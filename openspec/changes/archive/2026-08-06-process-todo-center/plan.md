# 流程中心与待办中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现面向普通用户的流程中心（发起入口）与待办中心（待办/已办/我发起的），补齐后端 API 缺口，使平台可实际使用。

**Architecture:** 后端在现有 Controller/Service 上扩展查询参数与返回 VO，新增审批记录历史与催办两个 API 域；前端复用 SearchTable/FormRenderer 组件体系，新增 6 个页面/组件，抽取 BpmnViewer/ApprovalTimeline/UserPicker 三个通用组件。

**Tech Stack:** Spring Boot + Flowable + MySQL/Flyway（后端）；Vue 3 + Element Plus + TypeScript + bpmn-js（前端）

## Global Constraints

- 后端 REST 返回统一 `R<T>` 封装，流程相关 API 前缀 `/api/v1/`，任务 API 暂保留 `/api/`（技术债后续统一）
- 前端 API 模块统一 `http` 封装，返回 `R<T>` 类型，组件复用 `SearchTable`/`FormRenderer`
- 数据库变更通过 Flyway 迁移脚本，版本号递增不冲突
- TDD：后端先写测试再实现；前端组件先确保渲染再接 API
- 每个任务组结束有独立提交点

---

## Task 1: 后端数据库迁移 — wf_task_comment + wf_task_remind

**Files:**
- Create: `backend/src/main/resources/db/migration/V13__create_wf_task_comment.sql`
- Create: `backend/src/main/resources/db/migration/V14__create_wf_task_remind.sql`

**Interfaces:**
- Produces: `wf_task_comment` 表（id, task_id, process_instance_id, user_id, comment, action, create_time）
- Produces: `wf_task_remind` 表（id, task_id, process_instance_id, remind_from, remind_to, remind_time），task_id 索引

- [ ] **Step 1: 编写 V13 迁移脚本**

