# 视图查询设计器（View Designer）与自定义页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现"视图 + 自定义页面"双轨查询界面能力：视图轨（轨 A）声明式配置、发布不建表、绑定已发布业务表单物理表，支持双层自定义事件；页面轨（轨 B）form-create 自由布局（阶段二）。

**Architecture:** 独立 `wf_page_def` 表 + `PageDefinition` 实体；`PageDefinitionService.publish()` 不执行任何 DDL，仅做绑定/字段校验并触发 `ViewCompiler` 将视图配置编译为 form-create rule；前端 `ViewDesigner`（清单勾选）+ `PageRenderer`（通用渲染 /page/:pageKey）复用 `FormRenderer`、`SearchTable`、`BizDataService`。视图事件采用"声明式动作链 + ScriptSandbox 沙箱脚本"双层机制；自定义页面轨复用 @form-create/designer 与同一数据层。

**Tech Stack:** Spring Boot + JPA + MySQL（后端）；Vue 3 + Element Plus + @form-create/designer@3.5 + @form-create/element-ui@3.3 + Vitest（前端）；Flyway 迁移。

## Global Constraints

- 发布动作绝不调用 `DynamicTableManager`、绝不执行任何 DDL（单测断言）
- 不改动现有 `FormDefinitionService.publish()` / `FormDesigner.vue` / `BizDataListPage.vue` 的行为
- 所有查询强制按租户 `tenant_id` 过滤；查询 filter 字段白名单化（仅页面 schema 声明字段）
- 现有代码模式参考：`backend/src/main/java/com/workflow/engine/form/`（FormDefinitionService / FormDefinitionRepository / FormDefinition 实体）、迁移文件 `backend/src/main/resources/db/migration/V12__create_form_tables.sql`、前端 `frontend/src/api/form.ts` / `frontend/src/views/form/`（FormListPage / FormDesigner / BizDataListPage / components/FormRenderer.vue）
- 后端测试命令：`cd backend && mvn test -Dtest=<TestClass>`；前端测试：`cd frontend && npx vitest run <file>`
- 阶段一只实现轨 A（VIEW）；轨 B（PAGE）为阶段二预留（tasks 13.x / 本 plan Task 13）

---

### Task 1: 数据库迁移 V19

**Files:**
- Create: `backend/src/main/resources/db/migration/V19__create_wf_page_def.sql`

**Interfaces:**
- Produces: 表 `wf_page_def` + 页面管理菜单（供 Task 2 的 JPA 实体映射）

- [ ] **Step 1: 写迁移 SQL**

```sql
-- ============================================================
-- 页面定义：视图/自定义页面（发布不建表，绑定已发布业务表单）
-- ============================================================
CREATE TABLE IF NOT EXISTS wf_page_def (
    id               VARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id        VARCHAR(64)  NOT NULL,
    name             VARCHAR(255) NOT NULL COMMENT '页面名称',
    `key`            VARCHAR(255) NOT NULL COMMENT '页面标识（租户内唯一）',
    type             VARCHAR(32)  NOT NULL DEFAULT 'VIEW' COMMENT 'VIEW=视图 / PAGE=自定义页面',
    form_key         VARCHAR(255) COMMENT '绑定的业务表单 key → wf_biz_<form_key>',
    `schema`         LONGTEXT COMMENT 'VIEW=视图配置JSON / PAGE=form-create {rule,option}',
    version          INT NOT NULL DEFAULT 1,
    status           VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED',
    published_version INT,
    created_by       VARCHAR(50),
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_page_def_tenant_key_version (tenant_id, `key`, version),
    INDEX idx_page_def_tenant_form (tenant_id, form_key),
    INDEX idx_page_def_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='页面定义（视图/自定义页面）';

-- 父菜单：查询界面管理
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(140, NULL, '查询界面管理', 0, '/page', NULL, NULL, 'Grid', 4, 1, 0, NOW(), NOW());

-- 子菜单
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(141, 140, '页面列表', 1, '/page', 'page/PageListPage', 'page:list', 'Document', 1, 1, 0, NOW(), NOW());

-- 按钮权限
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at) VALUES
(150, 141, '页面创建', 2, 'page:create', 1, 1, 0, NOW(), NOW()),
(151, 141, '页面编辑', 2, 'page:edit', 2, 1, 0, NOW(), NOW()),
(152, 141, '页面发布', 2, 'page:publish', 3, 1, 0, NOW(), NOW()),
(153, 141, '页面删除', 2, 'page:delete', 4, 1, 0, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (140, 141, 150, 151, 152, 153)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);
```

