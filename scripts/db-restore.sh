#!/bin/bash
# workflow 库恢复（Task 136）——与 db-dump.sh 配对使用
#
# 用法: bash scripts/db-restore.sh <dump文件> [目标库]
#   目标库缺省 workflow
# 行为：DROP 目标库 → 重建 → 导入 dump（dump 自含 DROP TABLE/外键关闭）
# 警告：目标库将被整体替换！
set -euo pipefail

M=/home/z/my-project/mariadb-user/root/bin/mysql
SOCK=/home/z/my-project/mariadb-user/mysql.sock
export LD_LIBRARY_PATH=/home/z/my-project/mariadb-user/root/usr/lib/x86_64-linux-gnu

DUMP="${1:?用法: db-restore.sh <dump文件> [目标库]}"
DB="${2:-workflow}"
[ -f "$DUMP" ] || { echo "[restore] dump 文件不存在: $DUMP"; exit 1; }

$M -uroot -p740130 -S "$SOCK" -e "DROP DATABASE IF EXISTS \`$DB\`; CREATE DATABASE \`$DB\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
$M -uroot -p740130 -S "$SOCK" "$DB" < "$DUMP" 2>/dev/null

T=$($M -uroot -p740130 -S "$SOCK" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB';" 2>/dev/null | tail -1)
echo "[restore] $DB 恢复完成：$T 张表（源: $DUMP）"
echo "[restore] 提醒：恢复后 flyway_schema_history 随库带回，Java 重启不会重跑迁移；如需全新迁移链请改用 CREATE DATABASE + Java 启动自建"
