#!/bin/bash
# 内存守护（OOM 铁律①）：mem-guard.sh auto = 报告并给出是否允许重型任务的裁决
avail=$(free -m | awk '/^Mem:/{print $7}')
total=$(free -m | awk '/^Mem:/{print $2}')
echo "[mem-guard] total=${total}MB available=${avail}MB"
if [ "$1" = "auto" ]; then
  if [ "$avail" -lt 1200 ]; then
    echo "[mem-guard] 可用内存不足 1200MB：严禁启动 Java/构建/全量测试；先清理或暂停门户再执行重型任务"
    exit 2
  fi
  echo "[mem-guard] 内存充足，重型任务可执行（门户存活期间仍禁止并行重型任务）"
fi
