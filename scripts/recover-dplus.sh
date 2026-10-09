#!/bin/bash
# ============================================================
# recover-dplus.sh — D+ 终态全链路幂等恢复
# 场景：环境重供给后（jar/mariadb-user/jdk/maven/.m2 全灭），
#       由 cron 巡检前台调用，重建 MariaDB→数据→jar→Java 引擎。
# 依据 worklog restore-r139 / cron-20261009-1705 / 1905 已验证序列。
# 用法：前台 bash scripts/recover-dplus.sh（超时重跑幂等续作）
# ============================================================
set -u
BASE=/home/z/my-project
MDB=$BASE/mariadb-user
TOOLS=/home/z/tools
BACKEND=$BASE/workflow_lowcode/backend
NODE_BACKEND=$BASE/workflow_lowcode/backend-node
BK=$BASE/backups
JAR="$BACKEND/target/workflow-platform-1.0.0-SNAPSHOT.jar"
DBPASS=740130
WF_DUMP=$BK/db-workflow-full-20261009.sql
V6_DUMP=$BK/rescue-workflow_v6-20261008-013021.sql
LD="$MDB/sysroot/usr/lib/x86_64-linux-gnu:$MDB/root/usr/lib/x86_64-linux-gnu"
export LD_LIBRARY_PATH=$LD
export DEBIAN_FRONTEND=noninteractive

log() { echo "[recover $(date +%H:%M:%S)] $*"; }
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1; }

