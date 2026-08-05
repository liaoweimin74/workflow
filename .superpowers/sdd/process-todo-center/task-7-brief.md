## Task 7: 鍚庣 鈥?鍌姙 API

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/task/TaskRemindService.java`
- Create: `backend/src/main/java/com/workflow/api/controller/TaskRemindController.java`
- Create: `backend/src/main/java/com/workflow/engine/task/entity/WfTaskRemind.java`
- Create: `backend/src/main/java/com/workflow/engine/task/repository/WfTaskRemindRepository.java`

**Interfaces:**
- Produces: `POST /api/v1/tasks/{taskId}/remind` 鈥?棰戠巼闄愬埗 24h锛岃褰曞埌 wf_task_remind锛岃Е鍙戦€氱煡

- [ ] **Step 1: 鍒涘缓 WfTaskRemind 瀹炰綋 + Repository**

- [ ] **Step 2: 缂栧啓澶辫触娴嬭瘯 鈥?姝ｅ父鍌姙 + 棰戠巼闄愬埗**

```java
@Test
void remindSucceedsFirstTime() { /* 鏂█鎴愬姛 */ }
@Test
void remindRejectedWithin24h() { /* 鏂█鎶涘紓甯告垨杩斿洖澶辫触 */ }
```

- [ ] **Step 3: 瀹炵幇 TaskRemindService**

鏌ヨ wf_task_remind 琛ㄨ taskId 鏈€鍚庝竴鏉¤褰?鈫?鑻?remind_time 鍦?24h 鍐呭垯鎶涘紓甯?鈫?鍚﹀垯鎻掑叆璁板綍 + 璋冪敤閫氱煡鏈嶅姟锛堟湰鏈熼€氱煡鍏?log锛屽悗缁鎺ラ€氱煡涓績锛夈€?
- [ ] **Step 4: 鍒涘缓 TaskRemindController**

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

- [ ] **Step 5: 寰呭姙鍒楄〃 VO 澧炲姞 reminded 鏍囪**

`TaskTodoVO.reminded` 瀛楁 鈥?鏌ヨ鏃?LEFT JOIN wf_task_remind 鍒ゆ柇鏄惁鏈夎褰曘€?
- [ ] **Step 6: 杩愯娴嬭瘯纭閫氳繃**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(remind): add task remind API with 24h frequency limit"
```

---

