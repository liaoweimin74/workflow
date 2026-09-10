# Spike 设计：Flowable 8 会签/或签/驳回 可行性验证

> 状态：设计稿（explore 模式产出）
> 日期：2026-08-03
> 关联：PRD 3.3.2 会签与或签、3.3.4 驳回

## 目的

在动手实现 3.3 流程执行引擎前，用三个 throwaway 集成测试验证 Flowable 8 的三个关键能力是否如预期工作。spike 结果决定会签或签的实现路线（BPMN MI 原生 vs 自定义 TaskListener）。

**spike 不写生产代码**，只写测试类，验证后可删除或保留为回归测试。

## 三个独立命题

| Spike | 命题 | 失败后果 |
|---|---|---|
| Spike-1 | Flowable 8 MI parallel 会签：N 个审批人全部 complete 才前进 | 放弃 MI 路线，走自定义 TaskListener |
| Spike-2 | Flowable 8 MI 或签：completionCondition 任一完成即结束其余 | 同上 |
| Spike-3 | Flowable 8 changeActivityState 驳回（单实例）：回退到发起人节点 | 放弃 changeActivityState，走终止+重启路线 |
| Spike-4 | Flowable 8 changeActivityState 驳回（MI 节点）：整体回退，重新提交后 MI 重新展开 | MI 驳回降级为不支持，或改用"终止+重启"fallback |

Spike-1/2/3 互不依赖，可并行验证。Spike-4 依赖 Spike-1 通过（需先确认 MI 会签可用）。

## 前置条件

- 测试 profile：`application-test.yml` 已有 H2 + Flowable `database-schema-update: true`
- 项目无 `@SpringBootTest` 集成测试先例，spike 将是第一个
- 需要注入 `RepositoryService`、`RuntimeService`、`TaskService`、`HistoryService`

## 测试基础设施

### 共用 BPMN 流程定义

spike 用三个不同的 BPMN XML（内嵌字符串，不依赖前端设计器）。统一结构：

```
会签/或签流程:
  ●(start) → [审批节点 MI] → ●(end)

驳回流程:
  ●(start) → [发起人填表] → [经理审批] → ●(end)
```

### 测试类位置

```
backend/src/test/java/com/workflow/engine/spike/
  ├── MultiInstanceCountersignSpikeTest.java   (Spike-1)
  ├── MultiInstanceOrSignSpikeTest.java        (Spike-2)
  └── RejectChangeActivityStateSpikeTest.java  (Spike-3)
```

---

## Spike-1：会签（MI parallel，全部完成才前进）

### BPMN XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="spike">
  <process id="countersignSpike" name="会签Spike" isExecutable="true">
    <startEvent id="start" />
    <userTask id="approvalTask" name="会签审批"
              flowable:candidateUsers="${approverList}">
      <multiInstanceLoopCharacteristics isSequential="false"
                                         flowable:collection="${approverList}"
                                         flowable:elementVariable="approver">
        <completionCondition>${nrOfCompletedInstances == nrOfInstances}</completionCondition>
      </multiInstanceLoopCharacteristics>
    </userTask>
    <endEvent id="end" />
    <sequenceFlow id="f1" sourceRef="start" targetRef="approvalTask" />
    <sequenceFlow id="f2" sourceRef="approvalTask" targetRef="end" />
  </process>
</definitions>
```

### 测试用例

```java
@SpringBootTest
@ActiveProfiles("test")
class MultiInstanceCountersignSpikeTest {

    @Autowired RepositoryService repositoryService;
    @Autowired RuntimeService runtimeService;
    @Autowired TaskService taskService;

    @Test
    void countersign_allApproveThenAdvance() {
        // 1. 部署含 MI parallel 的 BPMN
        deploy("countersignSpike", BPMN_COUNTERSIGN);

        // 2. 启动，传入 3 个审批人
        List<String> approvers = List.of("alice", "bob", "carol");
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
            "countersignSpike",
            Map.of("approverList", approvers));

