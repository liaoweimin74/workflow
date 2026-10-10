#!/bin/bash
# ============================================================
# recover-dplus.sh — D+ 终态自动恢复（幂等）
#
# 触发场景：沙箱环境重供给（cron 会话边界冷启动）后，未入 git 的
#   运行时产物（mariadb-user/、jdk21、maven、.m2、jar）全部丢失，
#   开机自愈链只能拉起 vite + Node 假绿（SQLite 缺 SYS_USER 表）。
#
# 本脚本按序恢复：MariaDB → 数据导入 → jar（优先 git 备份）→ Java。
# 全程可重入：任何一步已就绪则跳过。调用方：
#   1) start-services.sh 冷启动检测（后台异步）
#   2) 巡检轮（前台）
#
# 性能：jar 走 backups/jar 恢复时全程 ~3 分钟；无备份时含 mvn 构建 ~10 分钟
# ============================================================
set -u

MDB=/home/z/my-project/mariadb-user
BACKUPS=/home/z/my-project/backups
BACKEND=/home/z/my-project/workflow_lowcode/backend
NODE_BACKEND=/home/z/my-project/workflow_lowcode/backend-node
TOOLS=/home/z/tools
JAR="$BACKEND/target/workflow-platform-1.0.0-SNAPSHOT.jar"
JAR_BAK="$BACKUPS/jar/workflow-platform-1.0.0-SNAPSHOT.jar"

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1; }
http_8080() { curl -s -o /dev/null -w '%{http_code}' -m 5 -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8080/api/auth/login 2>/dev/null; }

echo "[recover] $(date '+%F %T') start (uptime=$(cut -d' ' -f1 /proc/uptime)s)"

# ---- 幂等短路：全部健康则退出 ----
if [ -f "$JAR" ] && port_open 3306 && [ "$(http_8080)" != "000" ]; then
  echo "[recover] 全部健康，幂等退出"
  exit 0
fi

