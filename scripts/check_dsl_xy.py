#!/usr/bin/env python3
"""检查 wf_logic_flow 表中 DSL 的节点 x/y 持久化情况（定位批处理节点位置丢失问题）"""
import json
import pymysql

conn = pymysql.connect(
    unix_socket='/home/z/my-project/mariadb-user/mysql.sock',
    user='root',
    password='740130',
    database='workflow',
    cursorclass=pymysql.cursors.DictCursor,
)
try:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, flow_key, name, dsl_json, updated_at FROM wf_logic_flow ORDER BY updated_at DESC LIMIT 8"
        )
        rows = cur.fetchall()
finally:
    conn.close()

for r in rows:
    dsl = r.get('dsl_json') or ''
    print(f"=== {r['flow_key']} ({r['name']}) updated={r['updated_at']} dsl_len={len(dsl)}")
    try:
        obj = json.loads(dsl)
    except Exception as e:
        print(f"  !! DSL 解析失败: {e}")
        continue
    for n in obj.get('nodes', []):
        has_xy = 'x' in n and 'y' in n
        print(f"  node {n.get('id'):24s} type={str(n.get('type')):10s} x={n.get('x')!r:10} y={n.get('y')!r:10} xy_present={has_xy}")
        cfg = n.get('config') or {}
        if n.get('type') == 'BATCH':
            body = cfg.get('body') or []
            print(f"    BATCH body: {len(body)} items, ids={[b.get('id') for b in body]}")
