# Proposal: 跨表单数据传递（form-data-mapping）

## Why

工作流已支持不同节点绑定不同表单，但 `wf_form_data` 按 processInstanceId + formDefId
隔离存储：发起节点填写的表单数据（如申请人姓名、申请金额）在下游审批节点渲染时
完全不可见，审批人无法查阅发起信息，表单数据也无法驱动网关条件。随着多表单流程
场景上线，跨表单数据传递成为流程可用性的缺口。本变更引入节点级字段映射与流程级
变量映射，使下游节点单向只读引用上游表单字段与流程变量，无需改动现有数据隔离模型。

## What Changes

**节点级字段映射（dataMappings）**
- From: 节点表单仅配置 formDefId + fieldPermissions，渲染时只读本表单数据
- To: 节点表单配置新增 dataMappings（targetField ← source），源支持
  `form:initiator`（发起人表单）、`form:<nodeId>`（指定节点表单）、
  `variable:<name>`（流程变量）；渲染时后端聚合 `mappedData` 返回，前端预填
- Reason: 下游节点需要展示上游表单数据，且发起人表单可被替换，需逻辑引用
- Impact: 非破坏性，新增配置字段，旧流程无映射时行为不变

**任务详情返回 mappedData**
- From: `GET /api/v1/tasks/{id}/detail` 返回 fieldPermissions、operations 等
- To: TaskDetailVO 增加 `mappedData`（Map<String, Object>），按其所在节点
  dataMappings 聚合源表单当前数据与流程变量
- Reason: 前端 FormRenderer 保持通用，聚合逻辑收敛在后端
- Impact: 非破坏性，新增响应字段

**流程级变量映射（variableMappings）**
- From: 表单字段仅在发起时作为变量传入，后续节点填写的数据不进入流程变量，
  网关条件无法引用表单字段
- To: `__PROCESS__` 配置新增 variableMappings（表单字段 → 流程变量），
  发起时与每次任务完成时写入 Flowable 变量
- Reason: 网关条件（如 ${amount > 1000}）需要表单字段提升为流程变量
- Impact: 非破坏性，新增配置；变量写入时机为发起 + 任务完成

**配置 UI 与发布校验**
- From: 节点属性面板仅可配置表单与字段权限；发布流程不校验表单字段引用
- To: 属性面板新增"数据来源"配置列；流程设计器新增变量映射面板；
  发布时校验字段存在性、禁止循环引用
- Reason: 映射配置错误需要尽早暴露，避免运行时静默缺省
- Impact: 前端 UI 扩展；发布校验失败阻止发布

## Capabilities

### New Capabilities
- `form-data-mapping`: 节点级跨表单字段映射——dataMappings 配置结构、后端
  mappedData 聚合、FormRenderer 预填、属性面板映射 UI、发布校验（禁止循环引用、
  字段存在性检查）
- `process-variable-mapping`: 流程级变量映射——`__PROCESS__` 配置
  variableMappings、发起时 + 任务完成时写入流程变量、变量名唯一校验

### Modified Capabilities
- `task-detail`: TaskDetailVO 增加 mappedData 字段，节点映射数据随任务详情返回
- `form-runtime`: FormRenderer 增加 mappedData prop，渲染时预填映射字段

## Impact

- 后端：新增聚合组件（FormDataMerger）；修改 FormDataService/WorkflowTaskService
  （变量写入）、TaskDetailVO、任务完成与发起逻辑、发布校验逻辑
- 前端：FormRenderer.vue（mappedData 预填）、FormPropertyTab.vue（数据来源列）、
  流程设计器（__PROCESS__ 变量映射面板）、TaskDetailPage / TaskDoneDetailPage
  （传递 mappedData）
- 数据：无表结构变更，配置为 NodeConfig.configJson 增量字段
- 兼容性：旧流程/旧配置无映射时聚合为空，行为不变