注意：菜单 id（140/141/150-153）需检查是否与既有迁移冲突（V12 用了 120/121/130-133）。若冲突，选取空闲区段并全局替换。

- [ ] **Step 2: 应用迁移验证**

Run: `cd backend && mvn flyway:migrate`（或按项目既有迁移执行方式）
Expected: 迁移成功，`wf_page_def` 表与菜单记录创建

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V19__create_wf_page_def.sql
git commit -m "feat(page): V19 创建 wf_page_def 表与页面管理菜单"
```

---

### Task 2: PageDefinition 实体与 Repository

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/page/entity/PageDefinition.java`
- Create: `backend/src/main/java/com/workflow/engine/page/repository/PageDefinitionRepository.java`

**Interfaces:**
- Consumes: Task 1 的 `wf_page_def` 表
- Produces: `PageDefinition`（字段：id/tenantId/name/key/type/formKey/schema/version/status/publishedVersion/createdBy/createdAt/updatedAt + getters/setters）；`PageDefinitionRepository` 方法：`findByIdAndTenantId`、`existsByTenantIdAndKey`、`findFirstByTenantIdAndKeyOrderByVersionDesc`、`findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc`、`findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc`、`findByTenantIdAndKeyOrderByVersionDesc`、`findByTenantIdAndKeyAndVersion`、`findByIdForUpdate`、`findByTenantIdOrderByUpdatedAtDesc`、`findByTenantIdAndNameContainingOrderByUpdatedAtDesc`、`findByTenantIdAndStatusOrderByUpdatedAtDesc`、`findByTenantIdAndTypeOrderByUpdatedAtDesc`（带 name/status/type 组合）

- [ ] **Step 1: 参考 FormDefinition 实体写 PageDefinition**

参考：`backend/src/main/java/com/workflow/engine/form/entity/FormDefinition.java`。实体注解 @Entity @Table(name="wf_page_def")，字段映射对齐 Task 1 建表 SQL。type 默认值 "VIEW"。

```java
package com.workflow.engine.page.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "wf_page_def")
public class PageDefinition {
    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "name", length = 255, nullable = false)
    private String name;

    @Column(name = "key", length = 255, nullable = false)
    private String key;

    @Column(name = "type", length = 32, nullable = false)
    private String type = "VIEW";

    @Column(name = "form_key", length = 255)
    private String formKey;

    @Column(name = "schema")
    @Lob
    private String schema;

    @Column(name = "version", nullable = false)
    private Integer version = 1;

    @Column(name = "status", length = 32, nullable = false)
    private String status = "DRAFT";

    @Column(name = "published_version")
    private Integer publishedVersion;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // getters / setters 与 FormDefinition 保持一致
}
```

- [ ] **Step 2: 参考 FormDefinitionRepository 写 PageDefinitionRepository**

参考：`backend/src/main/java/com/workflow/engine/form/repository/FormDefinitionRepository.java`。`findByIdForUpdate` 使用 `@Lock(LockModeType.PESSIMISTIC_WRITE)` 或在查询中指定 lock 模式，与服务端串行化发布保持对齐。分页查询接口返回 `Page<PageDefinition>`（Spring Data `Pageable` 参数）。

- [ ] **Step 3: 编译验证**

Run: `cd backend && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/page/
git commit -m "feat(page): PageDefinition 实体与 Repository"
```

---

### Task 3: PageDefinitionService（CRUD，不含发布）

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/page/PageDefinitionService.java`

**Interfaces:**
- Consumes: Task 2 实体/Repository；`TenantProvider`
- Produces: `PageDefinitionService` 方法：`create(name, key, type, formKey)`、`getById(id)`、`getByKey(key)`、`list(status, name, type, pageable)`、`update(id, name, key, schema, formKey)`、`delete(id)`、`getVersions(id)`、`getPublishedVersion(id)`；`publish(id)` 由 Task 5 完成

- [ ] **Step 1: 参考 FormDefinitionService 实现 CRUD**

参考：`backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java`（create/getById/getByKey/list/update/delete/getVersions/getPublishedVersion 逐一对齐）。差异：create 增加 type/formKey 参数；key 校验租户唯一；delete 时 PUBLISHED 拒绝（BusinessException(400, "已发布的页面不能删除")）。

- [ ] **Step 2: 编译验证**

Run: `cd backend && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/page/PageDefinitionService.java
git commit -m "feat(page): PageDefinitionService CRUD（不含发布）"
```

---

### Task 4: 发布校验器 PageValidator

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/page/PageValidator.java`

