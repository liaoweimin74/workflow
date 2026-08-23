# unify-workflow-form-datasource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将工作流表单以 WORKFLOW 类型接入数据源 SPI（只读），并把视图轨从 formKey 直连切换为 dataSourceId 经 SPI 统一取数，含存量自动迁移。

**Architecture:** 新增 `FormSchemaColumnExtractor`（schema→列）与 `WorkflowFormDataQueryService`（wf_form_data 跨版本查询+行组装）两个组件，由 `UnifiedDataSourceAdapter` 的 WORKFLOW 分支消费；`PageDefinition` 增加 `dataSourceId`，发布校验/查询端点/前端设计器全部切换到数据源协议；启动时 `ViewDataSourceMigrator` 幂等迁移存量视图。

**Tech Stack:** Spring Boot 3 + JPA + Flowable（RuntimeService/HistoryService）、MySQL JSON_EXTRACT、Vue 3 + Element Plus + form-create、JUnit 5 + Mockito。

## Global Constraints

- 所有面向用户错误消息使用中文，`BusinessException(code, 中文消息)`
- 每次数据访问必须经 `TenantProvider.getTenantId()` 租户隔离
- JSON_EXTRACT 仅 MySQL 可用（项目既有约束），禁止引入其他方言分支
- 禁止 `@ts-ignore`/`as any` 压制类型；禁止删除失败测试
- TDD：每个任务先写失败测试再实现；提交信息用 conventional commits（feat/test/chore/docs）
- WORKFLOW 数据源全只读：CUD 一律抛 `BusinessException(400)`
- 排序第一版仅支持系统列 created_at / startTime（见 Task 2 说明）
- 本计划在 worktree `.worktrees/unify-workflow-form-datasource/` 内执行

---

### Task 1: FormSchemaColumnExtractor 组件（TDD）

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/column/FormSchemaColumnExtractor.java`
- Test: `backend/src/test/java/com/workflow/engine/form/column/FormSchemaColumnExtractorTest.java`

**Interfaces:**
- Consumes: `ColumnConfig`（已有，engine/form/column）
- Produces: `public List<ColumnConfig> extract(String schemaJson)` —— 输入 form-create schema（根为数组或 `{rule:[...]}`），输出列定义列表；非法/空输入返回空列表不抛错

- [ ] **Step 1: 确认组件类型字符串**

Run: `grep -rn "addComponent\|label:" frontend/src/views/form/FormDesigner.vue | head -50`
记录实际组件 type 字符串（如 input/inputNumber/datePicker/upload/subTable 等），据此确定下方映射表与 SKIP 集。SKIP 集合必须包含：子表、嵌套表单、分组容器、文件上传、dataPicker/lookupPicker 等引用类字段。

- [ ] **Step 2: 写失败测试**

```java
class FormSchemaColumnExtractorTest {
    private final ObjectMapper om = new ObjectMapper();
    private final FormSchemaColumnExtractor extractor = new FormSchemaColumnExtractor(om);

    @Test void 根数组解析_数字映射INT() {
        String schema = "[{\"type\":\"inputNumber\",\"field\":\"days\",\"title\":\"天数\"}]";
        List<ColumnConfig> cols = extractor.extract(schema);
        assertEquals(1, cols.size());
        assertEquals("days", cols.get(0).getKey());
        assertEquals("天数", cols.get(0).getLabel());
        assertEquals("INT", cols.get(0).getColumnType());
    }
    @Test void rule包装对象解析_日期映射DATE() { /* {rule:[{type:"datePicker",field:"start",title:"开始"}]} → DATE */ }
    @Test void 文件与子表字段跳过() { /* upload/subTable 类字段不出现在结果 */ }
    @Test void 无field节点跳过且非法JSON返回空列表() {}
}
```

- [ ] **Step 3: 运行确认失败**

Run: `cd backend && mvn test -Dtest=FormSchemaColumnExtractorTest`
Expected: 编译失败（类不存在）

- [ ] **Step 4: 最小实现**

```java
@Component
public class FormSchemaColumnExtractor {
    private static final Set<String> NUMERIC_TYPES = Set.of(/* Step1 确认的数字类 */);
    private static final Set<String> DATE_TYPES = Set.of(/* 日期类 */);
    private static final Set<String> DATETIME_TYPES = Set.of(/* 日期时间/范围类 */);
    private static final Set<String> SKIP_TYPES = Set.of(/* 子表/嵌套/分组/上传/引用类 */);
    // 解析 root.isArray()?root:root.path("rule")；逐节点取 field/title/type；
    // field 为空或命中 SKIP_TYPES 跳过；columnType 按 NUMERIC→INT、DATE→DATE、DATETIME→DATETIME、其余 VARCHAR
}
```

- [ ] **Step 5: 运行通过后提交**

Run: `cd backend && mvn test -Dtest=FormSchemaColumnExtractorTest`
```bash
git add backend/src/main/java/com/workflow/engine/form/column/FormSchemaColumnExtractor.java backend/src/test/java/com/workflow/engine/form/column/FormSchemaColumnExtractorTest.java
git commit -m "feat: 表单schema列解析器 FormSchemaColumnExtractor"
```

---

### Task 2: WorkflowFormDataQueryService 查询与行组装（TDD）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/repository/FormDefinitionRepository.java`（新增按 key 查全部版本方法）
- Create: `backend/src/main/java/com/workflow/engine/datasource/WorkflowFormDataQueryService.java`
- Test: `backend/src/test/java/com/workflow/engine/datasource/WorkflowFormDataQueryServiceTest.java`

