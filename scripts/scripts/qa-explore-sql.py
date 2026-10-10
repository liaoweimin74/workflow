#!/usr/bin/env python3
"""explore-sql 探测回归套件（Task 10）"""
import json
import urllib.request

BASE = "http://127.0.0.1:8080"


def login():
    req = urllib.request.Request(
        BASE + "/api/auth/login",
        data=json.dumps({"username": "admin", "password": "admin123"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)["data"]["accessToken"]


def probe(token, sql):
    req = urllib.request.Request(
        BASE + "/api/v1/data-sources/explore-sql",
        data=json.dumps({"sql": sql}).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.load(e)


CASES = [
    ("R1 用户SQL(SYS_USER JOIN 无tenant)", "SELECT m.NICKNAME, m.USERNAME, s.ORG_NAME FROM SYS_USER m LEFT JOIN SYS_ORGANIZATION s ON m.ORG_ID = s.ID", 200),
    ("R2 JOIN+SELECT* (原重复列)", "SELECT * FROM WF_FORM_DEF m LEFT JOIN WF_FORM_DEF t ON m.ID = t.ID WHERE m.tenant_id = :tenantId", 200),
    ("R3 内联值+LIKE", "SELECT m.ID, m.NAME FROM WF_FORM_DEF m WHERE m.tenant_id = :tenantId AND m.STATUS = '1' AND m.NAME LIKE '%表单%'", 200),
    ("R4 已带LIMIT不重复追加", "SELECT m.ID, m.NAME FROM WF_FORM_DEF m WHERE m.tenant_id = :tenantId LIMIT 5", 200),
    ("R5 尾随行注释", "SELECT m.ID FROM WF_FORM_DEF m -- 注释", 200),
    ("R6 单表tenant(Task9回归)", "SELECT * FROM WF_FORM_DEF m WHERE m.tenant_id = :tenantId", 200),
    ("R7 IN列表", "SELECT m.ID, m.STATUS FROM WF_FORM_DEF m WHERE m.STATUS IN ('1', '2')", 200),
    ("R8 非SELECT拒绝", "DELETE FROM WF_FORM_DEF", 400),
    ("R9 多语句拒绝", "SELECT 1; DROP TABLE X", 400),
]

token = login()
passed = failed = 0
for name, sql, expect in CASES:
    res = probe(token, sql)
    code = res.get("code")
    ok = code == expect
    if isinstance(expect, int) and expect == 200:
        detail = f"{len(res['data'])} cols" if res.get("data") is not None else "no data"
    else:
        detail = str(res.get("msg", ""))[:60]
    print(f"{'PASS' if ok else 'FAIL'}  {name}: code={code} {detail}")
    if ok:
        passed += 1
    else:
        failed += 1
print(f"\n{passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
