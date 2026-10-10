#!/bin/bash
# java-only 拉起（保留 MariaDB 数据，不做重建/导 dump）
# 用法：作为工具命令主体前台执行：bash /home/z/my-project/scripts/start-java.sh
# 幂等：已存在同 jar 进程则不重复拉起
set -u
PAT='workflow-platform-1.0.0-SNAPSHOT.jar'
if pgrep -f "$PAT" >/dev/null 2>&1; then
  echo "[start-java] 已有 Java 进程在跑，跳过（pid=$(pgrep -f "$PAT" | head -1)）"
  exit 0
fi
# 清掉 Node 假绿占位与残留
pkill -f 'bun src/index.ts' 2>/dev/null || true
sleep 1
cd /home/z/my-project/workflow_lowcode/backend || exit 1
nohup java -Xmx448m -XX:MaxMetaspaceSize=192m \
  -jar target/workflow-platform-1.0.0-SNAPSHOT.jar \
  --spring.profiles.active=sandbox >> /home/z/tools/backend.log 2>&1 < /dev/null &
PID=$!
echo "[start-java] $(date '+%F %T') launched pid=$PID"
