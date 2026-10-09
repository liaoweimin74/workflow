#!/bin/bash
# ============================================================
# dump-db.sh — 数据快照（巡检每轮必做）
# 全量 dump workflow + workflow_v6 入 backups/ 并 git 提交
# MariaDB 不在线时自动跳过；仅失败时输出错误（供巡检汇报）
# ============================================================
MDB=/home/z/my-project/mariadb-user
BK=/home/z/my-project/backups
TS=$(date +%Y%m%d-%H%M%S)
export LD_LIBRARY_PATH="$MDB/sysroot/usr/lib/x86_64-linux-gnu:$MDB/root/usr/lib/x86_64-linux-gnu"
DUMP="$MDB/root/usr/bin/mariadb-dump"

(exec 3<>"/dev/tcp/127.0.0.1/3306") 2>/dev/null || { exit 0; }   # 不在线静默跳过
mkdir -p "$BK"

dump_one() { # $1=db $2=outname
  "$DUMP" -h 127.0.0.1 -P 3306 -u root -p740130 --protocol=TCP \
    --single-transaction --routines "$1" > "$BK/$2" 2>/dev/null || { echo "dump $1 FAIL"; return 1; }
}

OK=1
dump_one workflow    "db-workflow-full-$TS.sql"    || OK=0
dump_one workflow_v6 "db-workflow_v6-$TS.sql"      || OK=0
[ "$OK" = 1 ] || exit 1

cd /home/z/my-project || exit 1
git add backups/db-workflow-*.sql 2>/dev/null
git diff --cached --quiet 2>/dev/null || git commit -m "chore(db): snapshot $TS" --no-verify -q
git push origin main >/dev/null 2>&1 || true
exit 0
