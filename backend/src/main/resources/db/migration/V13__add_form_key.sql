-- ============================================================
-- 表单定义增加 form_key 列
-- 用于 CRUD 页面绑定到对应的已发布表单定义
-- ============================================================

ALTER TABLE wf_form_def ADD COLUMN form_key VARCHAR(100);

-- 添加索引以支持 by-key 查询
CREATE INDEX idx_form_def_form_key ON wf_form_def (form_key);
