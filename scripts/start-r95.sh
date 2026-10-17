#!/bin/bash
# r95 临时拉起脚本：Temurin JDK（系统 JRE 损坏）+ vite（bun 干环境）
# 模式与 recover-dplus.sh 一致：子 shell daemon 化，脚本退出后进程脱离会话
cd /home/z/my-project/workflow_lowcode/backend
setsid nohup env MALLOC_ARENA_MAX=2 /home/z/tools/jdk21/bin/java \
  -Xmx320m -XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=320m \
  -XX:MaxDirectMemorySize=64m -Xss512k -XX:+UseSerialGC -XX:ReservedCodeCacheSize=128m \
  -jar /home/z/my-project/backups/jar/workflow-platform-1.0.0-SNAPSHOT.jar \
  --spring.profiles.active=sandbox >> /home/z/tools/backend.log 2>&1 < /dev/null &
echo "[start-r95] java started"

cd /home/z/my-project/workflow_lowcode/frontend
setsid nohup bun run dev >> /home/z/my-project/scripts/vite-r95.log 2>&1 < /dev/null &
echo "[start-r95] vite started"
