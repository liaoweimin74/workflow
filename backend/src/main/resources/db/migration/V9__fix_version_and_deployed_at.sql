-- ============================================================
-- V9: 修正 version 语义 + 补全 lastDeployedAt
-- version: 未部署=0，部署后=Flowable processDefinition.version
-- lastDeployedAt: 已部署但为空的历史数据用 updated_at 补全
-- ============================================================

-- 草稿状态 version 设为 0
UPDATE wf_process_draft SET version = 0 WHERE status = 'DRAFT';

-- 已部署但 lastDeployedAt 为空的历史数据，用 updated_at 近似补全
UPDATE wf_process_draft SET last_deployed_at = updated_at
WHERE status = 'DEPLOYED' AND last_deployed_at IS NULL;