**Interfaces:**
- Produces:
  - `List<ColumnConfig> columnsFor(String formKey)` —— 5 系统列 + 最新 PUBLISHED schema 解析列
  - `BizDataPageVO query(String formKey, BizDataQueryRequest req)`
  - `BizDataVO getById(String formKey, String id)`
  - `public static List<ColumnConfig> systemColumns()`（instanceId/processStatus/initiatorName/startTime/currentNodeName）
- Consumes: Task 1 extractor；`FormDataRepository`；Flowable `HistoryService`/`RuntimeService`（参照 `ProcessInstanceService` 对 initiator/currentNode/status 的既有解析方式，实现前先 Read `backend/src/main/java/com/workflow/engine/process/ProcessInstanceService.java` 公共方法并复用其模式）

- [ ] **Step 1: Repository 新增方法**

```java
/** 该 key 下全部版本（任意状态），按版本倒序 */
List<FormDefinition> findByTenantIdAndKeyOrderByVersionDesc(String tenantId, String key);
```

- [ ] **Step 2: 写失败测试（行组装核心逻辑，mock 仓库层）**

覆盖场景：
1. query 返回每实例一行：系统列值 + dataJson 展开字段
2. 旧版本实例多余字段忽略、缺失字段为 null（data 中键存在值为 null 或不出现均可，但 MUST 不抛错）
3. filter 条件列不在最新 schema keys 内 → 400
4. getById 返回单行；id 不存在 → 404 业务异常
5. is_snapshot=true 与 processInstanceId=null 的草稿行被排除（SQL 条件单测以捕获到的 JPQL/native 参数断言）

- [ ] **Step 3: 运行失败 → 实现 → 通过**

实现要点（native SQL 分页，EntityManager 注入）：

```sql
SELECT f.id, f.data_json, f.process_instance_id, h.START_TIME_, h.START_USER_ID_
FROM wf_form_data f
LEFT JOIN ACT_HI_PROCINST h ON h.ID_ = f.process_instance_id
WHERE f.tenant_id=:t AND f.form_def_id IN (:ids)
  AND f.is_snapshot=0 AND f.process_instance_id IS NOT NULL
  [AND JSON_UNQUOTE(JSON_EXTRACT(f.data_json,'$.<col>')) LIKE CONCAT('%',:kw,'%')]  -- 仅白名单列拼接
ORDER BY COALESCE(h.START_TIME_, f.created_at) DESC   -- startTime 排序由此天然支持
LIMIT :limit OFFSET :offset
```