**Interfaces:**
- Consumes: `PageDefinition`/schema JSON、`FormDefinitionRepository`（查绑定表单及其 columnConfig）、`PageDefinitionRepository`
- Produces: `void validateForPublish(PageDefinition page)` —— 抛 BusinessException(400) 表达各类失败

- [ ] **Step 1: 写校验失败的测试（TDD）**

Create: `backend/src/test/java/com/workflow/engine/page/PageValidatorTest.java`
覆盖：绑定表单不存在/未发布；searchFields/columns 引用列不存在；引用隐藏列；searchFields 引用 JSON/TEXT 列；合法配置通过。

```java
@Test
void searchFieldReferencingJsonColumn_rejected() {
    PageDefinition page = new PageDefinition();
    page.setType("VIEW");
    page.setFormKey("leave");
    page.setSchema("{\"searchFields\":[{\"key\":\"content\",\"label\":\"内容\",\"matchType\":\"like\"}]}");
    // stub: 绑定表单 column_config 中 content 列 columnType=JSON
    assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=PageValidatorTest`
Expected: FAIL（PageValidator 不存在）

- [ ] **Step 3: 实现 PageValidator**

解析 schema（兼容 `{rule:[...]}` 与纯数组，复用 FormDefinitionService 的兼容逻辑）；查询绑定表单 `form_def_id` 的 PUBLISHED 记录取 column_config；构建合法列集合与隐藏列集合、TEXT/JSON 列集合；逐项校验并抛出 BusinessException(400, 具体原因)。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=PageValidatorTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/page/PageValidator.java backend/src/test/java/com/workflow/engine/page/PageValidatorTest.java
git commit -m "feat(page): 发布校验器 PageValidator（绑定/字段/类型校验）"
```

---

### Task 5: PageDefinitionService.publish + ViewCompiler

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/page/ViewCompiler.java`
- Modify: `backend/src/main/java/com/workflow/engine/page/PageDefinitionService.java`（增加 publish）

**Interfaces:**
- Consumes: PageValidator（Task 4）、ViewCompiler
- Produces: `ViewCompiler.compile(PageDefinition page, List<ColumnConfig> bindColumns) : String`（返回编译后 `{rule, option}` JSON 字符串，持久化到 page.schema 或独立产物字段）；`PageDefinitionService.publish(id)` 方法

- [ ] **Step 1: 写发布不建表的测试（TDD）**

Create: `backend/src/test/java/com/workflow/engine/page/PageDefinitionServiceTest.java`。关键断言：发布成功；发布过程中无 DDL（用 Mockito 注入 DynamicTableManager 并 verify 其方法从未被调用——即使 service 不依赖它，也通过 spy DataSource/JdbcTemplate 或断言日志无 DDL）；内容未变化拒绝；同 key 旧 PUBLISHED 降 ARCHIVED。

```java
@Test
void publish_view_success_withoutDdl() {
    PageDefinition draft = /* DRAFT VIEW，schema 有效，绑定表单已发布 */;
    service.publish(draft.getId());
    assertThat(draft.getStatus()).isEqualTo("PUBLISHED");
    // 编译产物已持久化且非空
    assertThat(draft.getSchema()).contains("\"rule\"");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=PageDefinitionServiceTest`
Expected: FAIL（publish 未实现）

- [ ] **Step 3: 实现 ViewCompiler**

