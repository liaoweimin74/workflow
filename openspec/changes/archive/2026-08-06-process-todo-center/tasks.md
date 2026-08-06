## 1. 后端数据库迁移

- [x] 1.1 创建 `wf_task_comment` 表 Flyway 迁移脚本（taskId、processInstanceId、userId、comment、action、createTime）
- [x] 1.2 创建 `wf_task_remind` 表 Flyway 迁移脚本（taskId、processInstanceId、remindFrom、remindTo、remindTime），对 taskId 加索引

## 2. 后端 — 流程定义列表筛选扩展

- [x] 2.1 `ProcessService.listProcessDefinitions` 扩展查询条件：支持 categoryId、name、status 参数
- [x] 2.2 `ProcessDefinitionController.list` 增加 categoryId、name、status 可选查询参数
- [x] 2.3 编写单元测试验证筛选逻辑

## 3. 后端 — 任务列表 VO 与关联查询

- [x] 3.1 新建 `TaskTodoVO`（含 processName、initiator、initiatorName、currentNodeName、businessKey 等关联字段）
- [x] 3.2 新建 `TaskDoneVO`（在 TaskTodoVO 基础上增加 endTime、approveResult）
- [x] 3.3 `WorkflowTaskService` 扩展：listTodoTasks/listHistoricTasks 返回 VO，批量关联查询流程定义名称与发起人（避免 N+1）
- [x] 3.4 `TaskController.listTodo`/`listHistoric` 改为返回 VO 分页，支持 processName、initiator、createTimeStart/End 筛选参数
- [x] 3.5 编写集成测试验证 VO 字段完整性与关联查询性能

## 4. 后端 — 任务详情 VO

- [x] 4.1 新建 `TaskDetailVO`（含任务字段 + 流程基本信息 + 表单定义引用 + 流程变量快照）
- [x] 4.2 `TaskController.get` 改为返回 TaskDetailVO
- [x] 4.3 编写测试验证详情字段完整性

## 5. 后端 — 流程实例列表筛选扩展

- [x] 5.1 `ProcessInstanceService.listProcessInstances` 扩展查询条件：支持 initiator、status、processName 参数
- [x] 5.2 `ProcessInstanceController.list` 增加 initiator、status、processName 可选查询参数，返回 VO 含 currentNode、status 字段
- [x] 5.3 编写测试验证发起人与状态筛选

## 6. 后端 — 审批记录历史 API

- [x] 6.1 新建 `ProcessHistoryService`：基于 Flowable HistoryService 聚合历史活动节点 + 审批意见，返回时间线数据
- [x] 6.2 新建 `ProcessHistoryController`：`GET /api/v1/process-instances/{id}/history` 返回审批记录列表
- [x] 6.3 任务完成/驳回/转办等操作时写入审批意见到 wf_task_comment 表
- [x] 6.4 编写集成测试验证审批记录完整性与排序

## 7. 后端 — 催办 API

- [x] 7.1 新建 `TaskRemindService`：催办记录持久化 + 频率限制（默认 24h，可配置）+ 通知触发
- [x] 7.2 新建 `TaskRemindController`：`POST /api/v1/tasks/{taskId}/remind`
- [x] 7.3 待办列表 VO 增加 reminded 标记字段（该任务是否已被催办）
- [x] 7.4 编写测试验证频率限制与催办记录

## 8. 前端 — API 模块封装

- [x] 8.1 新建 `frontend/src/api/task.ts`：封装待办/已办列表、任务详情、任务操作 API（对应 TaskController）
- [x] 8.2 扩展 `frontend/src/api/processDefinition.ts`：deployed-processes 端点增加 categoryId/name/status 参数
- [x] 8.3 扩展 `frontend/src/api/processInstance.ts`：list 端点增加 initiator/status/processName 参数；新增 history 端点
- [x] 8.4 新建 `frontend/src/api/taskRemind.ts`：封装催办 API

## 9. 前端 — 流程中心页面

- [x] 9.1 改造 `ProcessCenterPage.vue`：分类分组折叠展示 + 流程卡片（名称/图标/描述/版本/发起按钮）
- [x] 9.2 实现流程名称搜索框（跨分类模糊匹配，搜索时全部分类展开）
- [x] 9.3 空状态处理（无可发起流程时提示）