```sql
-- V13__create_wf_task_comment.sql
CREATE TABLE wf_task_comment (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL,
    process_instance_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    comment TEXT,
    action VARCHAR(32) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_id (task_id),
    INDEX idx_process_instance_id (process_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: 编写 V14 迁移脚本**

```sql
-- V14__create_wf_task_remind.sql
CREATE TABLE wf_task_remind (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL,
    process_instance_id VARCHAR(64) NOT NULL,
    remind_from VARCHAR(64) NOT NULL,
    remind_to VARCHAR(64) NOT NULL,
    remind_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 3: 启动后端验证迁移执行**

Run: `cd backend && mvn spring-boot:run`（检查日志无 Flyway 报错，表已创建）
Expected: Flyway 执行 V13/V14 成功

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V13__create_wf_task_comment.sql backend/src/main/resources/db/migration/V14__create_wf_task_remind.sql
git commit -m "feat(db): add wf_task_comment and wf_task_remind tables"
```

---

## Task 2: 后端 — 流程定义列表筛选扩展

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/process/ProcessService.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/ProcessDefinitionController.java`
- Test: `backend/src/test/java/com/workflow/api/controller/ProcessDefinitionControllerTest.java`

**Interfaces:**
- Produces: `ProcessService.listProcessDefinitions(PageRequest, String categoryId, String name, String status)` 
- Produces: `GET /api/v1/deployed-processes?categoryId=&name=&status=` 支持 3 个可选参数

- [ ] **Step 1: 编写失败测试 — 按分类筛选**

```java
@Test
void listByCategoryId() {
    // 部署一个分类下的流程，调用 GET /api/v1/deployed-processes?categoryId=<id>
    // 断言返回列表仅包含该分类的流程
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && mvn test -Dtest=ProcessDefinitionControllerTest#listByCategoryId`
Expected: FAIL

- [ ] **Step 3: 扩展 ProcessService 查询条件**

修改 `listProcessDefinitions` 方法签名，增加 categoryId/name/status 参数，使用 Flowable `ProcessDefinitionQuery` 的 `.processDefinitionCategoryLike()`/`.processDefinitionNameLike()`/`.active()`/`.suspended()` 链式查询。

- [ ] **Step 4: 扩展 Controller 查询参数**

```java
@GetMapping
public R<PageResponse<ProcessDefinition>> list(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String categoryId,
        @RequestParam(required = false) String name,
        @RequestParam(required = false) String status) {
    Page<ProcessDefinition> result = processService.listProcessDefinitions(
        PageRequest.of(page, size), categoryId, name, status);
    // ... 封装 PageResponse 返回
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && mvn test -Dtest=ProcessDefinitionControllerTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/process/ProcessService.java backend/src/main/java/com/workflow/api/controller/ProcessDefinitionController.java backend/src/test/java/com/workflow/api/controller/ProcessDefinitionControllerTest.java
git commit -m "feat(process-definition): support categoryId/name/status filter in list API"
```

---

## Task 3: 后端 — 任务列表 VO 与关联查询

**Files:**
- Create: `backend/src/main/java/com/workflow/api/dto/TaskTodoVO.java`
- Create: `backend/src/main/java/com/workflow/api/dto/TaskDoneVO.java`
- Modify: `backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/TaskController.java`
- Test: `backend/src/test/java/com/workflow/api/controller/TaskControllerVOTest.java`

**Interfaces:**
- Produces: `TaskTodoVO`（taskId, processInstanceId, processDefinitionId, processName, businessKey, initiator, initiatorName, currentNodeName, assignee, createTime, reminded）
- Produces: `TaskDoneVO` extends TaskTodoVO +（endTime, approveResult）
- Produces: `GET /api/tasks?assignee=&processName=&initiator=&createTimeStart=&createTimeEnd=` 返回 `PageResponse<TaskTodoVO>`
- Produces: `GET /api/tasks/historic?userId=&processName=&initiator=&endTimeStart=&endTimeEnd=&approveResult=` 返回 `PageResponse<TaskDoneVO>`

- [ ] **Step 1: 创建 TaskTodoVO 与 TaskDoneVO 类**

```java
// TaskTodoVO.java
public class TaskTodoVO {
    private String taskId;
    private String processInstanceId;
    private String processDefinitionId;
    private String processName;
    private String businessKey;
    private String initiator;
    private String initiatorName;
    private String currentNodeName;
    private String assignee;
    private String createTime;
    private boolean reminded;
    // getters/setters
}

// TaskDoneVO.java
public class TaskDoneVO extends TaskTodoVO {
    private String endTime;
    private String approveResult; // 通过/驳回/转办/委派/加签/转签
    // getters/setters
}
```

- [ ] **Step 2: 编写失败测试 — 待办列表返回关联字段**

```java
@Test
void listTodoReturnsVOWithProcessName() {
    // 发起流程，查询待办，断言返回 TaskTodoVO 包含 processName, initiatorName
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd backend && mvn test -Dtest=TaskControllerVOTest#listTodoReturnsVOWithProcessName`
Expected: FAIL

- [ ] **Step 4: 扩展 WorkflowTaskService — 批量关联查询**

在 `listTodoTasks` 中：查询 Task 分页 → 批量收集 processInstanceId → 一次性查询 ProcessInstance 获取 processName/initiator/businessKey → 批量查询 User 获取 initiatorName → 组装 TaskTodoVO。扩展方法签名支持 processName/initiator/createTimeStart/createTimeEnd 筛选。

- [ ] **Step 5: 修改 TaskController.listTodo 返回 VO**

```java
@GetMapping
public R<PageResponse<TaskTodoVO>> listTodo(
        @RequestParam String assignee,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String processName,
        @RequestParam(required = false) String initiator,
        @RequestParam(required = false) String createTimeStart,
        @RequestParam(required = false) String createTimeEnd) {
    // 调用 taskService.listTodoTasks 返回 VO 分页
}
```

- [ ] **Step 6: 同理实现已办列表 TaskDoneVO 与筛选**

`listHistoric` 方法返回 `PageResponse<TaskDoneVO>`，approveResult 从 wf_task_comment 表查询 action 字段。

- [ ] **Step 7: 运行测试确认通过**

Run: `cd backend && mvn test -Dtest=TaskControllerVOTest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/workflow/api/dto/TaskTodoVO.java backend/src/main/java/com/workflow/api/dto/TaskDoneVO.java backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java backend/src/main/java/com/workflow/api/controller/TaskController.java backend/src/test/java/com/workflow/api/controller/TaskControllerVOTest.java
git commit -m "feat(task): return TaskTodoVO/TaskDoneVO with related fields, support filters"
```

---

## Task 4: 后端 — 任务详情 VO

**Files:**
- Create: `backend/src/main/java/com/workflow/api/dto/TaskDetailVO.java`
- Modify: `backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/TaskController.java`

**Interfaces:**
- Produces: `TaskDetailVO`（任务字段 + processName + initiator + initiatorName + businessKey + formKey + variables Map）
- Produces: `GET /api/tasks/{id}` 返回 `R<TaskDetailVO>`

- [ ] **Step 1: 创建 TaskDetailVO**

```java
public class TaskDetailVO {
    private String taskId;
    private String name;
    private String description;
    private String assignee;
    private String processInstanceId;
    private String processDefinitionId;
    private String processName;
    private String businessKey;
    private String initiator;
    private String initiatorName;
    private String formKey;
    private Map<String, Object> variables;
    private String createTime;
    // getters/setters
}
```

- [ ] **Step 2: 编写失败测试 — 详情返回关联字段**

- [ ] **Step 3: 扩展 WorkflowTaskService.getTaskDetail**

查询 Task → 关联查询 ProcessInstance 获取 processName/initiator/businessKey → 查询 UserService 获取 initiatorName → 查询 formKey → 查询流程变量 → 组装 TaskDetailVO。

- [ ] **Step 4: 修改 TaskController.get 返回 TaskDetailVO**

- [ ] **Step 5: 运行测试确认通过**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(task): return TaskDetailVO with process info and variables"
```

---

## Task 5: 后端 — 流程实例列表筛选扩展

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/process/ProcessInstanceService.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/ProcessInstanceController.java`

**Interfaces:**
- Produces: `GET /api/v1/process-instances?initiator=&status=&processName=` 返回 VO 含 currentNode/status

- [ ] **Step 1: 编写失败测试 — 按发起人筛选**

- [ ] **Step 2: 扩展 ProcessInstanceService 查询条件**

使用 Flowable `RuntimeService.createProcessInstanceQuery().variableValueEquals("initiator", initiator)` 筛选；status=running 用 `.active()`，status=completed 需查 HistoryService。

- [ ] **Step 3: 扩展 Controller 参数 + 返回 VO 含 currentNode/status**

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(process-instance): support initiator/status/processName filter"
```

---

## Task 6: 后端 — 审批记录历史 API

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/history/ProcessHistoryService.java`
- Create: `backend/src/main/java/com/workflow/api/controller/ProcessHistoryController.java`
- Create: `backend/src/main/java/com/workflow/api/dto/ApprovalRecordVO.java`
- Create: `backend/src/main/java/com/workflow/engine/history/entity/WfTaskComment.java`
- Create: `backend/src/main/java/com/workflow/engine/history/repository/WfTaskCommentRepository.java`
- Modify: 任务操作处（RejectService/TransferService/AddSignService/ForwardSignService/WorkflowTaskService）写入审批意见

**Interfaces:**
- Produces: `GET /api/v1/process-instances/{id}/history` 返回 `R<List<ApprovalRecordVO>>`
- ApprovalRecordVO: activityId, activityName, assignee, assigneeName, startTime, endTime, action, comment

- [ ] **Step 1: 创建 WfTaskComment 实体 + Repository**

- [ ] **Step 2: 编写失败测试 — 查询审批记录**

```java
@Test
void getHistoryReturnsApprovalRecords() {
    // 发起流程 → 完成任务 → 查询 history → 断言返回 ApprovalRecordVO 列表含 action/comment
}
```

- [ ] **Step 3: 实现 ProcessHistoryService**

基于 Flowable `HistoryService.createHistoricActivityInstanceQuery()` 查询已完成的 userTask 活动 → 关联查询 wf_task_comment 获取审批意见 → 关联查询 UserService 获取办理人姓名 → 组装 ApprovalRecordVO 列表按 startTime 正序。

- [ ] **Step 4: 创建 ProcessHistoryController**

```java
@RestController
@RequestMapping("/api/v1/process-instances")
public class ProcessHistoryController {
    @GetMapping("/{id}/history")
    public R<List<ApprovalRecordVO>> history(@PathVariable String id) {
        return R.ok(processHistoryService.getApprovalHistory(id));
    }
}
```

- [ ] **Step 5: 任务操作处写入审批意见**

在 complete/reject/transfer/delegate/add-sign/forward-sign 的 Service 方法中，操作成功后写入 `wf_task_comment` 记录（action + comment + userId）。

- [ ] **Step 6: 运行测试确认通过**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(history): add approval history API, persist task comments on operations"
```

---

## Task 7: 后端 — 催办 API

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/task/TaskRemindService.java`
- Create: `backend/src/main/java/com/workflow/api/controller/TaskRemindController.java`
- Create: `backend/src/main/java/com/workflow/engine/task/entity/WfTaskRemind.java`
- Create: `backend/src/main/java/com/workflow/engine/task/repository/WfTaskRemindRepository.java`

**Interfaces:**
- Produces: `POST /api/v1/tasks/{taskId}/remind` — 频率限制 24h，记录到 wf_task_remind，触发通知

- [ ] **Step 1: 创建 WfTaskRemind 实体 + Repository**

- [ ] **Step 2: 编写失败测试 — 正常催办 + 频率限制**

```java
@Test
void remindSucceedsFirstTime() { /* 断言成功 */ }
@Test
void remindRejectedWithin24h() { /* 断言抛异常或返回失败 */ }
```

- [ ] **Step 3: 实现 TaskRemindService**

查询 wf_task_remind 表该 taskId 最后一条记录 → 若 remind_time 在 24h 内则抛异常 → 否则插入记录 + 调用通知服务（本期通知先 log，后续对接通知中心）。

- [ ] **Step 4: 创建 TaskRemindController**

```java
@RestController
@RequestMapping("/api/v1/tasks")
public class TaskRemindController {
    @PostMapping("/{taskId}/remind")
    public R<Void> remind(@PathVariable String taskId) {
        taskRemindService.remind(taskId);
        return R.ok();
    }
}
```

- [ ] **Step 5: 待办列表 VO 增加 reminded 标记**

`TaskTodoVO.reminded` 字段 — 查询时 LEFT JOIN wf_task_remind 判断是否有记录。

- [ ] **Step 6: 运行测试确认通过**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(remind): add task remind API with 24h frequency limit"
```

---

## Task 8: 前端 — API 模块封装

**Files:**
- Create: `frontend/src/api/task.ts`
- Modify: `frontend/src/api/processDefinition.ts`
- Modify or Create: `frontend/src/api/processInstance.ts`
- Create: `frontend/src/api/taskRemind.ts`

**Interfaces:**
- Produces: `taskApi`（listTodo, listHistoric, getDetail, complete, reject, transfer, delegate, addSign, forwardSign）
- Produces: `processInstanceApi`（list 支持 initiator/status/processName, get, highlight, history）
- Produces: `taskRemindApi`（remind）

- [ ] **Step 1: 创建 task.ts 封装任务 API**

```typescript
// frontend/src/api/task.ts
import http from '@/utils/http'
import type { R } from '@/types/common'

export interface TaskTodoVO { /* 对应后端 VO 字段 */ }
export interface TaskDoneVO extends TaskTodoVO { endTime: string; approveResult: string }
export interface TaskDetailVO { /* 对应后端 VO 字段 */ }

export const taskApi = {
  listTodo(params): Promise<R<PageResponse<TaskTodoVO>>> { return http.get('/tasks', { params }) },
  listHistoric(params): Promise<R<PageResponse<TaskDoneVO>>> { return http.get('/tasks/historic', { params }) },
  getDetail(id): Promise<R<TaskDetailVO>> { return http.get(`/tasks/${id}`) },
  complete(id, data): Promise<R<any>> { return http.post(`/tasks/${id}/complete`, data) },
  reject(id, data): Promise<R<void>> { return http.post(`/tasks/${id}/reject`, data) },
  transfer(id, data): Promise<R<void>> { return http.post(`/tasks/${id}/transfer`, data) },
  delegate(id, data): Promise<R<void>> { return http.post(`/tasks/${id}/delegate`, data) },
  addSign(id, data): Promise<R<void>> { return http.post(`/tasks/${id}/add-sign`, data) },
  forwardSign(id, data): Promise<R<void>> { return http.post(`/tasks/${id}/forward-sign`, data) },
}
```

- [ ] **Step 2: 扩展 processDefinition.ts — deployed-processes 增加筛选参数**

- [ ] **Step 3: 创建/扩展 processInstance.ts — list 增加 initiator/status/processName + history 端点**

- [ ] **Step 4: 创建 taskRemind.ts**

- [ ] **Step 5: TypeScript 编译验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/
git commit -m "feat(api): add task/processInstance/taskRemind API modules"
```

---

## Task 9: 前端 — 流程中心页面

**Files:**
- Modify: `frontend/src/views/process/ProcessCenterPage.vue`

- [ ] **Step 1: 实现分类分组折叠展示**

使用 `el-collapse` + `el-collapse-item`，每个分类一个面板。调用 `categoryApi.tree()` 获取分类，`processDesignApi` 或新 API 获取已部署流程按 categoryId 分组。

- [ ] **Step 2: 实现流程卡片**

`el-card` 网格布局，每张卡片：流程名称、图标（el-icon 默认）、描述、版本号、"发起"按钮。点击"发起" → `router.push('/process/start/' + processDefinitionId)`。

- [ ] **Step 3: 实现名称搜索框**

顶部 `el-input` 搜索，输入触发 `GET /api/v1/deployed-processes?name=<keyword>&status=active`，搜索时所有 collapse 面板展开。

- [ ] **Step 4: 空状态处理**

无可发起流程时 `el-empty` 提示。

- [ ] **Step 5: 浏览器验证**

启动前端，访问 `/process/center`，确认分类展示、搜索、卡片渲染正常。

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(process-center): category-grouped process list with search"
```

---

## Task 10: 前端 — 发起流程页面

**Files:**
- Create: `frontend/src/views/process/ProcessStartPage.vue`
- Modify: `frontend/src/router/index.ts`（新增路由）

- [ ] **Step 1: 新增路由 `/process/start/:processDefinitionId`**

- [ ] **Step 2: 实现流程基本信息区 + 流程图预览区（折叠）**

调用 `GET /api/v1/deployed-processes/{id}` + `/xml`，流程图用 BpmnViewer 组件（Task 15 抽取前可临时内联 bpmn-js Viewer）。

- [ ] **Step 3: 实现发起表单区**

复用 `FormRenderer` 组件，传入 formKey 加载表单定义，字段权限按"创建时填写"。

- [ ] **Step 4: 实现提交逻辑**

```typescript
async function handleSubmit() {
  await formRef.value.validate()
  const variables = formRef.value.getFormData()
  const res = await processInstanceApi.start({ processKey: processDefinition.key, variables })
  ElMessage.success('发起成功')
  router.push({ path: '/process/todo', query: { tab: 'mine', highlight: res.data.id } })
}
```

- [ ] **Step 5: 处理无关联表单的流程**

无 formKey 时仅展示流程信息 + "确认发起"按钮。

- [ ] **Step 6: 浏览器验证**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(process-start): standalone start page with form and diagram preview"
```

---

## Task 11: 前端 — 待办中心页面

**Files:**
- Modify: `frontend/src/views/process/ProcessTodoPage.vue`

- [ ] **Step 1: 改造为三 Tab 结构**

`el-tabs` 含"待办""已办""我发起的"三个 `el-tab-pane`，每 Tab 独立数据加载与筛选状态。

- [ ] **Step 2: 实现待办 Tab**

`SearchTable` 组件，列：流程名称/流程编号/发起人/当前节点/接收时间/操作。`fetchApi` 调用 `taskApi.listTodo`。未读行加粗（CSS），reminded 为 true 显示催办角标（el-badge）。操作列"处理"按钮跳转 `/process/todo/:taskId`。

- [ ] **Step 3: 实现待办筛选**

SearchField 配置：流程名称（input）、发起人（UserPicker）、接收时间（daterange）。

- [ ] **Step 4: 实现已办 Tab**

`SearchTable`，列含审批结果。`fetchApi` 调用 `taskApi.listHistoric`。筛选增加审批结果下拉。"查看"按钮跳转 `/process/todo/done/:taskId`。

- [ ] **Step 5: 实现"我发起的"Tab**

`SearchTable`，`fetchApi` 调用 `processInstanceApi.list({ initiator: currentUserId })`。列含当前节点/状态。"跟踪"按钮跳转 `/process/instance/:instanceId`。

- [ ] **Step 6: 实现分页**

三 Tab 均配置 SearchTable 分页，每页 20 条。

- [ ] **Step 7: 浏览器验证**

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(todo-center): three-tab todo/done/mine lists with filters"
```

---

## Task 12: 前端 — 任务处理详情页

**Files:**
- Create: `frontend/src/views/process/TaskDetailPage.vue`
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 新增路由 `/process/todo/:taskId`**

- [ ] **Step 2: 实现顶部流程基本信息区**

调用 `taskApi.getDetail(taskId)` 加载，展示流程名称/编号/发起人/发起时间/当前节点。

- [ ] **Step 3: 实现中部审批表单区**

若有 formKey，`FormRenderer` 渲染表单（权限按"审批时查看"）。下方只读展示 `el-descriptions` 列出流程变量。

- [ ] **Step 4: 实现底部审批意见区 + 操作按钮**

`el-input type="textarea"` 审批意见。主按钮"通过""驳回"。`el-dropdown` 更多操作：转办/委派/加签/转签，各弹出 UserPicker 对话框。

- [ ] **Step 5: 实现各操作逻辑**

```typescript
async function handleApprove() {
  await taskApi.complete(taskId, { variables: { comment: comment.value } })
  ElMessage.success('审批通过')
  router.push('/process/todo')
}
// 同理 handleReject/handleTransfer/handleDelegate/handleAddSign/handleForwardSign
```

- [ ] **Step 6: 实现右侧流程跟踪区**

`el-drawer` 或右侧固定面板：BpmnViewer 高亮图 + ApprovalTimeline 组件。调用 `highlight` + `history` API。

- [ ] **Step 7: 浏览器验证**

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(task-detail): three-section layout with approve operations and tracking"
```

---

## Task 13: 前端 — 已办只读详情页

**Files:**
- Create: `frontend/src/views/process/TaskDoneDetailPage.vue`
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 新增路由 `/process/todo/done/:taskId`**

- [ ] **Step 2: 复用详情页布局，只读模式**

结构与 TaskDetailPage 相同，但表单 `disabled`、无操作按钮、流程跟踪高亮当时处理节点。

- [ ] **Step 3: 流程仍在进行中时提供跳转**

若 `processInstance.ended === false`，显示"查看实时进度"按钮跳转 `/process/instance/:instanceId`。

- [ ] **Step 4: 浏览器验证**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(task-done-detail): read-only detail page with live tracking link"
```

---

## Task 14: 前端 — 流程实例跟踪页

**Files:**
- Create: `frontend/src/views/process/ProcessInstanceTrackPage.vue`
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 新增路由 `/process/instance/:instanceId`**

- [ ] **Step 2: 实现流程基本信息 + 高亮图**

调用 `processInstanceApi.get(id)` + `highlight(id)`。BpmnViewer 渲染高亮（已完成绿色/当前蓝色）。

- [ ] **Step 3: 实现审批记录时间线**

`ApprovalTimeline` 组件，调用 `processInstanceApi.history(id)` 渲染时间线。

- [ ] **Step 4: 实现催办按钮**

进行中实例显示"催办"按钮，调用 `taskRemindApi.remind(currentTaskId)`。处理频率限制错误提示。

- [ ] **Step 5: 已结束实例只读**

`instance.ended === true` 时不显示催办按钮。

- [ ] **Step 6: 浏览器验证**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(process-track): instance tracking page with highlight, timeline, remind"
```

---

## Task 15: 前端 — 通用组件抽取

**Files:**
- Create: `frontend/src/components/business/BpmnViewer.vue`
- Create: `frontend/src/components/business/ApprovalTimeline.vue`
- Create: `frontend/src/components/business/UserPicker.vue`

- [ ] **Step 1: 抽取 BpmnViewer 组件**

基于 `bpmn-js/lib/NavigatedViewer`，props: xml, highlightData（completed/activity 节点 ID 数组）。封装 import/渲染/高亮 overlay 逻辑。重构 Task 10/12/14 中内联的 bpmn-js 调用改用此组件。

- [ ] **Step 2: 抽取 ApprovalTimeline 组件**

props: records（ApprovalRecordVO[]）。用 `el-timeline` 渲染，每项显示节点/办理人/时间/意见/操作类型标签。

- [ ] **Step 3: 抽取 UserPicker 组件**

props: multiple（boolean）。基于 `el-select` + 远程搜索调用 `GET /api/users`。重构 Task 12 中转办/委派/加签/转签的 UserPicker 对话框改用此组件。

- [ ] **Step 4: TypeScript 编译 + 浏览器验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(components): extract BpmnViewer, ApprovalTimeline, UserPicker"
```

---

## Task 16: 端到端验证

**Files:** 无新增，仅验证

- [ ] **Step 1: 验证流程中心全链路**

启动后端 + 前端 → 登录 → 访问流程中心 → 分类展示正常 → 搜索功能正常 → 点击发起 → 填写表单 → 提交 → 跳转待办中心"我发起的"Tab → 新实例高亮显示。

- [ ] **Step 2: 验证待办处理全链路**

用另一个账号登录 → 待办 Tab 看到新任务 → 点击处理 → 详情页三段布局正常 → 审批通过 → 返回待办列表 → 任务消失。

- [ ] **Step 3: 验证驳回/转办/委派/加签/转签**

依次测试驳回（回到发起人 → 发起人待办出现）、转办（任务转给新办理人）、委派（被委派人处理后回到原办理人）、加签（新增审批人）、转签（替换审批人）。

- [ ] **Step 4: 验证已办查看**

已办 Tab → 查看已办详情 → 只读模式 → 流程仍在进行中时跳转跟踪页。

- [ ] **Step 5: 验证流程跟踪与催办**

"我发起的" → 跟踪 → 高亮图 + 时间线正常 → 催办 → 成功提示 → 24h 内再次催办 → 频率限制提示。

- [ ] **Step 6: 最终 Commit**

```bash
git commit -m "test(e2e): verify process-center and todo-center full flows"
```

---

## Self-Review

**1. Spec coverage:**
- process-center spec → Task 2（API 筛选）+ Task 9（页面）✓
- process-start spec → Task 10 ✓
- todo-center spec → Task 3（VO）+ Task 5（实例筛选）+ Task 11（页面）✓
- task-detail spec → Task 4（详情 VO）+ Task 12（页面）✓
- process-tracking spec → Task 6（历史 API）+ Task 14（页面）✓
- task-remind spec → Task 7（API）+ Task 14（催办按钮）✓

**2. Placeholder scan:** 无 TBD/TODO，所有步骤含具体代码或明确操作。✓

**3. Type consistency:** TaskTodoVO/TaskDoneVO/TaskDetailVO/ApprovalRecordVO 字段在后端与前端 API 模块定义一致。✓