输入视图 schema，输出 `{"rule":[...],"option":{...}}`：
- searchFields → 查询条件组件 rule（matchType eq → 等值输入；like → 文本输入；range → 双输入/日期范围）
- columns → `el-table` 列配置规则（prop=key、label、width、align、sortable）
- actions → 操作按钮 rule（create/edit/delete/view 开关 + permissions 映射到 v-if 权限指令数据）
- detail → 详情弹窗 rule（type=form 时嵌套绑定表单的 form-create rule）
- events → 对应组件 rule 增加 `on` 处理器（声明式动作链 + 模板变量 `$row.xxx`/`$param.xxx` 占位，运行时替换）
- 未知 matchType / 无法映射 → 抛 BusinessException(400)

编译产物中的组件类型必须是 FormRenderer 已注册组件。参考：`FormDesigner.vue` 保存的 schema 结构与 `frontend/src/views/form/components/FormRenderer.vue` 的解析逻辑。

- [ ] **Step 4: 实现 publish 方法**

对齐 FormDefinitionService.publish：findByIdForUpdate → 状态校验（DRAFT 或 PUBLISHED 重发）→ 内容未变化拒绝（对比同 key 排除自身的最新 PUBLISHED）→ type=VIEW 时 PageValidator.validateForPublish + ViewCompiler.compile → 旧 PUBLISHED 降 ARCHIVED → 当前记录 status=PUBLISHED、publishedVersion=version → save。type=PAGE 时（阶段二预留）：仅 validateForPublish 基础校验，不编译（阶段二实现）。

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=PageDefinitionServiceTest,PageValidatorTest,ViewCompilerTest`（ViewCompilerTest 在 Task 4 或本任务补充）
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/page/
git commit -m "feat(page): 视图编译 ViewCompiler + 发布（不建表）"
```

---

### Task 6: Controller 与查询 API

**Files:**
- Create: `backend/src/main/java/com/workflow/api/controller/PageDefinitionController.java`
- Create: `backend/src/main/java/com/workflow/api/controller/PageQueryController.java`

**Interfaces:**
- Consumes: Task 3/5 的 Service、`BizDataService`（分页过滤引擎）
- Produces: REST 端点（见 Step 1/2）供前端 Task 8 调用

- [ ] **Step 1: 实现 PageDefinitionController**

参考 `backend/src/main/java/com/workflow/api/controller/FormDefinitionController.java`：
- `GET /api/v1/pages`（分页 + status/name/type 过滤）
- `POST /api/v1/pages`（创建，body: name/key/type/formKey）
- `GET /api/v1/pages/{id}`、`PUT /api/v1/pages/{id}`（更新，body: name/key/schema/formKey）
- `DELETE /api/v1/pages/{id}`
- `GET /api/v1/pages/{key}/definition`（按 key 取最新定义，供渲染页加载）
- `POST /api/v1/pages/{id}/publish`
- DTO 对齐 `frontend/src/api/form.ts` 期望的响应封装 `{ code, data, message }`

- [ ] **Step 2: 实现 PageQueryController**

`GET /api/v1/pages/{pageKey}/data`：参数 page/size/filter（Map）/sort。逻辑：按 pageKey 取最新 PUBLISHED 定义 → 校验发布 → 读绑定表单 column_config → 白名单过滤 filter（仅 schema 声明的 searchFields key；pageKey 未发布/不存在 → 404）→ 组装 `BizDataService` 查询 → 返回 `{ records, total }`（对齐 BizDataListPage fetchApi 契约）。

参考：`frontend/src/views/form/BizDataListPage.vue` 的 fetchApi 与 `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`。

- [ ] **Step 3: 编译验证**

