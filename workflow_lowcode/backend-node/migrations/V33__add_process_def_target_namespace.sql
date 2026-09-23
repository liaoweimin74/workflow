-- V33：wfe_process_def 增加 target_namespace
--
-- 为什么需要：Flowable 的 ProcessDefinition.category 取的是 BPMN 的 targetNamespace，
-- 而「已部署流程」接口把它作为 category 字段返回（实测确认）。
-- wfe_process_def 原本只存了业务分类 category_id，两者不是一回事
-- （实测中草稿的 categoryId 为 null，但响应里的 category 是 BPMN 的 targetNamespace）。
--
-- 这是绿地表（决策 C2），加列不影响任何既有数据与 Java 侧。

ALTER TABLE `wfe_process_def`
  ADD COLUMN `target_namespace` VARCHAR(255) DEFAULT NULL
  COMMENT 'BPMN 的 targetNamespace，Flowable 把它当作 ProcessDefinition.category';
