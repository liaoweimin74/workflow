# 业务表单（底表） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在统一设计器基础上新增业务表单（底表）能力：表单定义支持 type=BUSINESS，发布时运行时受控 DDL 建物理表 `wf_biz_<formKey>`，提供业务数据 CRUD API 与前端管理页。

**Architecture:** 复用现有 form-create 设计器/渲染器与 `wf_form_def` 版本机制。`FormDefinition` 加 `type`/`columnConfig`；新增 `ColumnTypeMapper`/`DdlBuilder`/`DynamicTableManager` 实现列映射与受控 DDL；新增 `BizDataService`/`BizDataController` 提供参数化动态 SQL CRUD；前端新增业务数据管理页并复用 FormRenderer 编辑。多租户采用共享表 + tenant_id 强制过滤。

**Tech Stack:** Spring Boot 3 / Spring Data JPA / MySQL 8 / Flyway；Vue 3 / Element Plus / form-create。

## Global Constraints

- 所有查询/写入必须强制 `tenant_id` 过滤（`TenantProvider` 获取当前租户）
- 列名正则白名单 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$`；列类型白名单：VARCHAR/TEXT/INT/DECIMAL/DATE/DATETIME/TINYINT/JSON
- 动态 SQL 全部参数化（PreparedStatement），禁止拼接用户输入
- DDL 仅允许：增列、改列宽/精度（只加不减）、改必填、加索引；禁止删列与类型跨类变更
- 禁止使用 `as any` / `@ts-ignore` 抑制类型错误
- 测试命令：后端 `mvn test -Dtest=<TestClass>`（workdir `backend/`），前端 `npm run build`（workdir `frontend/`）
- 参考规范：本变更 `openspec/changes/business-form-table/specs/` 下 3 个 delta spec；设计文档 `design.md`

---

### Task 1: FormDefinition 实体与 DTO 类型扩展

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/entity/FormDefinition.java`
- Modify: `backend/src/main/java/com/workflow/api/dto/FormDefinitionDTO.java`、`FormDefinitionDetailDTO.java`、`FormDefinitionSaveRequest.java`
- Create: `backend/src/main/resources/db/migration/V<next>__form_def_add_type_and_column_config.sql`（先查 `backend/src/main/resources/db/migration/` 现有最大版本号）
- Test: `backend/src/test/java/com/workflow/engine/form/FormDefinitionServiceTest.java`

**Interfaces:**
- Produces: `FormDefinition.getType()`/`setType(String)`、`getColumnConfig()`/`setColumnConfig(String)`（JSON 字符串）；`FormDefinitionDTO.type`；`FormDefinitionDetailDTO.type`/`columnConfig`；`FormDefinitionSaveRequest.columnConfig`

- [ ] **Step 1: 写迁移脚本**

创建 Flyway 迁移（版本号取现有最大 + 1）：

```sql
ALTER TABLE wf_form_def
    ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'WORKFLOW',
    ADD COLUMN column_config JSON NULL;
```

- [ ] **Step 2: 扩展实体**

在 `FormDefinition.java` 增加字段（参照现有 `status` 字段写法）：

```java
@Column(name = "type", length = 20, nullable = false)
private String type = "WORKFLOW";

@Lob
@Column(name = "column_config", columnDefinition = "JSON")
private String columnConfig;
```

并补充 getter/setter（与现有字段风格一致）。

- [ ] **Step 3: 扩展 DTO**

- `FormDefinitionDTO`：加 `private String type;` + getter/setter
- `FormDefinitionDetailDTO`：加 `private String type;` 与 `private String columnConfig;` + getter/setter
- `FormDefinitionSaveRequest`：加 `private String columnConfig;` + getter/setter

- [ ] **Step 4: 更新 Controller 映射**

`FormDefinitionController.toDTO()`/`toDetailDTO()` 补充 `dto.setType(formDef.getType())`、`toDetailDTO` 加 `dto.setColumnConfig(formDef.getColumnConfig())`；`create()` 增加 `@RequestParam(required = false) String type`，传给 service（默认 WORKFLOW）；`list()` 增加 `@RequestParam(required = false) String type` 透传。