- 列名拼进 SQL 前必须校验匹配 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` 且属于最新 schema keys（防注入）
- status/initiatorName/currentNodeName 批量补齐：running 用 `runtimeService.createProcessInstanceQuery().processInstanceIds(ids)`（suspended 看 SUSPENSION_STATE_），completed/发起人姓名复用 ProcessInstanceService 既有批量模式 + UserService.findByIds
- 总数用同条件 COUNT SQL；组装 `new BizDataVO(rowId, LinkedHashMap数据, null,null,null)` 与 `new BizDataPageVO(rows,total,page,size)`

- [ ] **Step 4: 提交**

```bash
git commit -am "feat: WORKFLOW 数据源跨实例查询服务"
```

---

### Task 3: UnifiedDataSourceAdapter WORKFLOW 分支（TDD）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/datasource/UnifiedDataSourceAdapter.java`
- Modify: `backend/src/test/java/com/workflow/engine/datasource/UnifiedDataSourceAdapterTest.java`

**Interfaces:**
- Consumes: Task 2 的 `WorkflowFormDataQueryService`
- Produces: `supports()` 接受 `DataSourceType.WORKFLOW`；metadata/query/getById 委托查询服务；create/update/delete 抛只读业务异常

- [ ] **Step 1: 写失败测试**

在 `UnifiedDataSourceAdapterTest` 追加 `@Nested class WorkflowBranch`：

```java
@Test void metadata_返回系统列加解析列() { /* mock columnsFor 固定列表，断言透传 */ }
@Test void query与getById委托查询服务() {}
@Test void create_update_delete抛400且消息含只读() {
    BusinessException ex = assertThrows(BusinessException.class,
        () -> adapter.createData(wfDef, Map.of()));
    assertEquals(400, ex.getCode());
}
```

注意：构造器新增 `WorkflowFormDataQueryService` 依赖后，同步修正所有既有构造点。

- [ ] **Step 2: 最小实现**

```java
if (def.getType() == DataSourceType.WORKFLOW) {
    return switch (op) {
        case METADATA -> new DataSourceMetadata(queryService.columnsFor(formKey), false);
        case QUERY    -> queryService.query(formKey, req);
        case GET_BY_ID-> queryService.getById(formKey, id);
        default       -> throw new BusinessException(400, "工作流表单数据源为只读，不支持该操作");
    };
}
```

（switch 形式按现有代码风格调整，保持一致即可。）

- [ ] **Step 3: 回归 + 提交**

```bash
cd backend && mvn test -Dtest=UnifiedDataSourceAdapterTest
git commit -am "feat: 统一数据源适配器接入 WORKFLOW 只读类型"
```

---

### Task 4: enable 校验（PUBLISHED 且非 BUSINESS）（TDD）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/datasource/DataSourceDefinitionService.java`（enable 方法）
- Modify: 既有服务层/控制器测试（先定位：`grep -rln "enable" backend/src/test/java/com/workflow/engine/datasource/`）

- [ ] **Step 1: 写失败测试**

| 场景 | 期望 |
|---|---|
| WORKFLOW + PUBLISHED 版本存在 | 通过 |
| WORKFLOW + 表单 type=BUSINESS | 400「业务表单不可配置为工作流表单数据源」 |
| WORKFLOW + 仅 DRAFT（无 PUBLISHED） | 400「工作流表单必须先发布」 |
| WORKFLOW + formKey 不存在 | 400「表单不存在」 |

- [ ] **Step 2: 实现**

复用 `findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, key, "PUBLISHED")` 判定。

- [ ] **Step 3: 回归 + 提交**

```bash
cd backend && mvn test "-Dtest=DataSource*Test"
git commit -am "feat: WORKFLOW 数据源启用校验"
```

---

### Task 5: PageDefinition 增加 dataSourceId

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/page/PageDefinition.java`
- Modify: page DTO 与 `PageDefinitionService` 保存/响应映射（先 grep `formKey` 在 api/dto 与 service 的引用位置确认文件名）
- Create: DDL 变更（跟随项目现有 schema/迁移脚本目录约定，先 glob `backend/src/main/resources/**/*.sql`）

- [ ] **Step 1: 实体字段**

```java
/** 视图绑定的数据源 ID（新协议）；formKey 为遗留字段仅保留兼容 */
@Column(name = "data_source_id")
private String dataSourceId;
```

- [ ] **Step 2: DTO 与映射**

保存请求与查询响应 DTO 各加 `dataSourceId`，service 两处映射赋值。

- [ ] **Step 3: DDL**

```sql
ALTER TABLE wf_page_def ADD COLUMN data_source_id VARCHAR(64) NULL COMMENT '视图绑定数据源ID';
```

- [ ] **Step 4: 编译验证 + 提交**

```bash
cd backend && mvn -q compile
git commit -am "feat: 页面定义支持绑定数据源"
```

---

### Task 6: ViewDataSourceMigrator 存量自动迁移（TDD）

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/page/ViewDataSourceMigrator.java`
- Modify: `PageDefinitionRepository`（新增扫描查询）
- Test: `backend/src/test/java/com/workflow/engine/page/ViewDataSourceMigratorTest.java`

