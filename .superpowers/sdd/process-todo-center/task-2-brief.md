## Task 2: 鍚庣 鈥?娴佺▼瀹氫箟鍒楄〃绛涢€夋墿灞?
**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/process/ProcessService.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/ProcessDefinitionController.java`
- Test: `backend/src/test/java/com/workflow/api/controller/ProcessDefinitionControllerTest.java`

**Interfaces:**
- Produces: `ProcessService.listProcessDefinitions(PageRequest, String categoryId, String name, String status)` 
- Produces: `GET /api/v1/deployed-processes?categoryId=&name=&status=` 鏀寔 3 涓彲閫夊弬鏁?
- [ ] **Step 1: 缂栧啓澶辫触娴嬭瘯 鈥?鎸夊垎绫荤瓫閫?*

```java
@Test
void listByCategoryId() {
    // 閮ㄧ讲涓€涓垎绫讳笅鐨勬祦绋嬶紝璋冪敤 GET /api/v1/deployed-processes?categoryId=<id>
    // 鏂█杩斿洖鍒楄〃浠呭寘鍚鍒嗙被鐨勬祦绋?}
```

- [ ] **Step 2: 杩愯娴嬭瘯纭澶辫触**

Run: `cd backend && mvn test -Dtest=ProcessDefinitionControllerTest#listByCategoryId`
Expected: FAIL

- [ ] **Step 3: 鎵╁睍 ProcessService 鏌ヨ鏉′欢**

淇敼 `listProcessDefinitions` 鏂规硶绛惧悕锛屽鍔?categoryId/name/status 鍙傛暟锛屼娇鐢?Flowable `ProcessDefinitionQuery` 鐨?`.processDefinitionCategoryLike()`/`.processDefinitionNameLike()`/`.active()`/`.suspended()` 閾惧紡鏌ヨ銆?
- [ ] **Step 4: 鎵╁睍 Controller 鏌ヨ鍙傛暟**

```java
@GetMapping
public R<PageResponse<ProcessDefinition>> list(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String categoryId,
        @RequestParam(required = false) String name,
        @RequestParam(required = false) String status) {
    Page<ProcessDefinition> result = processService.listProcessDefinitions(
        PageRequest.of(page, size), categoryId, name, status);
    // ... 灏佽 PageResponse 杩斿洖
}
```

- [ ] **Step 5: 杩愯娴嬭瘯纭閫氳繃**

Run: `cd backend && mvn test -Dtest=ProcessDefinitionControllerTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/process/ProcessService.java backend/src/main/java/com/workflow/api/controller/ProcessDefinitionController.java backend/src/test/java/com/workflow/api/controller/ProcessDefinitionControllerTest.java
git commit -m "feat(process-definition): support categoryId/name/status filter in list API"
```

---

