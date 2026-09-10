# Design: 跨表单数据传递（form-data-mapping）

## Context

工作流设计已支持每个节点绑定独立表单（`NodeConfig.configJson.form.formDefId` +
`fieldPermissions`，`__PROCESS__` 节点存流程默认表单）。但数据存储 `wf_form_data`
以 `processInstanceId + formDefId` 为键，每个表单独立一条"当前数据"
（`isSnapshot=false`）+ 每次审批冻结一条快照（`isSnapshot=true`）。

由此产生的问题：**跨表单数据不可见**。节点 A 用表单 F1、节点 B 用表单 F2 时，
`FormRenderer.loadData()` 只查 `getFormData(processInstanceId, formDefId)` 本表单数据，
节点 B 无法展示/引用节点 A 填写的 F1 字段（如发起人姓名、申请金额）。

本设计引入**跨表单字段映射传递**机制，使下游节点能只读引用上游表单字段与流程变量，
并让表单字段可提升为流程变量驱动网关条件。

涉及现有代码：
- `backend/.../engine/form/FormDataService.java`、`FormDataController.java`、`entity/FormData.java`
- `backend/.../engine/process/entity/NodeConfig.java`（`configJson`）
- `backend/.../engine/task/WorkflowTaskService.java`（`extractFormConfig` 解析节点表单）
- `backend/.../api/controller/ProcessDefinitionController.java`（`resolveFormDefIds`）
- `frontend/src/views/form/components/FormRenderer.vue`
- `frontend/src/views/designer/properties/FormPropertyTab.vue`（节点表单配置 UI）
- `frontend/src/views/process/TaskDetailPage.vue` / `ProcessStartPage.vue` / `TaskDoneDetailPage.vue`

## Goals / Non-Goals

**Goals:**
- 下游节点表单可展示上游表单字段（发起人表单、指定节点表单）与流程变量，单向只读
- 表单字段可提升为流程变量（发起时 + 任务完成时写入），驱动网关条件
- 不改变 `wf_form_data` 存储模型与审批快照机制
- 前端 FormRenderer 保持通用，不感知映射配置结构
- 历史单据（已办详情）按当时配置正确回显映射数据

**Non-Goals:**
- 双向同步 / 下游修改回写源表单
- 表单字段命名空间改造（统一数据容器方案，已否决）
- 嵌套字段（子表行内字段）作为映射源（v1 仅顶层字段）
- 动态表单（运行时改表单定义）与映射的组合场景

## Decisions

### D1: 映射配置结构（节点级 `form.dataMappings`）

目标节点 `NodeConfig.configJson.form` 扩展：

```json
{
  "form": {
    "formDefId": "F2-审批表单",
    "fieldPermissions": { "applicantName": "VIEW", "amount": "VIEW" },
    "dataMappings": [
      { "targetField": "applicantName", "source": "form:initiator", "sourceField": "name" },
      { "targetField": "requestAmount", "source": "variable:requestAmount" }
    ]
  }
}
```

- `targetField`：本表单字段名（须存在于本表单 schema）
- `source`：源标识，三种形式
  - `form:initiator` — 发起人节点表单（逻辑引用）
  - `form:<nodeId>` — 指定 BPMN 节点 ID 的表单
  - `variable:<name>` — 流程变量名
- `sourceField`：源表单字段名（`variable:*` 源不需要）

**为什么用逻辑引用 `form:initiator` 而非硬编码 formDefId**：发起人表单可在流程配置中
替换，逻辑引用使映射声明与具体表单解耦；运行时解析保证始终指向当前生效的发起表单。

### D2: 流程级变量声明（`__PROCESS__` 配置扩展）

`__PROCESS__` 节点 `configJson` 扩展：

```json
{
  "variableMappings": [
    { "variable": "requestAmount", "source": "form:initiator", "sourceField": "amount" }
  ]
}
```

用途：表单字段 → Flowable 变量，供网关条件（`${requestAmount > 1000}`）与
`variable:*` 映射源求值。写入时机：**发起时 + 每次任务完成时**，保证网关条件
始终拿到最新值。

### D3: 后端聚合 `mappedData`

新增聚合组件 `FormDataMerger`（或扩展 `FormDataService`）：

```
mergeMappedData(processDefinitionId, nodeId, processInstanceId)
  → Map<String, Object>  // targetField → value
```

解析步骤：
1. 按 `findByProcessDefinitionId` 取该部署版本的 NodeConfig 快照，定位目标节点
   `dataMappings`
