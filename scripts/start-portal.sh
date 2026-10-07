#!/bin/bash
# ============================================================
# 门户（3000）幂等拉起脚本 —— Task 40 沉淀
#
# 【已退役·D+ 架构 2026-10-08】用户定调：门户不启动省内存，
# vite 直接独占 3000（见 scripts/start-services.sh 与 vite.config.ts）。
# 本脚本保留仅作历史存档，执行时直接拒绝退出——防止误拉起 next dev
# 与 vite 抢占 3000。如需恢复门户，先还原 package.json dev 脚本与本守卫。
# ============================================================
echo "[start-portal] 已退役（D+ 架构：vite 独占 3000，门户不再启动）。"
echo "[start-portal] 如需前端：bash scripts/start-services.sh（vite 将监听 3000）。"
exit 1

# ------------------------------------------------------------
# 以下为历史实现（永不执行）
# ------------------------------------------------------------
#
# 背景（service-supervisor.ts 沙箱铁律）：
#   - 只有平台 start.sh 启动的进程树能常驻；agent 工具调用里
#     spawn 的进程会在回合结束后被沙箱回收（setsid 亦无效）。
#   - 因此本脚本用于「回合内临时拉起」：用户需要预览时执行一次，
#     验证 200 即可在当前回合内正常访问。
#   - 回合结束后若 3000 失效，重新执行本脚本即可。
#
# 用法：bash scripts/start-portal.sh
# ============================================================
set -u
cd /home/z/my-project

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
}

http_code() {
  curl -s -o /dev/null -m "$2" -w '%{http_code}' "http://127.0.0.1:$1$3" 2>/dev/null
}

# 1) 已健康则直接退出（幂等）
if port_open 3000 && [ "$(http_code 3000 5 /)" != "000" ]; then
  echo "[start-portal] 3000 已健康 (HTTP $(http_code 3000 5 /))，无需拉起"
  exit 0
fi

# 2) 清残留（端口占用但假死的 next 进程）与 Turbopack 缓存
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1
[ -d .next ] && rm -rf .next

# 3) setsid 后台拉起（同回合内有效）
setsid nohup env NODE_OPTIONS=--max-old-space-size=614 \
  ./node_modules/.bin/next dev -p 3000 >> /tmp/portal-direct.log 2>&1 < /dev/null &

# 4) 等待就绪（最多 40s），成功即返回
for i in $(seq 1 20); do
  sleep 2
  CODE=$(http_code 3000 8 /)
  if [ "$CODE" != "000" ]; then
    echo "[start-portal] 3000 已拉起 (HTTP $CODE, 第 ${i} 次探测)"
    exit 0
  fi
done

echo "[start-portal] 拉起失败，请查看 /tmp/portal-direct.log"
tail -20 /tmp/portal-direct.log 2>/dev/null
exit 1
