#!/bin/bash
# ============================================================
# 工作流低代码平台 - 服务启动脚本（幂等）
# 在 Next.js dev server 启动前，拉起 Java 后端与 Vite 前端。
# 沙箱重启后由 package.json 的 dev 脚本自动调用。
# 运行期看护由 Next.js 内的服务监督器 (src/lib/service-supervisor.ts) 负责。
#
# 历史 bug 修复（worklog Task 5b/5c、Task 7）：
# 端口探测竞态——旧进程优雅关闭时 SSE 长连接会拖住端口，
# 仅凭"端口开着"误判为健康而跳过启动，导致服务假死。
# 现改为：端口开 + HTTP 探活双确认；探活失败则等待/清场后重启。
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

# HTTP 探活：任意状态码都算活（401/404 也证明 HTTP 层活着），连接失败/超时算死
http_alive() { # $1=port $2=path
  [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$1$2" 2>/dev/null)" != "000" ]
}

# 清掉残留的 zombies 后端进程（只匹配本平台 jar，绝不误伤其他 java 进程）
kill_stale_backend() {
  pkill -f "workflow-platform-1.0.0-SNAPSHOT.jar" 2>/dev/null || return 0
  sleep 3
  pkill -9 -f "workflow-platform-1.0.0-SNAPSHOT.jar" 2>/dev/null || true
  sleep 1
}

# ---- 引擎选择（Task 13-8）：标记文件存在时 8080 由 Node 后端提供 ----
NODE_MARKER=/home/z/tools/backend-engine-node
NODE_BACKEND_DIR=/home/z/my-project/workflow_lowcode/backend-node

# Task 13-R2：双位置 marker（安全区优先，兼容旧位置）
NODE_MARKER_SAFE="$NODE_BACKEND_DIR/.engine-node"
# Task 13-R3：发布/重置会清掉 node_modules、/home/z/tools、甚至项目内 dotfile marker，
# 但源码与 SQLite 主库历次重置均幸存。决策链：
#   ① 双 marker 任一存在 → Node
#   ② workflow.db 存在（最强持久信号）→ 重建 marker → Node
#   ③ jar 缺失（Java 无法运行且无自愈）→ 重建 marker → Node
if [ ! -f "$NODE_MARKER" ] && [ -f "$NODE_MARKER_SAFE" ]; then
  NODE_MARKER="$NODE_MARKER_SAFE"
fi
NODE_DB="$NODE_BACKEND_DIR/data/workflow.db"
if [ ! -f "$NODE_MARKER" ]; then
  if [ -f "$NODE_DB" ]; then
    echo "[start-services] 检测到 Node 引擎主库，重建引擎标记..."
    mkdir -p /home/z/tools
    touch "$NODE_MARKER_SAFE" /home/z/tools/backend-engine-node 2>/dev/null || true
    NODE_MARKER="$NODE_MARKER_SAFE"
  elif [ ! -f "$JAR" ]; then
    echo "[start-services] jar 缺失且无 Java 回滚条件，自动使用 Node 引擎..."
    mkdir -p /home/z/tools
    touch "$NODE_MARKER_SAFE" /home/z/tools/backend-engine-node 2>/dev/null || true
    NODE_MARKER="$NODE_MARKER_SAFE"
  fi
fi

# Node 后端启动前置自愈：依赖缺失先 bun install（后台日志到 backend-node-install.log）
start_node_backend() {
  if [ ! -d "$NODE_BACKEND_DIR/node_modules/express" ]; then
    echo "[start-services] backend-node 依赖缺失，执行 bun install（最多 4 分钟）..."
    (cd "$NODE_BACKEND_DIR" && bun install >> "$LOG_DIR/backend-node-install.log" 2>&1) \
      || echo "[start-services] backend-node bun install 失败，仍尝试启动（详见 backend-node-install.log）"
  fi
  (cd "$NODE_BACKEND_DIR" && PORT=8080 NODE_OPTIONS=--max-old-space-size=512 nohup bun src/index.ts >> "$LOG_DIR/backend-node.log" 2>&1 &)
}

