# task-detail Specification Delta

## ADDED Requirements

### Requirement: 任务详情返回映射数据

`TaskDetailVO` SHALL 包含 `mappedData` 字段（`Map<String, Object>`），表示该任务
所在节点按 `dataMappings` 聚合出的映射值集合（`targetField → value`）。

- 节点未配置 `dataMappings` 时，`mappedData` SHALL 为 null 或空 Map
- 聚合按部署版本节点配置快照（`findByProcessDefinitionId`）解析，保证与审批时一致
- 已办详情（历史任务）SHALL 同样返回 `mappedData`，聚合时使用该任务当时的
  历史版本配置与该实例下的历史数据（当前数据或审批快照）

前端任务详情页 SHALL 将 `mappedData` 传递给 FormRenderer 用于预填。

#### Scenario: 待办任务详情包含映射数据

- **WHEN** 调用 `GET /api/v1/tasks/{taskId}/detail`，且任务节点配置了 `dataMappings`
- **THEN** 响应 SHALL 包含 `mappedData` 字段
- **AND** `mappedData` SHALL 含各映射目标字段与其源值

#### Scenario: 未配置映射的任务

- **WHEN** 任务节点未配置 `dataMappings`
- **THEN** 响应中 `mappedData` SHALL 为 null（或空 Map）
- **AND** 其他字段行为 SHALL 与现状一致

#### Scenario: 已办任务详情返回映射数据

- **WHEN** 调用已办任务详情接口，且任务当时配置了 `dataMappings`
- **THEN** 响应 SHALL 包含按历史配置聚合的 `mappedData`