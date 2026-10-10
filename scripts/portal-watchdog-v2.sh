#!/usr/bin/env bash
# ============================================================
# 门户看门狗 v2 —— Task 119-series OOM 时序修复
#
# v1 的两个致命缺陷（本版修复）：
# ① pkill -f 'next dev' 会击杀「正在编译」的健康实例（编译期 3000 无响应，
#    巡检窗口撞上即误杀）→ v2 永不 pkill，死亡进程自会退出，只需拉起
# ② 单次探测失败即拉起 → 瞬时慢响应也会触发重复启动 → v2 连续 2 次确认
#
# 根因背景（Task 119-restore 实证）：
#   容器 cgroup 4Gi 硬限；next-server(Turbopack Rust) 服务期内存波动触顶，
#   内核在 cgroup 内击杀最大进程（oom_kill 计数实证 2 次，dmesg 静默）。
#   拉起后若再次被 OOM，本看门狗会继续拉起（缓存热时增量编译秒级）。
#
# 启动方式（独立会话，脱离终端存活）：
#   setsid nohup bash /home/z/my-project/scripts/portal-watchdog-v2.sh \
#     >> /home/z/my-project/portal-watchdog-v2.log 2>&1 &
# ============================================================

PORT=3000
APP_DIR=/home/z/my-project
LOG=$APP_DIR/portal-standalone.log
COOLDOWN=75          # 拉起后等待期：覆盖冷编译 ~15s + 服务稳定窗口，防半初始化误判
CONFIRM_TIMES=2      # 连续 N 次探活失败才判定死亡
CONFIRM_INTERVAL=10  # 确认间隔秒

probe() {
  local c
  c=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null)
  [ "$c" != "000" ] && [ -n "$c" ]
}

echo "[$(date '+%F %T')] watchdog v2 started (pid $$)"

while true; do
  if ! probe; then
    # 第一次失败：CONFIRM_TIMES-1 次复检，防瞬时波动
    local_dead=1
    for _ in $(seq 1 $((CONFIRM_TIMES - 1))); do
      sleep "$CONFIRM_INTERVAL"
      if probe; then local_dead=0; break; fi
    done

    if [ "$local_dead" = "1" ]; then
      echo "[$(date '+%F %T')] portal confirmed dead (2 consecutive probes), restarting..."
      # v2 核心差异：不 pkill——OOM/崩溃后的进程已不存在；
      # 若端口被僵尸占用，lsof 检测并只杀监听 3000 的进程（精确打击）
      listener=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | head -1)
      if [ -n "$listener" ]; then
        echo "[$(date '+%F %T')] port $PORT held by pid $listener, killing precisely"
        kill -9 "$listener" 2>/dev/null
        sleep 2
      fi
      cd "$APP_DIR" || exit 1
      setsid nohup bash -c 'bun run next dev -p 3000' >> "$LOG" 2>&1 &
      echo "[$(date '+%F %T')] restarted (pid $!)"
      sleep "$COOLDOWN"
    fi
  fi
  sleep 20
done
