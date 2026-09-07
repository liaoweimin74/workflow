-- source_key 泛化为全类型唯一标识（租户内唯一）：
-- 1. 存量 FORM/WORKFLOW 回填 source_key = form_key（其表单 key 本就租户内唯一）
-- 2. 建立租户内唯一索引兜底（SQL/API 等未填 source_key 的行保持 NULL，唯一索引对 NULL 不互斥）
UPDATE wf_data_source
SET source_key = form_key
WHERE type IN ('FORM', 'WORKFLOW')
  AND (source_key IS NULL OR source_key = '');

CREATE UNIQUE INDEX uk_ds_tenant_source_key
ON wf_data_source (tenant_id, source_key);
