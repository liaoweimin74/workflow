# process-operation-policy Specification

## Purpose
TBD - created by archiving change process-config-and-version. Update Purpose after archive.
## Requirements
### Requirement: 流程级操作权限配置结构

流程级配置 `ProcessConfigData.approvalPolicy.operations` SHALL 包含四个操作权限开关：

- `allowReject`：允许驳回（默认 `true`）
- `allowAddSign`：允许加签（默认 `true`）
- `allowTransfer`：允许转办（含会签节点转签，默认 `true`）
- `allowDelegate`：允许委派（默认 `true`）

废弃字段 `approvalPolicy.allowAddSigner` 与 `approvalPolicy.allowDelegate` SHALL 从 `ProcessConfigData` 类型中移除。设计器加载旧配置（含废弃字段）时 SHALL 忽略废弃字段并使用默认值补全新字段。

#### Scenario: 新流程默认全开

WHEN 创建一个新的流程定义
THEN 流程级 operations SHALL 为 `{ allowReject: true, allowAddSign: true, allowTransfer: true, allowDelegate: true }`

#### Scenario: 加载含废弃字段的旧配置

WHEN 设计器加载一个含 `allowAddSigner: false`、`allowDelegate: false` 的旧流程配置
THEN 废弃字段 SHALL 被忽略
AND operations 各开关 SHALL 使用默认值 `true`

### Requirement: 流程级与节点级 AND 生效规则

运行时操作权限解析 `extractOperations(processDefId, taskDefKey)` SHALL 叠加流程级配置：最终权限 = 流程级开关 AND 节点级开关。

解析逻辑：
1. 读取该部署版本（processDefinitionId）的 `__PROCESS__` 节点配置，解析流程级 operations
2. 读取节点（nodeId=taskDefKey）配置的节点级 operations
3. 每个开关取 `流程级 && 节点级`
4. 节点未配置 operations 时，节点级按默认值（`allowReject: true`、`allowAddSign: false`、`allowTransfer: true`、`allowDelegate: false`）处理
5. 流程级未配置 operations 时，流程级按全开处理

#### Scenario: 流程级关闭转办

WHEN 流程级 `operations.allowTransfer = false` 且节点级 `operations.allowTransfer = true`
THEN extractOperations SHALL 返回该节点 `allowTransfer = false`

#### Scenario: 流程级开启、节点级关闭

WHEN 流程级 `operations.allowDelegate = true` 且节点级 `operations.allowDelegate = false`
THEN extractOperations SHALL 返回该节点 `allowDelegate = false`

#### Scenario: 节点未配置 operations

WHEN 节点 NodeConfig 无 operations 配置且流程级全开
THEN extractOperations SHALL 返回默认值 `{ allowReject: true, allowAddSign: false, allowTransfer: true, allowDelegate: false }`

### Requirement: 流程属性面板操作权限总控

流程属性面板（`ProcessProperty.vue`）"流程配置" Tab SHALL 展示"节点操作权限"分区，包含四个开关（允许驳回、允许加签、允许转办、允许委派），绑定 `approvalPolicy.operations`。

废弃的"允许加签"（`allowAddSigner`）与"允许转办"（`allowDelegate`）开关 SHALL 从流程属性面板移除。

#### Scenario: 流程属性面板显示四个总控开关

WHEN 用户在设计器点击画布空白处选中流程
THEN 流程属性面板 SHALL 显示"节点操作权限"分区
AND 分区内 SHALL 包含允许驳回、允许加签、允许转办、允许委派四个开关
AND 开关值 SHALL 与 `approvalPolicy.operations` 双向同步

#### Scenario: 修改流程级开关保存并重新加载

WHEN 用户将流程级"允许转办"关闭并保存
AND 重新加载设计器
THEN 流程属性面板"允许转办"开关 SHALL 保持关闭状态

