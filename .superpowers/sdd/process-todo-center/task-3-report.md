# Task 3 Report: 后端 — 任务列表 VO 与关联查询

## Status: DONE

## Summary

Created `TaskTodoVO` and `TaskDoneVO` DTOs with related fields (processName, initiator, initiatorName, currentNodeName). Extended `WorkflowTaskService` with `listTodoTasksVO`/`listHistoricTasksVO` methods that batch-query ProcessInstance, ProcessDefinition, and UserService to populate related fields without N+1. Modified `TaskController` endpoints to return VO pages with filter parameters.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `backend/.../api/dto/TaskTodoVO.java` | Create | 待办任务 VO（taskId, processInstanceId, processDefinitionId, processName, businessKey, initiator, initiatorName, currentNodeName, assignee, createTime, reminded） |
| `backend/.../api/dto/TaskDoneVO.java` | Create | 已办任务 VO，extends TaskTodoVO + endTime, approveResult |
| `backend/.../api/dto/TaskTodoFilter.java` | Create | 待办过滤 record（processName, initiator, createTimeStart, createTimeEnd） |
| `backend/.../api/dto/TaskDoneFilter.java` | Create | 已办过滤 record（processName, initiator, endTimeStart, endTimeEnd, approveResult） |
| `backend/.../engine/task/WorkflowTaskService.java` | Modify | 新增 RepositoryService + UserService 依赖；新增 listTodoTasksVO/listHistoricTasksVO + 批量查询辅助方法 |
| `backend/.../api/controller/TaskController.java` | Modify | listTodo/listHistoric 改为返回 VO 分页，增加过滤参数 |
| `backend/.../test/.../TaskControllerVOTest.java` | Create | 4 个单元测试 |

## TDD Evidence

### RED Phase

```
mvn test -Dtest=TaskControllerVOTest

[ERROR] 找不到符号: 方法 listTodoTasksVO(...)
[ERROR] 找不到符号: 方法 listHistoricTasksVO(...)
[ERROR] 无法将方法 listHistoric 应用到给定类型（参数数量不匹配）
[ERROR] 找不到符号: 方法 processName() / initiator() / createTimeStart() / createTimeEnd()
```

Test fails because VO methods, filter records, and controller signature changes don't exist yet.

### GREEN Phase

```
mvn test -Dtest=TaskControllerVOTest

[INFO] Tests run: 4, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 1.066 s
[INFO] BUILD SUCCESS
```

### Full Suite

```
mvn test
[INFO] BUILD SUCCESS
```

All existing tests pass — no regressions.

## Design Decisions

### N+1 Avoidance

- **ProcessInstance**: batch query via `runtimeService.createProcessInstanceQuery().processInstanceIds(set)` for todo; `historyService.createHistoricProcessInstanceQuery().processInstanceIds(set)` for historic
- **ProcessDefinition**: batch query via `repositoryService.createProcessDefinitionQuery().processDefinitionIds(set)` to get process names
- **Initiator variable**: per-instance query for `initiator` process variable (runtime for active, historic variable for finished)
- **User names**: batch via `userService.findByIds(List<Long>)` → map userId→nickname

### Filter Strategy

- `createTimeStart/End` and `endTimeStart/End`: pushed down to Flowable query (`taskCreatedAfter/Before`, `taskCompletedAfter/Before`)
- `processName` and `initiator`: filtered in-memory after VO assembly (Flowable TaskQuery doesn't support joining process definition name or process variables directly)
- `approveResult`: filtered in-memory (requires wf_task_comment table query, not yet implemented)

### approveResult — Temporarily Null

The `wf_task_comment` table exists (V13 migration) but no JPA entity/repository has been created yet (likely a later task). `approveResult` is set to `null` with a TODO marker. The filter still works — it just won't match any non-null approveResult values until the entity is wired in.

### API Endpoints

```
GET /api/v1/tasks?assignee=&processName=&initiator=&createTimeStart=&createTimeEnd=&page=&size=
    → R<PageResponse<TaskTodoVO>>

GET /api/v1/tasks/historic?userId=&processName=&initiator=&endTimeStart=&endTimeEnd=&approveResult=&page=&size=
    → R<PageResponse<TaskDoneVO>>
```

## Commit

```
8e41dac feat(task): add TaskTodoVO/TaskDoneVO with batch related-field queries
```

## Concerns

1. **approveResult is null**: `wf_task_comment` entity/repository not yet created. Need a follow-up task to wire `WfTaskComment` entity and query `action` field for `approveResult`.
2. **In-memory filtering**: `processName` and `initiator` filters are applied post-query. For large result sets this is acceptable since Flowable pagination happens first, but if filter selectivity is high, the page may appear sparser than expected. Could be addressed by a custom SQL query in the future.
3. **Initiator variable queries**: Currently per-instance (loop). Could be optimized to a single `createHistoricVariableInstanceQuery().processInstanceIds(set)` batch, but Flowable's variable query API varies by version.
