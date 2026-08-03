# bpmn-designer Specification

## Purpose
TBD - created by archiving change bpmn-designer-phase-1. Update Purpose after archive.
## Requirements
### Requirement: 流程设计器页面

用户可通过管理后台导航进入流程设计器页面。

BPMN 流程设计器 SHALL 集成在现有前端项目中，通过懒加载路由访问，路径为 `/workflow/designer`。

设计器页面 SHALL 采用三栏布局：
- 左侧 Palette（元素面板）
- 中间 Canvas（流程图绘制区域）
- 右侧 Properties Panel（属性编辑面板）

设计器页面 SHALL 提供顶部工具栏，包含保存草稿、部署、导入 BPMN XML、导出 BPMN XML、撤销、重做按钮。

#### Scenario: 导航到设计器页面
WHEN 用户点击"流程设计"菜单项
THEN 系统懒加载 ProcessDesigner.vue 组件
AND 页面显示三栏布局

#### Scenario: 创建新流程
WHEN 用户点击"新建流程"按钮
THEN 系统显示空流程图
AND Palette 中显示可拖拽的 BPMN 元素列表

### Requirement: BPMN 元素支持

设计器 SHALL 支持拖拽创建以下 BPMN 2.0 元素：开始事件、结束事件、用户任务、排他网关、并行网关、包含网关、子流程、泳道（Lane）、连线（Sequence Flow）。

#### Scenario: 拖拽创建元素
WHEN 用户从 Palette 拖拽"用户任务"到 Canvas
THEN Canvas 上创建对应的 BPMN 元素
AND 该元素出现在流程图中

#### Scenario: 创建连线
WHEN 用户从源节点拖拽连线到目标节点
THEN Canvas 上创建 Sequence Flow
AND 连线带有箭头方向

#### Scenario: 删除元素
WHEN 用户选中元素后按 Delete 键
AND 确认删除
THEN 该元素从流程图中移除

### Requirement: 节点属性配置

设计器 SHALL 支持配置选中节点的属性，属性面板按节点类型动态展示对应配置项。

选中节点时，属性面板 SHALL 显示该节点类型的属性编辑组件。属性面板 SHALL 支持以下节点类型的属性配置：

**开始事件：** 名称（必填）、描述（可选）、关联表单（可选，从已发布表单定义中选择）
**用户任务：** 名称（必填）、描述（可选）、审批人设置、关联表单（可选，从已发布表单定义中选择）、表单字段权限
**网关（排他/并行/包含）：** 名称（必填）、默认流转
**结束事件：** 名称（必填）
**连线：** 条件表达式（可选）、描述（可选）

关联表单选择器 SHALL 从已发布（PUBLISHED）的表单定义列表中选择。

表单字段权限 SHALL 在关联表单后显示，支持对表单中每个字段设置权限（EDIT/VIEW/HIDDEN）。

属性面板中修改的值 SHALL 实时更新到 designerStore，不直接操作 bpmn-js 模型。

#### Scenario: 选中节点显示属性
WHEN 用户点击 Canvas 上的用户任务节点
THEN 右侧属性面板显示"基本信息"、"审批人设置"和"表单" Tab

#### Scenario: 修改节点名称
WHEN 用户在属性面板中修改节点名称
THEN designerStore 中对应 nodeConfig 更新
AND 流程图节点上的显示名称同步更新

#### Scenario: 配置审批人
WHEN 用户在用户任务的"审批人设置"中选择审批人类型为"指定用户"
AND 选择具体用户
AND 选择多人审批方式为"会签"
THEN designerStore 中存储对应的审批人配置

#### Scenario: 关联表单
WHEN 用户在用户任务的"表单" Tab 中点击关联表单下拉框
THEN 系统从后端加载已发布的表单定义列表
AND 用户选择一个表单定义
THEN designerStore 中 nodeConfig.form.formDefId 更新为所选表单定义的 id

#### Scenario: 配置字段权限
WHEN 用户为用户任务关联表单后
THEN 属性面板显示该表单的所有字段列表
AND 每个字段可设置权限为 EDIT、VIEW 或 HIDDEN
AND designerStore 中 nodeConfig.form.fieldPermissions 更新

