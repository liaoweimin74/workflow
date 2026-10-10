#!/bin/bash
# ============================================================
# dump-db.sh — MariaDB 全量快照 + 本地 git 提交（重置不丢数据）
#
# 原理：沙箱环境重供给只保留 git 追踪状态（2026-10-09 四次重置实证），
#       本地 git 历史（含平台 cron 快照提交）跨重置幸存。
#       因此：dump → backups/（git 追踪）→ commit = 数据持久化。
#
# 用法：bash scripts/dump-db.sh（幂等，mariadb 不在线时静默跳过）
# 建议频率：每小时巡检轮首（RPO ≤ 1 小时）
# ============================================================
set -u

MDB=/home/z/my-project/mariadb-user
M="$MDB/root/bin/mariadb"
DUMPBIN="$MDB/root/bin/mariadb-dump"
BACKUPS=/home/z/my-project/backups
TS=$(date +%Y%m%d-%H%M%S)
export LD_LIBRARY_PATH="$MDB/sysroot/usr/lib/x86_64-linux-gnu:$MDB/root/usr/lib/x86_64-linux-gnu"

mkdir -p "$BACKUPS"

# mariadb 必须在线（冷启动时由 recover-dplus.sh 重建后再 dump）
if ! (exec 3<>"/dev/tcp/127.0.0.1/3306") 2>/dev/null; then
  echo "[dump-db] 3306 不在线，跳过本轮"
  exit 0
fi

DUMP_WF="$BACKUPS/db-workflow-full-$TS.sql"
DUMP_V6="$BACKUPS/db-workflow_v6-$TS.sql"

"$DUMPBIN" -u root -p740130 -S "$MDB/mysql.sock" --databases workflow > "$DUMP_WF" 2>/dev/null
"$DUMPBIN" -u root -p740130 -S "$MDB/mysql.sock" --databases workflow_v6 > "$DUMP_V6" 2>/dev/null

# 有效性检查：非空且含建表语句（mariadb 刚被拉起但数据未导时会产出空壳 dump）
if [ ! -s "$DUMP_WF" ] || ! grep -q 'CREATE TABLE' "$DUMP_WF"; then
  echo "[dump-db] workflow dump 无效，放弃本轮"
  rm -f "$DUMP_WF" "$DUMP_V6"
  exit 1
fi

# 每库只保留最近 3 份
ls -1t "$BACKUPS"/db-workflow-full-*.sql 2>/dev/null | tail -n +4 | xargs -r rm -f
ls -1t "$BACKUPS"/db-workflow_v6-*.sql 2>/dev/null | tail -n +4 | xargs -r rm -f

# 本地 git 提交（无推送凭证，本地历史即持久层）
cd /home/z/my-project
git add -A backups/ 2>/dev/null
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "backup: db dump $TS" -q
fi

echo "[dump-db] OK $TS workflow=$(du -h "$DUMP_WF" | cut -f1) v6=$(du -h "$DUMP_V6" | cut -f1)"
# 推送（凭证由 credential.helper store 提供；失败必须显式告警，禁止静默吞掉）
if ! git push origin main >/dev/null 2>&1; then
  echo "[dump-db][WARN] git push FAILED $(date '+%F %T')——远端落后，凭据或网络需人工检查" | tee -a /home/z/tools/dump-db-push-fail.log >&2
fi