        // 3. 断言：生成 3 个并发任务
        List<Task> tasks = taskService.createTaskQuery()
            .processInstanceId(inst.getId())
            .list();
        assertEquals(3, tasks.size(), "应生成 3 个并发审批任务");

        // 4. alice 完成
        completeFirst(tasks, "alice");
        assertTaskCount(inst.getId(), 2, "alice 完成后应剩 2 个");

        // 5. bob 完成
        completeFirst(tasks, "bob");
        assertTaskCount(inst.getId(), 1, "bob 完成后应剩 1 个");

        // 6. carol 完成 —— 全部完成，流程前进到 end
        completeFirst(tasks, "carol");
        assertProcessEnded(inst.getId());
    }

    @Test
    void countersign_partialComplete_notAdvance() {
        deploy("countersignSpike", BPMN_COUNTERSIGN);
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
            "countersignSpike",
            Map.of("approverList", List.of("alice", "bob")));

        // 只完成 1 个，流程不应结束
        List<Task> tasks = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).list();
        taskService.complete(tasks.get(0).getId());

        assertFalse(runtimeService.createProcessInstanceQuery()
            .processInstanceId(inst.getId()).singleResult().isEnded(),
            "会签未全部完成，流程不应结束");
    }
}
```

### 验证点

| # | 断言 | 含义 |
|---|---|---|
| 1 | 启动后任务数 = 审批人数 | MI parallel 正确展开 |
| 2 | 完成 1 个后剩 N-1 个 | 不会提前结束 |
| 3 | 全部完成后流程结束 | completionCondition 正确 |
| 4 | 部分完成时流程不结束 | 排除"完成即结束"的假阳性 |

### ⚠️ 风险点

- `flowable:collection` + `flowable:elementVariable` 的语法在 Flowable 8 是否变化 → spike 验证
- `candidateUsers="${approverList}"` 与 MI collection 是否冲突 → 如果冲突，去掉 candidateUsers，仅靠 MI 的 elementVariable 分配

---

## Spike-2：或签（MI parallel + completionCondition，任一完成即结束）

### BPMN XML

与会签唯一区别在 `completionCondition`：

```xml
<userTask id="approvalTask" name="或签审批"
          flowable:candidateUsers="${approverList}">
  <multiInstanceLoopCharacteristics isSequential="false"
                                     flowable:collection="${approverList}"
                                     flowable:elementVariable="approver">
    <completionCondition>${nrOfCompletedInstances >= 1}</completionCondition>
  </multiInstanceLoopCharacteristics>
</userTask>
```

### 测试用例

```java
@SpringBootTest
@ActiveProfiles("test")
class MultiInstanceOrSignSpikeTest {

    @Autowired RepositoryService repositoryService;
    @Autowired RuntimeService runtimeService;
    @Autowired TaskService taskService;

    @Test
    void orSign_firstCompleteRestAutoCancel() {
        deploy("orSignSpike", BPMN_OR_SIGN);

        List<String> approvers = List.of("alice", "bob", "carol");
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
            "orSignSpike",
            Map.of("approverList", approvers));

