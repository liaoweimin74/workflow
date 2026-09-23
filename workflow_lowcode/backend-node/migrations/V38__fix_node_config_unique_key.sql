-- ============================================================
-- V38: 修正 wf_node_config 的唯一键 —— 旧键与数据模型矛盾
-- ============================================================
--
-- 【问题（由并发控制测试暴露）】
--   V4 建表时声明了 `UNIQUE KEY uk_node (tenant_id, process_def_id, node_id)`。
--   但节点的配置行**本来就会有两类并存**：
--     · 编辑态行：`process_definition_id IS NULL`（设计器正在编辑的当前配置）
--     · 部署快照行：`process_definition_id = <key:version>`（每个部署版本一行，配置随版本冻结）
--   同一个 (draft, node) 同时存在这两类行是**设计使然**（见 `ProcessConfigResolver`
--   按部署版本读快照、`findEditingConfigs` 读编辑态），所以 uk_node 定义过窄。
--
-- 【实测证据：两种来源的库行为不一致】
--   · `workflow_v6`（契约库，表由 Java/Hibernate 先建，V4 的 CREATE IF NOT EXISTS 成了空操作）
--     ⇒ **没有** uk_node，带节点配置的流程可以正常部署（契约场景一直全绿）；
--   · 只跑 Node 迁移的全新库（`workflow_node_test` / 并发测试库）
--     ⇒ **有** uk_node ⇒ 部署时插入快照行与新键冲突：
--       `Duplicate entry 'default-<draftId>-Approve_1' for key 'uk_node'`（HTTP 500）。
--   也就是说：**Node 在全新库上无法部署任何带节点配置的流程** —— 独立部署的硬阻塞。
--   （P8 的「全新库冒烟」只打了 login 与读端点，没走部署，因此没发现。）
--
-- 【本迁移做什么】
--   把唯一键换成**包含版本**的版本：`(tenant_id, process_def_id, node_id, process_definition_id)`。
--   · 保留原意图（同一版本下同节点不允许重复快照行 —— 能挡住"重复快照"这类 bug）；
--   · MySQL 的唯一索引把 NULL 视作互不相同 ⇒ 编辑态行（NULL）不受影响，仍只有一行；
--   · 先删旧键再建新键，两步都带守卫，可重复执行（在 workflow_v6 上等价于只加新键）。
--
-- ⚠️ 不动 V4（约束 C5：V2–V31 必须逐字节保持），修正只能以新迁移的形式叠加。
-- ============================================================


-- ---------- 1. 删除过窄的旧唯一键（若存在） ----------
SET @ddl = (
    SELECT IF(COUNT(*) > 0,
              'ALTER TABLE wf_node_config DROP INDEX uk_node',
              'SELECT 1')
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_node_config' AND INDEX_NAME = 'uk_node'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------- 2. 建版本感知的新唯一键（若不存在） ----------
SET @ddl = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE wf_node_config ADD UNIQUE KEY uk_node_version (tenant_id, process_def_id, node_id, process_definition_id)',
              'SELECT 1')
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_node_config'
      AND INDEX_NAME = 'uk_node_version'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
