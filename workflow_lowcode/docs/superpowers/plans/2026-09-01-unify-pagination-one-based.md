# 全量统一 1-based 分页实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有前后端分页接口及其内部实现统一为 1-based 页码，第一页统一使用 `page=1`，不保留 0-based 兼容行为。

**Architecture:** 对外 API、DTO、前端分页状态和组件统一采用 1-based；JPA/SQL 等底层分页仍使用 0-based 索引时，仅在最靠近底层的 service/repository 边界执行 `Math.max(page, 1) - 1` 转换。统一数据源适配器不再把 0-based 页码转给系统用户服务，所有适配器的响应页码保持 1-based。

**Tech Stack:** Spring Boot 4、Spring Data JPA、Java、Vue 3、TypeScript、Element Plus、JUnit 5、Mockito、Vitest。

## Global Constraints

- 所有外部和内部分页请求的 `page` 均为 1-based，`page=1` 表示第一页。
- 所有分页响应中的页码均为 1-based。
- 不新增 0-based 兼容参数、请求头或版本分支。
- 底层 `PageRequest` 的 0-based 转换只能集中在对应 service/adapter 边界。
- 实现采用 TDD：每个行为先写失败测试，再写最小实现。
- 变更只在 `D:\aicode\workflow\.worktrees\message-center\` 中完成。
- 不修改与分页契约无关的业务行为。

## 文件与模块地图

- 后端请求/响应契约：`backend/src/main/java/com/workflow/api/dto/BizDataQueryRequest.java`、`PageResponse.java`、`common/domain/PageResult.java`、各分页 Controller。
- 后端分页实现：`system/service/impl/*ServiceImpl.java`、`engine/datasource/UnifiedDataSourceAdapter.java`、业务数据/流程/任务/通知分页 service。
- 前端通用分页：`frontend/src/components/business/SearchTable.vue` 及其类型定义。
- 前端数据源与选择器：`frontend/src/views/form/components/DataPicker.vue`、`frontend/src/api/data-source.ts`、`frontend/src/views/dataSource/DataSourceListPage.vue`。
- 前端业务列表：通知、系统管理、流程、页面、表单等使用分页 API 的页面与 API 封装。
- 测试：对应后端 Controller/Service/Adapter 测试、前端 notification 与通用组件测试。

---

### Task 1: 建立全仓库分页契约清单与失败测试基线

**Files:**
- Modify: `backend/src/test/java/com/workflow/engine/datasource/UnifiedDataSourceAdapterTest.java`
- Modify: `backend/src/test/java/com/workflow/api/controller/DataSourceControllerTest.java`
- Modify: 与 `page`、`PageRequest.of`、`page - 1` 匹配的现有分页测试文件
- Create: `docs/superpowers/plans/2026-09-01-pagination-inventory.md`

**Interfaces:**
- Produces: 完整分页入口清单、每个入口的当前约定、目标 1-based 约定和测试覆盖表。

- [ ] **Step 1: 盘点分页实现与调用方**
  - 搜索后端所有 `PageRequest.of(`、分页 DTO 的默认值、`PageResult`/`PageResponse` 构造。
  - 搜索前端所有 `page - 1`、`page: 0`、分页状态默认值及 API 参数转换。
  - 记录每个入口的路径、请求默认值、service 参数约定、响应页码。
- [ ] **Step 2: 为统一数据源和代表性业务接口写 1-based 失败断言**
  - 断言 `BizDataQueryRequest` 默认 `page == 1`。
  - 断言 `DataSourceController.list` 的第一页使用底层 index 0，但响应 `pageNumber == 1`。
  - 断言 `UnifiedDataSourceAdapter` 传给 `UserService` 的第一页参数为 1。
- [ ] **Step 3: 运行基线测试并确认失败原因是旧页码契约**
  - Run: `mvn -q -Dtest=UnifiedDataSourceAdapterTest,DataSourceControllerTest test`
  - Expected: 新增断言因当前 0-based 默认或转换失败而失败，不得因测试语法错误失败。
- [ ] **Step 4: 保存清单并检查遗漏**
  - 在 `pagination-inventory.md` 列出所有受影响 Java/TS/Vue 文件和验证命令。

### Task 2: 统一后端 DTO、通用响应和数据源链路

**Files:**
- Modify: `backend/src/main/java/com/workflow/api/dto/BizDataQueryRequest.java`
- Modify: `backend/src/main/java/com/workflow/api/dto/PageResponse.java`
- Modify: `backend/src/main/java/com/workflow/common/domain/PageResult.java`（仅补充契约注释/必要默认规范）
- Modify: `backend/src/main/java/com/workflow/api/controller/DataSourceController.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/SystemInternalController.java`
- Modify: `backend/src/main/java/com/workflow/engine/datasource/UnifiedDataSourceAdapter.java`
- Test: `backend/src/test/java/com/workflow/engine/datasource/UnifiedDataSourceAdapterTest.java`
- Test: `backend/src/test/java/com/workflow/api/controller/DataSourceControllerTest.java`
- Test: `backend/src/test/java/com/workflow/api/controller/SystemInternalControllerTest.java`

**Interfaces:**
- Consumes: 1-based `BizDataQueryRequest.page`。
- Produces: 所有数据源列表接口返回 1-based `page`；SYSTEM user-tree 直接以 1-based 调用 `UserService`。

- [ ] **Step 1: 将 DTO 和 Controller 默认页码改为 1**
  - `BizDataQueryRequest.page` 默认值改为 `1`，注释改为 1-based。
  - `DataSourceController.list` 与 `SystemInternalController.users` 默认值改为 `1`。
  - 对显式传入的 `page < 1` 统一归一为 1，避免产生负底层索引。
- [ ] **Step 2: 修正统一数据源适配器**
  - 删除 `UnifiedDataSourceAdapter.queryUsers()` 中针对 0-based 请求的 `+1` 转换。
  - 直接以规范化后的 1-based page 构造 `UserQueryRequest`。
  - `queryUsers` 响应页码返回规范化后的 1-based page。
- [ ] **Step 3: 运行 Task 1 测试并确认 GREEN**
  - Run: `mvn -q -Dtest=UnifiedDataSourceAdapterTest,DataSourceControllerTest,SystemInternalControllerTest test`
  - Expected: PASS。

### Task 3: 统一系统管理与通知分页 Service

**Files:**
- Modify: `backend/src/main/java/com/workflow/system/service/impl/UserServiceImpl.java`
- Modify: `backend/src/main/java/com/workflow/system/service/impl/RoleServiceImpl.java`
- Modify: `backend/src/main/java/com/workflow/system/service/impl/DictTypeServiceImpl.java`
- Modify: `backend/src/main/java/com/workflow/notification/admin/AnnouncementController.java`
- Modify: 其它 inventory 中标记的 system/notification 分页 Controller 与 service
- Test: 对应 `UserServiceQueryTest`、Role/Dict/Announcement 测试文件

**Interfaces:**
- Consumes: Controller/DTO 传入 1-based page。
- Produces: Service 返回 1-based `PageResult`/响应；仅 `PageRequest.of(Math.max(page, 1) - 1, size)` 使用底层 index。

- [ ] **Step 1: 为用户、角色、字典和公告第一页写失败测试**
  - 断言传入 page=1 时底层 repository 收到 index 0。
  - 断言返回的 `PageResult.page` 或响应 page 为 1。
- [ ] **Step 2: 修改 service 边界转换**
  - 统一使用 `int normalizedPage = Math.max(page, 1)`。
  - `PageRequest.of(normalizedPage - 1, size, ...)`。
  - 返回 `normalizedPage`，不返回底层 page index。
- [ ] **Step 3: 修正 Controller 默认值和前端契约注释**
  - 所有相关 `@RequestParam(defaultValue = "0")` 改为 `"1"`。
  - 保持 size 校验和业务过滤行为不变。
- [ ] **Step 4: 运行系统/通知后端测试**
  - Run: `mvn -q -Dtest=UserServiceQueryTest,AnnouncementControllerTest,*Role*Test,*Dict*Test test`
  - Expected: PASS。

### Task 4: 统一业务数据、流程、任务和页面分页

**Files:**
- Modify: inventory 中所有使用 `PageRequest.of(page, size)` 或构造分页响应的业务 Controller/service。
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`
- Modify: `backend/src/main/java/com/workflow/engine/datasource/WorkflowFormDataQueryService.java`
- Test: 对应 `BizDataServiceTest`、流程/任务/页面/表单 Controller 测试。

**Interfaces:**
- Consumes: 所有 HTTP/DTO page 为 1-based。
- Produces: JPA、SQL LIMIT/OFFSET 计算前统一转换到 index `normalizedPage - 1`；响应 page 为 normalizedPage。

- [ ] **Step 1: 为 FORM、WORKFLOW、流程实例、任务列表补充第一页失败测试**
  - page=1 应使用 SQL/JPA index 0 或 OFFSET 0。
  - 返回页码应为 1。
- [ ] **Step 2: 修改各底层边界转换**
  - JPA：`PageRequest.of(Math.max(page, 1) - 1, size)`。
  - SQL：`OFFSET (Math.max(page, 1) - 1) * size`。
  - 不在 Controller 或前端重复减 1。
- [ ] **Step 3: 修正所有响应页码**
  - 将 `Page.getNumber()` 等 0-based 值转换为 `getNumber() + 1` 后再放入对外响应。
- [ ] **Step 4: 运行业务分页测试**
  - Run: `mvn -q -Dtest=*ControllerTest,*ServiceTest test`
  - Expected: 受影响分页测试通过；若出现既有失败，单独记录并不得删除测试。

### Task 5: 统一前端通用分页和数据源组件

**Files:**
- Modify: `frontend/src/components/business/SearchTable.vue`
- Modify: `frontend/src/components/business/types.ts`
- Modify: `frontend/src/views/form/components/DataPicker.vue`
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue`
- Modify: `frontend/src/api/data-source.ts`
- Test: 通用组件测试、notification 测试及新增分页参数测试

**Interfaces:**
- Consumes: 所有后端分页 API 使用 `page=1` 第一页。
- Produces: 前端分页状态、请求参数、响应显示均使用 1-based。

- [ ] **Step 1: 为 DataPicker、SearchTable 和数据源预览写失败测试**
  - 打开列表第一页请求应发送 `page: 1`。
  - 翻到第二页应发送 `page: 2`。
  - 不允许请求 `page: 0`。
- [ ] **Step 2: 删除前端 0-based 转换**
  - 将 `page: query.page - 1` 改为 `page: query.page`。
  - 将 `page: 0` 的详情/已选查询改为 `page: 1`。
  - 将预览页 `previewPage - 1` 改为 `previewPage`。
- [ ] **Step 3: 统一响应页码处理**
  - 若组件仅依赖 total，则保留现有分页状态。
  - 若组件展示当前页，直接显示 API 返回的 1-based page，不再 `+1`。
- [ ] **Step 4: 运行前端测试和类型检查**
  - Run: `npx vitest run src/modules/notification`
  - Run: `npx vue-tsc --noEmit`
  - Expected: 通知测试全部通过；仅允许记录与本次无关的既有类型错误。

### Task 6: 更新所有业务前端 API 调用与页面分页状态

**Files:**
- Modify: inventory 中所有包含 `page - 1`、`page: 0`、`currentPage - 1` 的 Vue/TS 文件。
- Modify: notification、system、workflow、task、form、page、dataSource 页面及 API 封装。
- Test: 对应页面/API 测试。

**Interfaces:**
- Consumes: 统一 1-based 后端接口。
- Produces: 所有前端请求第一页发送 1，第二页发送 2。

- [ ] **Step 1: 为每类业务列表添加请求页码断言**
  - 覆盖公告、用户、角色、字典、流程、任务、数据源和业务数据列表。
- [ ] **Step 2: 移除所有调用方的手工减 1/加 1**
  - 保持 Element Plus `el-pagination` 的 `current-page` 直接作为 API page。
  - 保持搜索、切换 page-size 后回到 `page=1`。
- [ ] **Step 3: 运行前端全量测试**
  - Run: `npx vitest run`
  - Expected: 全部通过或明确区分既有失败。

### Task 7: 全量契约验证与真实链路验收

**Files:**
- Modify: 受影响测试文件中仍使用 0-based 断言的部分。
- Create/Modify: `docs/test-runs/2026-09-01-pagination-1-based.md`（按项目约定记录测试结果）

- [ ] **Step 1: 全仓库静态扫描旧契约**
  - 搜索 `defaultValue = "0"`、`page: 0`、`page - 1`、`PageRequest.of(page,`、`getNumber()` 直接作为外部 page 的残留。
  - 每个残留必须删除、转换到 service 边界，或在记录中说明其确实是底层 index。
- [ ] **Step 2: 运行后端全量测试和构建**
  - Run: `mvn test`
  - Expected: BUILD SUCCESS，所有测试通过。
- [ ] **Step 3: 运行前端全量测试和类型检查**
  - Run: `npx vitest run`
  - Run: `npx vue-tsc --noEmit`
  - Expected: 测试通过；类型检查仅保留已知且与本次无关的问题。
- [ ] **Step 4: 验证真实统一数据源链路**
  - 使用新 token 调用：`GET /api/v1/data-sources/{user-tree-id}/data?page=1&size=10`。
  - Expected: HTTP 200，响应 `data.page == 1`，第一页用户数据正确。
  - 调用 `page=2`，Expected: 响应 `data.page == 2`，数据偏移正确。
- [ ] **Step 5: 记录验收结果**
  - 记录命令、测试数量、真实 HTTP 请求和已知无关错误。

## 完成标准

- 所有公开/内部分页 API 第一页均使用 `page=1`。
- 所有分页响应页码均为 1-based。
- `UserServiceImpl`、其它 JPA service、SQL 查询只在底层边界转换为 index。
- 统一数据源 user-tree 的 `page=1` 不再触发 `Page index must not be less than zero`。
- 前端不再发送 `page=0` 或通过 `page - 1` 适配后端。
- 后端全量测试、前端全量测试和真实 user-tree HTTP 链路均通过。
