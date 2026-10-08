-- Task 141：成员组自动规则机制下线（前端管理界面重构为「左组导航 + 右成员表」，
-- 不再提供规则录入/维护能力；规则成员本就为运行时计算、从未物化入成员表，
-- 故历史规则数据无保留价值）。
-- 组/成员两表（sys_member_group / sys_member_group_member）继续服役。
DROP TABLE IF EXISTS sys_member_group_rule;
