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

# ---- Vite 前端 (5173) ----
if port_open 5173; then
  if http_alive 5173 "/lowcode/"; then
    echo "[start-services] 前端已在运行 (5173)"
  else
    echo "[start-services] 5173 端口被占但无 HTTP 响应，清场重启..."
    pkill -f "vite" 2>/dev/null || true
    sleep 2
    (cd "$FRONTEND_DIR" && nohup env NODE_OPTIONS="--max-old-space-size=512" bun run dev >> "$LOG_DIR/vite.log" 2>&1 &)
  fi
else
  echo "[start-services] 启动 Vite 前端..."
  # NODE_OPTIONS 堆上限：防 Turbopack 无限增长导致系统 OOM（见 worklog 2026-09-10 OOM 分析）
  (cd "$FRONTEND_DIR" && nohup env NODE_OPTIONS="--max-old-space-size=512" bun run dev >> "$LOG_DIR/vite.log" 2>&1 &)
fi

echo "[start-services] 完成"
exit 0