if [ -f "$NODE_MARKER" ]; then
  if port_open 8080; then
    if http_alive 8080 "/health"; then
      echo "[start-services] 后端已在运行 (8080, Node 引擎)"
    else
      echo "[start-services] 8080 被占但 /health 无响应，等待..."
      OK=""
      for i in 1 2 3 4; do
        sleep 3
        if http_alive 8080 "/health"; then OK=1; break; fi
      done
      if [ -z "$OK" ]; then
        echo "[start-services] 后端假死，按 Node 引擎重启..."
        fuser -k 8080/tcp 2>/dev/null
        sleep 2
        start_node_backend
      fi
    fi
  else
    echo "[start-services] 启动 Node 后端 (bun + Express, 8080)..."
    start_node_backend
  fi
else
# ---- Java 后端 (8080) ----
if port_open 8080; then
  if http_alive 8080 "/"; then
    echo "[start-services] 后端已在运行 (8080)"
  else
    # 端口开着但 HTTP 无响应：等优雅关闭完成（最多 20s），仍无响应则清场重启
    echo "[start-services] 8080 端口被占但无 HTTP 响应，等待关闭/就绪..."
    OK=""
    for i in 1 2 3 4; do
      sleep 5
      if http_alive 8080 "/"; then OK=1; break; fi
    done
    if [ -n "$OK" ]; then
      echo "[start-services] 后端恢复响应 (8080)"
    else
      echo "[start-services] 后端假死，清场重启..."
      kill_stale_backend
      echo "[start-services] 启动 Java 后端..."
      # -Xmx448m：沙箱仅 3.9Gi 内存，限制 Java 堆防 OOM kill next-server（历史 bug：Turbopack+Java+Chrome 同挤 4G）
      (cd "$BACKEND_DIR" && nohup java -Xmx448m -XX:MaxMetaspaceSize=192m -jar "$JAR" --spring.profiles.active=sandbox >> "$LOG_DIR/backend.log" 2>&1 &)
    fi
  fi
elif [ ! -f "$JAR" ]; then
  echo "[start-services] 跳过后端：jar 未构建 ($JAR)，可运行 scripts/bootstrap-after-reset.sh 重建"
else
  echo "[start-services] 启动 Java 后端..."
  (cd "$BACKEND_DIR" && nohup java -Xmx448m -XX:MaxMetaspaceSize=192m -jar "$JAR" --spring.profiles.active=sandbox >> "$LOG_DIR/backend.log" 2>&1 &)
fi

fi

# ---- Vite 前端 (5173) ----
# Task 13-R3：依赖缺失先自愈安装，避免重置后 bun run dev 因 vite 二进制缺失而 code=127 空转
FRONTEND_NODE_MODULES="$FRONTEND_DIR/node_modules/vite"
ensure_frontend_deps() {
  if [ ! -d "$FRONTEND_NODE_MODULES" ]; then
    echo "[start-services] frontend 依赖缺失，执行 bun install（最多 4 分钟）..."
    (cd "$FRONTEND_DIR" && bun install >> "$LOG_DIR/frontend-install.log" 2>&1) \
      || echo "[start-services] frontend bun install 失败（详见 frontend-install.log）"
  fi
}

if port_open 5173; then
  if http_alive 5173 "/lowcode/"; then
    echo "[start-services] 前端已在运行 (5173)"
  else
    echo "[start-services] 5173 端口被占但无 HTTP 响应，清场重启..."
    pkill -f "vite" 2>/dev/null || true
    sleep 2
    ensure_frontend_deps
    (cd "$FRONTEND_DIR" && nohup env NODE_OPTIONS="--max-old-space-size=512" bun run dev >> "$LOG_DIR/vite.log" 2>&1 &)
  fi
else
  echo "[start-services] 启动 Vite 前端..."
  ensure_frontend_deps
  # NODE_OPTIONS 堆上限：防 Turbopack 无限增长导致系统 OOM（见 worklog 2026-09-10 OOM 分析）
  (cd "$FRONTEND_DIR" && nohup env NODE_OPTIONS="--max-old-space-size=512" bun run dev >> "$LOG_DIR/vite.log" 2>&1 &)
fi

echo "[start-services] 完成"
exit 0
