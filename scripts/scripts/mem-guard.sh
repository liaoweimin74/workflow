#!/usr/bin/env bash
# 内存守护：auto 模式显示当前内存水位，提醒重型任务纪律（4G 红线）
case "${1:-auto}" in
  auto|status)
    free -h | awk 'NR==1 || /Mem/'
    avail=$(free -m | awk '/Mem:/{print $7}')
    if [ "$avail" -lt 800 ]; then
      echo "[mem-guard] WARN: available ${avail}MB < 800MB —— 严禁启动重型任务/Java"
    else
      echo "[mem-guard] OK: available ${avail}MB"
    fi
    ;;
  check-heavy)
    avail=$(free -m | awk '/Mem:/{print $7}')
    chrome=$(pgrep -c chrome 2>/dev/null || echo 0)
    echo "[mem-guard] avail=${avail}MB chrome=${chrome}"
    if [ "$avail" -lt 1200 ]; then echo "[mem-guard] BLOCK: 先 close 浏览器/门户再跑重型任务"; exit 1; fi
    ;;
esac
