#!/bin/bash
# ============================================================
# 工作流低代码平台 - 服务启动脚本（幂等）
# 在 Next.js dev server 启动前，拉起 Java 后端与 Vite 前端。
# 沙箱重启后由 package.json 的 dev 脚本自动调用。
# 运行期看护由 Next.js 内的服务监督器 (src/lib/service-supervisor.ts) 负责。
# ============================================================
set -u

LOG_DIR=/home/z/tools
BACKEND_DIR=/home/z/my-project/workflow_lowcode/backend
FRONTEND_DIR=/home/z/my-project/workflow_lowcode/frontend
JAR="$BACKEND_DIR/target/workflow-platform-1.0.0-SNAPSHOT.jar"
mkdir -p "$LOG_DIR"

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
}

# ---- Java 后端 (8080) ----
if port_open 8080; then
  echo "[start-services] 后端已在运行 (8080)"
elif [ ! -f "$JAR" ]; then
  echo "[start-services] 跳过后端：jar 未构建 ($JAR)"
else
  echo "[start-services] 启动 Java 后端..."
  # -Xmx448m：沙箱仅 4.1Gi 内存，限制 Java 堆防 OOM kill next-server（历史 bug：Turbopack+Java+Chrome 同挤 4G）
  (cd "$BACKEND_DIR" && nohup java -Xmx448m -XX:MaxMetaspaceSize=192m -jar "$JAR" --spring.profiles.active=sandbox >> "$LOG_DIR/backend.log" 2>&1 &)
fi

# ---- Vite 前端 (5173) ----
if port_open 5173; then
  echo "[start-services] 前端已在运行 (5173)"
else
  echo "[start-services] 启动 Vite 前端..."
  # NODE_OPTIONS 堆上限：防 Turbopack 无限增长导致系统 OOM（见 worklog 2026-09-10 OOM 分析）
  (cd "$FRONTEND_DIR" && nohup env NODE_OPTIONS="--max-old-space-size=512" bun run dev >> "$LOG_DIR/vite.log" 2>&1 &)
fi

echo "[start-services] 完成"
exit 0