Run: `cd backend && mvn compile`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/workflow/api/controller/PageDefinitionController.java backend/src/main/java/com/workflow/api/controller/PageQueryController.java
git commit -m "feat(page): 页面 CRUD/Publish/Data 查询 API"
```

---

### Task 7: 后端集成测试

**Files:**
- Create: `backend/src/test/java/com/workflow/engine/page/PageDefinitionPublishIntegrationTest.java`

**Interfaces:**
- Consumes: 全部后端能力（Task 1-6）
- Produces: 端到端验证

- [ ] **Step 1: 写集成测试**

参考 `backend/src/test/java/com/workflow/engine/form/FormDefinitionPublishBusinessTest.java` 模式：
1. 创建并发布一个 BUSINESS 表单（触发建表，作为绑定目标）
2. 创建 VIEW 页面绑定该表单 → 发布成功，断言无 DDL（MockMvc + JdbcTemplate 表结构不变）
3. 调用 `/api/v1/pages/{key}/data` 分页查询、filter 白名单（未知字段 400）、租户隔离
4. 并发发布同 key 页面 → 仅一个成功、无重复 PUBLISHED
5. 修改绑定表单 column_config 后重新发布表单 → 页面再次发布时校验跟随（引用已删列 → 400）

- [ ] **Step 2: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=PageDefinitionPublishIntegrationTest`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/workflow/engine/page/PageDefinitionPublishIntegrationTest.java
git commit -m "test(page): 发布-查询-白名单-并发 集成测试"
```

---

### Task 8: 前端 API 与路由

**Files:**
- Create: `frontend/src/api/page.ts`
- Modify: `frontend/src/router/index.ts`

**Interfaces:**
- Consumes: Task 6 REST API
- Produces: `pageApi` 对象（方法见 Step 1）；路由 `/page`（PageListPage）、`/page/designer`（ViewDesigner）、`/page/:pageKey`（PageRenderer）

- [ ] **Step 1: 创建 pageApi**

参考 `frontend/src/api/form.ts` 封装风格：

```ts
import request from '@/api/request' // 按项目实际请求封装路径

export const pageApi = {
  getPages: (params: any) => request.get('/pages', { params }),
  createPage: (data: { name: string; key: string; type: string; formKey?: string }) => request.post('/pages', data),
  getPage: (id: string) => request.get(`/pages/${id}`),
  getPageByKey: (key: string) => request.get(`/pages/${key}/definition`),
  updatePage: (id: string, data: any) => request.put(`/pages/${id}`, data),
  deletePage: (id: string) => request.delete(`/pages/${id}`),
  publishPage: (id: string) => request.post(`/pages/${id}/publish`),
  queryPageData: (pageKey: string, params: any) => request.get(`/pages/${pageKey}/data`, { params }),
}
```

类型定义 `PageDefinitionDTO`（name/key/type/formKey/schema/version/status）对齐 FormDefinitionDTO 风格。

- [ ] **Step 2: 注册路由**

参考 `frontend/src/router/index.ts` 现有 form 路由：
- `/page` → `views/page/PageListPage.vue`（name: PageList）
- `/page/designer` → `views/page/ViewDesigner.vue`（name: PageDesigner，query: id）
- `/page/:pageKey` → `views/page/PageRenderer.vue`（name: PageRenderer）

- [ ] **Step 3: 前端类型检查**

Run: `cd frontend && npx vue-tsc --noEmit`（或项目实际类型检查命令）
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/page.ts frontend/src/router/index.ts
git commit -m "feat(page): 前端 pageApi 与路由"
```

---

### Task 9: 页面管理列表 PageListPage

**Files:**
- Create: `frontend/src/views/page/PageListPage.vue`

**Interfaces:**
- Consumes: `pageApi`、`SearchTable`（`frontend/src/components/business`）
- Produces: 页面列表 UI（供用户创建/编辑/发布/删除页面）

- [ ] **Step 1: 实现列表页**

参考 `frontend/src/views/form/FormListPage.vue`：SearchTable + 创建弹窗。列表列：名称/标识/类型（VIEW 视图 / PAGE 页面 tag）/绑定表单/状态/版本/最近更新时间。操作：编辑（跳转 /page/designer?id=xx）、发布（确认 + publishPage）、删除。创建弹窗：name、key、type 单选（VIEW 默认；PAGE 选项阶段二置灰提示）、formKey 下拉（加载 `formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED', size: 100 })`）。

- [ ] **Step 2: 测试发布交互**

