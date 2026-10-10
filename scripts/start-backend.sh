#!/bin/bash
# ============================================================
# 低代码后端（Java 8080）幂等拉起/重启脚本 —— Task 142
#
# 用法：
#   bash scripts/start-backend.sh            # 幂等：健康则跳过
#   bash scripts/start-backend.sh --restart  # 强制重启（换 jar 后用）
#
# 沙箱进程铁律：必须以脚本文件内 setsid nohup 方式拉起才能常驻，
# agent 命令块 inline 后台进程会被沙箱在块结束时回收。
# ============================================================
set -u
cd /home/z/my-project/workflow_lowcode/backend

JAR=target/workflow-platform-1.0.0-SNAPSHOT.jar
JAVA=/home/z/tools/jdk21/bin/java
LOG=/home/z/tools/backend-java.log

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
}

business_ok() {
  # 业务特征探活：登录端点应答（非 000）即视为 Spring 上下文就绪
  [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' -X POST \
      -H 'Content-Type: application/json' -d '{}' \
      http://127.0.0.1:8080/api/auth/login 2>/dev/null)" != "000" ]
}

if [ "${1:-}" != "--restart" ] && port_open 8080 && business_ok; then
  echo "[start-backend] 8080 已健康，无需拉起"
  exit 0
fi

# 清旧进程（cmdline 含 jar 文件名，精确匹配）
pkill -f "workflow-platform-1.0.0-SNAPSHOT.jar" 2>/dev/null || true
sleep 2
pkill -9 -f "workflow-platform-1.0.0-SNAPSHOT.jar" 2>/dev/null || true
sleep 1

if [ ! -f "$JAR" ]; then
  echo "[start-backend] jar 不存在：$JAR（先 mvn package）"
  exit 1
fi

setsid nohup "$JAVA" -Xmx448m -XX:MaxMetaspaceSize=192m \
  -jar "$JAR" --spring.profiles.active=sandbox >> "$LOG" 2>&1 < /dev/null &

for i in $(seq 1 45); do
  sleep 2
  if port_open 8080 && business_ok; then
    echo "[start-backend] 8080 就绪（第 $i 次探测）"
    exit 0
  fi
done
echo "[start-backend] 90s 内未就绪，请查 $LOG"
exit 1
