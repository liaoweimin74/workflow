# Tasks: 跨表单数据传递（form-data-mapping）

## 1. 后端：映射配置解析

- [x] 1.1 新增 `FormMappingConfig` 值对象（dataMappings 条目：targetField/source/sourceField；variableMappings 条目：variable/source/sourceField），解析 `NodeConfig.configJson` 中 `form.dataMappings` 与 `variableMappings`（TDD：先写解析单测）
- [x] 1.2 新增 `FormMappingResolver`：按 processDefinitionId 快照 + nodeId 解析节点 dataMappings；按 `__PROCESS__` 解析流程 variableMappings；源标识解析（form:initiator / form:<nodeId> / variable:<name>）——复用 `InitiatorNodeResolver` 解析发起人节点
- [x] 1.3 解析器缓存：复用/对齐 `ProcessConfigResolver` 的 TTL 缓存模式，避免每次任务详情命中 DB

## 2. 后端：mappedData 聚合

- [x] 2.1 新增 `FormDataMerger`（或扩展 FormDataService）：`mergeMappedData(processDefinitionId, nodeId, processInstanceId)` 返回 `Map<String,Object>`——form:* 源查源表单当前数据（isSnapshot=false）取字段；variable:* 源查 Flowable 变量；源缺失跳过不报错（TDD：先写聚合单测，覆盖发起人表单/指定节点/变量源/源缺失场景）
- [x] 2.2 `TaskDetailVO` 增加 `mappedData` 字段；`WorkflowTaskService.getTaskDetail`（运行时任务）构建时调用聚合并填充
- [x] 2.3 已办详情（历史任务）聚合：按历史 processDefinitionId + 当时节点配置调用聚合，源数据优先取该实例当前数据或审批快照
- [x] 2.4 `GET /api/v1/tasks/{id}` 响应包含 mappedData（含空配置返回 null 场景单测）

## 3. 后端：流程变量映射写入

- [x] 3.1 新增变量写入逻辑：按 variableMappings 从源数据取值（form:* 源取源表单当前数据字段；variable:* 源原样写入），缺失跳过
- [x] 3.2 流程发起时写入：`ProcessInstanceController.start` 发起成功后在流程实例上写入映射变量（TDD：发起后变量存在且值正确）
- [x] 3.3 任务完成时写入：任务完成（complete/reject 等流转动作）后更新映射变量（TDD：完成后续节点网关条件可基于新值求值）

## 4. 后端：发布校验

- [x] 4.1 发布流程增加映射配置校验：targetField 存在于目标表单 schema；form:* 源 sourceField 存在于源表单 schema；variable:* 源变量名非空（TDD：校验失败阻止发布）
- [x] 4.2 循环引用检测：节点间（含 form:initiator 间接环）相互引用检测；重复变量名检测（TDD：循环引用/重复变量名场景）
- [x] 4.3 校验错误信息定位到节点与字段

## 5. 前端：FormRenderer 映射预填

- [x] 5.1 FormRenderer 增加 `mappedData` prop：onMounted 合并到 formData（本表单已有数据优先，不覆盖）；未传入时不产生预填
- [x] 5.2 与 fieldPermissions 协同验证：映射字段 VIEW 只读 / HIDDEN 不渲染 / EDIT 可编辑
- [x] 5.3 前端类型与 API 定义更新（TaskDetailVO 类型增加 mappedData；form.ts 同步）

## 6. 前端：配置 UI

- [x] 6.1 `FormPropertyTab.vue` 增加"数据来源"列：每字段可配置 无/发起人表单+源字段/指定节点+源字段/流程变量+变量名；写入节点 dataMappings（清除时移除对应条目）
- [x] 6.2 流程设计器增加流程级"变量映射"面板（编辑 `__PROCESS__` variableMappings：新增/删除条目、变量名输入、数据源选择、重复变量名提示）
- [x] 6.3 `TaskDetailPage` / `TaskDoneDetailPage` 从任务详情取 mappedData 传给 FormRenderer

## 7. 验证与文档

- [x] 7.1 后端全量测试通过（mvn test / 对应模块）
- [x] 7.2 前端构建与类型检查通过（vue-tsc / 构建脚本）
- [x] 7.3 手动验证：配置多表单流程（发起人表单 → 审批表单引用字段），确认审批节点只读展示发起数据、网关条件按变量分流、已办详情回显一致