- [ ] **Step 5: 写失败测试**

在 `FormDefinitionServiceTest` 追加：

```java
@Test
void create_withBusinessType_setsType() {
    FormDefinition def = formDefService.create("业务表单", "biz_leave", "BUSINESS");
    assertThat(def.getType()).isEqualTo("BUSINESS");
}

@Test
void create_withoutType_defaultsToWorkflow() {
    FormDefinition def = formDefService.create("工作流表单", "wf_leave", null);
    assertThat(def.getType()).isEqualTo("WORKFLOW");
}
```

- [ ] **Step 6: 运行验证失败**

Run: `mvn test -Dtest=FormDefinitionServiceTest`（workdir `backend/`）
Expected: 编译失败/测试失败（create 方法无 type 参数）

- [ ] **Step 7: 修改 Service 并转绿**

`FormDefinitionService.create(String name, String key, String type)`：`type == null || type.isBlank()` 时设 `"WORKFLOW"`，否则直接赋值。`list(String status, String name, String type, Pageable)` 在 Repository 增加 `findByTenantIdAndTypeAndStatusAndNameContaining` 风格查询（用 `Specification` 或三元空值分支，参照现有 list 实现）。更新 `FormDefinitionController` 调用处。

- [ ] **Step 8: 运行验证通过 + 提交**

Run: `mvn test -Dtest=FormDefinitionServiceTest`（workdir `backend/`）
Expected: PASS

```bash
git add backend/src/main/java/com/workflow/engine/form/entity/FormDefinition.java backend/src/main/java/com/workflow/api/dto backend/src/main/java/com/workflow/api/controller/FormDefinitionController.java backend/src/main/resources/db/migration/ backend/src/test/java/com/workflow/engine/form/FormDefinitionServiceTest.java
git commit -m "feat(form-definition): 表单定义支持 type 与 column_config"
```

---

### Task 2: 列映射模型与 ColumnTypeMapper

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/column/ColumnConfig.java`
- Create: `backend/src/main/java/com/workflow/engine/form/column/ColumnTypeMapper.java`
- Test: `backend/src/test/java/com/workflow/engine/form/column/ColumnTypeMapperTest.java`

**Interfaces:**
- Produces: `ColumnConfig`（字段：`key`/`label`/`columnType`/`length`/`scale`/`required`/`unique`/`indexed` + getter/setter，Jackson 反序列化用）；`ColumnTypeMapper.mapComponentToColumn(String componentType, Map<String,Object> props)` 返回 `ColumnConfig` 草案；`ColumnTypeMapper.isAllowedColumnType(String)`；`ColumnTypeMapper.isCrossTypeChange(String oldType, String newType)`

- [ ] **Step 1: 写失败测试**

创建 `ColumnTypeMapperTest`：

```java
@Test
void mapInputText_returnsVarchar255() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("input", Map.of());
    assertThat(c.getColumnType()).isEqualTo("VARCHAR");
    assertThat(c.getLength()).isEqualTo(255);
}

@Test
void mapDate_returnsDate() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("DatePicker", Map.of("type", "date"));
    assertThat(c.getColumnType()).isEqualTo("DATE");
}

@Test
void mapNumberDecimal_returnsDecimal() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("inputNumber", Map.of("precision", 2));
    assertThat(c.getColumnType()).isEqualTo("DECIMAL");
    assertThat(c.getScale()).isEqualTo(2);
}