**Interfaces:**
- Produces: `ApplicationRunner`，启动执行 `migrate()`，幂等
- Consumes: `PageDefinitionRepository`、`DataSourceDefinitionRepository`、表单服务（取表单名）

- [ ] **Step 1: Repository 扫描方法**

```java
// type=VIEW 且 formKey 非空 且 dataSourceId IS NULL（字段/枚举名以实体实际为准）
List<PageDefinition> findPendingViewMigration(String tenantId);
```

- [ ] **Step 2: 写失败测试（5 场景）**

1. 存在同名 FORM 数据源 → 复用并置 ENABLED，不新建
2. 无同名 → 创建 FORM 数据源，命名 `<表单名> 数据源`，直接 ENABLED
3. 表单已删除或无 PUBLISHED → 跳过该页记 WARN 日志，不影响其他页继续迁移
4. 幂等：dataSourceId 已填充的页不再处理，二次运行为空操作
5. 每页独立事务：一页异常不回滚其他页（TransactionTemplate 逐页 execute）

- [ ] **Step 3: 实现**

```java
@Component
@RequiredArgsConstructor
public class ViewDataSourceMigrator implements ApplicationRunner {
    // run(): 有待迁移页时打 INFO 开始日志；逐页 transactionTemplate.execute(...)
    // 命名约定查重: findByTenantIdAndTypeAndName(tenantId, FORM, 约定名)
    // 新建: type=FORM, formKey=key, status=ENABLED, description="视图存量自动迁移"
    // 无 PUBLISHED 版本 → log.warn("跳过页面 {}: 表单 {} 未发布", ...) 且返回 null 不抛出
}
```

- [ ] **Step 4: 回归 + 提交**

```bash
cd backend && mvn test -Dtest=ViewDataSourceMigratorTest
git commit -am "feat: 视图存量数据源自动迁移"
```

---

### Task 7: PageValidator VIEW 分支改造（TDD）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/page/PageValidator.java`
- Modify: `PageDefinitionService` 发布链路为 ViewCompiler 供列的调用点（原从表单 schema 取列）
- Modify: `backend/src/test/java/com/workflow/engine/page/PageValidatorTest.java` 及发布相关测试

**Interfaces:**
- Consumes: `UnifiedDataSourceAdapter.getMetadata(dsId)`（含 WORKFLOW 列）
- Produces: VIEW 发布校验新协议

校验规则：
1. dataSourceId 与 formKey 均为空 → 拒绝「请选择数据源」
2. dataSourceId 非空但定义不存在/未启用 → 拒绝
3. 组件绑定列不在 metadata 列 keys 内 → 拒绝并列出非法列
4. 兼容兜底：dataSourceId 为空且 formKey 非空（迁移被跳过的页）→ 维持旧校验逻辑

- [ ] **Step 1: 先改测试为新协议预期（RED）**
- [ ] **Step 2: 实现 VIEW 分支重写（GREEN）**
- [ ] **Step 3: 发布链路改从 adapter.metadata 取列喂给 ViewCompiler**
- [ ] **Step 4: 回归 + 提交**

```bash
cd backend && mvn test "-Dtest=Page*Test"
git commit -am "feat: 视图发布校验切换数据源协议"
```

---

### Task 8: PageQueryController 经 SPI 查询（TDD）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/api/controller/PageQueryController.java`
- Modify: `backend/src/test/java/com/workflow/engine/api/controller/PageQueryControllerTest.java`

**Interfaces:**
- Consumes: `UnifiedDataSourceAdapter.queryData(dsId, req)`；遗留 `BizDataService` 兜底分支

- [ ] **Step 1: 测试改为三分支预期（RED）**

| 场景 | 期望 |
|---|---|
| VIEW 页有 dataSourceId | 调 `adapter.queryData(page.dataSourceId, req)` |
| 仅剩 formKey（兼容） | 走旧 BizDataService 路径 |
| 两者皆无 | 400「页面未绑定数据源」 |

