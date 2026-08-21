-- V22: 添加 form_id 字段到 wf_data_source 表
-- 用于关联业务表单数据源

ALTER TABLE wf_data_source ADD COLUMN form_id VARCHAR(64) COMMENT '关联的业务表单ID';

-- 为 form_id 字段添加索引
CREATE INDEX idx_wf_data_source_form_id ON wf_data_source(form_id);