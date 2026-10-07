-- Task 74：流程基本属性——草稿表增加「流程说明」列。
-- 设计器属性面板「基本属性」分组（流程名称/标识/分类/说明）的持久化通道：
--   name / key / category_id 三列此前已存在且 saveDesign 已透传，
--   仅缺 description（前端 store 有 draftDescription 但从未落库）。
-- 仅草稿表加列；部署版本表 wfe_process_def 不加——历史版本编辑器
-- （getVersionEditor）对 name/categoryId 本就返回 null，description 对齐该语义。
ALTER TABLE `wf_process_draft`
  ADD COLUMN `description` VARCHAR(500) DEFAULT NULL
    COMMENT '流程说明（设计器「基本属性」分组维护）' AFTER `category_id`;