Run: `cd frontend && npx vitest run src/views/page/__tests__/PageListPage.test.ts`（如项目有组件测试模式，参考 FormListPage 相关测试；否则手动验证）
Expected: 发布成功提示 + 状态刷新；删除已发布页被 400 拦截提示

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/page/PageListPage.vue
git commit -m "feat(page): 页面管理列表 PageListPage"
```

---

### Task 10: 视图设计器 ViewDesigner

**Files:**
- Create: `frontend/src/views/page/ViewDesigner.vue`
- Create: `frontend/src/views/page/components/SearchFieldsConfig.vue`、`ColumnsConfig.vue`、`ActionsConfig.vue`、`DetailConfig.vue`、`EventsConfig.vue`（或按需合并，保持文件聚焦）

**Interfaces:**
- Consumes: `pageApi`、`formApi`（加载绑定表单 columnConfig 与 schema）
- Produces: 视图 schema `{searchFields, columns, actions, detail, events}` → `pageApi.updatePage` / `pageApi.publishPage`

- [ ] **Step 1: 实现设计器骨架**

参考 `FormDesigner.vue` 顶部信息栏模式：名称/key 输入、绑定表单选择（加载已发布 BUSINESS 表单）、状态显示、保存/发布按钮。绑定表单变化时调用 `formApi.getFormDefinitionByKey(formKey)` 加载 columnConfig，缓存为候选字段。

- [ ] **Step 2: 实现各配置区**

- SearchFieldsConfig：候选 = 可筛选列（非 JSON/TEXT、非隐藏、参考 BizDataListPage.filterableColumns 规则），勾选 + matchType 选择（文本 eq/like；数字 eq/range；日期 eq/range）
- ColumnsConfig：候选 = 可展示列（非 unsupported、非 hidden），勾选 + width/align/sortable
- ActionsConfig：create/edit/delete/view 开关 + permissions 输入
- DetailConfig：启用开关 + 弹窗宽度
- EventsConfig：事件列表（触发器下拉 + target + 动作链编辑：动作类型下拉 + 参数 key/value，支持 $row./$param. 变量提示）

- [ ] **Step 3: 保存与发布**

保存 → 组装 schema JSON → `pageApi.updatePage`。发布 → 确认文案（区分首次/重发，参考 FormDesigner.handlePublish）→ `pageApi.publishPage` → 刷新状态。预览按钮：跳转 `/page/<key>?preview=1`（PageRenderer 支持 preview 参数加载 DRAFT 编译产物，或展示编译产物 JSON 对话框——取简单实现：展示编译产物 JSON）。

- [ ] **Step 4: 前端测试**

Run: `cd frontend && npx vitest run src/views/page/__tests__/ViewDesigner.test.ts`
Expected: 勾选配置 → schema 组装正确；绑定表单未加载时发布被禁用

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/page/
git commit -m "feat(page): 视图设计器 ViewDesigner（清单勾选式）"
```

---

### Task 11: 通用渲染页 PageRenderer

**Files:**
- Create: `frontend/src/views/page/PageRenderer.vue`

**Interfaces:**
- Consumes: `pageApi.getPageByKey`、`pageApi.queryPageData`、`FormRenderer`（`frontend/src/views/form/components/FormRenderer.vue`）、`formApi.getFormDefinitionByKey`（详情弹窗 schema）
- Produces: `/page/:pageKey` 渲染 + 事件动作执行器

- [ ] **Step 1: 实现加载与渲染**

加载 pageKey → 取定义（VIEW：编译产物；PAGE：原始 schema，阶段二）→ 错误处理（未发布/不存在 → 错误提示，参考 BizDataListPage 的 ElMessage.error）→ 将 rule 交给 FormRenderer 渲染。注入 PageDataSource（包装 `pageApi.queryPageData` + bizDataApi 的 detail/create/update/remove）。

- [ ] **Step 2: 实现事件动作执行器**

从编译产物中提取事件绑定 → 运行时为组件注册 `on` 处理器：动作类型分发 openDetail（打开详情弹窗，复用绑定表单 schema）/ openLink（router.push，`$row`/`$param` 模板替换）/ openCreate / edit / delete（确认） / refresh（重新查询） / export / message。模板变量替换函数：

```ts
function resolveTemplate(tpl: string, ctx: { row: any; params: Record<string, any> }): string {
  return tpl.replace(/\$row\.([\w]+)/g, (_, k) => ctx.row?.[k] ?? '')
            .replace(/\$param\.([\w]+)/g, (_, k) => ctx.params?.[k] ?? '')
}
```

- [ ] **Step 3: 前端测试**