2. 对每条映射：
   - `form:initiator` → 解析发起人节点表单 formDefId（`InitiatorNodeResolver` +
     节点配置）→ 查 `wf_form_data` 该实例下源表单当前数据 → 取 `sourceField`
   - `form:<nodeId>` → 查该节点表单 formDefId → 查源表单当前数据 → 取字段
   - `variable:<name>` → `runtimeService.getVariable` / 历史变量
3. 源数据缺失 → 该字段缺省（不报错）

**暴露方式**：`TaskDetailVO` 增加 `mappedData` 字段，任务详情接口返回；
已办详情接口（快照场景）按历史 `processDefinitionId` 调用同一逻辑。
`GET /v1/form-data` 查询接口保持原样（FormRenderer 由父组件传入 mappedData）。

**为什么聚合在后端**：映射解析依赖节点配置与 Flowable 运行时，放后端避免前端
重复实现配置解析、保持 FormRenderer 通用。

### D4: 前端预填

- `FormRenderer` 新增 `mappedData?: Record<string, unknown>` prop：
  `onMounted` 时将 `mappedData` 合并进 `formData`（仅映射目标字段，不覆盖
  本表单已有数据）
- 可编辑性由 `fieldPermissions` 统一控制（映射字段默认配 `VIEW` 即只读）
- `submit()` 仍只序列化 `formData` 保存——由于映射字段在 `formData` 中，
  只读场景（VIEW）下其值不会被改动，天然满足"单向只读，不回写源表单"；
  若配置为 EDIT，则值随本表单保存，但不回写源表单（符合决策语义）

### D5: 配置 UI（`FormPropertyTab.vue` 扩展）

在现有"字段权限"表上增加"数据来源"列，每行可配置：
- 无（默认）：本节点首次填写
- 发起人表单 + 源字段（下拉选择发起人表单字段）
- 指定节点 + 源字段（下拉选择流程中其他节点及其表单字段）
- 流程变量 + 变量名（输入）

流程级 UI：流程设计器增加"流程变量映射"面板（编辑 `__PROCESS__` 的
`variableMappings`）。

### D6: 历史回看一致性

已办详情渲染时使用**历史版本节点配置**（`findByProcessDefinitionId(历史ID)`）
调用 `mergeMappedData`，映射源也查该实例下的历史数据（当前数据或审批快照），
保证历史单据展示与审批当时一致。

### D7: 配置校验（发布时）

发布流程校验：
- `targetField` 必须存在于本表单 schema
- `sourceField` 必须存在于源表单 schema（`form:*` 源）
- 禁止循环引用（A 引 B 且 B 引 A；含经 `form:initiator` 的间接环）
- `variable:*` 源名称非空

校验失败阻止发布，错误信息定位到节点与字段。

## Risks / Trade-offs

- [表单升级导致字段改名，映射失效] → 发布校验对比源表单 schema 字段存在性；
  运行时源数据缺失时字段留空不报错，避免阻塞流程
- [发起节点未配置表单时 `form:initiator` 解析失败] → 映射缺省，日志告警；
  配置 UI 在无发起人表单时禁用该来源选项
- [聚合增加每次任务详情的查询成本] → 源表单数据查询走 `(processInstanceId,
  formDefId, isSnapshot)` 索引；同一实例多次聚合可加进程内短 TTL 缓存
- [网关条件引用变量但该分支未经过写入节点，变量缺失] → 沿用 Flowable 默认
  求值行为（缺失视为 false/空），在文档与 UI 提示
- [`variable:*` 与 `variableMappings` 命名冲突] → 流程级校验变量名唯一，
  冲突禁止发布

## Migration Plan

1. 后端：新增 `FormDataMerger` + `TaskDetailVO.mappedData` + `__PROCESS__`
   `variableMappings` 写入逻辑（发起 + 任务完成）
2. 前端：`FormRenderer.mappedData` prop → `FormPropertyTab` 映射 UI →
   流程级变量映射面板
3. 配置校验接入发布流程
4. 兼容性：旧流程无 `dataMappings` / `variableMappings` 配置时行为不变
   （空映射 → 无聚合），无需数据迁移

回滚策略：功能开关或直接回退代码——配置为纯增量字段，旧版本忽略未知 JSON 键。

## Open Questions

1. `form:<nodeId>` 引用的是该节点**当前生效表单**，运行时解析（与 form:initiator
   一致）而非部署时固化——确认该语义（倾向：运行时解析，与 NodeConfig 快照机制一致，
   但历史实例回看时源表单按实例实际使用的版本取）
2. `mappedData` 是否需要在已办详情之外（如流程跟踪抽屉）展示？v1 仅任务表单场景
3. 任务完成时写入变量：若多个节点映射同一变量名，后写入者覆盖——接受该语义，
   由流程级校验保证声明唯一
