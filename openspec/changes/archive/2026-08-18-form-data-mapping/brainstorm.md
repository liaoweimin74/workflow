# Brainstorm: 跨表单数据传递（form-data-mapping）

## Design Summary

工作流设计已支持不同节点绑定不同表单，但 `wf_form_data` 按 `processInstanceId + formDefId`
隔离存储，下游节点的表单渲染时读不到上游表单的数据。本变更引入**跨表单字段映射传递**机制：

- **节点级**：在目标节点的表单配置中声明 `dataMappings`（本表单字段 ← 源表单字段/流程变量），
  渲染时由后端聚合源数据返回 `mappedData`，前端预填到目标字段。
- **流程级**：在 `__PROCESS__` 节点配置中声明 `variableMappings`（表单字段 → 流程变量），
  发起时 + 每次任务完成时写入 Flowable 变量，供网关条件求值。
- **语义**：单向只读——下游只展示源数据，保存时仅 upsert 本表单，不回写源表单。

## Alternatives Considered

### 方案 A：跨表单字段映射 + 后端聚合（Agreed）
- **做法**：目标节点 `form.dataMappings` 声明字段映射，源支持 `form:initiator` /
  `form:<nodeId>` / `variable:<name>`；后端在读取接口中聚合 `mappedData`；流程级
  `variableMappings` 把表单字段提升为流程变量。
- **優點**：存储模型（FormData 按 formDefId 隔离）与快照机制完全不动；改动集中在
  配置扩展 + 数据聚合；与现有 `fieldPermissions`（EDIT/VIEW/HIDDEN）天然配合；
  前端一次请求拿到全部数据。
- **缺點**：每次渲染需聚合源数据（有 DB/缓存成本）；字段改名后映射需维护。
- **為何未採用**：此为最终采用方案。

### 方案 B：流程变量桥接
- **做法**：提交时把表单字段显式写入 Flowable 变量，下游节点从变量读取预填。
- **優點**：Flowable 原生支持；网关条件可直接用变量求值。
- **缺點**：表单数据 + 流程变量两份副本需手动同步；复杂类型（子表）序列化麻烦；
  变量随流程生命周期扩散、难以审计。
- **為何未採用**：同步负担重、变量污染，且不能覆盖"跨表单只读展示"这一核心诉求
  （变量存的是副本而非表单数据）。作为能力补充被吸收进方案 A 的
  `variable:*` 源类型与流程级 `variableMappings`。

### 方案 C：统一数据容器
- **做法**：整个流程实例合并为一份 dataJson，各表单读写各自字段子集。
- **優點**：数据天然贯通，无需映射配置。
- **缺點**：改动最大——存储模型、快照粒度、字段命名冲突（多个表单都有"备注"）均需
  重新设计；破坏现有按 formDefId 隔离的数据管理页/快照审计。
- **為何未採用**：收益不抵成本，且破坏现有隔离模型。

## Agreed Approach

采用**方案 A**。理由：

1. 现有架构已为"节点间传递"预留设计——`FormData` 的"当前数据"（isSnapshot=false）
   注释即"用于节点间传递"，但仅支持同一表单跨节点 upsert。方案 A 在此之上扩展
   **跨表单**的字段级映射，最小化改动面。
2. 单向只读语义最清晰：上游表单数据在源表单维护，下游只展示，避免并发写冲突与循环引用。
3. 后端聚合保证前端 FormRenderer 保持通用，不感知节点配置结构。

## Key Decisions

1. **传递方向**：单向（上游 → 下游），下游映射字段只读，不回写源表单。
2. **可编辑性**：映射字段默认 VIEW（只读），由节点 `fieldPermissions` 统一控制；
   允许配置 EDIT 的场景仅影响本表单保存（mappedData 不参与保存）。
3. **映射源类型**：支持三种源——
   - `form:initiator`：发起人节点表单（逻辑引用，解耦发起表单替换）
   - `form:<nodeId>`：指定节点表单
   - `variable:<name>`：流程变量（含网关条件结果、外部写入变量）
4. **聚合层**：后端聚合。`GET /v1/form-data` 响应扩展 `mappedData` 字段，
   后端按目标节点 dataMappings 解析源表单当前数据 / 流程变量。
5. **变量写入时机**：发起时 + 每次任务完成时。按当前生效的 `variableMappings`
   把源字段值写入 Flowable 变量，保证网关条件始终拿到最新值。
6. **配置位置**：`dataMappings` 在目标节点的 `NodeConfig.configJson.form`；
   `variableMappings` 在 `__PROCESS__` 节点的 `configJson`。
7. **历史回看**：已办详情按历史版本节点配置（`findByProcessDefinitionId` 快照）
   重新聚合 mappedData，保证展示与当时配置一致。
8. **配置校验**：发布时校验——禁止循环引用、映射源节点/字段存在性；
   表单升级导致字段改名时给出提示。

## Open Questions

1. `form:<nodeId>` 引用的是该节点的**当前生效表单**（部署时解析为具体 formDefId），
   部署快照中是否固化解析结果？（倾向：固化，与 NodeConfig 快照机制一致）
2. `variableMappings` 中的源表单字段是否需要支持嵌套字段（如子表）路径？
   （v1 倾向：仅顶层字段，嵌套字段后续版本扩展）
3. 网关条件引用变量但变量缺失（如分支未走发起节点）时，Flowable 的求值行为
   以现有引擎默认（变量缺失视为 false）为准，不做额外处理。
