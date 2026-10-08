-- ============================================================
-- V48: 修正 wf_node_config 唯一键 —— 对位 Nest V38（Java 侧同步修复）
--
-- 【问题（Task 130f 部署「请假」流程实测暴露）】
--   Java 基线（workflow.sql）与 V4 时代的 `UNIQUE KEY uk_node (tenant_id,
--   process_def_id, node_id)` 与数据模型矛盾：节点的配置行本来就有两类并存——
--     · 编辑态行：process_definition_id IS NULL（设计器当前配置）
--     · 部署快照行：process_definition_id = <Flowable 定义 id>（每版本一行，
--       由 ProcessDesignService.snapshotNodeConfigs 在部署时复制生成）
--   同一 (draft, node) 两类行并存是设计使然 ⇒ uk_node 过窄。
--   实测：任何带节点配置的草稿执行部署，快照插入即撞
--   `Duplicate entry 'default-<draftId>-__PROCESS__' for key 'uk_node'`。
--   （此前未暴露：历史部署均无编辑态配置，快照复制提前 return。）
--
-- 【修复】唯一键换成含版本的四列（对齐 Nest V38 逐语义）：
--   (tenant_id, process_def_id, node_id, process_definition_id)
--   · MariaDB 唯一索引把 NULL 视作互不相同 ⇒ 编辑态行（NULL）不受约束，
--     单行不变量由 saveDesign 的 delete+insert 保证；
--   · 同版本同节点仍不允许重复快照行（保留原意图）；
--   · 两步 DDL 均带守卫，可重复执行。
-- 实体同步：NodeConfig.java 的 @UniqueConstraint 同步为 uk_node_version
-- （Hibernate 全新建表路径直接正确；update 模式不改既有约束，以此迁移为准）。
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
