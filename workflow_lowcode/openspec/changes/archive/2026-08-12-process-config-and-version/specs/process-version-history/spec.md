# process-version-history Specification

## Purpose

提供流程历史版本的查看能力：列出同一 `processKey` 的全部已部署版本，并可查看任一版本的编辑器数据（BPMN XML + 该版本部署时的节点配置快照，含 `__PROCESS__`）。前端提供版本历史抽屉与只读设计器视图。

## ADDED Requirements

### Requirement: 版本列表接口

系统 SHALL 提供 `GET /api/v1/deployed-processes/{key}/versions` 接口，按租户返回该流程 key 的全部已部署版本。

响应项 SHALL 包含：
- `procDefId`：Flowable 流程定义 ID
- `version`：版本号
- `name`：流程名称
- `deploymentTime`：部署时间
- `isLatest`：是否为最新版本（boolean）

版本 SHALL 按版本号倒序排列。租户隔离 SHALL 生效（仅返回当前租户的版本）。

#### Scenario: 查询某流程的全部版本

WHEN 流程 key=`leave` 已部署 3 次（v1/v2/v3）
AND 用户调用 `GET /api/v1/deployed-processes/leave/versions`
THEN 响应 SHALL 返回 3 条版本记录
AND v3 的 `isLatest` SHALL 为 true
AND v1、v2 的 `isLatest` SHALL 为 false

#### Scenario: 租户隔离

WHEN 租户 A 调用版本列表接口
THEN 响应 SHALL 仅包含租户 A 的流程版本
AND SHALL NOT 包含其他租户的同 key 流程版本

#### Scenario: 流程不存在

WHEN 用户调用不存在的流程 key 的版本列表
THEN 接口 SHALL 返回空数组（不报错）

### Requirement: 版本编辑器数据接口

系统 SHALL 提供 `GET /api/v1/deployed-processes/versions/{procDefId}/editor` 接口，返回指定版本的编辑器数据。

响应结构 SHALL 复用编辑器数据形状（EditorDTO）：
- `bpmnXml`：该版本部署时的 BPMN XML（从 Flowable `ACT_GE_BYTEARRAY` 读取）
- `nodeConfigs`：该版本部署时的节点配置快照（`Map<String, String>`，nodeId → configJson，含 `__PROCESS__` 键）
- `name` / `key` / `status`：流程元信息

配置快照 SHALL 从 `wf_node_config` 按 `processDefId + processDefinitionId` 精确查询（部署时生成的版本快照），而非当前编辑中的配置。

#### Scenario: 读取历史版本编辑器数据

WHEN 用户请求 v1（`procDefId = xyz1`）的编辑器数据
THEN 响应 `bpmnXml` SHALL 为 v1 部署时的 XML
AND 响应 `nodeConfigs` SHALL 为 v1 部署时快照的配置（含当时的 `__PROCESS__`）
AND SHALL NOT 混入 v3 的当前配置

#### Scenario: 历史版本 XML 读取失败

WHEN Flowable 中该版本 XML 无法读取（如部署数据异常）
THEN 接口 SHALL 返回 404 与友好错误提示
AND SHALL NOT 抛 500 异常

### Requirement: 前端版本历史入口

流程管理列表（`ProcessListPage.vue`）SHALL 为每个已部署流程提供"版本历史"入口，点击后 SHALL 打开版本列表抽屉：

- 展示该流程全部版本（版本号、部署时间、最新标记）
- 点击某版本 SHALL 跳转到只读设计器页，加载该版本的编辑器数据

#### Scenario: 打开版本历史抽屉

WHEN 用户在流程列表点击某流程的"版本历史"
THEN 系统 SHALL 调用版本列表接口
AND 抽屉 SHALL 展示该流程的全部版本，最新版本带"最新"标记

#### Scenario: 跳转只读设计器

WHEN 用户在版本历史抽屉点击 v1 版本
THEN 系统 SHALL 调用版本编辑器数据接口
AND 跳转到只读设计器页
AND 设计器 SHALL 以只读模式加载 v1 的 BPMN XML 与配置快照

### Requirement: 只读设计器模式

流程设计器（`ProcessDesigner.vue`）SHALL 支持 `readOnly` 模式：

- bpmn-js 以仅渲染方式加载流程图（不响应编辑操作）
- 工具栏 SHALL 隐藏保存、部署、导入等编辑类按钮
- 属性面板 SHALL 以只读形式展示选中节点的配置（基本信息 + 配置 JSON 只读展示）
- 页面 SHALL 提供返回按钮回到流程列表

#### Scenario: 只读模式禁用编辑

WHEN 只读设计器加载完成
THEN 用户 SHALL 无法拖拽、删除、移动任何 BPMN 元素
AND 工具栏 SHALL 不显示保存/部署/导入按钮
AND 属性面板 SHALL 仅展示只读内容

#### Scenario: 返回流程列表

WHEN 用户在只读设计器点击返回按钮
THEN 系统 SHALL 跳转回流程管理列表页