@Test
void crossTypeChange_isRejected() {
    assertThat(ColumnTypeMapper.isCrossTypeChange("VARCHAR", "DECIMAL")).isTrue();
    assertThat(ColumnTypeMapper.isCrossTypeChange("VARCHAR", "VARCHAR")).isFalse();
}
```

- [ ] **Step 2: 运行验证失败**

Run: `mvn test -Dtest=ColumnTypeMapperTest`（workdir `backend/`）
Expected: 编译失败（类不存在）

- [ ] **Step 3: 实现 ColumnConfig 与 ColumnTypeMapper**

`ColumnConfig`：普通 POJO（String key/label/columnType；Integer length/scale；boolean required/unique/indexed；Jackson `@JsonIgnoreProperties(ignoreUnknown = true)`）。

`ColumnTypeMapper` 映射规则（组件 type 来自 form-create rule 的 `type` 字段，`props.type` 区分日期子类型）：

```java
switch (componentType) {
    case "input" -> newColumn("VARCHAR", 255);
    case "textarea", "RichText" -> newColumn("TEXT", null);
    case "inputNumber" -> props 含 precision>0 ? DECIMAL(18, precision) : INT;
    case "select", "radio" -> newColumn("VARCHAR", 255);
    case "checkbox", "multiSelect" -> newColumn("VARCHAR", 1024);
    case "DatePicker" -> props.type 为 "datetime"/"datetimerange" 时 DATETIME；"daterange" 时拆两列 DATE（草案生成处处理）；默认 DATE;
    case "TimePicker" -> newColumn("VARCHAR", 32);
    case "switch" -> newColumn("TINYINT", 1);
    case "Upload", "upload" -> newColumn("JSON", null);
    default -> null; // 不支持映射（子表/嵌套表单/人员选择等）
}
```

`isAllowedColumnType`：白名单集合 `Set.of("VARCHAR","TEXT","INT","DECIMAL","DATE","DATETIME","TINYINT","JSON")`。`isCrossTypeChange`：按"大类"比较——整数类(INT)/小数类(DECIMAL)/字符串类(VARCHAR,TEXT)/日期类(DATE,DATETIME)/其他，跨类为 true。

- [ ] **Step 4: 运行验证通过 + 提交**

Run: `mvn test -Dtest=ColumnTypeMapperTest`（workdir `backend/`）
Expected: PASS

```bash
git add backend/src/main/java/com/workflow/engine/form/column backend/src/test/java/com/workflow/engine/form/column
git commit -m "feat(business-form-data): 列映射模型与 ColumnTypeMapper"
```

---

### Task 3: DdlBuilder 与 DynamicTableManager

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/column/DdlBuilder.java`
- Create: `backend/src/main/java/com/workflow/engine/form/column/DynamicTableManager.java`
- Test: `backend/src/test/java/com/workflow/engine/form/column/DdlBuilderTest.java`

**Interfaces:**
- Produces: `DdlBuilder.buildCreateTable(String formKey, List<ColumnConfig> columns)` → String；`DdlBuilder.buildAlterStatements(String formKey, List<ColumnConfig> desired, List<ColumnInfo> existing)` → List<String>；`ColumnInfo`（key/columnType/isNullable/isUnique）；`DynamicTableManager.ensureTable(String formKey, List<ColumnConfig> columns)`（先查 information_schema 再执行 DDL）；`DynamicTableManager.findTableColumns(String tableName)` → List<ColumnInfo>

- [ ] **Step 1: 写失败测试**

创建 `DdlBuilderTest`：

```java
@Test
void buildCreateTable_generatesValidSql() {
    ColumnConfig name = new ColumnConfig();
    name.setKey("name"); name.setColumnType("VARCHAR"); name.setLength(255); name.setRequired(true);
    String sql = DdlBuilder.buildCreateTable("biz_leave", List.of(name));
    assertThat(sql).contains("CREATE TABLE IF NOT EXISTS wf_biz_biz_leave");
    assertThat(sql).contains("name VARCHAR(255) NOT NULL");
    assertThat(sql).contains("tenant_id VARCHAR(64) NOT NULL");
}

@Test
void buildAlter_addsColumn_whenMissing() {
    // existing 为空，desired 有 dept 列 → ADD COLUMN dept VARCHAR(64)
    ColumnConfig dept = new ColumnConfig();
    dept.setKey("dept"); dept.setColumnType("VARCHAR"); dept.setLength(64);
    List<String> stmts = DdlBuilder.buildAlterStatements("biz_leave", List.of(dept), List.of());
    assertThat(stmts).anyMatch(s -> s.contains("ADD COLUMN dept"));
}

@Test
void buildAlter_dropsColumn_neverGenerated() {
    // existing 有 oldField，desired 无 → 无 DROP COLUMN 语句
    ColumnInfo old = new ColumnInfo("oldField", "VARCHAR", true, false);
    List<String> stmts = DdlBuilder.buildAlterStatements("biz_leave", List.of(), List.of(old));
    assertThat(stmts).noneMatch(s -> s.contains("DROP"));
}

@Test
void invalidColumnKey_rejected() {
    ColumnConfig bad = new ColumnConfig();
    bad.setKey("bad name!"); bad.setColumnType("VARCHAR"); bad.setLength(255);
    assertThatThrownBy(() -> DdlBuilder.buildCreateTable("biz_x", List.of(bad)))
        .isInstanceOf(IllegalArgumentException.class);
}
```