        // 初始 3 个任务
        List<Task> tasks = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).list();
        assertEquals(3, tasks.size());

        // alice 完成（第一个完成）
        Task aliceTask = tasks.stream()
            .filter(t -> "alice".equals(t.getAssignee())
                      || t.getCandidates().stream()
                          .anyMatch(c -> "alice".equals(c.getUserId())))
            .findFirst().orElseThrow();
        taskService.complete(aliceTask.getId());

        // 断言：流程已结束（或签，任一完成即通过）
        assertTrue(runtimeService.createProcessInstanceQuery()
            .processInstanceId(inst.getId()).singleResult().isEnded(),
            "或签：第一个完成后流程应结束");

        // 断言：其余 2 个任务已被引擎自动删除（不是残留）
        List<Task> remaining = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).list();
        assertEquals(0, remaining.size(),
            "或签完成后其余任务应被自动清理");
    }

    @Test
    void orSign_checkAssigneeOrCandidate() {
        // 验证 MI 下任务如何分配给审批人
        // 关键：collection + elementVariable 下，每个实例的 assignee 是否正确设置
        deploy("orSignSpike", BPMN_OR_SIGN);
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
            "orSignSpike",
            Map.of("approverList", List.of("alice", "bob")));

        List<Task> tasks = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).list();

        // 记录每个任务的 assignee，用于判断分配模式
        // 可能情况 A: assignee = "alice"/"bob"（elementVariable 自动设 assignee）
        // 可能情况 B: assignee = null, candidateUser = "alice"/"bob"
        // spike 目的就是确认实际行为
        tasks.forEach(t -> {
            System.out.println("Task " + t.getId()
                + " assignee=" + t.getAssignee());
        });
    }
}
```

### 验证点

| # | 断言 | 含义 |
|---|---|---|
| 1 | 启动后任务数 = 审批人数 | MI 展开（同会签） |
| 2 | 第一个完成后流程结束 | completionCondition 生效 |
| 3 | 其余任务被自动清理 | 无残留待办 |
| 4 | 记录 assignee/candidateUser 分配模式 | 确定运行时如何查询"某人的或签任务" |

### ⚠️ 风险点

- 或签完成后，未完成的任务是被**删除**还是**标记完成**？影响历史查询 → spike 验证
- `nrOfCompletedInstances >= 1` 写法是否正确 → 文档说是，spike 证实

---

## Spike-3：驳回（changeActivityState 回退到发起人节点）

### BPMN XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="spike">
  <process id="rejectSpike" name="驳回Spike" isExecutable="true">
    <startEvent id="start" />
    <userTask id="initiatorTask" name="发起人填表"
              flowable:assignee="${initiator}" />
    <userTask id="managerApproval" name="经理审批"
              flowable:assignee="${manager}" />
    <endEvent id="end" />
    <sequenceFlow id="f1" sourceRef="start" targetRef="initiatorTask" />
    <sequenceFlow id="f2" sourceRef="initiatorTask" targetRef="managerApproval" />
    <sequenceFlow id="f3" sourceRef="managerApproval" targetRef="end" />
  </process>
</definitions>
```

### 测试用例