Run: `cd frontend && npx vitest run src/views/page/__tests__/PageRenderer.test.ts`
Expected: 视图渲染（mock pageApi）；未发布错误提示；事件行点击触发 openDetail 且模板变量正确替换

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/page/PageRenderer.vue
git commit -m "feat(page): 通用渲染页 PageRenderer + 事件动作执行器"
```

---

### Task 12: ScriptSandbox（视图脚本事件）

**Files:**
- Create: `frontend/src/utils/scriptSandbox.ts`
- Modify: `frontend/src/views/page/PageRenderer.vue`（脚本动作分发）

**Interfaces:**
- Consumes: 事件上下文（row/params/selectedRows/ds/api/actions/$）
- Produces: `executeScript(source: string, context: Record<string, any>): Promise<void>`（异常捕获，不抛出）；配置开关 `isScriptEventEnabled()`

- [ ] **Step 1: 实现 sandbox（选型验证后锁定实现）**

候选：`new Function` + with 白名单代理（限制访问 globalThis 仅白名单键）；优先验证 iframe MessageChannel 方案是否在项目构建链（vite）中可用——若不可用则降级 `new Function` + Proxy 限制。核心约束：上下文对象以参数传入，`globalThis` 访问被拦截，异常捕获并 console.error。

```ts
const SANDBOX_GLOBALS = ['console', 'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number']
export async function executeScript(source: string, context: Record<string, any>): Promise<void> {
  try {
    const fn = new Function('ctx', `with (__sandbox(ctx)) { ${source} }`)
    // __sandbox 构建 Proxy 限制 globals 访问；context 键透传
    await fn(context)
  } catch (e) {
    console.error('[script] 执行失败:', e)
  }
}
// 注：with + Proxy 的精确隔离需要在实现时用测试锁定；若验证不足，降级为直接参数调用 + 白名单校验 source 内容
```

- [ ] **Step 2: 写 sandbox 测试（TDD）**

Create: `frontend/src/utils/__tests__/scriptSandbox.test.ts`
覆盖：上下文注入（ctx.row.name 可读）；全局访问受限（window/document 不可用）；异常被捕获不抛出；`actions`/`api`/`ds` 透传可调用。

- [ ] **Step 3: PageRenderer 接入脚本动作**

事件动作 type=script → 若 `isScriptEventEnabled()`（默认 false，通过 `import.meta.env.VITE_PAGE_SCRIPT_ENABLED` 或运行时配置）执行 `executeScript(source, { row, params, selectedRows, ds, api, actions, $ })`；禁用时记录警告并忽略。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/utils/__tests__/scriptSandbox.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/scriptSandbox.ts frontend/src/utils/__tests__/scriptSandbox.test.ts
git commit -m "feat(page): ScriptSandbox 沙箱脚本执行"
```

---

### Task 13: 阶段二预留（自定义页面轨，不实现）

**Files:**
- 预留：`frontend/src/views/page/PageDesigner.vue`、页面组件库注册文件（`frontend/src/views/page/components/registry.ts`）

**Interfaces:**
- 阶段二启动时依据 `custom-page-designer` spec 实施（tasks 13.1-13.6）
- 本变更数据结构已预留：`wf_page_def.type='PAGE'`、schema 存 form-create `{rule,option}`

- [ ] **Step 1: 确认阶段一交付不含轨 B**

- [ ] 阶段一发布前核对：tasks.md 13.x 全部未勾选属预期；阶段一验收路径（Task 14）只需轨 A 端到端可用

（无代码产出，本任务仅作阶段边界标记）

---

### Task 14: 验收与收尾

**Files:**
- Modify: `docs/PRD.md`（3.2 补充查询界面/页面能力说明）、`docs/features.md`

**Interfaces:**
- Consumes: 全部交付

- [ ] **Step 1: 全量回归**

Run: `cd backend && mvn test`；`cd frontend && npx vitest run`
Expected: 全部通过，存量表单/流程测试不受影响（现有 FormDefinitionService/DynamicTableManager 行为未改）

- [ ] **Step 2: 端到端演示路径验证**

1. 创建 BUSINESS 表单并发布（建 wf_biz_leave）
2. 创建 VIEW 页面绑定 leave → 配置搜索/列/操作/详情/事件 → 发布
3. 访问 /page/leave-query → 查询数据、操作按钮、事件（行点击详情）全部生效
4. 验证无新物理表产生（information_schema 对照）

- [ ] **Step 3: 更新文档**

向 `docs/PRD.md` 3.2 增加"列表查询界面"说明（视图/页面双轨、发布不建表、绑定已发布业务表单）；`docs/features.md` 增加能力条目。

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(page): PRD/features 补充查询界面能力说明"
```