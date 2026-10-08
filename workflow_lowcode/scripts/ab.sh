#!/bin/bash
# agent-browser 包装（OOM 铁律④）：透传参数给 agent-browser，结束后提醒关闭
agent-browser "$@"
code=$?
if [ "$1" = "open" ] || [ "$1" = "reload" ]; then
  echo "[ab] 用完请执行: bash scripts/ab.sh close 并确认 chrome 进程归零"
fi
exit $code