- [ ] **Step 2: 实现分支（GREEN）**，移除不再使用的直接依赖（若无他处引用）

- [ ] **Step 3: 回归 + 提交**

```bash
cd backend && mvn test -Dtest=PageQueryControllerTest
git commit -am "feat: 视图查询端点经统一数据源SPI"
```

---

### Task 9: 前端数据源管理页支持 WORKFLOW

**Files:**
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue`

- [ ] **Step 1: 类型选项与表单选择器**

- 类型下拉增加「工作流表单（WORKFLOW）」
- type=WORKFLOW 时表单下拉过滤掉 BUSINESS 类型（实现前先 grep form api 中 type 枚举取值确认字面量）
- 编辑/详情回显 formKey；新建默认状态沿用现有交互

- [ ] **Step 2: 手动验证**

`npm run dev` → 数据源管理：新建 WORKFLOW 数据源选已发布流程表单启用成功；选 BUSINESS 表单展示后端 400 中文提示。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/views/dataSource/DataSourceListPage.vue
git commit -m "feat(frontend): 数据源管理支持工作流表单类型"
```

---

### Task 10: ViewDesigner 切换绑定 + PageRenderer 双轨详情

**Files:**
- Modify: `frontend/src/views/page/ViewDesigner.vue`
- Modify: `frontend/src/views/page/PageRenderer.vue`（含详情弹窗子组件，若拆分）
- 可能 Modify: page api 的保存 payload 类型定义文件

**ViewDesigner：**
- [ ] 绑定区由「选择表单」改为「选择数据源」（选项 = 启用中的 FORM/WORKFLOW 数据源列表，前端按 status/type 过滤）
- [ ] 保存 payload 携带 `dataSourceId`（不再写 formKey）
- [ ] 「刷新列」改调 `GET /api/data-sources/{id}/metadata`，将 columns 映射进设计器可用列集合（key/label/columnType）

**PageRenderer：**
- [ ] 页面加载后拉取一次 metadata，缓存列信息与 writable
- [ ] 详情弹窗双轨：数据源 type=FORM → 经 metadata 反查 formKey 走既有 FormRenderer；否则 KV 只读表格
- [ ] 新建/编辑/删除按钮按 `metadata.writable === true` 显隐

- [ ] **手动验证**：绑定 WORKFLOW 数据源 → 列刷新成功 → 预览列表出数 → 行详情为 KV 且无编辑按钮；FORM 数据源页仍走表单渲染。
- [ ] **提交**

```bash
git add frontend/src/views/page/
git commit -m "feat(frontend): 视图设计与渲染切换数据源协议"
```

---

### Task 11: 收尾——全量构建、E2E 清单、文档

- [ ] **Step 1: 全量构建**

```bash
cd backend && mvn -q clean package
cd ../frontend && npm run build
```

Expected: 双端退出码 0。

- [ ] **Step 2: 手动 E2E（对照 specs 全场景）**

1. 启动后端 → 日志出现迁移 INFO；检查 `<表单名> 数据源` 记录生成、`wf_page_def.data_source_id` 已填充
2. 二次重启幂等（无重复创建）
3. WORKFLOW 列表页跨实例数据 + 系统列 + keyword 筛选生效
4. curl 直接 POST CUD 接口 → 400 只读中文消息
5. BUSINESS 表单建 WORKFLOW 数据源被拒（400 中文）

- [ ] **Step 3: 文档更新**

`docs/features.md` 数据源管理小节补充 WORKFLOW 类型说明（只读、自动迁移）。

- [ ] **Step 4: 最终提交**

```bash
git add -A && git commit -m "docs: 数据源功能说明补充工作流表单类型"
```

---

## Self-review checklist（每任务完成后过一遍）

- [ ] 错误消息全部中文且走 BusinessException
- [ ] 所有查询带 tenantId 条件
- [ ] SQL 拼接列名经白名单校验（`^[a-zA-Z][a-zA-Z0-9_]{0,63}$` 且在最新 schema keys 内）
- [ ] 无 `as any` / `@ts-ignore` / 空 catch
- [ ] TDD 先 RED 后 GREEN，无删除失败测试
- [ ] conventional commit 信息符合规范
