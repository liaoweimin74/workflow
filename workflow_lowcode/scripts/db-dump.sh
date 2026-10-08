#!/bin/bash
# workflow 库备份（Task 136）——bin 无 mysqldump 的替代方案
#
# 原理：让数据库自己生成 INSERT（QUOTE() 处理全部转义，含多行 BPMN XML /
# 引号 / 反斜杠），脚本只负责拼接结构（SHOW CREATE TABLE）与文件骨架。
# 列清单从 information_schema 动态读取，NULL 用 IF(col IS NULL,'NULL',QUOTE(col))。
#
# 用法: bash scripts/db-dump.sh [输出文件] [库名]
#   输出文件缺省 scripts/db-backup/workflow-dump-<YYYYmmdd-HHMM>.sql
#   库名缺省 workflow（自洽校验时可传临时库：dump→restore→re-dump→diff）
# 恢复: bash scripts/db-restore.sh <dump文件> [目标库]
set -euo pipefail

M=/home/z/my-project/mariadb-user/root/bin/mysql
SOCK=/home/z/my-project/mariadb-user/mysql.sock
export LD_LIBRARY_PATH=/home/z/my-project/mariadb-user/root/usr/lib/x86_64-linux-gnu

OUT="${1:-/home/z/my-project/workflow_lowcode/scripts/db-backup/workflow-dump-$(date +%Y%m%d-%H%M).sql}"
DB="${2:-workflow}"
mkdir -p "$(dirname "$OUT")"
OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

echo "SET NAMES utf8mb4;" > "$OUT_ABS"
echo "SET FOREIGN_KEY_CHECKS=0;" >> "$OUT_ABS"

# 有数据的表 + 全部表清单
TABLES=$($M -uroot -p740130 -S "$SOCK" -N -e \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='$DB' AND table_type='BASE TABLE' ORDER BY table_name;" 2>/dev/null)

CNT=0
for T in $TABLES; do
  CNT=$((CNT+1))
  # 结构（--raw 保留真换行，否则 CREATE TABLE 里的 \n 是字面量两字符）
  echo "" >> "$OUT_ABS"
  echo "-- ===== table: $T =====" >> "$OUT_ABS"
  echo "DROP TABLE IF EXISTS \`$T\`;" >> "$OUT_ABS"
  $M --raw -uroot -p740130 -S "$SOCK" -N -e "SHOW CREATE TABLE \`$DB\`.\`$T\`" 2>/dev/null \
    | cut -f2 >> "$OUT_ABS"
  echo ";" >> "$OUT_ABS"

  # 数据（QUOTE 转义方案）
  ROWS=$($M -uroot -p740130 -S "$SOCK" -N -e \
    "SELECT COUNT(*) FROM \`$DB\`.\`$T\`" 2>/dev/null)
  [ "$ROWS" = "0" ] && continue

  # 注意：GROUP_CONCAT 默认 1024 字符截断，宽表表达式会被斩断致 INSERT 残缺（已踩坑）
  GCMAX="SET SESSION group_concat_max_len=1048576;"
  COLS=$($M -uroot -p740130 -S "$SOCK" -N -e \
    "$GCMAX SELECT GROUP_CONCAT('\`', column_name, '\`' ORDER BY ordinal_position SEPARATOR ',') FROM information_schema.columns WHERE table_schema='$DB' AND table_name='$T';" 2>/dev/null | tail -1)
  EXPR=$($M -uroot -p740130 -S "$SOCK" -N -e \
    "$GCMAX SELECT GROUP_CONCAT('IF(\`', column_name, '\` IS NULL, ''NULL'', QUOTE(\`', column_name, '\`))' ORDER BY ordinal_position SEPARATOR ',') FROM information_schema.columns WHERE table_schema='$DB' AND table_name='$T';" 2>/dev/null | tail -1)
  PK=$($M -uroot -p740130 -S "$SOCK" -N -e \
    "$GCMAX SELECT GROUP_CONCAT('\`', column_name, '\`' ORDER BY seq_in_index SEPARATOR ',') FROM information_schema.statistics WHERE table_schema='workflow' AND table_name='$T' AND index_name='PRIMARY';" 2>/dev/null | tail -1)

  echo "-- rows: $ROWS" >> "$OUT_ABS"
  # 每行一条 INSERT：GROUP BY 主键逐行分组，行内各列用 CONCAT_WS(',',...) 真逗号连接
  # （此前的 CONCAT 参数列表写法中，EXPR 间逗号是参数分隔符而非输出内容——已踩坑）
  # printf %s 字面替换后管道给 mysql，杜绝 EXPR 中列名反引号被 shell 命令替换吞掉（已踩坑）
  # [Task 138 第四坑] 数据管道必须 --raw：否则 client 输出层把 QUOTE 产生的 \\ 再翻倍成
  # \\\\，导入后多一层转义（内嵌 JSON 的 \" 变 \\\" → JSON.parse 断裂）。BPMN XML 无反斜杠
  # 故幸存，schema 内嵌 JSON 首次踩中。自洽校验法：dump→restore→re-dump→diff 必须为空。
  printf "SELECT CONCAT('INSERT INTO \`%s\` (%s) VALUES (', GROUP_CONCAT(CONCAT_WS(',', %s) SEPARATOR ','), ');') FROM \`%s\`.\`%s\` GROUP BY %s;" \
    "$T" "$COLS" "$EXPR" "$DB" "$T" "$PK" \
    | $M --raw -uroot -p740130 -S "$SOCK" -N 2>/dev/null >> "$OUT_ABS"
done

echo "SET FOREIGN_KEY_CHECKS=1;" >> "$OUT_ABS"
echo "[dump] $CNT 张表 → $OUT_ABS ($(du -h "$OUT_ABS" | cut -f1))"