- [ ] **Step 2: 运行验证失败**

Run: `mvn test -Dtest=DdlBuilderTest`（workdir `backend/`）
Expected: 编译失败（类不存在）

- [ ] **Step 3: 实现 DdlBuilder**

- `buildCreateTable`：表名 `wf_biz_<formKey>`（formKey 先过正则校验），固定列 + 业务列拼接，唯一约束生成 `UNIQUE KEY uk_<formKey>_<field> (tenant_id, <field>)`，`indexed` 生成 `INDEX idx_<formKey>_<field> (<field>)`
- 列定义方法：VARCHAR(n)/TEXT/DECIMAL(18,n)/INT/DATE/DATETIME/TINYINT/JSON，required → `NOT NULL`，否则 `NULL`
- `buildAlterStatements`：对比 desired 与 existing——missing 的列 → `ADD COLUMN`；类型相同但长度变大 → `MODIFY COLUMN`；existing 有而 desired 无 → 忽略（不生成语句）；`isCrossTypeChange` 为 true 时抛 `IllegalArgumentException`（不允许变更）
- `isValidColumnKey(String)`：`key.matches("^[a-zA-Z][a-zA-Z0-9_]{0,63}$")` 且不在保留集（id/tenant_id/version/created_by/created_at/updated_at）

- [ ] **Step 4: 实现 DynamicTableManager**

- `findTableColumns`：`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`（参数化），映射为 `ColumnInfo`（DATA_TYPE 归一化为大写白名单类型；COLUMN_KEY 含 "UNI" → unique=true）
- `ensureTable`：表不存在 → `CREATE TABLE IF NOT EXISTS`；存在 → 生成并执行 alter 列表；使用 `JdbcTemplate`（`spring.jpa.database-platform` 已有）执行；所有 DDL 记录日志
- `tableExists(String formKey)`：查询 information_schema.TABLES

- [ ] **Step 5: 运行验证通过 + 提交**

Run: `mvn test -Dtest=DdlBuilderTest`（workdir `backend/`）
Expected: PASS

```bash
git add backend/src/main/java/com/workflow/engine/form/column backend/src/test/java/com/workflow/engine/form/column
git commit -m "feat(business-form-data): DdlBuilder 受控 DDL 与 DynamicTableManager"
```

---

### Task 4: 业务表单发布流程扩展

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java`
- Modify: `backend/src/main/java/com/workflow/engine/form/repository/FormDefinitionRepository.java`（如需锁查询）
- Test: `backend/src/test/java/com/workflow/engine/form/FormDefinitionPublishBusinessTest.java`（Mockito 单测，mock DynamicTableManager）

**Interfaces:**
- Consumes: `DynamicTableManager.ensureTable(String, List<ColumnConfig>)`、`ColumnTypeMapper`
- Produces: `FormDefinitionService.publish()` 对 BUSINESS 表单执行建表/变更；拒绝含子表/嵌套组件 schema 的发布（400）

- [ ] **Step 1: 写失败测试**

```java
@ExtendWith(MockitoExtension.class)
class FormDefinitionPublishBusinessTest {
    @Mock DynamicTableManager tableManager;
    // 构造 FormDefinitionService（构造器注入 tableManager）