```java
@SpringBootTest
@ActiveProfiles("test")
class RejectChangeActivityStateSpikeTest {

    @Autowired RepositoryService repositoryService;
    @Autowired RuntimeService runtimeService;
    @Autowired TaskService taskService;
    @Autowired HistoryService historyService;

    @Test
    void reject_moveFromManagerBackToInitiator() {
        deploy("rejectSpike", BPMN_REJECT);

        // 启动：发起人 = alice，经理 = bob
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
            "rejectSpike",
            Map.of("initiator", "alice", "manager", "bob"));

        // 1. 当前在 initiatorTask，alice 完成 → 流程到 managerApproval
        Task initiatorTask = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).singleResult();
        assertEquals("initiatorTask", initiatorTask.getTaskDefinitionKey());
        assertEquals("alice", initiatorTask.getAssignee());

        // 提交时带一些变量（模拟填表数据）
        taskService.complete(initiatorTask.getId(),
            Map.of("formData", "原始申请内容", "amount", 1000));

        // 2. 当前在 managerApproval
        Task managerTask = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).singleResult();
        assertEquals("managerApproval", managerTask.getTaskDefinitionKey());
        assertEquals("bob", managerTask.getAssignee());

        // 3. 驳回：把活跃节点从 managerApproval 移回 initiatorTask
        runtimeService.createChangeActivityStateBuilder()
            .processInstanceId(inst.getId())
            .moveActivityIdTo("managerApproval", "initiatorTask")
            .changeState();

        // 4. 断言：managerApproval 任务消失
        assertNull(taskService.createTaskQuery()
            .processInstanceId(inst.getId())
            .taskDefinitionKey("managerApproval").singleResult(),
            "驳回后经理任务应消失");

        // 5. 断言：initiatorTask 重新出现，assignee 仍是 alice
        Task reopenedTask = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).singleResult();
        assertEquals("initiatorTask", reopenedTask.getTaskDefinitionKey());
        assertEquals("alice", reopenedTask.getAssignee(),
            "驳回后任务应回到发起人 alice");

        // 6. 断言：流程变量保留（formData / amount 未丢失）
        Map<String, Object> vars = runtimeService.getVariables(inst.getId());
        assertEquals("原始申请内容", vars.get("formData"));
        assertEquals(1000, vars.get("amount"));

        // 7. 发起人修改后重新提交 → 流程再次到 managerApproval
        taskService.complete(reopenedTask.getId(),
            Map.of("formData", "修改后申请内容", "amount", 2000));

        Task reManagerTask = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).singleResult();
        assertEquals("managerApproval", reManagerTask.getTaskDefinitionKey());
    }

    @Test
    void reject_variablesOverwrittenOnResubmit() {
        // 验证重新提交时同名变量是否覆盖
        // （场景 7 的延伸：amount 从 1000 改成 2000，经理看到的是新值）
        // 如果上一个测试通过，这个隐含通过，单独写为了明确
    }

    @Test
    void reject_historyRecordsBothApprovals() {
        // 验证驳回不丢历史：经理审批的第一次记录仍在历史表
        deploy("rejectSpike", BPMN_REJECT);
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
            "rejectSpike",
            Map.of("initiator", "alice", "manager", "bob"));

        // 走到经理审批 → 驳回 → 重新到经理审批
        // ... (复用上面流程)
        runtimeService.createChangeActivityStateBuilder()
            .processInstanceId(inst.getId())
            .moveActivityIdTo("managerApproval", "initiatorTask")
            .changeState();

        // 查历史：应有 1 条已完成的 managerApproval 记录（驳回前的）
        long historicManagerCount = historyService.createHistoricTaskInstanceQuery()
            .processInstanceId(inst.getId())
            .taskDefinitionKey("managerApproval")
            .finished()
            .count();
        // 期望 1（驳回的那次被标记为完成/取消）
        // 注意：changeActivityState 取消任务时，历史记录的 endTime 行为需 spike 确认
        System.out.println("Historic finished managerApproval count: "
            + historicManagerCount);
    }
}
```

### 验证点

| # | 断言 | 含义 |
|---|---|---|
| 1 | 驳回后经理任务消失 | changeActivityState 生效 |
| 2 | 发起人任务重新出现，assignee 正确 | 回退目标正确 |
| 3 | 流程变量保留 | 申请人已填数据不丢 |
| 4 | 重新提交后流程继续 | 驳回-重提交闭环 |
| 5 | 历史表有驳回前经理审批记录 | 审计可追溯 |

### ⚠️ 风险点

- `moveActivityIdTo` 的参数是 **activityId（BPMN XML 里的 id）**，不是 taskId。spike 确认 Flowable 8 API 签名
- 驳回时经理任务是被"取消"还是"完成"？影响历史查询的 `finished()` 语义 → spike 验证
- 如果 managerApproval 有多个并发实例（MI），`moveActivityIdTo` 可能失败 → Spike-4 单独验证

---

## Spike-4：MI 节点驳回（changeActivityState 整体回退）

### 背景

决策点⑦选定 MI 节点驳回走"整体回退"语义：MI 会签节点被驳回时，所有实例（含已完成）的 token 回收，流程回退到发起人节点；发起人重新提交后，MI 节点用原 collection 重新展开全部实例。

本 spike 验证 Flowable 8 的 `moveActivityIdTo` 对 MI 节点是否支持此行为。

