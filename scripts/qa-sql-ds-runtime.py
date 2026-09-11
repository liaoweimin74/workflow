#!/usr/bin/env python3
"""SQL 数据源保存 + 运行时查询端到端验证（Task 10）"""
import json
import time
import urllib.request

BASE = "http://127.0.0.1:8080"


def api(path, payload=None, token=None, method=None):
    headers = {"Content-Type": "application/json", "X-Tenant-Id": "1"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method or ("POST" if data else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except Exception:
            return {"code": e.code, "msg": "http error"}


token = api("/api/auth/login", {"username": "admin", "password": "admin123"})["data"]["accessToken"]

# 1. 创建 SQL 数据源（SYS_USER JOIN SYS_ORGANIZATION，无 :tenantId——前端修复后可视化将生成的形态）
ds_name = "qa-sql-e2e-%d" % int(time.time())
params = {
    "queryMode": "visual",
    "query": "SELECT m.NICKNAME, m.USERNAME, s.ORG_NAME FROM SYS_USER m LEFT JOIN SYS_ORGANIZATION s ON m.ORG_ID = s.ID",
    "columns": [
        {"key": "NICKNAME", "label": "NICKNAME", "columnType": "VARCHAR", "sortable": True, "filterable": True},
        {"key": "USERNAME", "label": "USERNAME", "columnType": "VARCHAR", "sortable": True, "filterable": True},
        {"key": "ORG_NAME", "label": "ORG_NAME", "columnType": "VARCHAR", "sortable": True, "filterable": True},
    ],
}
r = api("/api/v1/data-sources", {"name": ds_name, "type": "SQL", "sourceKey": "qa_e2e_%d" % int(time.time()), "params": json.dumps(params)}, token)
print("create:", r.get("code"), r.get("msg", ""))
if r.get("code") != 200:
    raise SystemExit(1)
ds_id = r["data"]["id"]

# 2. 运行时分页查询（原 validate 会报 SQL 模板必须包含 :tenantId）
q = api("/api/v1/data-sources/%s/data?page=1&size=10" % ds_id, token=token)
if q.get("code") == 200:
    rows = (q["data"] or {}).get("records") or (q["data"] or {}).get("list") or []
    print("query: OK rows=%d sample=%s" % (len(rows), json.dumps(rows[0], ensure_ascii=False)[:120] if rows else "[]"))
else:
    print("query: FAIL", q.get("code"), str(q.get("msg", ""))[:120])

# 3. 清理测试数据源
d = api("/api/v1/data-sources/%s" % ds_id, token=token, method="DELETE")
print("cleanup:", d.get("code"), d.get("msg", ""))
