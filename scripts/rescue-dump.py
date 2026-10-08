#!/usr/bin/env python3
"""数据抢救导出：workflow + workflow_v6 全库结构+数据 -> SQL 文件
背景：2026-10-08 08:39(UTC+8) workflow 库被重置，wf_ 业务数据丢失且无任何备份。
本脚本将现存所有数据导出为标准 SQL，落盘 backups/ 目录防再丢。
"""
import pymysql
import os
import datetime

OUT_DIR = "/home/z/my-project/backups"
os.makedirs(OUT_DIR, exist_ok=True)
STAMP = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

SCHEMAS = ["workflow", "workflow_v6"]


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (bytes, bytearray)):
        return "_binary'{}'".format("".join("\\x%02x" % b for b in v))
    if isinstance(v, datetime.datetime):
        return "'{}'".format(v.isoformat(sep=" "))
    if isinstance(v, datetime.date):
        return "'{}'".format(v.isoformat())
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r")
    return "'{}'".format(s)


def dump_schema(conn, schema):
    cur = conn.cursor()
    cur.execute("SHOW TABLES")
    tables = [r[0] for r in cur.fetchall()]
    lines = [
        "-- rescue dump {}: schema={}".format(STAMP, schema),
        "SET NAMES utf8mb4;",
        "SET FOREIGN_KEY_CHECKS=0;",
        "CREATE DATABASE IF NOT EXISTS `{}` DEFAULT CHARACTER SET utf8mb4;".format(schema),
        "USE `{}`;".format(schema),
        "",
    ]
    total_rows = 0
    for t in tables:
        cur.execute("SHOW CREATE TABLE `{}`".format(t))
        create_sql = cur.fetchone()[1]
        lines.append("DROP TABLE IF EXISTS `{}`;".format(t))
        lines.append(create_sql + ";")
        cur.execute("SELECT * FROM `{}`".format(t))
        rows = cur.fetchall()
        if rows:
            cols = [d[0] for d in cur.description]
            col_sql = ",".join("`{}`".format(c) for c in cols)
            for chunk_start in range(0, len(rows), 200):
                chunk = rows[chunk_start:chunk_start + 200]
                vals = ",".join("({})".format(",".join(q(v) for v in row)) for row in chunk)
                lines.append("INSERT INTO `{}` ({}) VALUES {};".format(t, col_sql, vals))
        total_rows += len(rows)
        lines.append("")
    lines.append("SET FOREIGN_KEY_CHECKS=1;")
    return "\n".join(lines), tables, total_rows


def main():
    conn = pymysql.connect(
        unix_socket="/home/z/my-project/mariadb-user/mysql.sock",
        user="root", password="740130", charset="utf8mb4",
    )
    summary = []
    for schema in SCHEMAS:
        conn.select_db(schema)
        sql, tables, total = dump_schema(conn, schema)
        out = os.path.join(OUT_DIR, "rescue-{}-{}.sql".format(schema, STAMP))
        with open(out, "w", encoding="utf-8") as f:
            f.write(sql)
        summary.append((schema, len(tables), total, out, os.path.getsize(out)))
    conn.close()
    print("=== 抢救导出完成 ===")
    for s in summary:
        print("schema={} tables={} rows={} file={} ({} bytes)".format(*s))


if __name__ == "__main__":
    main()