#### Scenario: 开始事件关联表单
WHEN 用户在开始事件的属性面板中关联表单
THEN designerStore 中开始节点的 nodeConfig.form.formDefId 更新
AND 该表单作为流程级默认表单

### Requirement: 审批人设置

用户任务的属性配置 SHALL 支持以下审批人设置：

- **审批人类型**：指定用户、指定角色、部门负责人、发起人自选、表达式
- **审批人值**：按审批人类型动态展示对应的选择器
- **多人审批方式**：会签（全部通过）、或签（一人通过即可）

审批人配置 SHALL 存储在 wf_node_config.config_json 的 approval 字段中。

#### Scenario: 切换审批人类型
WHEN 用户将审批人类型从"指定用户"切换为"指定角色"
THEN 审批人值的选择器从用户选择器切换为角色选择器

#### Scenario: 配置会签
WHEN 用户选择审批人为指定用户"张三、李四"
AND 选择多人审批方式为"会签"
THEN config_json 中存储 approval.type="user"、approval.value="zhangsan,lisi"、approval.multiMode="countersign"

### Requirement: 保存设计器内容

设计器 SHALL 支持保存当前流程图到服务器。

用户点击"保存草稿"按钮时，系统 SHALL：
1. 从 bpmn-js 导出当前流程图的 BPMN XML
2. 从 designerStore 收集所有节点配置
3. 调用 PUT /api/v1/process-definitions/{id}/design 保存

后端 SHALL 在事务内：
1. 更新 wf_process_def.bpmn_xml
2. 删除该流程定义的所有 wf_node_config 记录
3. 批量插入新的 wf_node_config 记录

#### Scenario: 保存草稿
WHEN 用户点击"保存草稿"按钮
THEN 前端调用 PUT /api/v1/process-definitions/{id}/design
AND 后端事务更新 BPMN XML 和节点配置
AND 提示"保存成功"

#### Scenario: 保存时无 nodeConfig
WHEN 用户尚未配置任何节点属性即点击保存
THEN nodeConfigs 为空对象
AND 后端只更新 BPMN XML

### Requirement: 部署流程

设计器 SHALL 支持将当前流程图部署到 Flowable 引擎。

用户点击"部署"按钮时，系统 SHALL 先自动保存，再调用 POST /api/v1/process-definitions/{id}/deploy。

部署成功后，流程定义状态 SHALL 更新为 DEPLOYED，并记录 Flowable 返回的 deployId 和 procDefId。

#### Scenario: 部署流程
WHEN 用户点击"部署"按钮
THEN 系统先自动保存
AND 调用部署接口
AND Flowable 引擎解析 BPMN XML 并注册流程定义
AND 状态更新为 DEPLOYED

### Requirement: 导入/导出 BPMN XML

设计器 SHALL 支持导入和导出 BPMN XML 文件。

导入时，用户选择 .bpmn 或 .xml 文件，系统解析并渲染到 Canvas 上。导出时，系统将当前流程图导出为 .bpmn 文件供下载。

#### Scenario: 导入 BPMN XML
WHEN 用户点击"导入"按钮并选择 BPMN 文件
THEN 系统解析 BPMN XML
AND Canvas 渲染导入的流程图

#### Scenario: 导出 BPMN XML
WHEN 用户点击"导出"按钮
THEN 系统从 bpmn-js 导出 BPMN XML
AND 浏览器下载为 .bpmn 文件

### Requirement: 撤销/重做

设计器 SHALL 支持撤销和重做操作。

撤销/重做 SHALL 基于 bpmn-js 的 CommandStack 实现，覆盖元素的创建、删除、移动、连线创建等操作。

#### Scenario: 撤销操作
WHEN 用户删除一个节点后点击"撤销"
THEN 被删除的节点恢复

#### Scenario: 重做操作
WHEN 用户撤销删除后又点击"重做"
THEN 节点再次被删除

### Requirement: 流程复制

系统 SHALL 支持基于已有流程定义复制创建新流程定义。

复制时 SHALL 复制 BPMN XML 和所有节点配置，生成新的流程定义记录，版本号重置为 v1。

#### Scenario: 复制流程
WHEN 用户在流程定义列表中选择"复制"
THEN 系统创建新的流程定义
AND 复制 BPMN XML 和节点配置
AND 新流程定义版本为 v1

