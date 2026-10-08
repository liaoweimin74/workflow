-- ============================================================
-- V41: 审批意见表增加手写签名列
-- 配合节点 signature.enabled / useLast / allowUpload 配置：
--   - completeTask 提交时把 body.signature（dataURL）随 approve 意见落库
--   - useLast=true 的节点，getTaskDetail 查该用户最近一条签名回填
-- ============================================================

ALTER TABLE wf_task_comment
    ADD COLUMN signature LONGTEXT NULL COMMENT '手写签名 dataURL（signature.enabled 节点提交时存储，action=approve）' AFTER comment;
