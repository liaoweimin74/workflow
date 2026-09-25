#!/usr/bin/env bash
# 门户看门狗：沙箱 4GB 内存下 next-server（Turbopack）会因重度编译 OOM 被内核杀死，
# 且死因无声（dmesg: oom-kill task=next-server）。本看门狗 20s 巡检 3000 端口，
# 死亡即拉起；若日志尾部有 Turbopack panic 则先清 .next 缓存再拉起。
# 启动方式（独立会话，脱离终端存活）：
#   setsid nohup bash scripts/portal-watchdog.sh >> /home/z/my-project/portal-watchdog.log 2>&1 &

PORT=3000
APP_DIR=/home/z/my-project
LOG=$APP_DIR/dev.log
COOLDOWN=30   # 拉起后的最短等待，避免半初始化状态误判重复拉起

is_up() {
  curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" --max-time 5 | grep -q '200\|307\|302'
}

while true; do
  if ! is_up; then
    echo "[$(date '+%F %T')] portal down detected, restarting..."
    # 清理残留进程
    pkill -f 'next dev' 2>/dev/null
    pkill -f 'next-server' 2>/dev/null
    sleep 2
    # Turbopack 缓存损坏（进程被杀后 .next 残留坏状态）→ 清缓存
    if tail -n 40 "$LOG" 2>/dev/null | grep -q 'FATAL.*Turbopack\|corrupted database'; then
      echo "[$(date '+%F %T')] turbopack cache corrupted, clearing .next"
      rm -rf "$APP_DIR/.next"
    fi
    cd "$APP_DIR" || exit 1
    setsid nohup bash -c 'bun run dev' >> "$LOG" 2>&1 &
    echo "[$(date '+%F %T')] restarted (pid $!)"
    sleep $COOLDOWN
  fi
  sleep 20
done
