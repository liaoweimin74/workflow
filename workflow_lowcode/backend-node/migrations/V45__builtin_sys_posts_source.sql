-- V45: 预置第 9 个内建系统数据源「系统岗位」（sys-posts）
--
-- 背景：成员组管理重构为数据引用（DataPicker）录入后，自动规则的「按岗位」
-- 维度需要一个岗位数据源。目录唯一事实源 system-source-catalog.ts 已新增
-- sys-posts 定义（列/分页语义），本迁移按 V39 的同款幂等模式预置
-- `wf_data_source` 行（固定 id `ds-builtin-sys-posts`）。
--
-- 与 V39 相同的防御：
--   1. 清理同名历史行（保留 id 不是 `ds-builtin-<source_key>` 的，避免重名冲突）
--   2. 按 id 缺则插入（NOT EXISTS），重复执行安全
--
-- 取数语义（SystemSourceQueryService.queryPosts）：仅启用岗位（status=1）、
-- 标准分页、keyword 匹配岗位名称/编码 —— 对齐旧 UI 的 listPostOptions。

DELETE FROM wf_data_source
WHERE name = '系统岗位' AND type = 'SYSTEM'
  AND id <> CONCAT('ds-builtin-', source_key);

INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-sys-posts', 'system', '系统岗位', 'SYSTEM', NULL, 'sys-posts', NULL,
       '{"list":{"action":"/api/v1/internal/system/posts","method":"GET"}}',
       'ENABLED', 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-sys-posts');