    @Test
    void publishBusinessForm_createsTable() {
        FormDefinition draft = draft("biz_leave", "BUSINESS",
            "{\"rule\":[{\"type\":\"input\",\"field\":\"name\"}]}",
            "[{\"key\":\"name\",\"columnType\":\"VARCHAR\",\"length\":255}]");
        // service.publish(draft.getId())
        verify(tableManager).ensureTable(eq("biz_leave"), anyList());
    }

    @Test
    void publishBusinessForm_withSubTable_rejected() {
        FormDefinition draft = draft("biz_bad", "BUSINESS",
            "{\"rule\":[{\"type\":\"subTable\",\"field\":\"items\"}]}", null);
        assertThatThrownBy(() -> service.publish(draft.getId()))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("子表");
    }
}
```

- [ ] **Step 2: 运行验证失败**

Run: `mvn test -Dtest=FormDefinitionPublishBusinessTest`（workdir `backend/`）
Expected: 编译失败

- [ ] **Step 3: 实现发布扩展**

- `FormDefinitionService` 注入 `DynamicTableManager`
- `publish()` 中：读当前 DRAFT → 若 `type=BUSINESS`：先校验 schema 不含子表/嵌套组件（遍历 rule 的 `type` 属白名单 `Set.of("subTable","nestedForm","SubTable","NestedForm","dataTable")` 之外的组件集，命中则抛 `BusinessException(400, "业务表单暂不支持子表/嵌套表单组件，请移除后发布")`）；再解析 columnConfig JSON → `List<ColumnConfig>`（Jackson）→ `tableManager.ensureTable(key, columns)`；校验/DDL 失败则抛 400 且不创建版本记录
- 发布事务内对 form_def 行加锁：Repository 新增 `@Lock(LockModeType.PESSIMISTIC_WRITE) Optional<FormDefinition> findByIdForUpdate(String id)`，publish 用该方法读取
- DDL 执行放在版本记录保存**之前**，DDL 成功后再提交版本（DDL 隐式提交，版本记录保存失败时结构可能已变更——日志记录变更，允许重试）

- [ ] **Step 4: 运行验证通过 + 提交**

Run: `mvn test -Dtest=FormDefinitionPublishBusinessTest`（workdir `backend/`）
Expected: PASS

```bash
git add backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java backend/src/main/java/com/workflow/engine/form/repository/FormDefinitionRepository.java backend/src/test/java/com/workflow/engine/form/FormDefinitionPublishBusinessTest.java
git commit -m "feat(business-form-data): 业务表单发布触发受控 DDL"
```

---

### Task 5: 业务数据 CRUD 服务与 Controller

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataQueryBuilder.java`
- Create: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`
- Create: `backend/src/main/java/com/workflow/api/controller/BizDataController.java`
- Create: `backend/src/main/java/com/workflow/api/dto/BizDataSaveRequest.java`、`BizDataQueryRequest.java`、`BizDataVO.java`、`BizDataPageVO.java`
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java`、`backend/src/test/java/com/workflow/engine/form/bizdata/BizDataQueryBuilderTest.java`

**Interfaces:**
- Produces: `BizDataService.create(String formKey, Map<String,Object> data)` → `BizDataVO`；`query(String formKey, BizDataQueryRequest req)` → `BizDataPageVO`；`getById(String formKey, String id)`；`update(String formKey, String id, Map<String,Object> data, Integer version)`；`delete(String formKey, String id)`
- Consumes: `DynamicTableManager.tableExists(String)`、`FormDefinitionService`（按 key 读 column_config 与必填/唯一规则）、`TenantProvider`

- [ ] **Step 1: 写失败测试（QueryBuilder）**

```java
@Test
void buildSelect_whitelistsColumns_andForcesTenant() {
    // tenant="t1", columns=[dept, name]
    SqlAndParams sp = BizDataQueryBuilder.buildSelect("biz_leave", List.of("dept","name"),
        "t1", Map.of("dept","研发部"), "name", "dept", "asc", 0, 20);
    assertThat(sp.sql()).contains("tenant_id = ?");
    assertThat(sp.params()).contains("t1", "研发部");
}

@Test
void buildSelect_rejectsUnknownSortColumn() {
    assertThatThrownBy(() -> BizDataQueryBuilder.buildSelect("biz_leave", List.of("dept"),
        "t1", Map.of(), null, "hack", "asc", 0, 20))
        .isInstanceOf(IllegalArgumentException.class);
}
```

