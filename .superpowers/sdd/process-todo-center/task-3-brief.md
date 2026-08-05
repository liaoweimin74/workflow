## Task 3: 鍚庣 鈥?浠诲姟鍒楄〃 VO 涓庡叧鑱旀煡璇?
**Files:**
- Create: `backend/src/main/java/com/workflow/api/dto/TaskTodoVO.java`
- Create: `backend/src/main/java/com/workflow/api/dto/TaskDoneVO.java`
- Modify: `backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/TaskController.java`
- Test: `backend/src/test/java/com/workflow/api/controller/TaskControllerVOTest.java`

**Interfaces:**
- Produces: `TaskTodoVO`锛坱askId, processInstanceId, processDefinitionId, processName, businessKey, initiator, initiatorName, currentNodeName, assignee, createTime, reminded锛?- Produces: `TaskDoneVO` extends TaskTodoVO +锛坋ndTime, approveResult锛?- Produces: `GET /api/tasks?assignee=&processName=&initiator=&createTimeStart=&createTimeEnd=` 杩斿洖 `PageResponse<TaskTodoVO>`
- Produces: `GET /api/tasks/historic?userId=&processName=&initiator=&endTimeStart=&endTimeEnd=&approveResult=` 杩斿洖 `PageResponse<TaskDoneVO>`

- [ ] **Step 1: 鍒涘缓 TaskTodoVO 涓?TaskDoneVO 绫?*

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
    private String approveResult; // 閫氳繃/椹冲洖/杞姙/濮旀淳/鍔犵/杞
    // getters/setters
}
```

- [ ] **Step 2: 缂栧啓澶辫触娴嬭瘯 鈥?寰呭姙鍒楄〃杩斿洖鍏宠仈瀛楁**

```java
@Test
void listTodoReturnsVOWithProcessName() {
    // 鍙戣捣娴佺▼锛屾煡璇㈠緟鍔烇紝鏂█杩斿洖 TaskTodoVO 鍖呭惈 processName, initiatorName
}
```

- [ ] **Step 3: 杩愯娴嬭瘯纭澶辫触**

Run: `cd backend && mvn test -Dtest=TaskControllerVOTest#listTodoReturnsVOWithProcessName`
Expected: FAIL

- [ ] **Step 4: 鎵╁睍 WorkflowTaskService 鈥?鎵归噺鍏宠仈鏌ヨ**

鍦?`listTodoTasks` 涓細鏌ヨ Task 鍒嗛〉 鈫?鎵归噺鏀堕泦 processInstanceId 鈫?涓€娆℃€ф煡璇?ProcessInstance 鑾峰彇 processName/initiator/businessKey 鈫?鎵归噺鏌ヨ User 鑾峰彇 initiatorName 鈫?缁勮 TaskTodoVO銆傛墿灞曟柟娉曠鍚嶆敮鎸?processName/initiator/createTimeStart/createTimeEnd 绛涢€夈€?
- [ ] **Step 5: 淇敼 TaskController.listTodo 杩斿洖 VO**

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
    // 璋冪敤 taskService.listTodoTasks 杩斿洖 VO 鍒嗛〉
}
```

- [ ] **Step 6: 鍚岀悊瀹炵幇宸插姙鍒楄〃 TaskDoneVO 涓庣瓫閫?*

`listHistoric` 鏂规硶杩斿洖 `PageResponse<TaskDoneVO>`锛宎pproveResult 浠?wf_task_comment 琛ㄦ煡璇?action 瀛楁銆?
- [ ] **Step 7: 杩愯娴嬭瘯纭閫氳繃**

Run: `cd backend && mvn test -Dtest=TaskControllerVOTest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/workflow/api/dto/TaskTodoVO.java backend/src/main/java/com/workflow/api/dto/TaskDoneVO.java backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java backend/src/main/java/com/workflow/api/controller/TaskController.java backend/src/test/java/com/workflow/api/controller/TaskControllerVOTest.java
git commit -m "feat(task): return TaskTodoVO/TaskDoneVO with related fields, support filters"
```

---