# ---- 阶段 1：MariaDB 二进制 + 布局 ----
if [ ! -x "$MDB/root/usr/sbin/mariadbd" ]; then
  log "S1: 下载 MariaDB deb 并解包..."
  mkdir -p "$MDB/debs" && cd "$MDB/debs" || exit 1
  apt-get download mariadb-server mariadb-server-core mariadb-client mariadb-client-core \
    mariadb-common libmariadb3 liburing2 libaio1t64 libncurses6 >>"$TOOLS/recover.log" 2>&1 \
    || { log "S1 FAIL: apt-get download 失败"; exit 1; }
  for d in ./*.deb; do dpkg -x "$d" "$MDB/root/"; dpkg -x "$d" "$MDB/sysroot/"; done
  log "S1: deb 解包完成 ($(ls ./*.deb | wc -l) 件)"
else
  log "S1: MariaDB 二进制已就位，跳过"
fi

# 布局符号链接（幂等）+ 探测 errmsg.sys 实际位置
mkdir -p "$MDB/root"
ln -sfn usr/bin  "$MDB/root/bin"
ln -sfn usr/sbin "$MDB/root/sbin"
ln -sfn usr/sbin "$MDB/root/libexec"
ln -sfn usr/share "$MDB/root/share"   # basedir/share/mariadb/*.sql = usr/share/mariadb
MSGDIR=""
for c in usr/share/mariadb usr/share/mysql; do
  if [ -f "$MDB/root/$c/errmsg.sys" ] || [ -f "$MDB/root/$c/english/errmsg.sys" ]; then
    MSGDIR="$c" && break
  fi
done
[ -n "$MSGDIR" ] || { log "S1 FAIL: errmsg.sys 未找到"; ls "$MDB/root/usr/share/" ; exit 1; }
log "S1: errmsg.sys @ $MSGDIR"

# ---- 阶段 2：datadir 初始化 ----
if [ ! -d "$MDB/root/data/mysql" ]; then
  log "S2: mariadb-install-db 初始化 datadir..."
  rm -rf "$MDB/root/data"
  "$MDB/root/usr/bin/mariadb-install-db" --no-defaults \
    --basedir="$MDB/root" --datadir="$MDB/root/data" \
    --lc-messages-dir="$MDB/root/$MSGDIR" \
    --auth-root-authentication-method=normal >>"$TOOLS/recover.log" 2>&1 \
    || { log "S2 FAIL: install-db 失败，详见 recover.log"; tail -20 "$TOOLS/recover.log"; exit 1; }
  log "S2: datadir 初始化完成"
else
  log "S2: datadir 已存在，跳过"
fi

# ---- 阶段 3：拉起 mariadbd（幂等）----
if port_open 3306; then
  log "S3: MariaDB 已在线 (3306)"
else
  log "S3: 启动 mariadbd..."
  rm -f "$MDB/mysqld.pid"
  (cd "$MDB" && nohup root/usr/sbin/mariadbd --no-defaults \
    --basedir="$MDB/root" --datadir="$MDB/root/data" \
    --socket="$MDB/mysql.sock" --pid-file="$MDB/mysqld.pid" \
    --port=3306 --bind-address=127.0.0.1 --lower-case-table-names=1 \
    >> "$MDB/mariadbd.err" 2>&1 < /dev/null &)
  for i in 1 2 3 4 5 6 7 8; do sleep 3; port_open 3306 && break; done
  port_open 3306 || { log "S3 FAIL: 3306 未就绪"; tail -20 "$MDB/mariadbd.err"; exit 1; }
  log "S3: mariadbd 在线"
fi

# ---- 阶段 4：root 授权（幂等：TCP 密码连通即跳过）----
MC="$MDB/root/usr/bin/mariadb -h 127.0.0.1 -P 3306 -u root -p$DBPASS --protocol=TCP"
if $MC -e "SELECT 1" >/dev/null 2>&1; then
  log "S4: root@$DBPASS TCP 授权已就绪"
else
  log "S4: 配置 root 密码（socket 初始化授权）..."
  "$MDB/root/usr/bin/mariadb" --socket="$MDB/mysql.sock" -u root <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED BY '$DBPASS';
ALTER USER 'root'@'127.0.0.1' IDENTIFIED BY '$DBPASS';
ALTER USER 'root'@'::1' IDENTIFIED BY '$DBPASS';
FLUSH PRIVILEGES;
SQL
  $MC -e "SELECT 1" >/dev/null 2>&1 || { log "S4 FAIL: 授权后仍无法连接"; exit 1; }
  log "S4: 授权完成"
fi

# ---- 阶段 5：数据导入（幂等：workflow.SYS_USER 存在则跳过）----
if $MC -e "SELECT 1 FROM workflow.SYS_USER LIMIT 1" >/dev/null 2>&1; then
  log "S5: workflow 库数据已就绪，跳过导入"
else
  [ -s "$WF_DUMP" ] || { log "S5 FAIL: $WF_DUMP 为空/缺失"; exit 1; }
  log "S5: 导入 workflow 全量 dump..."
  $MC < "$WF_DUMP" || { log "S5 FAIL: workflow 导入失败"; exit 1; }
  log "S5: workflow 导入完成"
fi
if $MC -e "SELECT 1 FROM workflow_v6.flyway_schema_history LIMIT 1" >/dev/null 2>&1; then
  log "S5: workflow_v6 已就绪"
else
  [ -s "$V6_DUMP" ] || log "S5 WARN: $V6_DUMP 为空/缺失，跳过 v6"
  $MC < "$V6_DUMP" && log "S5: workflow_v6 导入完成" || log "S5 WARN: v6 导入失败（非致命）"
fi

# ---- 阶段 6：JDK 21 ----
ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && A=x64 || A=aarch64
if [ -x "$TOOLS/jdk21/bin/javac" ]; then
  log "S6: JDK 已就绪"
else
  log "S6: 下载 Temurin JDK 21 ($A, ~198M)..."
  curl -sL --max-time 550 --retry 1 -o /tmp/jdk21.tar.gz \
    "https://api.adoptium.net/v3/binary/latest/21/ga/linux/$A/jdk/hotspot/normal/eclipse" \
    || { log "S6 FAIL: JDK 下载失败"; exit 1; }
  tar -xzf /tmp/jdk21.tar.gz -C "$TOOLS" || { log "S6 FAIL: 解压失败"; exit 1; }
  SRCDIR=$(tar -tzf /tmp/jdk21.tar.gz | head -1 | cut -d/ -f1)
  rm -rf "$TOOLS/jdk21" && mv "$TOOLS/$SRCDIR" "$TOOLS/jdk21" && rm -f /tmp/jdk21.tar.gz
  [ -x "$TOOLS/jdk21/bin/javac" ] || { log "S6 FAIL: javac 校验失败"; exit 1; }
  log "S6: JDK 就绪 ($("$TOOLS/jdk21/bin/javac" -version 2>&1))"
fi

# ---- 阶段 7：Maven ----
if [ -x "$TOOLS/maven/bin/mvn" ]; then
  log "S7: Maven 已就绪"
else
  log "S7: 下载 Maven 3.9.9..."
  curl -sL --max-time 300 --retry 2 -o /tmp/mvn.tar.gz \
    "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.tar.gz" \
    || curl -sL --max-time 300 --retry 2 -o /tmp/mvn.tar.gz \
    "https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz" \
    || { log "S7 FAIL: Maven 下载失败"; exit 1; }
  tar -xzf /tmp/mvn.tar.gz -C "$TOOLS"
  rm -rf "$TOOLS/maven" && mv "$TOOLS/apache-maven-3.9.9" "$TOOLS/maven" && rm -f /tmp/mvn.tar.gz
  [ -x "$TOOLS/maven/bin/mvn" ] || { log "S7 FAIL: mvn 校验失败"; exit 1; }
  log "S7: Maven 就绪"
fi

# ---- 阶段 8：mvn 构建 jar ----
if [ -f "$JAR" ]; then
  log "S8: jar 已存在 ($(du -h "$JAR" | cut -f1))，跳过构建"
else
  log "S8: mvn package（冷 .m2 需数分钟）..."
  (cd "$BACKEND" && JAVA_HOME="$TOOLS/jdk21" "$TOOLS/maven/bin/mvn" -B -DskipTests package >>"$TOOLS/recover.log" 2>&1) \
    || { log "S8 FAIL: mvn 构建失败，详见 recover.log"; tail -30 "$TOOLS/recover.log"; exit 1; }
  [ -f "$JAR" ] || { log "S8 FAIL: 构建后无 jar"; exit 1; }
  log "S8: jar 就绪 ($(du -h "$JAR" | cut -f1))"
fi

# ---- 阶段 9：切引擎（choice=java + 清 marker + 清 Node 假绿）----
mkdir -p "$NODE_BACKEND/data"
echo -n java > "$NODE_BACKEND/data/engine-choice"
rm -f /home/z/tools/backend-engine-node "$NODE_BACKEND/.engine-node"
pkill -f "bun src/index.ts" 2>/dev/null || true
sleep 2
log "S9: engine-choice=java，markers 已清，Node 假绿已清场"

# ---- 阶段 10：start-services.sh 拉起 Java ----
bash "$BASE/scripts/start-services.sh"

# ---- 阶段 11：真绿验证（Java 首启 20-30s）----
log "S11: 等待 Java 引擎点亮..."
G=""
for i in $(seq 1 20); do
  sleep 5
  body=$(curl -s --max-time 5 -X POST -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"admin123"}' http://127.0.0.1:8080/api/auth/login 2>/dev/null)
  if echo "$body" | grep -q accessToken; then G=1; log "S11: 真绿 (t+$((i*5))s)"; break; fi
done
if [ -n "$G" ]; then
  log "恢复成功：D+ 终态已重建"
  exit 0
else
  log "S11 WARN: 120s 内未真绿，请查看 $TOOLS/backend.log 尾部"
  tail -20 "$TOOLS/backend.log" 2>/dev/null
  exit 2
fi
