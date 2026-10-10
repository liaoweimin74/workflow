#!/bin/bash
# qa-sqlmodel-status.sh — SQL 模型下拉修复部署状态快照（只读，不改动任何服务）
JAR=/home/z/my-project/workflow_lowcode/backend/target/workflow-platform-1.0.0-SNAPSHOT.jar
SRC=/home/z/my-project/workflow_lowcode/backend/src/main/java/com/workflow/engine/form/column/DynamicTableManager.java
echo "== $(date -u '+%Y-%m-%d %H:%M:%S') UTC =="
stat -c 'src mtime: %y' "$SRC" 2>/dev/null | cut -c1-19,32-
stat -c 'jar mtime: %y' "$JAR" 2>/dev/null | cut -c1-19,32-
ps -o pid,lstart,etime -C java 2>/dev/null | tail -n +2
TOKEN=$(curl -s -m 10 -X POST http://127.0.0.1:8080/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('accessToken',''))" 2>/dev/null)
echo "-- GET /db/tables:"
curl -s -m 10 http://127.0.0.1:8080/api/v1/data-sources/db/tables -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: default" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin); t=d.get('data') or []
    print('  code=',d.get('code'),' count=',len(t),' first5=',t[:5])
except Exception as e: print('  parse-fail:',e)"
echo "-- GET /db/tables/form_definition/columns:"
curl -s -m 10 "http://127.0.0.1:8080/api/v1/data-sources/db/tables/form_definition/columns" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: default" | head -c 300
echo