## 10. 前端 — 发起流程页面

- [x] 10.1 新建 `ProcessStartPage.vue` + 路由 `/process/start/:processDefinitionId`
- [x] 10.2 实现流程基本信息区 + 流程图预览区（可折叠，基于 bpmn-js Viewer）
- [x] 10.3 实现发起表单区（复用 FormRenderer，字段权限按"创建时填写"）
- [x] 10.4 实现提交逻辑（表单校验 → POST 发起 → 跳转待办中心"我发起的"Tab 高亮新实例）
- [x] 10.5 处理无关联表单的流程（直接展示信息 + 确认发起按钮）

## 11. 前端 — 待办中心页面

- [x] 11.1 改造 `ProcessTodoPage.vue` 为三 Tab 结构（待办/已办/我发起的）
- [x] 11.2 实现待办 Tab：表格列表（流程名称/编号/发起人/当前节点/接收时间/处理按钮）+ 未读加粗 + 催办角标
- [x] 11.3 实现待办 Tab 筛选（流程名称/发起人/接收时间范围）+ 分页
- [x] 11.4 实现已办 Tab：表格列表（含审批结果列/查看按钮）+ 筛选（流程名称/发起人/处理时间/审批结果）+ 分页
- [x] 11.5 实现"我发起的"Tab：表格列表（流程名称/编号/当前节点/发起时间/状态/跟踪按钮）+ 筛选（流程名称/发起时间/状态）+ 分页

## 12. 前端 — 任务处理详情页

- [x] 12.1 新建 `TaskDetailPage.vue` + 路由 `/process/todo/:taskId`
- [x] 12.2 实现顶部流程基本信息区
- [x] 12.3 实现中部审批表单区（复用 FormRenderer，权限按"审批时查看"）+ 流程变量只读展示
- [x] 12.4 实现底部审批意见区 + 主操作按钮（通过/驳回）+ 更多操作下拉（转办/委派/加签/转签）
- [x] 12.5 实现各操作逻辑（调 API + 成功后返回待办列表 + 触发刷新）
- [x] 12.6 实现右侧流程跟踪区（高亮图 + 审批记录时间线组件）

## 13. 前端 — 已办只读详情页

- [x] 13.1 新建 `TaskDoneDetailPage.vue` + 路由 `/process/todo/done/:taskId`
- [x] 13.2 复用详情页布局，表单只读、无操作按钮、流程跟踪高亮当时处理节点
- [x] 13.3 流程仍在进行中时提供"查看实时进度"跳转到流程实例跟踪页

## 14. 前端 — 流程实例跟踪页

- [x] 14.1 新建 `ProcessInstanceTrackPage.vue` + 路由 `/process/instance/:instanceId`
- [x] 14.2 实现流程基本信息 + 流程图高亮（已完成绿色/当前蓝色）
- [x] 14.3 实现完整审批记录时间线（节点/办理人/时间/意见/操作类型）
- [x] 14.4 实现进行中实例的催办按钮（调催办 API + 频率限制提示）
- [x] 14.5 已结束实例只读展示，无催办按钮

## 15. 前端 — 通用组件抽取

- [x] 15.1 抽取 `BpmnViewer.vue` 组件（基于 bpmn-js Viewer 模块，支持高亮，供发起页预览与跟踪页复用）
- [x] 15.2 抽取 `ApprovalTimeline.vue` 组件（审批记录时间线，供详情页与跟踪页复用）
- [x] 15.3 抽取 `UserPicker.vue` 组件（用户选择器，供转办/委派/加签/转签/筛选复用）

## 16. 端到端验证

- [x] 16.1 验证流程中心：分类展示 → 搜索 → 发起流程 → 跳转待办中心"我发起的"
- [x] 16.2 验证待办处理：待办列表 → 处理详情页 → 通过/驳回/转办/委派/加签/转签 → 返回列表刷新
- [x] 16.3 验证已办查看：已办列表 → 只读详情 → 流程仍在进行中时跳转跟踪页
- [x] 16.4 验证流程跟踪：我发起的 → 跟踪页 → 高亮图 + 时间线 → 催办（含频率限制）
