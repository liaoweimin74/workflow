## Task 4: 鍚庣 鈥?浠诲姟璇︽儏 VO

**Files:**
- Create: `backend/src/main/java/com/workflow/api/dto/TaskDetailVO.java`
- Modify: `backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/TaskController.java`

**Interfaces:**
- Produces: `TaskDetailVO`锛堜换鍔″瓧娈?+ processName + initiator + initiatorName + businessKey + formKey + variables Map锛?- Produces: `GET /api/tasks/{id}` 杩斿洖 `R<TaskDetailVO>`

- [ ] **Step 1: 鍒涘缓 TaskDetailVO**

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

- [ ] **Step 2: 缂栧啓澶辫触娴嬭瘯 鈥?璇︽儏杩斿洖鍏宠仈瀛楁**

- [ ] **Step 3: 鎵╁睍 WorkflowTaskService.getTaskDetail**

鏌ヨ Task 鈫?鍏宠仈鏌ヨ ProcessInstance 鑾峰彇 processName/initiator/businessKey 鈫?鏌ヨ UserService 鑾峰彇 initiatorName 鈫?鏌ヨ formKey 鈫?鏌ヨ娴佺▼鍙橀噺 鈫?缁勮 TaskDetailVO銆?
- [ ] **Step 4: 淇敼 TaskController.get 杩斿洖 TaskDetailVO**

- [ ] **Step 5: 杩愯娴嬭瘯纭閫氳繃**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(task): return TaskDetailVO with process info and variables"
```

---