- [ ] **Step 2: 运行验证失败**

Run: `mvn test -Dtest=BizDataQueryBuilderTest`（workdir `backend/`）
Expected: 编译失败

- [ ] **Step 3: 实现 BizDataQueryBuilder**

- `record SqlAndParams(String sql, List<Object> params)`
- `buildSelect`：基础 `SELECT * FROM wf_biz_<formKey> WHERE tenant_id = ?`；filter 仅接受白名单字段 → `AND <col> = ?`；keyword → `AND <col> LIKE ?`（`%kw%`）；sort 仅接受白名单 → `ORDER BY <col> <asc|desc>`（asc/desc 白名单校验，默认 created_at desc）；`LIMIT ? OFFSET ?` 参数化；所有标识符来自白名单校验（非法抛 `IllegalArgumentException` → Controller 转 400）
- `buildInsert`/`buildUpdate`/`buildDelete` 同理（insert 只含白名单字段；update 含 version 条件 `AND version = ?`；delete 含 `AND tenant_id = ?`）

- [ ] **Step 4: 实现 BizDataService 与 Controller**

- `BizDataService`：构造注入 `JdbcTemplate`、`DynamicTableManager`、`FormDefinitionService`、`TenantProvider`；每个方法先 `tableExists(formKey)` 否则抛 `BusinessException(404, ...)`；`create`：按 column_config 校验必填（缺失抛 400）→ `buildInsert` 执行 → 返回 `getById` 结果；`update`：校验 version 不匹配（`update` 影响行数 0 时查当前行区分"不存在 404 / 版本冲突 409"）→ 返回更新后记录；`delete`：`buildDelete` 执行
- `BizDataController`：`@RequestMapping("/api/v1/biz-data")`，`@PathVariable String formKey` 先过 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` 校验（非法 400）；`IllegalArgumentException` 统一 `@ExceptionHandler` → 400
- `BizDataVO`：`id`/`data`(Map)/`version`/`createdAt`/`updatedAt`；`BizDataPageVO`：`records`/`total`/`page`/`size`

- [ ] **Step 5: 写失败测试（Service，Mock JdbcTemplate）**

```java
@Test
void create_missingRequiredField_rejected() {
    // column_config 含 required=true 的 name；请求体无 name
    assertThatThrownBy(() -> service.create("biz_leave", Map.of("dept", "研发部")))
        .isInstanceOf(BusinessException.class)
        .hasMessageContaining("必填");
}

@Test
void query_rejectsCrossTenant_neverVisible() {
    // tenant t2 查询 t1 数据：SQL 恒含 tenant_id=? 且参数为 t2
}
```

- [ ] **Step 6: 运行验证通过 + 提交**

Run: `mvn test -Dtest=BizDataQueryBuilderTest,BizDataServiceTest`（workdir `backend/`）
Expected: PASS

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata backend/src/main/java/com/workflow/api/controller/BizDataController.java backend/src/main/java/com/workflow/api/dto backend/src/test/java/com/workflow/engine/form/bizdata
git commit -m "feat(business-form-data): 业务数据 CRUD API"
```

---

### Task 6: 前端——表单类型选择与列映射确认

**Files:**
- Modify: `frontend/src/api/form.ts`
- Modify: `frontend/src/views/form/FormListPage.vue`
- Modify: `frontend/src/views/form/FormDesigner.vue`
- Create: `frontend/src/views/form/components/ColumnConfigDialog.vue`

**Interfaces:**
- Produces: `formApi.createFormDefinition(name, key, type)`；`FormDefinitionDTO.type`；`ColumnConfigDialog`（props: `schema: Rule[]`；emit: `confirm(columnConfig: ColumnConfigItem[])`）；`ColumnConfigItem { key, label, columnType, length, scale, required, unique, indexed }`

- [ ] **Step 1: 扩展 api/form.ts**

