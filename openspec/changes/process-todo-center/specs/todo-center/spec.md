## ADDED Requirements

### Requirement: 待办中心三 Tab 结构

待办中心页面 SHALL 包含三个 Tab：待办、已办、我发起的。用户切换 Tab 时加载对应数据，互不影响。三个 Tab 的列表均 SHALL 支持分页，默认每页 20 条。

#### Scenario: 切换 Tab

WHEN 用户从"待办"Tab 切换到"已办"Tab
THEN 系统 SHALL 加载已办列表数据，保留待办 Tab 的筛选状态

### Requirement: 待办 Tab 列表

待办 Tab SHALL 以表格形式展示当前用户的待处理任务，默认按接收时间倒序。列包含：流程名称、流程编号、发起人、当前节点名称、接收时间、操作（"处理"按钮）。未读任务 SHALL 加粗显示，有催办标记的任务 SHALL 显示催办角标。

#### Scenario: 加载待办列表

WHEN 用户进入待办 Tab
THEN 系统 SHALL 调用 `GET /api/tasks?assignee=<currentUserId>` 获取待办列表
AND 返回的 TaskTodoVO SHALL 包含流程名称、发起人、当前节点名称等关联字段

#### Scenario: 空待办列表

WHEN 当前用户无待办任务
THEN 系统 SHALL 显示"暂无待办任务"空状态

### Requirement: 待办 Tab 筛选

待办 Tab SHALL 支持以下筛选维度：流程名称（模糊搜索）、发起人（用户选择器）、接收时间（日期范围选择器）。

#### Scenario: 按流程名称筛选

WHEN 用户在流程名称搜索框输入关键词并触发搜索
THEN 系统 SHALL 调用 `GET /api/tasks?assignee=<userId>&processName=<keyword>` 筛选待办

#### Scenario: 按发起人筛选

WHEN 用户通过用户选择器选择发起人
THEN 系统 SHALL 调用 `GET /api/tasks?assignee=<userId>&initiator=<selectedUserId>` 筛选待办

#### Scenario: 按接收时间范围筛选

WHEN 用户选择接收时间起止日期
THEN 系统 SHALL 调用 `GET /api/tasks?assignee=<userId>&createTimeStart=<start>&createTimeEnd=<end>` 筛选待办

### Requirement: 已办 Tab 列表

已办 Tab SHALL 以表格形式展示当前用户已处理的任务，默认按处理时间倒序。列包含：流程名称、流程编号、发起人、节点名称、处理时间、审批结果（通过/驳回/转办等）、操作（"查看"按钮）。

#### Scenario: 加载已办列表

WHEN 用户进入已办 Tab
THEN 系统 SHALL 调用 `GET /api/tasks/historic?userId=<currentUserId>` 获取已办列表
AND 返回的 TaskDoneVO SHALL 包含审批结果字段

### Requirement: 已办 Tab 筛选

已办 Tab SHALL 支持以下筛选维度：流程名称（模糊搜索）、发起人（用户选择器）、处理时间（日期范围选择器）、审批结果（下拉：全部/通过/驳回/转办/委派/加签/转签）。

#### Scenario: 按审批结果筛选

WHEN 用户在审批结果下拉选择"驳回"
THEN 系统 SHALL 仅展示审批结果为"驳回"的已办记录

### Requirement: 我发起的 Tab 列表

我发起的 Tab SHALL 以表格形式展示当前用户发起的流程实例，默认按发起时间倒序。列包含：流程名称、流程编号、当前节点、发起时间、状态（进行中/已通过/已驳回/已终止）、操作（"跟踪"按钮）。

#### Scenario: 加载我发起的列表

WHEN 用户进入"我发起的"Tab
THEN 系统 SHALL 调用 `GET /api/v1/process-instances?initiator=<currentUserId>` 获取列表
AND 返回数据 SHALL 包含当前节点、状态字段

#### Scenario: 被驳回回到发起人的实例

WHEN 流程被驳回回到发起人（PRD 3.3.4）
THEN 该实例 SHALL 出现在"待办"Tab 而非"我发起的"Tab
AND "我发起的"中该实例状态 SHALL 仍为"进行中"

### Requirement: 我发起的 Tab 筛选

我发起的 Tab SHALL 支持以下筛选维度：流程名称（模糊搜索）、发起时间（日期范围选择器）、状态（下拉：全部/进行中/已通过/已驳回/已终止）。

#### Scenario: 按状态筛选

WHEN 用户在状态下拉选择"进行中"
THEN 系统 SHALL 调用 `GET /api/v1/process-instances?initiator=<userId>&status=running` 筛选

### Requirement: 流程实例列表 API 扩展

`GET /api/v1/process-instances` 端点 SHALL 支持以下可选查询参数：
- `initiator`：按发起人筛选
- `status`：按实例状态筛选（running/completed/terminated）
- `processName`：按流程名称模糊搜索

#### Scenario: 按发起人筛选流程实例

WHEN 请求携带 `initiator` 参数
THEN 系统 SHALL 仅返回该发起人的流程实例

#### Scenario: 按状态筛选流程实例

WHEN 请求携带 `status=running` 参数
THEN 系统 SHALL 仅返回未结束的流程实例
WHEN 请求携带 `status=completed` 参数
THEN 系统 SHALL 仅返回已正常结束的流程实例

### Requirement: 任务列表 VO 扩展

待办与已办列表 API SHALL 返回包含关联信息的 VO，而非裸 Task 字段。TaskTodoVO SHALL 包含：taskId、processInstanceId、processDefinitionId、processName、processDefinitionName、businessKey、initiator（发起人 ID+姓名）、currentNodeName、assignee、createTime。TaskDoneVO 额外包含：endTime、approveResult（操作类型）。

#### Scenario: 待办列表返回关联字段

WHEN 调用 `GET /api/tasks?assignee=<userId>`
THEN 响应中每条记录 SHALL 包含 processName、initiator、currentNodeName 字段
AND 关联信息 SHALL 通过批量查询获取，不允许 N+1 查询