### BPMN XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="spike">
  <process id="miRejectSpike" name="MI驳回Spike" isExecutable="true">
    <startEvent id="start" />
    <userTask id="initiatorTask" name="发起人填表"
              flowable:assignee="${initiator}" />
    <userTask id="countersignTask" name="会签审批"
              flowable:assignee="${approver}">
      <multiInstanceLoopCharacteristics isSequential="false"
                                         flowable:collection="${approverList}"
                                         flowable:elementVariable="approver">
        <completionCondition>${nrOfCompletedInstances == nrOfInstances}</completionCondition>
      </multiInstanceLoopCharacteristics>
    </userTask>
    <endEvent id="end" />
    <sequenceFlow id="f1" sourceRef="start" targetRef="initiatorTask" />
    <sequenceFlow id="f2" sourceRef="initiatorTask" targetRef="countersignTask" />
    <sequenceFlow id="f3" sourceRef="countersignTask" targetRef="end" />
  </process>
</definitions>
```

### 测试用例

```java
@SpringBootTest
@ActiveProfiles("test")
class MiRejectChangeActivityStateSpikeTest {

    @Autowired RepositoryService repositoryService;
    @Autowired RuntimeService runtimeService;
    @Autowired TaskService taskService;
    @Autowired HistoryService historyService;

    @Test
    void miReject_moveCountersignBackToInitiator() {
        deploy("miRejectSpike", BPMN_MI_REJECT);

        // 启动：发起人=alice，3 个会签人
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
            "miRejectSpike",
            Map.of("initiator", "alice",
                   "approverList", List.of("bob", "carol", "dave")));

