-- ============================================================
-- V18: 流程草稿表新增部署配置 hash 列
-- deployed_config_hash: 上次部署时的配置指纹（改写后 XML + 节点配置整体 SHA-256）
-- 用于部署变化检测：配置任一变化即可部署，真正无变化才拦截
-- 历史数据该列为 NULL，部署时降级为旧的 XML 比较，部署成功后写入
-- ============================================================

ALTER TABLE wf_process_draft ADD COLUMN deployed_config_hash VARCHAR(64) NULL COMMENT '上次部署时的配置hash（XML+节点配置整体指纹）';
