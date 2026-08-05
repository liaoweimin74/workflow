# Task 4 审查修复报告

## 概述

修复 Task 4（任务详情 VO）审查发现的 2 个 Important issues：
1. `getTaskDetail` 未完全复用 batch 查询模式
2. 已结束流程的 businessKey 不可查

## 修改文件

| 文件 | 变更类型 |
|------|----------|
| `backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java` | 修改 `getTaskDetail` 方法 |
| `backend/src/test/java/com/workflow/engine/task/WorkflowTaskServiceDetailTest.java` | 更新 mock + 新增测试 |

## Issue 1 修复：复用 batch 查询模式

### 问题

`getTaskDetail` 单任务场景直接调用 `runtimeService.createProcessInstanceQuery().processInstanceId(id).singleResult()` 和 `runtimeService.getVariable(id, "initiator")`，未复用 Task 3 建立的 `batchQueryProcessInstances` / `batchQueryInitiators` 方法，导致查询模式不一致。

### 修复

将 `getTaskDetail` 中的 ProcessInstance + initiator 查询改为：

```java
Set<String> piIdSet = Set.of(processInstanceId);
Map<String, ProcessInstance> piMap = batchQueryProcessInstances(piIdSet);
ProcessInstance pi = piMap.get(processInstanceId);

if (pi != null) {
    vo.setBusinessKey(pi.getBusinessKey());
    Map<String, String> initiatorMap = batchQueryInitiators(piIdSet, piMap);
    // ...
}
```

复用 `batchQueryProcessInstances(Set)` 和 `batchQueryInitiators(Set, Map)`，与 `assembleTodoVOs` 批量场景保持一致。

## Issue 2 修复：已结束流程 businessKey fallback

### 问题

原代码仅查 `runtimeService` ProcessInstance（运行中），流程结束后返回 null 导致 `businessKey` 丢失。

### 修复

当 `batchQueryProcessInstances` 返回的 map 中找不到 ProcessInstance 时，fallback 查 `historyService`：

```java
} else {
    // 流程已结束：fallback 查 HistoricProcessInstance
    HistoricProcessInstance hpi = historyService.createHistoricProcessInstanceQuery()
            .processInstanceId(processInstanceId)
            .singleResult();
    if (hpi != null) {
        vo.setBusinessKey(hpi.getBusinessKey());
    }
    // initiator 变量也从历史变量中获取
    Map<String, String> initiatorMap = batchQueryHistoricInitiators(piIdSet);
    // ...
}
```

同时复用 `batchQueryHistoricInitiators` 从历史变量获取 initiator，与 `assembleDoneVOs` 批量场景一致。

## 测试

### 更新现有测试

`getTaskDetailReturnsVOWithProcessNameInitiatorNameAndVariables` 的 mock 从 `piQuery.processInstanceId(anyString()).singleResult()` 改为 `piQuery.processInstanceIds(any()).list()`，匹配 `batchQueryProcessInstances` 的实际调用模式。

### 新增测试

`getTaskDetailFallsBackToHistoryWhenProcessEnded`：验证流程已结束场景下：
- `runtimeService` 返回空列表
- `historyService.createHistoricProcessInstanceQuery().singleResult()` 返回 HistoricProcessInstance 带 businessKey
- `historyService.createHistoricVariableInstanceQuery()` 返回历史 initiator 变量
- 断言 `businessKey`、`initiator`、`initiatorName` 均正确从历史数据获取

### 测试结果

```
Tests run: 146, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

全部 146 个测试通过，无回归。

## Commit

```
fix(task): reuse batch query pattern and add history fallback in getTaskDetail
```

`19c6328` on `feature/process-todo-center`
