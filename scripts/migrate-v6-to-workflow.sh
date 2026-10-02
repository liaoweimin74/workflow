#!/bin/bash
# ============================================================
# migrate-v6-to-workflow.sh — workflow_v6(Nest 时代) → workflow(Java 引擎)
#   历史业务数据补齐（幂等，可重复执行）
#
# 沿革：Task 129 首创（脚本留档 /tmp 随第十一次沙箱重置丢失），Task 130 重做
#   并仓库化留档——MariaDB 数据目录被重置回滚到 Task 129 迁移前快照时，
#   直接重跑本脚本即可恢复，无需手工重做。
#
# 方法论（Task 129 三坑闭环，重跑勿绕）：
#   ① SET FOREIGN_KEY_CHECKS=0 —— JPA 外键下 TRUNCATE 必败
#   ② 两库列顺序完全不同（Kysely 业务序 vs JPA 字母序），禁止 INSERT SELECT *，
#      必须按 information_schema 列名交集显式映射；v6 独有漂移列
#      （wf_category.parent_id / wf_process_draft.key）自动剔除
#   ③ wf_node_config 撞 uk_node 唯一键（草稿级 NULL/部署级两行）——
#      INSERT IGNORE + ORDER BY updated_at DESC 保留部署级
# 排除表：ACT_*/FLW_*（Flowable 自管）、flyway_schema_history、
#   sys_user/sys_role（Task 129 验证两库种子一致 admin/test 同 id）、
#   event_publication（v6 无）、wfe_*/wf_biz_*（v6 独有，Nest 自研引擎运行时/
#   动态业务表，Java 侧由引擎按表单部署自建）。
# ============================================================
set -uo pipefail

SOCK=/home/z/my-project/mariadb-user/mysql.sock
export LD_LIBRARY_PATH=/home/z/my-project/mariadb-user/root/usr/lib/x86_64-linux-gnu
MB=/home/z/my-project/mariadb-user/root/bin/mysql
MY() { "$MB" -S "$SOCK" -uroot -p740130 "$@"; }

TABLES=(
  msg_channel_config msg_delivery_retry msg_event_definition msg_message
  msg_recipient msg_subscription_rule msg_template msg_user_subscription
  sys_dict_data sys_dict_type
  sys_menu sys_organization sys_role_menu sys_user_role
  wf_category wf_data_source wf_engine_notify wf_form_data wf_form_def
  wf_node_config wf_page_def wf_process_draft wf_task_comment wf_task_remind wf_task_transfer
)

SQL_FILE=/tmp/migrate-v6-generated.sql
: > "$SQL_FILE"
echo "SET FOREIGN_KEY_CHECKS=0;" >> "$SQL_FILE"
echo "SET SESSION group_concat_max_len = 32768;" >> "$SQL_FILE"

MIGRATED=0; SKIPPED=0
for t in "${TABLES[@]}"; do
  # v6 同名表存在？
  EX=$(MY -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='workflow_v6' AND table_name='$t'" 2>/dev/null)
  if [ "$EX" != "1" ]; then echo "[skip] $t（v6 无同名表）"; SKIPPED=$((SKIPPED+1)); continue; fi
  # 列名交集（workflow 列 ∩ v6 列），反引号包裹防保留字；交集查询同时确认 workflow 表存在
  COLS=$(MY -N -e "SELECT GROUP_CONCAT(CONCAT('\`', c1.COLUMN_NAME, '\`') ORDER BY c1.COLUMN_NAME) FROM information_schema.columns c1 WHERE c1.table_schema='workflow' AND c1.table_name='$t' AND EXISTS (SELECT 1 FROM information_schema.columns c2 WHERE c2.table_schema='workflow_v6' AND c2.table_name=c1.table_name AND c2.column_name=c1.column_name)" 2>/dev/null)
  if [ -z "$COLS" ]; then echo "[skip] $t（列交集为空）"; SKIPPED=$((SKIPPED+1)); continue; fi
  # 有 updated_at 的表按其降序插入 + INSERT IGNORE，撞唯一键时保留最新（部署级）行
  HAS_UPD=$(MY -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='workflow_v6' AND table_name='$t' AND column_name='updated_at'" 2>/dev/null)
  ORD=""; [ "$HAS_UPD" != "0" ] && ORD=" ORDER BY updated_at DESC"
  {
    echo "TRUNCATE TABLE workflow.\`$t\`;"
    echo "INSERT IGNORE INTO workflow.\`$t\` ($COLS) SELECT $COLS FROM workflow_v6.\`$t\`$ORD;"
    echo "SELECT CONCAT('[migrated] $t rows=', ROW_COUNT()) AS log;"
  } >> "$SQL_FILE"
  MIGRATED=$((MIGRATED+1))
done
echo "SET FOREIGN_KEY_CHECKS=1;" >> "$SQL_FILE"

echo "---- 生成迁移 SQL：$MIGRATED 表迁移 / $SKIPPED 跳过 ----"
MY --table < "$SQL_FILE" 2>&1 | grep -E 'migrated|ERROR' || true

echo "---- 迁移后行数对照（v6 vs workflow）----"
{
  echo "SET SESSION group_concat_max_len = 32768;"
  for t in "${TABLES[@]}"; do
    echo "SELECT '$t' AS tbl, (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='workflow_v6' AND table_name='$t') AS v6_exists, (SELECT COUNT(*) FROM workflow_v6.\`$t\`) AS v6_cnt, (SELECT COUNT(*) FROM workflow.\`$t\`) AS wf_cnt HAVING v6_exists=1;"
  done
} | MY --table 2>/dev/null || echo "（部分对照查询失败，见上方日志）"
echo "---- 完成 ----"
echo
echo "【注意】wf_biz_* 动态业务表不在本脚本范围（v6 独有，Java 侧由表单发布流程建表）："
echo "  若 v6 的 wf_biz_<key> 有数据而 workflow 缺同名表，需两步："
echo "  ① POST /api/v1/form-definitions/<formDefId>/publish（republish 触发 Java DdlBuilder ensureTable 建表，Task 130d 验证）"
echo "  ② 按同名列 INSERT IGNORE ... SELECT 迁行（bill_test 结构与 v6 逐列一致）"
