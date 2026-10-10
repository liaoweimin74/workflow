#!/bin/bash
# ============================================================
# 门户 vite 版幂等拉起脚本（方案 D+）
#
# 与 start-portal.sh 同构：回合内临时拉起、幂等、带等待。
# 经验教训（本次实测）：agent 工具调用里 inline `setsid nohup cmd &`
# 会被沙箱在命令块结束时整树回收；而「脚本文件内 setsid nohup 拉起」
# 的进程（next dev / 5173 vite 均实证）可长期存活——故必须以脚本
# 文件方式执行，禁止 inline 后台。
#
# 用法：bash scripts/start-portal-vite.sh
# 端口：默认 3000；测试期 PORTAL_VITE_PORT=3001 bash scripts/start-portal-vite.sh
# ============================================================
set -u
cd /home/z/my-project

PORT="${PORTAL_VITE_PORT:-3000}"

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
}

http_code() {
  curl -s -o /dev/null -m "$2" -w '%{http_code}' "http://127.0.0.1:$1$3" 2>/dev/null
}

# 1) 已健康则直接退出（幂等）
if port_open "$PORT" && [ "$(http_code "$PORT" 5 /)" != "000" ]; then
  echo "[start-portal-vite] $PORT 已健康 (HTTP $(http_code "$PORT" 5 /))，无需拉起"
  exit 0
fi

# 2) 清残留（端口占用但假死的 vite 门户进程）
pkill -f "vite portal-vite" 2>/dev/null || true
pkill -f "portal-vite.*--port" 2>/dev/null || true
sleep 1

# 3) setsid 后台拉起（同回合内有效，实证可常驻）
setsid nohup env PORTAL_VITE_PORT="$PORT" \
  node /home/z/my-project/node_modules/.bin/vite portal-vite \
  >> /tmp/portal-vite.log 2>&1 < /dev/null &

# 4) 等待就绪（最多 40s），成功即返回
for i in $(seq 1 20); do
  sleep 2
  CODE=$(http_code "$PORT" 8 /)
  if [ "$CODE" != "000" ]; then
    echo "[start-portal-vite] $PORT 已拉起 (HTTP $CODE, 第 ${i} 次探测)"
    exit 0
  fi
done

echo "[start-portal-vite] 拉起失败，请查看 /tmp/portal-vite.log"
tail -20 /tmp/portal-vite.log 2>/dev/null
exit 1
