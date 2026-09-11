#!/bin/bash
# deploy-sqlmodel-fix.sh — 部署 SQL 模型下拉修复的最后一步：
# 重启后端（旧进程 3588 跑的是修复前代码）→ 就绪等待 → 端点验证 + 回归。
# 只动 8080 后端；Vite(5173) / next dev(3000) 不触碰。
set -u
JAR=/home/z/my-project/workflow_lowcode/backend/target/workflow-platform-1.0.0-SNAPSHOT.jar

tcp() { (exec 3<>/dev/tcp/127.0.0.1/$1) 2>/dev/null; }
http_code() { curl -s -o /dev/null -m 5 -w '%{http_code}' "$1" 2>/dev/null; }

echo "[step1] 停止旧后端 (仅匹配本平台 jar 的进程)"
OLDPID=$(pgrep -f "workflow-platform-1.0.0-SNAPSHOT.jar" | head -1)
echo "  old pid=$OLDPID"
# -9 直接释放端口，规避 supervisor 看门狗竞速拉起时抢 H2 文件锁（worklog Task 6 教训）
kill -9 "$OLDPID" 2>/dev/null
for i in 1 2 3 4 5; do
  tcp 8080 || { echo "[step1] 8080 已释放 (~$((i))s)"; break; }
  sleep 1
  [ $i -eq 5 ] && { echo "[abort] 8080 未释放"; exit 1; }
done

echo "[step2] A3 加固脚本拉起新后端（新 jar，带内存上限）"
bash /home/z/my-project/scripts/start-services.sh

echo "[step3] 就绪等待（后端启动约 20-30s：Hibernate→Flyway→Flowable→Tomcat）"
READY=0
for i in $(seq 1 18); do
  sleep 5
  C=$(http_code "http://127.0.0.1:8080/")
  if [ "$C" != "000" ]; then echo "[ready] 8080 HTTP ${C} after ~$((i*5))s"; READY=1; break; fi
  echo "[wait] $((i*5))s ..."
done
[ $READY -eq 1 ] || { echo "[abort] 后端 90s 未就绪，查日志 tail /home/z/tools/backend.log"; tail -5 /home/z/tools/backend.log; exit 1; }

echo "[step4] 登录 + 端点验证"
TOKEN=$(curl -s -m 10 -X POST http://127.0.0.1:8080/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('accessToken',''))" 2>/dev/null)
echo "  token_len=${#TOKEN}"

echo "  -- /db/tables:"
curl -s -m 10 http://127.0.0.1:8080/api/v1/data-sources/db/tables -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: default" | python3 -c "
import sys,json
d=json.load(sys.stdin); t=d.get('data') or []
print('  code=',d.get('code'),' count=',len(t))
print('  sample=',t[:8])
biz=[x for x in t if x.startswith('wf_')]
print('  wf_ tables=',len(biz))"

echo "  -- /db/tables/form_definition/columns:"
curl -s -m 10 "http://127.0.0.1:8080/api/v1/data-sources/db/tables/form_definition/columns" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: default" | python3 -c "
import sys,json
d=json.load(sys.stdin); c=d.get('data') or []
print('  code=',d.get('code'),' cols=',len(c))
for x in c[:4]: print('   ',x.get('key'),x.get('columnType'))"

echo "[step5] 回归：三端口 + 3000 网关链路"
for p in 3000 5173 8080; do tcp $p && echo "  $p OPEN" || echo "  $p CLOSED"; done
echo "  lowcode(3000): $(http_code -L http://127.0.0.1:3000/lowcode/)"
echo "  login(3000):   $(http_code -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}')"
ps aux | grep "next dev" | grep -v grep | head -1 | awk '{print "  next dev pid:",$2}'
pgrep -f "vite" >/dev/null && echo "  vite: alive" || echo "  vite: DEAD(!)"
echo "[done]"