`FormDefinitionDTO` 与 `FormDefinitionDetailDTO` 接口加 `type?: string` / `columnConfig?: string`；`createFormDefinition` 参数加 `type?: string` 并拼入请求（现有调用处补默认 `'WORKFLOW'`）。

- [ ] **Step 2: FormListPage 加类型选择与筛选**

- 新建按钮改为下拉（或弹窗选择）："新建工作流表单" / "新建业务表单" → 调用 `createFormDefinition(name, key, type)` 后跳设计器
- 列表筛选区加 el-select（全部/工作流/业务），绑定查询参数 `type`，变化时刷新列表
- 表格加"类型"列（tag：工作流/业务）；type=BUSINESS 行操作区加"管理数据"按钮 → `router.push('/biz-data/' + row.key)`

- [ ] **Step 3: FormDesigner 展示类型**

从 `getFormDefinition` 响应取 `type`，工具栏表单名旁显示类型 tag（业务表单蓝色 tag 文案"业务表单"）。`handlePublish` 前判断：`type === 'BUSINESS'` 时先打开 `ColumnConfigDialog`，确认后把 `column_config` 加入 `updateFormDefinition` 请求体再调 publish。

- [ ] **Step 4: 实现 ColumnConfigDialog**

- props `schema: Rule[]`：遍历 rule（跳过 layout 容器，平铺字段），按 `type` + `props` 生成 `ColumnConfigItem` 草案（映射表与后端 ColumnTypeMapper 对齐：input→VARCHAR(255)、textarea→TEXT、inputNumber→INT/DECIMAL(18,2)、select/radio→VARCHAR(255)、checkbox→VARCHAR(1024)、DatePicker(type=date)→DATE、(daterange)→生成 `<key>_start`/`<key>_end` 两行、switch→TINYINT(1)、Upload→JSON）
- 表格编辑：列类型 el-select（白名单，选择时校验跨类——后端 `isCrossTypeChange` 规则前端同步：字符串↔数字↔日期↔其他 跨类禁用并 tooltip 提示）、长度 el-input-number、必填/唯一/索引 el-switch
- 子表/嵌套表单字段（type 在 `['subTable','nestedForm','SubTable','NestedForm']`）：行标记红色"不支持"，不可勾选提交（提交时若存在则提示移除）
- 底部"确认发布"→ emit('confirm', items)（过滤掉不支持行）

- [ ] **Step 5: 类型检查 + 构建**

Run: `npm run build`（workdir `frontend/`）
Expected: 构建成功，无 TS 错误

```bash
git add frontend/src/api/form.ts frontend/src/views/form
git commit -m "feat(form-designer): 业务表单类型选择与列映射确认"
```

---

### Task 7: 前端——业务数据管理页

**Files:**
- Create: `frontend/src/api/bizData.ts`
- Create: `frontend/src/views/form/BizDataListPage.vue`
- Modify: `frontend/src/router/index.ts`

**Interfaces:**
- Produces: `bizDataApi.list(formKey, params)` / `detail(formKey, id)` / `create(formKey, data)` / `update(formKey, id, data, version)` / `remove(formKey, id)`；路由 `{ path: '/biz-data/:formKey', name: 'BizDataList', component: () => import('@/views/form/BizDataListPage.vue') }`

- [ ] **Step 1: 新增 api/bizData.ts**

```ts
import http from '@/utils/http'
import type { R, PageResult } from '@/types/common'

export interface BizDataVO {
  id: string
  data: Record<string, unknown>
  version: number
  createdAt: string
  updatedAt: string
}

export const bizDataApi = {
  list: (formKey: string, params: Record<string, unknown>) =>
    http.get<R<PageResult<BizDataVO>>>(`/api/v1/biz-data/${formKey}`, { params }),
  detail: (formKey: string, id: string) =>
    http.get<R<BizDataVO>>(`/api/v1/biz-data/${formKey}/${id}`),
  create: (formKey: string, data: Record<string, unknown>) =>
    http.post<R<BizDataVO>>(`/api/v1/biz-data/${formKey}`, data),
  update: (formKey: string, id: string, data: Record<string, unknown>, version: number) =>
    http.put<R<BizDataVO>>(`/api/v1/biz-data/${formKey}/${id}`, { ...data, version }),
  remove: (formKey: string, id: string) =>
    http.delete<R<void>>(`/api/v1/biz-data/${formKey}/${id}`),
}
```

