-- Task 105：流程分类扁平化——取消树形结构，删除 parent_id 列。
-- 流程定义页改版为「分类胶囊」形态：分类仅作为一层平铺的筛选标签，
-- 不再支持父子层级，parent_id 及其专属索引 idx_parent 随之废弃。
-- （MariaDB 删除列时，仅含该列的索引 idx_parent 会被一并移除，无需显式 DROP INDEX。）
ALTER TABLE `wf_category`
  DROP COLUMN `parent_id`;
