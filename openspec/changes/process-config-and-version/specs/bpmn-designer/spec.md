# bpmn-designer Specification (Delta)

## Purpose

修改流程设计器：流程属性面板新增"节点操作权限"总控分区（流程级四开关）；节点属性中移除"允许转签"配置项（并入"允许转办"）。

## ADDED Requirements

### Requirement: 流程级操作权限总控

流程属性面板（选中画布空白处）"流程配置" Tab SHALL 展示"节点操作权限"分区，包含四个开关：

- **允许驳回**：绑定 `approvalPolicy.operations.allowReject`
- **允许加签**：绑定 `approvalPolicy.operations.allowAddSign`
- **允许转办**：绑定 `approvalPolicy.operations.allowTransfer`（会签节点上等同允许转签）
- **允许委派**：绑定 `approvalPolicy.operations.allowDelegate`

四开关默认值均为开启。修改 SHALL 实时同步到 designerStore（`__PROCESS__` 配置），随流程保存与部署。

废弃的 `approvalPolicy.allowAddSigner`（允许加签）与 `approvalPolicy.allowDelegate`（允许转办）开关 SHALL 从流程属性面板移除。

#### Scenario: 流程属性面板显示操作权限总控

WHEN 用户点击画布空白处选中流程
THEN 流程属性面板 SHALL 显示"节点操作权限"分区
AND 分区内 SHALL 包含允许驳回、允许加签、允许转办、允许委派四个开关
AND 开关值 SHALL 与 `approvalPolicy.operations` 双向同步

#### Scenario: 关闭流程级转办并保存

WHEN 用户将"允许转办"关闭并点击保存草稿
THEN `__PROCESS__` 配置 SHALL 保存 `approvalPolicy.operations.allowTransfer = false`
AND 流程属性面板 SHALL 不再显示废弃的"允许转办"（allowDelegate）开关

### Requirement: 节点操作权限配置项

用户任务属性面板的"操作"分区 SHALL 展示四个操作权限开关：

- 允许驳回（`operations.allowReject`）
- 允许加签（`operations.allowAddSign`）
- 允许转办（`operations.allowTransfer`）
- 允许委派（`operations.allowDelegate`）

"允许转签"（`operations.allowForwardSign`）SHALL 从节点属性面板移除。节点配置中已存在的旧 `allowForwardSign` 字段 SHALL 被忽略。

#### Scenario: 节点属性面板无转签项

WHEN 用户选中用户任务节点查看"操作"分区
THEN 分区内 SHALL 包含允许驳回、允许加签、允许转办、允许委派四个开关
AND SHALL NOT 包含"允许转签"开关

#### Scenario: 旧配置含 allowForwardSign 被忽略

WHEN 用户加载一个含 `operations.allowForwardSign = false` 旧配置的用户任务节点
THEN 该字段 SHALL 被忽略
AND 其余四个操作开关 SHALL 正常读取与编辑
