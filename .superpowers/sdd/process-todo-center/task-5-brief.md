## Task 5: 鍚庣 鈥?娴佺▼瀹炰緥鍒楄〃绛涢€夋墿灞?
**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/process/ProcessInstanceService.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/ProcessInstanceController.java`

**Interfaces:**
- Produces: `GET /api/v1/process-instances?initiator=&status=&processName=` 杩斿洖 VO 鍚?currentNode/status

- [ ] **Step 1: 缂栧啓澶辫触娴嬭瘯 鈥?鎸夊彂璧蜂汉绛涢€?*

- [ ] **Step 2: 鎵╁睍 ProcessInstanceService 鏌ヨ鏉′欢**

浣跨敤 Flowable `RuntimeService.createProcessInstanceQuery().variableValueEquals("initiator", initiator)` 绛涢€夛紱status=running 鐢?`.active()`锛宻tatus=completed 闇€鏌?HistoryService銆?
- [ ] **Step 3: 鎵╁睍 Controller 鍙傛暟 + 杩斿洖 VO 鍚?currentNode/status**

- [ ] **Step 4: 杩愯娴嬭瘯纭閫氳繃**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(process-instance): support initiator/status/processName filter"
```

---

