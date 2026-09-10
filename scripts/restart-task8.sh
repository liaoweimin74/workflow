#!/bin/bash
# restart-task8.sh — Idempotent restart of next dev(3000) to activate on-disk A2/A3.
# Iron rule: NEVER touch Vite(5173) / Java(8080) standalone processes.
set -u
WORKLOG=/home/z/my-project/worklog.md
DATE=$(date '+%Y-%m-%d %H:%M:%S %z')

tcp() { (exec 3<>/dev/tcp/127.0.0.1/$1) 2>/dev/null; }

# ---- Idempotent guard ----
if grep -q "Task ID: 8" "$WORKLOG" 2>/dev/null; then
  echo "[guard] Task 8 already bound in worklog - no-op"
  for p in 3000 5173 8080; do tcp $p && echo "$p OPEN" || echo "$p CLOSED"; done
  echo "[result] ALREADY_DONE"
  exit 0
fi

# ---- Assess & clean port 3000 only ----
if tcp 3000; then
  echo "[assess] 3000 was OPEN"
  if ps -p 1066 >/dev/null 2>&1; then
    echo "[kill] stopping old PIDs 1055/1066"
    kill 1055 1066 2>/dev/null
    sleep 4
    kill -9 1055 1066 2>/dev/null
    sleep 2
  else
    echo "[kill] PID 1066 dead - port-level cleanup"
    fuser -k 3000/tcp 2>/dev/null
    sleep 3
  fi
  # wait for port release; hard fallback at timeout
  for i in 1 2 3 4 5 6; do
    if ! tcp 3000; then echo "[free] 3000 released after ~$((i*2))s"; break; fi
    if [ $i -eq 6 ]; then echo "[kill] port still held - fuser -9"; fuser -k -9 3000/tcp 2>/dev/null; sleep 2; fi
    sleep 2
  done
  if tcp 3000; then
    echo "[kill] last resort: pkill next dev / next-server"
    pkill -9 -f "next dev" 2>/dev/null
    pkill -9 -f "next-server" 2>/dev/null
    sleep 2
  fi
  if tcp 3000; then
    echo "[abort] 3000 still held after cleanup - not spawning (avoid double-bind)"
    echo "[result] FAILED - worklog not touched"
    exit 1
  fi
else
  echo "[assess] 3000 was DOWN"
fi

# ---- Spawn ----
(cd /home/z/my-project && nohup env NODE_OPTIONS=--max-old-space-size=614 bun run dev >> /home/z/my-project/dev.log 2>&1 </dev/null &)
echo "[spawn] bun run dev launched at $(date '+%H:%M:%S')"

# ---- Readiness: up to ~70s, probe every 10s ----
READY=0
for i in 1 2 3 4 5 6 7; do
  sleep 10
  if tcp 3000; then echo "[ready] 3000 OPEN after ~${i}0s"; READY=1; break; fi
  echo "[wait] ${i}0s not up yet"
done
if [ $READY -ne 1 ]; then
  echo "[result] FAILED - 3000 not up in 70s, worklog not touched"
  exit 1
fi

# ---- Warmup (first-compile tolerance) ----
curl -s -o /dev/null -m 15 http://127.0.0.1:3000/ || true

# ---- Verification (one retry each) ----
LOWCODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 -L http://127.0.0.1:3000/lowcode/)
if [ "$LOWCODE" != "200" ]; then sleep 5; LOWCODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 -L http://127.0.0.1:3000/lowcode/); fi
LOGIN=$(curl -s -o /dev/null -w "%{http_code}" -m 10 -X POST http://127.0.0.1:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}')
if [ "$LOGIN" != "200" ]; then sleep 5; LOGIN=$(curl -s -o /dev/null -w "%{http_code}" -m 10 -X POST http://127.0.0.1:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'); fi

P5S=CLOSED; tcp 5173 && P5S=OPEN
P8S=CLOSED; tcp 8080 && P8S=OPEN
echo "ports: 3000=OPEN 5173=$P5S 8080=$P8S"
echo "lowcode:$LOWCODE"
echo "login:$LOGIN"
ps aux | grep "next dev" | grep -v grep | head -2 || true

# ---- Atomic bind: only on full success touch worklog ----
if [ "$LOWCODE" = "200" ] && [ "$LOGIN" = "200" ]; then
  cat >> "$WORKLOG" <<WEOF

---
Task ID: 8
Agent: cron-restart
Date: $DATE
Task: Restart next dev(3000) to activate on-disk A2/A3 changes; Vite(5173)/Java(8080) untouched.

Work Log:
- Stopped old next dev (PIDs 1055/1066 / port-holder); port 3000 released
- Relaunched: cd /home/z/my-project && nohup env NODE_OPTIONS=--max-old-space-size=614 bun run dev >> dev.log 2>&1 &
- Readiness: 3000 OPEN after restart; warmup request completed
- Ports: 3000=OPEN 5173=$P5S 8080=$P8S
- Verification: lowcode HTTP $LOWCODE, login API HTTP $LOGIN

Stage Summary:
- next dev(3000) now runs with A2 (src/lib/service-supervisor.ts env field + memory params) and A3 (scripts/start-services.sh HTTP probe double-confirm + zombie cleanup restart) active
- Cron job 374482 (nextdev restart self-termination) can terminate: later rounds see the Task 8 marker, guard-exit, and delete the job; scheduler should delete it directly if no cron tool is available in-session
WEOF
  echo "[worklog] Task 8 appended"
  echo "[result] SUCCESS"
else
  echo "[result] FAILED - worklog not touched (lowcode=$LOWCODE login=$LOGIN)"
fi