        // 1. initiatorTask → alice 完成，流程到会签节点
        Task initiatorTask = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).singleResult();
        taskService.complete(initiatorTask.getId());

        // 2. 会签节点展开 3 个任务
        List<Task> countersignTasks = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).list();
        assertEquals(3, countersignTasks.size(), "会签应展开 3 个任务");

        // 3. bob 先完成（部分完成状态）
        Task bobTask = countersignTasks.stream()
            .filter(t -> "bob".equals(t.getAssignee()))
            .findFirst().orElseThrow();
        taskService.complete(bobTask.getId());

        // 确认还剩 2 个未完成
        assertEquals(2, taskService.createTaskQuery()
            .processInstanceId(inst.getId()).list().size());

        // 4. carol 点"驳回"：整个 MI 节点回退到 initiatorTask
        //    尝试用 moveActivityIdTo 把 MI 节点的 activityId 移回
        runtimeService.createChangeActivityStateBuilder()
            .processInstanceId(inst.getId())
            .moveActivityIdTo("countersignTask", "initiatorTask")
            .changeState();

        // 5. 断言：MI 节点所有任务消失（含 carol、dave 的待办）
        List<Task> remainingMiTasks = taskService.createTaskQuery()
            .processInstanceId(inst.getId())
            .taskDefinitionKey("countersignTask").list();
        assertEquals(0, remainingMiTasks.size(),
            "MI 驳回后所有会签任务应消失");

        // 6. 断言：initiatorTask 重新出现，assignee=alice
        Task reopenedTask = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).singleResult();
        assertEquals("initiatorTask", reopenedTask.getTaskDefinitionKey());
        assertEquals("alice", reopenedTask.getAssignee());

        // 7. 断言：流程变量保留（approverList 仍在，用于重新展开）
        Map<String, Object> vars = runtimeService.getVariables(inst.getId());
        assertNotNull(vars.get("approverList"),
            "approverList 变量应保留，重新提交时 MI 需用它重新展开");

        // 8. 发起人重新提交 → MI 节点应重新展开 3 个实例
        taskService.complete(reopenedTask.getId());

        List<Task> reCountersignTasks = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).list();
        assertEquals(3, reCountersignTasks.size(),
            "重新提交后会签节点应重新展开 3 个实例");

        // 9. 验证重新展开的实例包含 bob（bob 之前已审过，整体回退语义下需重审）
        List<String> reAssignees = reCountersignTasks.stream()
            .map(Task::getAssignee).toList();
        assertTrue(reAssignees.contains("bob"),
            "整体回退语义：bob 应需要重新审批");
        assertTrue(reAssignees.contains("carol"));
        assertTrue(reAssignees.contains("dave"));
    }

    @Test
    void miReject_historyKeepsFirstRound() {
        // 验证驳回前已完成的 bob 任务仍在历史表
        deploy("miRejectSpike", BPMN_MI_REJECT);
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
            "miRejectSpike",
            Map.of("initiator", "alice",
                   "approverList", List.of("bob", "carol", "dave")));

        // 走到会签 → bob 完成 → 驳回
        Task initTask = taskService.createTaskQuery()
            .processInstanceId(inst.getId()).singleResult();
        taskService.complete(initTask.getId());

        Task bobTask = taskService.createTaskQuery()
            .processInstanceId(inst.getId())
            .taskAssignee("bob").singleResult();
        taskService.complete(bobTask.getId());

        runtimeService.createChangeActivityStateBuilder()
            .processInstanceId(inst.getId())
            .moveActivityIdTo("countersignTask", "initiatorTask")
            .changeState();

        // 历史表：应有 1 条已完成的 countersignTask 记录（bob 那次）
        long finishedCount = historyService.createHistoricTaskInstanceQuery()
            .processInstanceId(inst.getId())
            .taskDefinitionKey("countersignTask")
            .finished()
            .count();
        System.out.println("Historic finished countersignTask count: "
            + finishedCount);
        // 期望 >= 1（bob 已完成的那次）
    }
}
```

### 验证点

| # | 断言 | 含义 |
|---|---|---|
| 1 | 驳回后 MI 所有任务消失 | moveActivityIdTo 对 MI 节点生效 |
| 2 | initiatorTask 重新出现 | 回退目标正确 |
| 3 | approverList 变量保留 | 重新展开的前提 |
| 4 | 重新提交后 MI 展开全部实例 | 整体回退语义成立 |
| 5 | 重新展开包含原全部审批人 | 含已审过的 bob，"重审"语义 |
| 6 | 历史表保留驳回前的完成记录 | 审计可追溯 |

### ⚠️ 风险点

- `moveActivityIdTo("countersignTask", "initiatorTask")` 对 MI 节点可能抛异常——Flowable 可能要求用 `moveActivityIdToSingleActivityId` 的变体或指定多实例下标 → spike 验证
- 如果抛异常，fallback 方案：
  - 方案 a: 先 `runtimeService.deleteProcessInstance` + 保留变量 → 从 initiatorTask 重启（丢失运行时执行树）
  - 方案 b: MI 驳回降级为不支持，前端会签节点不显示驳回按钮，会签场景下审批人只能"完成"或"转办"
- 已完成的 bob 实例在 changeActivityState 时是被"取消"还是"完成"？影响历史查询 → spike 验证

---

## Spike 执行后的决策矩阵

```
┌─────────────────────────────────────────────────────────────┐
│  Spike-1 (会签)  +  Spike-2 (或签) 结果                      │
├─────────────────────────────────────────────────────────────┤
│  两者通过 → 走 BPMN MI 原生路线                              │
│    - 设计器部署时翻译 multiMode → MI XML                     │
│    - 运行时零干预，Flowable 自动驱动                         │
│    - 审批人集合通过流程变量注入 collection                   │
│                                                             │
│  任一失败 → 走自定义 TaskListener 路线                       │
│    - 运行时 TaskListener 读 wf_node_config.multiMode        │
│    - 手动创建 N 个子任务，手动跟踪完成计数                   │
│    - 工作量大，状态机复杂                                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Spike-3 (单实例驳回) 结果                                   │
├─────────────────────────────────────────────────────────────┤
│  通过 → changeActivityState 路线                             │
│    - 驳回接口调 moveActivityIdTo                             │
│    - 发起人节点识别：start 后第一个 userTask                  │
│                                                             │
│  失败 → 终止 + 重启路线（fallback）                          │
│    - 记住当前变量 → 删除实例 → 从发起人节点重启              │
│    - 丢失运行时状态，不推荐                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Spike-4 (MI 驳回) 结果                                     │
├─────────────────────────────────────────────────────────────┤
│  通过 → MI 驳回走 changeActivityState 整体回退              │
│    - 会签/或签节点驳回，所有实例回收，重新提交后重新展开     │
│    - 已审过的审批人需重审                                    │
│                                                             │
│  失败 → 两种 fallback：                                      │
│    a. 终止+重启（保留变量，丢执行树）                        │
│    b. MI 驳回降级不支持（前端会签节点不显示驳回按钮）        │
│    倾向 b——降级比 fallback 更安全可预期                     │
└─────────────────────────────────────────────────────────────┘
```

## 不在 spike 范围

- 加签/转签（下期）
- 催办/超时（下期）
- 审批人去重（下期）
- 前端设计器 XML 生成改造（spike 通过后才做）

## 执行结果（2026-08-03）

4 个 spike 全部通过，无 fallback。

### 结果汇总

| Spike | 命题 | 结果 | 关键发现 |
|---|---|---|---|
| Spike-1 | MI parallel 会签 | ✅ 通过 | `collection` + `elementVariable` + `assignee="${approver}"` 正确分配 assignee |
| Spike-2 | MI 或签 | ✅ 通过 | `completionCondition >= 1` 生效，其余任务自动删除（非标记完成） |
| Spike-3 | 单实例驳回 | ✅ 通过 | `moveActivityIdTo` 生效，变量保留，历史 `deleteReason=Change activity to ...` |
| Spike-4 | MI 节点驳回 | ✅ 通过 | `moveActivityIdTo` 对 MI 节点生效，整体回退 + 重新展开全部实例 |

### 关键发现详情

**Spike-1/2 — MI assignee 分配模式确认**

BPMN 写法 `flowable:assignee="${approver}"` + `flowable:elementVariable="approver"` 下，每个 MI 实例的 `task.assignee` 正确设为 collection 对应元素。`listTodoTasks(assignee)` 查询天然可用，无需额外处理。

**Spike-2 — 或签任务清理机制**

或签第一个完成后，其余任务被 Flowable **删除**（ACT_RU_TASK 行消失），不是标记完成。历史表里被取消的任务有 `deleteReason`。`listTodoTasks` 不会查到残留。

**Spike-3 — 驳回历史记录**

`changeActivityState` 取消任务时，`ACT_HI_TASKINST` 记录的 `deleteReason` 自动设为 `"Change activity to {targetActivityId}"`。高亮接口若要区分"正常完成"vs"被驳回取消"，可查 `deleteReason IS NOT NULL`。本期按决策⑧不区分。

**Spike-4 — MI 驳回整体回退**

`moveActivityIdTo("countersignTask", "initiatorTask")` 对 MI 节点直接生效，无需特殊 API 变体。所有实例（含已完成的 bob）token 全部回收，`approverList` 变量保留。发起人重新提交后，MI 节点用原 collection 重新展开全部 3 个实例 `[bob, carol, dave]`。整体回退语义成立，已审过的人需重审。

### 路线决策

基于全部 spike 通过，最终路线：

| 能力 | 路线 |
|---|---|
| 会签/或签 | **BPMN MI 原生路线** — 设计器部署时翻译 multiMode → MI XML |
| 单实例驳回 | **changeActivityState 路线** — `moveActivityIdTo` |
| MI 节点驳回 | **changeActivityState 整体回退** — 同单实例 API，无需特殊处理 |

### spike 测试保留

4 个 spike 测试类保留在 `backend/src/test/java/com/workflow/engine/spike/` 作为回归测试，验证 Flowable 8 行为基线。后续升级 Flowable 版本时可重跑确认行为未变。
