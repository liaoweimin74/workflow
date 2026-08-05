# Task 8 Report: 前端 — API 模块封装

## Status: DONE

## 变更概要

### 新增文件

1. **`frontend/src/api/task.ts`** — 任务 API 模块
   - `TaskTodoVO` — 待办任务 VO（taskId, processName, initiator, initiatorName, currentNodeName, reminded 等）
   - `TaskDoneVO` — 已办任务 VO（继承 TaskTodoVO + endTime, approveResult）
   - `TaskDetailVO` — 任务详情 VO（formKey, variables 等）
   - `ApprovalRecordVO` — 审批记录 VO（activityId, action, comment 等）
   - 请求类型：`TaskTodoQueryParams`, `TaskDoneQueryParams`, `CompleteTaskRequest`, `RejectRequest`, `TransferRequest`, `DelegateRequest`, `AddSignRequest`, `ForwardSignRequest`
   - `CompleteTaskResponse` — 完成任务响应（processFinished, nextTaskId 等）
   - `taskApi` 对象：listTodo, listHistoric, getDetail, claim, complete, reject, transfer, delegate, addSign, forwardSign

2. **`frontend/src/api/processInstance.ts`** — 流程实例 API 模块（新建）
   - `ProcessInstanceVO` — 流程实例列表项
   - `ProcessInstanceQueryParams` — 支持 initiator/status/processName 筛选
   - `StartProcessRequest`, `StartProcessResponse`, `ProcessHighlight`
   - `processInstanceApi` 对象：start, list, get, suspend, resume, terminate, highlight, **history**（审批历史时间线）

3. **`frontend/src/api/taskRemind.ts`** — 任务催办 API 模块
   - `taskRemindApi.remind(taskId, data?)` — POST /api/v1/tasks/{taskId}/remind

### 修改文件

4. **`frontend/src/api/processDefinition.ts`** — 扩展已部署流程定义 API
   - 新增 `DeployedProcessDefinition` 接口（Flowable ProcessDefinition 序列化形状）
   - 新增 `DeployedProcessQueryParams`（page, size, categoryId, name, status）
   - 新增 `deployedProcessApi` 对象：list, listSummaries, get, getXml, suspend, activate
   - 保留原有 `processDesignApi`（含 listSummaries 向后兼容，CallActivityProperty.vue 依赖）

5. **`frontend/src/types/common.ts`** — 新增 `PageResponse<T>` 类型
   - 对应后端 Spring Data Page 包装（content, pageNumber, pageSize, totalElements, totalPages）
   - 与原有 `PageResult<T>`（rows/total/page/size）并存，新 API 使用 PageResponse

## 验证

- `npx tsc --noEmit` — 零错误
- `npm run build`（tsc + vite build）— 成功，2162 模块转换完成

## 端点覆盖

| 后端端点 | 前端 API |
|---------|---------|
| GET /api/v1/tasks | taskApi.listTodo |
| GET /api/v1/tasks/historic | taskApi.listHistoric |
| GET /api/v1/tasks/{id} | taskApi.getDetail |
| POST /api/v1/tasks/{id}/claim | taskApi.claim |
| POST /api/v1/tasks/{id}/complete | taskApi.complete |
| POST /api/v1/tasks/{id}/reject | taskApi.reject |
| POST /api/v1/tasks/{id}/transfer | taskApi.transfer |
| POST /api/v1/tasks/{id}/delegate | taskApi.delegate |
| POST /api/v1/tasks/{id}/add-sign | taskApi.addSign |
| POST /api/v1/tasks/{id}/forward-sign | taskApi.forwardSign |
| POST /api/v1/tasks/{id}/remind | taskRemindApi.remind |
| GET /api/v1/process-instances | processInstanceApi.list |
| POST /api/v1/process-instances | processInstanceApi.start |
| GET /api/v1/process-instances/{id} | processInstanceApi.get |
| POST /api/v1/process-instances/{id}/suspend | processInstanceApi.suspend |
| POST /api/v1/process-instances/{id}/resume | processInstanceApi.resume |
| POST /api/v1/process-instances/{id}/terminate | processInstanceApi.terminate |
| GET /api/v1/process-instances/{id}/highlight | processInstanceApi.highlight |
| GET /api/v1/process-instances/{id}/history | processInstanceApi.history |
| GET /api/v1/deployed-processes | deployedProcessApi.list |
| GET /api/v1/deployed-processes/summaries | deployedProcessApi.listSummaries |
| GET /api/v1/deployed-processes/{id} | deployedProcessApi.get |
| GET /api/v1/deployed-processes/{id}/xml | deployedProcessApi.getXml |
| POST /api/v1/deployed-processes/{id}/suspend | deployedProcessApi.suspend |
| POST /api/v1/deployed-processes/{id}/activate | deployedProcessApi.activate |

## 设计决策

1. **PageResponse vs PageResponse**：后端返回 `PageResponse`（content/totalElements），而系统模块 API 返回 `PageResult`（rows/total）。新增 `PageResponse<T>` 类型用于新 API，保持类型正确性。视图中已有的 `data.content || data.rows` 兼容写法不受影响。

2. **ApprovalRecordVO 定义位置**：放在 `task.ts` 中（因为它是任务/审批相关 VO），`processInstance.ts` 通过 `import type` 引用，避免循环依赖。

3. **deployedProcessApi 与 processDesignApi 分离**：`deployedProcessApi` 封装 `/api/v1/deployed-processes` 全部端点；`processDesignApi` 保留 `listSummaries` 以向后兼容 `CallActivityProperty.vue`。

4. **taskRemindApi 独立模块**：催办功能逻辑独立，单独模块便于后续扩展（如催办记录查询、批量催办等）。

## Commit

- `b63c48a` feat(frontend): add API modules for task, remind, history endpoints

## Concerns

无。所有 TypeScript 类型与后端 VO 字段一一对应，构建零错误。
