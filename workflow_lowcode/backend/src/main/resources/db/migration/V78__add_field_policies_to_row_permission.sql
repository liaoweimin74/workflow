-- B 组字段策略（designs 2026-10-25 §2.4：脱敏并入数据范围，grant 扩展字段策略，缺省跟权限对象基线）
-- 存储形态：JSON 数组 [{column, policy: VISIBLE|MASK|HIDDEN, rule: 仅 MASK}]；NULL = 无策略（全列可见，存量零破坏）
-- 合并语义：链内 grant 覆写对象基线；跨链按列取最严（strictest-wins，FieldPolicies 唯一实现）

ALTER TABLE `wf_row_permission`
    ADD COLUMN `field_policies_json` TEXT NULL COMMENT '字段策略基线：JSON 数组 [{column,policy,rule}]；NULL=无策略（全列可见）';

ALTER TABLE `wf_row_permission_grant`
    ADD COLUMN `field_policies_json` TEXT NULL COMMENT '授予级字段策略覆写：同列以 grant 为准；NULL=跟对象基线';
