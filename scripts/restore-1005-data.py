#!/usr/bin/env python3
"""从 10/5 dump 恢复近期业务数据到 workflow 库（当前库三表均为空，直接 INSERT）"""
import pymysql
import re

DUMP = "/home/z/my-project/workflow_lowcode/scripts/db-backup/workflow-dump-20261005-fixed.sql"
TABLES = ["wf_form_def", "wf_page_def", "wf_process_draft"]

sql_text = open(DUMP, encoding="utf-8", errors="replace").read()
lines = sql_text.split("\n")

stmts = []  # (table, sql)
i = 0
while i < len(lines):
    line = lines[i]
    m = re.match(r"INSERT INTO `(" + "|".join(TABLES) + r")` ", line)
    if m:
        # 跨行语句，直到以 ; 结束
        buf = [line]
        while not buf[-1].rstrip().endswith(";"):
            i += 1
            buf.append(lines[i])
        stmts.append((m.group(1), "\n".join(buf)))
    i += 1

print("提取到 INSERT 语句:", [(t, 1) for t, _ in stmts])

conn = pymysql.connect(
    unix_socket="/home/z/my-project/mariadb-user/mysql.sock",
    user="root", password="740130", database="workflow", charset="utf8mb4",
)
cur = conn.cursor()
try:
    for table, stmt in stmts:
        # 防重复：id 已存在则跳过
        idm = re.search(r"VALUES \('([^']+)'", stmt)
        rid = idm.group(1) if idm else None
        if rid:
            cur.execute(f"SELECT COUNT(*) FROM `{table}` WHERE id=%s", (rid,))
            if cur.fetchone()[0] > 0:
                print(f"跳过 {table} id={rid}（已存在）")
                continue
        cur.execute(stmt)
        print(f"恢复 {table} id={rid} OK")
    conn.commit()
    for table in TABLES:
        cur.execute(f"SELECT COUNT(*) FROM `{table}`")
        print(f"{table} 现有 {cur.fetchone()[0]} 行")
except Exception as e:
    conn.rollback()
    print("ERROR:", e)
finally:
    conn.close()
