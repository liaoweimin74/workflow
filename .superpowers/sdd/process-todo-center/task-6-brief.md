## Task 6: 鍚庣 鈥?瀹℃壒璁板綍鍘嗗彶 API

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/history/ProcessHistoryService.java`
- Create: `backend/src/main/java/com/workflow/api/controller/ProcessHistoryController.java`
- Create: `backend/src/main/java/com/workflow/api/dto/ApprovalRecordVO.java`
- Create: `backend/src/main/java/com/workflow/engine/history/entity/WfTaskComment.java`
- Create: `backend/src/main/java/com/workflow/engine/history/repository/WfTaskCommentRepository.java`
- Modify: 浠诲姟鎿嶄綔澶勶紙RejectService/TransferService/AddSignService/ForwardSignService/WorkflowTaskService锛夊啓鍏ュ鎵规剰瑙?
**Interfaces:**
- Produces: `GET /api/v1/process-instances/{id}/history` 杩斿洖 `R<List<ApprovalRecordVO>>`
- ApprovalRecordVO: activityId, activityName, assignee, assigneeName, startTime, endTime, action, comment

- [ ] **Step 1: 鍒涘缓 WfTaskComment 瀹炰綋 + Repository**

- [ ] **Step 2: 缂栧啓澶辫触娴嬭瘯 鈥?鏌ヨ瀹℃壒璁板綍**

```java
@Test
void getHistoryReturnsApprovalRecords() {
    // 鍙戣捣娴佺▼ 鈫?瀹屾垚浠诲姟 鈫?鏌ヨ history 鈫?鏂█杩斿洖 ApprovalRecordVO 鍒楄〃鍚?action/comment
}
```

- [ ] **Step 3: 瀹炵幇 ProcessHistoryService**

鍩轰簬 Flowable `HistoryService.createHistoricActivityInstanceQuery()` 鏌ヨ宸插畬鎴愮殑 userTask 娲诲姩 鈫?鍏宠仈鏌ヨ wf_task_comment 鑾峰彇瀹℃壒鎰忚 鈫?鍏宠仈鏌ヨ UserService 鑾峰彇鍔炵悊浜哄鍚?鈫?缁勮 ApprovalRecordVO 鍒楄〃鎸?startTime 姝ｅ簭銆?
- [ ] **Step 4: 鍒涘缓 ProcessHistoryController**

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

- [ ] **Step 5: 浠诲姟鎿嶄綔澶勫啓鍏ュ鎵规剰瑙?*

鍦?complete/reject/transfer/delegate/add-sign/forward-sign 鐨?Service 鏂规硶涓紝鎿嶄綔鎴愬姛鍚庡啓鍏?`wf_task_comment` 璁板綍锛坅ction + comment + userId锛夈€?
- [ ] **Step 6: 杩愯娴嬭瘯纭閫氳繃**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(history): add approval history API, persist task comments on operations"
```

---