（先确认 `frontend/src/types/common.ts` 中 `R`/`PageResult` 的形状，按现有 api 文件风格对齐）

- [ ] **Step 2: 实现 BizDataListPage.vue**

- 路由参数 `formKey`；onMounted：`formApi.getFormDefinition` 按 key 查表单（需后端支持按 key 查——若无，用 list 接口按 key 过滤，确认 `api/form.ts` 现有能力）取 `columnConfig`（JSON 解析为 `ColumnConfigItem[]`），失败提示并返回
- 顶部：返回按钮 + 表单名标题 + 总条数
- 筛选区：对 indexed 或 length<=64 的文本列生成 el-input/el-select 筛选器（**筛选器仅对非 JSON/TEXT 列生成**）；搜索按钮 → 重新查询
- 表格：el-table 列由 columnConfig 动态生成（label 为表头，`formatter` 读 `row.data[key]`；JSON/TEXT 列截断显示）；操作列：编辑/删除
- 新增/编辑弹窗：el-dialog 内嵌 `FormRenderer`（`:rule="schemaRule"`，rule 从表单定义 schema 解析；编辑时 `:initial-values="row.data"`），确定后调 create/update（携带当前 version）；删除走 `ElMessageBox.confirm`
- 分页：el-pagination（page/size 与后端对齐，注意后端 page 从 0 开始）

- [ ] **Step 3: 注册路由**

`frontend/src/router/index.ts` 在表单相关路由区新增：

```ts
{
  path: '/biz-data/:formKey',
  name: 'BizDataList',
  component: () => import('@/views/form/BizDataListPage.vue'),
}
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npm run build`（workdir `frontend/`）
Expected: 构建成功，无 TS 错误

```bash
git add frontend/src/api/bizData.ts frontend/src/views/form/BizDataListPage.vue frontend/src/router/index.ts
git commit -m "feat(business-form-data): 业务数据管理页"
```

---

### Task 8: 端到端验证与收尾

**Files:**
- 无新增；运行既有 + 新增全部测试

- [ ] **Step 1: 后端全量测试**

Run: `mvn test`（workdir `backend/`）
Expected: 全部 PASS（含既有 FormDefinitionServiceTest/ProcessInstanceControllerTest）

- [ ] **Step 2: 前端构建**

Run: `npm run build`（workdir `frontend/`）
Expected: 构建成功

- [ ] **Step 3: 手动冒烟（本地起前后端，按 AGENTS.md 用独立终端窗口）**

1. 表单管理 → 新建业务表单 → 设计含文本/数字/日期/下拉字段 → 发布 → 列映射确认 → 发布成功
2. 列表"管理数据" → 新增一条 → 列表出现 → 编辑（改值）→ 删除
3. 表单管理 → 新建工作流表单 → 确认类型仍为工作流表单、发布流程不受影响

- [ ] **Step 4: 提交收尾**

```bash
git add -A
git commit -m "chore(business-form-table): 端到端验证收尾"
```

---

## Self-Review 记录

- **Spec 覆盖**：business-form-data 的 5 个 Requirement（表管理/新增/查询/更新/删除）→ Task 3/4/5；form-definition 的 CRUD 与发布修改 → Task 1/4；form-designer 的类型选择与列映射确认 → Task 6。无遗漏。
- **占位符扫描**：无 TBD/TODO；所有步骤含具体文件路径与代码。
- **类型一致性**：`ColumnConfig`（key/label/columnType/length/scale/required/unique/indexed）在 Task 2 定义，Task 3/5/6 使用同一字段名；`DynamicTableManager.ensureTable(String, List<ColumnConfig>)` 在 Task 3 产出、Task 4 消费，签名一致；`BizDataVO`/`BizDataPageVO` 在 Task 5 产出、Task 7 消费，字段一致。
