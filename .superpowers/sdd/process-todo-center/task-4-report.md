# Task 4 Report: 后端 — 任务详情 VO

## Status: DONE

## Commits

- `d432750` — feat(task): return TaskDetailVO with process info and variables

## TDD Evidence

### RED (failing test)

Command:
```
mvn test -Dtest=WorkflowTaskServiceDetailTest -Dsurefire.failIfNoSpecifiedTests=false
```

Result: **COMPILATION FAILURE** — `TaskDetailVO` class not found, `getTaskDetail` method not found:
```
[ERROR] 找不到符号: TaskDetailVO (com.workflow.api.dto)
[ERROR] 找不到符号: 方法 getTaskDetail(java.lang.String)
[INFO] 6 errors
[INFO] BUILD FAILURE
```

### GREEN (passing test)

Command:
```
mvn test -Dtest=WorkflowTaskServiceDetailTest -Dsurefire.failIfNoSpecifiedTests=false
```

Result:
```
[INFO] Tests run: 2, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

### Full suite (no regressions)

Command:
```
mvn test
```

Result:
```
[INFO] Tests run: 145, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

## Changes

### Created files

1. **`backend/src/main/java/com/workflow/api/dto/TaskDetailVO.java`** — 任务详情 VO
   - Fields: taskId, name, description, assignee, processInstanceId, processDefinitionId, processName, businessKey, initiator, initiatorName, formKey, variables (Map<String,Object>), createTime

2. **`backend/src/test/java/com/workflow/engine/task/WorkflowTaskServiceDetailTest.java`** — 2 tests
   - `getTaskDetailReturnsVOWithProcessNameInitiatorNameAndVariables` — 验证所有关联字段正确填充
   - `getTaskDetailReturnsEmptyWhenTaskNotFound` — 任务不存在返回 empty

### Modified files

3. **`backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java`**
   - Added import: `TaskDetailVO`
   - Added `getTaskDetail(String taskId)` method — 查询 Task → ProcessInstance(businessKey) → initiator变量 → UserService(initiatorName) → ProcessDefinition(processName) → BpmnModel(formKey) → variables → 组装 TaskDetailVO
   - Added `extractFormKey(String processDefinitionId, String taskDefinitionKey)` — 从 BpmnModel 的 UserTask 节点提取 formKey
   - Reuses `batchQueryProcessDefinitions` and `batchQueryInitiatorNames` from Task 3

4. **`backend/src/main/java/com/workflow/api/controller/TaskController.java`**
   - Changed `get` method return type from `R<Map<String, Object>>` to `R<TaskDetailVO>`
   - Changed call from `taskService.getTask(id).map(task -> R.ok(toMap(task)))` to `taskService.getTaskDetail(id).map(R::ok)`

## Design decisions

- **formKey extraction**: Used `repositoryService.getBpmnModel(processDefinitionId)` + iterate UserTask nodes matching `taskDefinitionKey`, returning `userTask.getFormKey()`. Follows the pattern from `InitiatorNodeResolver`.
- **Defensive error handling**: ProcessInstance/initiator/variables queries wrapped in try-catch since the process instance may have ended (consistent with Task 3's `batchQueryInitiators` pattern).
- **Reused batch query helpers**: `batchQueryProcessDefinitions` and `batchQueryInitiatorNames` from Task 3, even for single-task scenario — keeps code DRY.
- **No `toMap` removal**: The old `toMap` and `toHistoricMap` private methods remain in TaskController for now (not called by `get` anymore, but `toHistoricMap` may be used elsewhere or in future tasks).

## Test summary

- 2 new tests, both passing
- 145 total tests, 0 failures, 0 errors, 0 skipped

## Concerns

None. The `toMap` and `toHistoricMap` methods in TaskController are now dead code (only `toMap` was used by old `get`), but they may be needed by future tasks or could be cleaned up in a refactor pass.