# ---- 1. MariaDB ----
export LD_LIBRARY_PATH="$MDB/root/lib/x86_64-linux-gnu"
if ! port_open 3306; then
  if [ ! -x "$MDB/root/usr/sbin/mariadbd" ]; then
    echo "[recover] 重建 MariaDB（deb 下载→解包→布局→initdb）..."
    mkdir -p "$MDB/debs"
    (cd "$MDB/debs" && apt-get download mariadb-server-core mariadb-server mariadb-client-core \
      mariadb-client mariadb-common libaio1t64 liburing2 libncurses6) >> /home/z/tools/recover.log 2>&1
    mkdir -p "$MDB/root"
    for f in "$MDB"/debs/*.deb; do dpkg -x "$f" "$MDB/root/"; done
    cd "$MDB/root" && ln -sfn usr/bin bin && ln -sfn usr/sbin sbin && ln -sfn usr/lib lib && ln -sfn usr/share share
    ln -sfn root "$MDB/sysroot" 2>/dev/null || true
    "$MDB/root/bin/mariadb-install-db" --no-defaults --basedir="$MDB/root" --datadir="$MDB/root/data" \
      --lc-messages-dir="$MDB/root/share/mariadb" --auth-root-authentication-method=normal \
      --skip-test-db >> /home/z/tools/recover.log 2>&1
  fi
  echo "[recover] 启动 mariadbd..."
  rm -f "$MDB/mysqld.pid"
  (cd "$MDB" && nohup root/usr/sbin/mariadbd --no-defaults --basedir="$MDB/root" --datadir="$MDB/root/data" \
    --socket="$MDB/mysql.sock" --pid-file="$MDB/mysqld.pid" --port=3306 --bind-address=127.0.0.1 \
    --lower-case-table-names=1 --lc-messages-dir="$MDB/root/share/mariadb" \
    >> "$MDB/mariadbd.err" 2>&1 < /dev/null &)
  for i in 1 2 3 4 5 6 7 8; do sleep 3; port_open 3306 && break; done
fi

# ---- 2. 账号 + 数据（SYS_USER 缺失才导入，避免重复导入）----
M="$MDB/root/bin/mariadb"
if port_open 3306 && [ -x "$M" ]; then
  "$M" -u root -S "$MDB/mysql.sock" -e "CREATE DATABASE IF NOT EXISTS workflow CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci; CREATE DATABASE IF NOT EXISTS workflow_v6 CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci; GRANT ALL ON *.* TO 'root'@'localhost' IDENTIFIED BY '740130' WITH GRANT OPTION; GRANT ALL ON *.* TO 'root'@'127.0.0.1' IDENTIFIED BY '740130' WITH GRANT OPTION; FLUSH PRIVILEGES;" >> /home/z/tools/recover.log 2>&1
  HAS_USER=$("$M" -u root -p740130 -S "$MDB/mysql.sock" -N -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='workflow' AND table_name='SYS_USER';" 2>/dev/null || echo 0)
  if [ "$HAS_USER" = "0" ]; then
    LATEST=$(ls -1t "$BACKUPS"/db-workflow-full-*.sql 2>/dev/null | head -1)
    if [ -n "$LATEST" ]; then
      echo "[recover] 导入数据: $LATEST"
      "$M" -u root -p740130 -S "$MDB/mysql.sock" workflow < "$LATEST" >> /home/z/tools/recover.log 2>&1
      LATEST6=$(ls -1t "$BACKUPS"/db-workflow_v6-*.sql 2>/dev/null | head -1)
      [ -n "$LATEST6" ] && "$M" -u root -p740130 -S "$MDB/mysql.sock" workflow_v6 < "$LATEST6" >> /home/z/tools/recover.log 2>&1
    else
      echo "[recover] WARN: 无可用 dump！workflow 库为空壳（Flyway 启动时仅建结构）"
    fi
  fi
fi

# ---- 3. jar：优先 git 备份直复（3 秒），否则前台 mvn 构建（~8 分钟）----
if [ ! -f "$JAR" ]; then
  if [ -f "$JAR_BAK" ]; then
    echo "[recover] 从 backups/jar 恢复 jar（跳过 mvn 构建）..."
    mkdir -p "$BACKEND/target" && cp "$JAR_BAK" "$JAR"
  else
    echo "[recover] 无 jar 备份，前台重建工具链 + mvn 构建（~8 分钟）..."
    if [ ! -x "$TOOLS/jdk21/bin/javac" ]; then
      curl -sL --max-time 560 -o /tmp/jdk21.tar.gz \
        "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" \
        && tar -xzf /tmp/jdk21.tar.gz -C "$TOOLS" \
        && SRC=$(tar -tzf /tmp/jdk21.tar.gz | head -1 | cut -d/ -f1) \
        && rm -rf "$TOOLS/jdk21" && mv "$TOOLS/$SRC" "$TOOLS/jdk21" && rm -f /tmp/jdk21.tar.gz
    fi
    if [ ! -x "$TOOLS/maven/bin/mvn" ]; then
      curl -sL --max-time 240 -o /tmp/maven.tar.gz \
        "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.tar.gz" \
        && tar -xzf /tmp/maven.tar.gz -C "$TOOLS" \
        && rm -rf "$TOOLS/maven" && mv "$TOOLS/apache-maven-3.9.9" "$TOOLS/maven" && rm -f /tmp/maven.tar.gz
    fi
    (cd "$BACKEND" && JAVA_HOME="$TOOLS/jdk21" "$TOOLS/maven/bin/mvn" -q -B -DskipTests package) >> /home/z/tools/recover.log 2>&1
  fi
fi

# ---- 4. 引擎决策固化 + Java 拉起 ----
mkdir -p "$NODE_BACKEND/data"
echo -n java > "$NODE_BACKEND/data/engine-choice" 2>/dev/null || true
rm -f "$NODE_BACKEND/.engine-node" "$TOOLS/backend-engine-node" 2>/dev/null || true

if [ -f "$JAR" ] && ! pgrep -f 'workflow-platform-1.0.0-SNAPSHOT.jar' >/dev/null 2>&1; then
  # 清掉 Node 假绿占位
  pkill -f 'bun src/index.ts' 2>/dev/null || true
  sleep 2
  echo "[recover] 启动 Java（-Xmx448m，首启约 20s）..."
  (cd "$BACKEND" && setsid nohup java -Xmx448m -XX:MaxMetaspaceSize=192m -jar "$JAR" \
    --spring.profiles.active=sandbox >> /home/z/tools/backend.log 2>&1 < /dev/null &)
  for i in $(seq 1 9); do sleep 5; port_open 8080 && break; done
fi

CODE=$(http_8080)
echo "[recover] $(date '+%F %T') done: 8080=$CODE jar=$([ -f "$JAR" ] && echo ok || echo MISSING) 3306=$(port_open 3306 && echo ok || echo DOWN)"
[ "$CODE" != "000" ] && [ -f "$JAR" ] && port_open 3306

# ---- 5. 真绿核验（accessToken；Java 首启 20-30s，最长 120s）----
G=""
for i in $(seq 1 24); do
  sleep 5
  body=$(curl -s --max-time 5 -X POST -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"admin123"}' http://127.0.0.1:8080/api/auth/login 2>/dev/null)
  if echo "$body" | grep -q accessToken; then G=1; echo "[recover] 真绿 (t+$((i*5))s)"; break; fi
done
[ -n "$G" ] || { echo "[recover] WARN: 120s 内未真绿，请查 /home/z/tools/backend.log"; exit 2; }
exit 0
