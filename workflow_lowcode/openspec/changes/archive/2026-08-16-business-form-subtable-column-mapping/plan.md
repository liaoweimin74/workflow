# business-form-subtable-column-mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 BUSINESS（物理表模型）表单支持 form-create 子表组件（group/tableForm/subForm），子表持久化到独立物理表 `wf_biz_<formKey>_<field>`（1:N，增量 diff 更新，传输方式可配置）。

**Architecture:** 后端扩展既有动态 DDL 管线（DdlBuilder/DynamicTableManager）以支持子表建表与变更；`ColumnConfig` 增加 `subColumns`/`subMode` 嵌套结构表达子表映射；`BizDataService` 在主表 CRUD 中同步子表行（create 批量插入、update 增量 diff、delete 级联），并按 subMode 决定是否内嵌返回；前端 `ColumnConfigDialog` 增加子表子列配置 UI。三处 `UNSUPPORTED_COMPONENTS` 名单同步修正。

**Tech Stack:** Java 17 + Spring Boot 3 + JdbcTemplate（动态 SQL，无 ORM）；Vue3 + element-plus + form-create；JUnit 5；Maven。

## Global Constraints

- 后端标识符（表名/列名/子表字段名）必须过 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` 白名单（`DdlBuilder.COLUMN_KEY_PATTERN`/`FORM_KEY_PATTERN`），禁止拼接用户输入进 SQL。
- 列类型仅限白名单：VARCHAR/TEXT/INT/DECIMAL/DATE/DATETIME/TINYINT/JSON；VARCHAR 最长 255。
- 表结构变更仅允许增列、改列宽（只增不减）、改必填、加索引；禁止删列与类型跨类变更（`ColumnTypeMapper.isCrossTypeChange`）。
- 所有业务数据读写强制按 `tenantProvider.getTenantId()` 租户隔离。
- 主表行删除必须同事务级联删除子表行。
- 子表行单次请求上限 100 行，超限 400。
- 保留对 `userPicker`/`deptPicker`/`divider`/`groupContainer` 的不可映射处理（不发布）。
- 子表内不再支持嵌套子表（仅一级）。
- 测试命令：`cd backend && mvn -q test`；前端构建 `cd frontend && npm run build`。

---

### Task 1: ColumnConfig 子表结构扩展

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/column/ColumnConfig.java`
- Test: `backend/src/test/java/com/workflow/engine/form/column/ColumnConfigTest.java`（新建）

**Interfaces:**
- Produces: `ColumnConfig.getSubColumns(): List<ColumnConfig>`、`ColumnConfig.setSubColumns(List<ColumnConfig>)`、`ColumnConfig.getSubMode(): String`、`ColumnConfig.setSubMode(String)`（subMode 缺省 `"embedded"`，`subColumns` 缺省 null）
- Consumes: 无（纯数据模型）

- [ ] **Step 1: 写失败测试**

```java
// ColumnConfigTest.java
class ColumnConfigTest {
    @Test
    void subColumnsRoundTrip_withJackson() throws Exception {
        ObjectMapper om = new ObjectMapper();
        ColumnConfig sub = new ColumnConfig();
        sub.setKey("amount"); sub.setColumnType("DECIMAL");
        ColumnConfig parent = new ColumnConfig();
        parent.setKey("items"); parent.setSubColumns(List.of(sub)); parent.setSubMode("dedicated");
        String json = om.writeValueAsString(parent);
        ColumnConfig parsed = om.readValue(json, ColumnConfig.class);
        assertThat(parsed.getSubColumns()).hasSize(1);
        assertThat(parsed.getSubColumns().get(0).getKey()).isEqualTo("amount");
        assertThat(parsed.getSubMode()).isEqualTo("dedicated");
    }

    @Test
    void legacyConfig_parsesWithoutSubColumns() throws Exception {
        ObjectMapper om = new ObjectMapper();
        ColumnConfig parsed = om.readValue("{\"key\":\"name\",\"columnType\":\"VARCHAR\"}", ColumnConfig.class);
        assertThat(parsed.getSubColumns()).isNull();
        assertThat(parsed.getSubMode()).isNull();
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=ColumnConfigTest`
Expected: FAIL（编译错误：getSubColumns/setSubColumns 不存在）

- [ ] **Step 3: 最小实现**

```java
// ColumnConfig.java 增加字段
/** 子表列映射（非空表示该 key 为子表字段，映射独立物理表 wf_biz_<formKey>_<key>） */
private List<ColumnConfig> subColumns;
/** 子表传输方式：embedded（默认，内嵌 JSON 随主表往返）/ dedicated（独立子表 CRUD 接口） */
private String subMode;

public List<ColumnConfig> getSubColumns() { return subColumns; }
public void setSubColumns(List<ColumnConfig> subColumns) { this.subColumns = subColumns; }
public String getSubMode() { return subMode; }
public void setSubMode(String subMode) { this.subMode = subMode; }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn -q test -Dtest=ColumnConfigTest`
Expected: PASS（2 个用例）

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/column/ColumnConfig.java backend/src/test/java/com/workflow/engine/form/column/ColumnConfigTest.java
git commit -m "feat(column): ColumnConfig 增加 subColumns/subMode 子表结构字段"
```

---

### Task 2: DdlBuilder 子表建表/变更 SQL

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/column/DdlBuilder.java`
- Test: `backend/src/test/java/com/workflow/engine/form/column/DdlBuilderTest.java`（追加用例）

**Interfaces:**
- Consumes: `ColumnConfig`（含 subColumns/subMode，Task 1）
- Produces:
  - `DdlBuilder.buildCreateSubTable(String formKey, String field, List<ColumnConfig> subColumns): String` — 返回 `CREATE TABLE IF NOT EXISTS wf_biz_<formKey>_<field> (...)`，固定列 id/biz_id/tenant_id/sort_no/version/created_by/created_at/updated_at + 子业务列 + `INDEX idx_<k>_<f>_biz (tenant_id, biz_id)`
  - `DdlBuilder.buildAlterSubTable(String formKey, String field, List<ColumnConfig> desired, List<ColumnInfo> existing): List<String>` — 差异变更（规则与主表 buildAlterStatements 一致）
  - `DdlBuilder.validateSubField(String field): void` — 子表字段名白名单校验

- [ ] **Step 1: 写失败测试**

```java
// DdlBuilderTest.java 追加
@Test
void buildCreateSubTable_includesFixedAndBizColumns() {
    ColumnConfig amount = new ColumnConfig();
    amount.setKey("amount"); amount.setColumnType("DECIMAL"); amount.setLength(18); amount.setScale(2);
    String sql = DdlBuilder.buildCreateSubTable("expense", "items", List.of(amount));
    assertThat(sql).contains("CREATE TABLE IF NOT EXISTS wf_biz_expense_items");
    assertThat(sql).contains("biz_id VARCHAR(64) NOT NULL");
    assertThat(sql).contains("sort_no INT NOT NULL DEFAULT 0");
    assertThat(sql).contains("amount DECIMAL(18,2)");
    assertThat(sql).contains("PRIMARY KEY (id)");
    assertThat(sql).contains("(tenant_id, biz_id)");
}

@Test
void buildCreateSubTable_rejectsInvalidField() {
    assertThatThrownBy(() -> DdlBuilder.buildCreateSubTable("expense", "bad field", List.of()))
        .isInstanceOf(IllegalArgumentException.class);
}

@Test
void buildAlterSubTable_addsColumnOnly() {
    ColumnConfig amount = new ColumnConfig();
    amount.setKey("amount"); amount.setColumnType("DECIMAL"); amount.setLength(18); amount.setScale(2);
    ColumnInfo existing = new ColumnInfo("name", "VARCHAR", true, false);
    List<String> stmts = DdlBuilder.buildAlterSubTable("expense", "items", List.of(amount), List.of(existing));
    assertThat(stmts).contains("ALTER TABLE wf_biz_expense_items ADD COLUMN amount DECIMAL(18,2)");
    assertThat(stmts).noneMatch(s -> s.contains("DROP"));
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=DdlBuilderTest`
Expected: FAIL（编译错误：buildCreateSubTable 不存在）

- [ ] **Step 3: 实现**

```java
// DdlBuilder.java 新增
/** 子表固定列保留字 */
private static final Set<String> SUB_RESERVED = Set.of(
        "id", "biz_id", "tenant_id", "sort_no", "version", "created_by", "created_at", "updated_at");

public static void validateSubField(String field) {
    if (field == null || !COLUMN_KEY_PATTERN.matcher(field).matches()) {
        throw new IllegalArgumentException("非法子表字段名（仅允许字母开头，含字母/数字/下划线，最长 64）: " + field);
    }
}

public static String buildCreateSubTable(String formKey, String field, List<ColumnConfig> subColumns) {
    validateFormKey(formKey);
    validateSubField(field);
    validateColumns(subColumns);
    String table = "wf_biz_" + formKey + "_" + field;
    StringBuilder sb = new StringBuilder("CREATE TABLE IF NOT EXISTS ").append(table).append(" (\n");
    sb.append("    id VARCHAR(64) NOT NULL,\n");
    sb.append("    biz_id VARCHAR(64) NOT NULL,\n");
    sb.append("    tenant_id VARCHAR(64) NOT NULL,\n");
    for (ColumnConfig c : subColumns) {
        sb.append("    ").append(c.getKey()).append(" ").append(columnDefinition(c)).append(",\n");
    }
    sb.append("    sort_no INT NOT NULL DEFAULT 0,\n");
    sb.append("    version INT NOT NULL DEFAULT 1,\n");
    sb.append("    created_by VARCHAR(50),\n");
    sb.append("    created_at DATETIME,\n");
    sb.append("    updated_at DATETIME,\n");
    sb.append("    PRIMARY KEY (id),\n");
    sb.append("    KEY idx_").append(formKey).append("_").append(field).append("_biz (tenant_id, biz_id)");
    for (ColumnConfig c : subColumns) {
        if (c.isUnique()) {
            sb.append(",\n    UNIQUE KEY uk_").append(formKey).append("_").append(field).append("_").append(c.getKey())
                    .append(" (tenant_id, biz_id, ").append(c.getKey()).append(")");
        }
        if (c.isIndexed()) {
            sb.append(",\n    INDEX idx_").append(formKey).append("_").append(field).append("_").append(c.getKey())
                    .append(" (").append(c.getKey()).append(")");
        }
    }
    sb.append("\n)");
    return sb.toString();
}

public static List<String> buildAlterSubTable(String formKey, String field, List<ColumnConfig> desired, List<ColumnInfo> existing) {
    validateFormKey(formKey);
    validateSubField(field);
    validateColumns(desired);
    String table = "wf_biz_" + formKey + "_" + field;
    Map<String, ColumnInfo> existingMap = new LinkedHashMap<>();
    for (ColumnInfo info : existing) existingMap.put(info.getKey(), info);
    List<String> statements = new ArrayList<>();
    for (ColumnConfig c : desired) {
        ColumnInfo current = existingMap.get(c.getKey());
        if (current == null) {
            statements.add("ALTER TABLE " + table + " ADD COLUMN " + c.getKey() + " " + columnDefinition(c));
            continue;
        }
        if (ColumnTypeMapper.isCrossTypeChange(current.getColumnType(), c.getColumnType())) {
            throw new IllegalArgumentException("子表列 " + c.getKey() + " 类型跨类变更不被支持: "
                    + current.getColumnType() + " -> " + c.getColumnType());
        }
        if (isNarrowing(current, c)) {
            throw new IllegalArgumentException("子表列 " + c.getKey() + " 不允许缩短长度/精度（防数据截断）");
        }
        if (!sameDefinition(current, c)) {
            statements.add("ALTER TABLE " + table + " MODIFY COLUMN " + c.getKey() + " " + columnDefinition(c));
        }
    }
    return statements;
}
```

注意：`validateColumns` 需跳过子表字段本身（`subColumns != null` 的 ColumnConfig 不生成列定义）；在主表场景由调用方过滤，子表场景传入的即为子列。

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn -q test -Dtest=DdlBuilderTest`
Expected: PASS（3 个新用例 + 既有用例）

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/column/DdlBuilder.java backend/src/test/java/com/workflow/engine/form/column/DdlBuilderTest.java
git commit -m "feat(ddl): DdlBuilder 支持子表建表与差异变更 SQL"
```

---

### Task 3: DynamicTableManager 子表 ensure

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/column/DynamicTableManager.java`
- Test: `backend/src/test/java/com/workflow/engine/form/column/DynamicTableManagerTest.java`（追加用例）

**Interfaces:**
- Consumes: `DdlBuilder.buildCreateSubTable`/`buildAlterSubTable`（Task 2）
- Produces: `DynamicTableManager.ensureSubTable(String formKey, String field, List<ColumnConfig> subColumns): void` — 表不存在建表，存在则差异变更

- [ ] **Step 1: 写失败测试（用 H2/嵌入式 DB 模式，与既有 DynamicTableManagerTest 同策略）**

```java
// DynamicTableManagerTest.java 追加（沿用既有 @BeforeEach 的 JdbcTemplate 注入）
@Test
void ensureSubTable_createsTable() {
    ColumnConfig amount = new ColumnConfig();
    amount.setKey("amount"); amount.setColumnType("DECIMAL"); amount.setLength(18); amount.setScale(2);
    manager.ensureSubTable("expense", "items", List.of(amount));
    assertThat(manager.tableExists("wf_biz_expense_items")).isTrue();
    List<ColumnInfo> cols = manager.findTableColumns("wf_biz_expense_items");
    assertThat(cols).extracting(ColumnInfo::getKey)
        .contains("id", "biz_id", "tenant_id", "sort_no", "amount", "version");
}

@Test
void ensureSubTable_noChangeSkips() {
    ColumnConfig amount = new ColumnConfig();
    amount.setKey("amount"); amount.setColumnType("DECIMAL"); amount.setLength(18); amount.setScale(2);
    manager.ensureSubTable("expense", "items", List.of(amount));
    manager.ensureSubTable("expense", "items", List.of(amount)); // 二次调用不抛错
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=DynamicTableManagerTest`
Expected: FAIL（编译错误：ensureSubTable 不存在）

- [ ] **Step 3: 实现**

```java
// DynamicTableManager.java 新增
public void ensureSubTable(String formKey, String field, List<ColumnConfig> subColumns) {
    String table = "wf_biz_" + formKey + "_" + field;
    if (!tableExists(table)) {
        String createSql = DdlBuilder.buildCreateSubTable(formKey, field, subColumns);
        log.info("Creating sub table: {}", table);
        jdbcTemplate.execute(createSql);
        return;
    }
    List<ColumnInfo> existing = findTableColumns(table);
    List<String> alterStatements = DdlBuilder.buildAlterSubTable(formKey, field, subColumns, existing);
    if (alterStatements.isEmpty()) {
        log.info("Sub table {} structure unchanged", table);
        return;
    }
    for (String stmt : alterStatements) {
        log.info("Altering sub table: {}", stmt);
        jdbcTemplate.execute(stmt);
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn -q test -Dtest=DynamicTableManagerTest`
Expected: PASS（2 个新用例 + 既有用例）

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/column/DynamicTableManager.java backend/src/test/java/com/workflow/engine/form/column/DynamicTableManagerTest.java
git commit -m "feat(ddl): DynamicTableManager 支持子表 ensure（建表/差异变更）"
```

---

### Task 4: 发布校验与流程（ColumnTypeMapper + FormDefinitionService）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/column/ColumnTypeMapper.java`
- Modify: `backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java`
- Test: `backend/src/test/java/com/workflow/engine/form/column/ColumnTypeMapperTest.java`、`backend/src/test/java/com/workflow/engine/form/FormDefinitionPublishBusinessTest.java`

**Interfaces:**
- Consumes: `DynamicTableManager.ensureSubTable`（Task 3）
- Produces: 发布流程对含子表表单创建主表+子表；`parseColumnConfig` 解析嵌套 subColumns

- [ ] **Step 1: 更新失败测试（先改断言再实现）**

```java
// ColumnTypeMapperTest.java
@Test
void subForm_mapsToJson() {
    assertThat(ColumnTypeMapper.mapComponentToColumn("subForm", Map.of()).getColumnType()).isEqualTo("JSON");
}
@Test
void group_returnsNull_forSubtableBranch() {
    assertThat(ColumnTypeMapper.mapComponentToColumn("group", Map.of())).isNull();
}
// FormDefinitionPublishBusinessTest.java 追加
@Test
void publishBusinessForm_withGroupSubtable_createsMainAndSubTables() {
    // schema: {"rule":[{"type":"group","field":"items","children":[{"type":"input","field":"name"}]}]}
    // column_config: items 含 subColumns(name VARCHAR)
    // 断言：主表存在 + wf_biz_<key>_items 存在 + 返回 200
}
@Test
void publishBusinessForm_withUserPicker_rejected() {
    // schema 含 userPicker → 400
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=ColumnTypeMapperTest,FormDefinitionPublishBusinessTest`
Expected: FAIL（subForm 返回 null、group 未处理、userPicker 未被拦）

- [ ] **Step 3: 实现**

```java
// ColumnTypeMapper.java
private static final Set<String> UNSUPPORTED_COMPONENTS = Set.of(
        "userPicker", "deptPicker", "divider", "groupContainer");
// mapComponentToColumn 增加：
case "subForm" -> applyJson(c);
// group/tableForm 不在此映射（返回 null），由上层子表分支处理

// FormDefinitionService.java
private static final Set<String> UNSUPPORTED_COMPONENTS = Set.of(
        "userPicker", "deptPicker", "divider", "groupContainer");

// validateBusinessSchema：子表类型放行
private static final Set<String> SUBTABLE_COMPONENTS = Set.of("group", "tableForm", "subForm");

// publish() BUSINESS 分支：
if ("BUSINESS".equals(draft.getType())) {
    validateBusinessSchema(draft.getSchema());
    validatePickerReferences(draft.getSchema());
    List<ColumnConfig> columns = parseColumnConfig(draft.getColumnConfig());
    tableManager.ensureTable(draft.getKey(), columns);
    for (ColumnConfig c : columns) {
        if (c.getSubColumns() != null && !c.getSubColumns().isEmpty()) {
            tableManager.ensureSubTable(draft.getKey(), c.getKey(), c.getSubColumns());
        }
    }
}
```

注意：`parseColumnConfig` 已用 Jackson 反序列化 `column_config`，`ColumnConfig` 的 subColumns 自动递归解析（Task 1 已验证）；`validateColumns` 需跳过 subColumns 非空的字段项。

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn -q test -Dtest=ColumnTypeMapperTest,FormDefinitionPublishBusinessTest`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/column/ColumnTypeMapper.java backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java backend/src/test/java/com/workflow/engine/form/column/ColumnTypeMapperTest.java backend/src/test/java/com/workflow/engine/form/FormDefinitionPublishBusinessTest.java
git commit -m "feat(publish): 发布流程支持子表组件（修正校验名单 + 子表建表）"
```

---

### Task 5: BizDataService 子表读写（create/update/getById/delete）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java`（追加）

**Interfaces:**
- Consumes: `ColumnConfig.getSubColumns()`/`getSubMode()`（Task 1）、`DynamicTableManager.ensureSubTable`（Task 3）
- Produces:
  - `BizDataContext` 增加 `subTables: Map<String, SubTableDef>`（key=子表字段名 → { tableName, subMode, subColumns }）
  - 私有 `writeSubRows(ctx, bizId, field, rows, subColumns)`、`diffSubRows(ctx, bizId, field, rows, subColumns)`、`readSubRows(ctx, bizId, field)`、`deleteSubRows(ctx, bizId)`

- [ ] **Step 1: 写失败测试**

```java
// BizDataServiceTest.java 追加（沿用既有租户/表初始化 setup，先 ensure 主表+子表）
@Test
void create_withSubRows_insertsMainAndSub() {
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("name", "报销单");
    data.put("items", List.of(
        Map.of("name", "差旅", "amount", 1200),
        Map.of("name", "办公", "amount", 450)
    ));
    BizDataVO vo = service.create("expense", data);
    // 断言子表 2 行，biz_id=vo.id，sort_no=0,1
}

@Test
void update_diff_addsRemovesUpdates() {
    // 先 create 2 行 → 记录 id1、id2
    // PUT：携带 [id1 改 amount, 新行 id3]
    // 断言：id2 被删、id1 更新、新行插入，sort_no 重排
}

@Test
void update_withoutSubField_keepsRows() {
    // create 含 items → PUT 仅 name → 子表行不变
}

@Test
void delete_cascadesSubRows() {
    // create 含 items → delete → 子表行清空
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=BizDataServiceTest`
Expected: FAIL（子表字段被当作普通列处理或忽略）

- [ ] **Step 3: 实现（核心逻辑）**

```java
// loadContext 扩展：解析 subTables
private record SubTableDef(String tableName, String subMode, List<ColumnConfig> subColumns, List<String> subKeys) {}
// ctx.subTables: for (ColumnConfig c : columns) if (c.getSubColumns()!=null && !c.getSubColumns().isEmpty())
//   → subTables.put(c.getKey(), new SubTableDef("wf_biz_"+formKey+"_"+c.getKey(), mode(c), c.getSubColumns(), keys))

private static final int MAX_SUB_ROWS = 100;

// create 主表写入后：
for (var e : ctx.subTables.entrySet()) {
    Object raw = data.get(e.getKey());
    if (raw instanceof List<?> rows && !rows.isEmpty()) {
        writeSubRows(e.getValue(), bizId, rows);
    }
}

private void writeSubRows(SubTableDef def, String bizId, List<?> rows) {
    if (rows.size() > MAX_SUB_ROWS) throw new BusinessException(400, "子表行数超限（最多 " + MAX_SUB_ROWS + " 行）: " + def.tableName());
    int sortNo = 0;
    for (Object row : rows) {
        @SuppressWarnings("unchecked")
        Map<String, Object> m = (Map<String, Object>) row;
        String rowId = UUID.randomUUID().toString().replace("-", "");
        List<Object> params = new ArrayList<>();
        StringBuilder cols = new StringBuilder("id, biz_id, tenant_id, sort_no, version");
        StringBuilder vals = new StringBuilder("?, ?, ?, ?, 1");
        params.add(rowId); params.add(bizId); params.add(tenantProvider.getTenantId()); params.add(sortNo);
        for (String k : def.subKeys()) {
            cols.append(", ").append(k); vals.append(", ?");
            params.add(m.get(k));
        }
        jdbcTemplate.update("INSERT INTO " + def.tableName() + " (" + cols + ") VALUES (" + vals + ")", params.toArray());
        sortNo++;
    }
}

// update 的 diff：
private void diffSubRows(SubTableDef def, String bizId, List<?> rows) {
    if (rows.size() > MAX_SUB_ROWS) throw new BusinessException(400, "子表行数超限（最多 " + MAX_SUB_ROWS + " 行）");
    List<Map<String, Object>> existing = readSubRows(def, bizId);
    Map<String, Map<String, Object>> existingById = existing.stream()
            .collect(Collectors.toMap(r -> String.valueOf(r.get("id")), r -> r, (a, b) -> a, LinkedHashMap::new));
    Set<String> keepIds = new HashSet<>();
    int sortNo = 0;
    for (Object row : rows) {
        Map<String, Object> m = (Map<String, Object>) row;
        String rowId = m.get("id") == null ? null : String.valueOf(m.get("id"));
        if (rowId != null && existingById.containsKey(rowId)) {
            Map<String, Object> cur = existingById.get(rowId);
            boolean changed = def.subKeys().stream().anyMatch(k -> !Objects.equals(cur.get(k), m.get(k)));
            if (changed || !Objects.equals(cur.get("sort_no"), sortNo)) {
                StringBuilder set = new StringBuilder();
                List<Object> params = new ArrayList<>();
                for (String k : def.subKeys()) { set.append(k).append(" = ?, "); params.add(m.get(k)); }
                set.append("sort_no = ? "); params.add(sortNo);
                params.add(tenantProvider.getTenantId()); params.add(bizId); params.add(rowId);
                jdbcTemplate.update("UPDATE " + def.tableName() + " SET " + set + " WHERE tenant_id = ? AND biz_id = ? AND id = ?", params.toArray());
            }
            keepIds.add(rowId);
        } else {
            Map<String, Object> newRow = new LinkedHashMap<>(m);
            newRow.remove("id"); newRow.remove("version");
            // 复用 writeSubRows 的单行插入，sortNo 作为序号
            insertOneSubRow(def, bizId, newRow, sortNo);
        }
        sortNo++;
    }
    // 删除不在 keepIds 的行
    if (existingById.size() > keepIds.size()) {
        List<Object> params = new ArrayList<>();
        params.add(tenantProvider.getTenantId()); params.add(bizId);
        StringBuilder ph = new StringBuilder();
        for (String id : existingById.keySet()) { if (!keepIds.contains(id)) { if (ph.length()>0) ph.append(","); ph.append("?"); params.add(id); } }
        jdbcTemplate.update("DELETE FROM " + def.tableName() + " WHERE tenant_id = ? AND biz_id = ? AND id IN (" + ph + ")", params.toArray());
    }
}

// getById：embedded 模式组装
private List<Map<String, Object>> readSubRows(SubTableDef def, String bizId) {
    return jdbcTemplate.queryForList("SELECT * FROM " + def.tableName()
            + " WHERE tenant_id = ? AND biz_id = ? ORDER BY sort_no", tenantProvider.getTenantId(), bizId);
}
// toVO 后：if (subMode.equals("embedded")) vo 附加子表字段数组（去掉 id/tenant 等内部列，或保留 id 供 diff）

// delete：
for (SubTableDef def : ctx.subTables.values()) {
    jdbcTemplate.update("DELETE FROM " + def.tableName() + " WHERE tenant_id = ? AND biz_id = ?", tenantId, id);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn -q test -Dtest=BizDataServiceTest`
Expected: PASS（4 个新用例 + 既有用例）

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java
git commit -m "feat(bizdata): BizDataService 子表写入/增量diff/内嵌读取/级联删除"
```

---

### Task 6: 独立子表行 CRUD 接口

**Files:**
- Modify: `backend/src/main/java/com/workflow/api/controller/BizDataController.java`
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java`（追加独立接口服务方法测试）

**Interfaces:**
- Consumes: Task 5 的 `readSubRows`/`writeSubRows`/diff 私有方法 → 抽出为包内可复用方法
- Produces: `BizDataService.listSubRows(formKey, id, field)`、`addSubRow(formKey, id, field, data)`、`updateSubRow(formKey, id, field, rowId, data, version)`、`deleteSubRow(formKey, id, field, rowId)`

- [ ] **Step 1: 写失败测试**

```java
@Test
void subRow_add_update_delete() {
    BizDataVO main = service.create("expense", Map.of("name", "单"));
    var added = service.addSubRow("expense", main.getId(), "items", Map.of("name", "新行", "amount", 99));
    assertThat(added.get("id")).isNotNull();
    var updated = service.updateSubRow("expense", main.getId(), "items", (String) added.get("id"), Map.of("name", "改", "amount", 100), 1);
    service.deleteSubRow("expense", main.getId(), "items", (String) added.get("id"));
    assertThat(service.listSubRows("expense", main.getId(), "items")).isEmpty();
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=BizDataServiceTest`
Expected: FAIL（编译错误：listSubRows 等方法不存在）

- [ ] **Step 3: 实现**

```java
// BizDataService.java：把 Task 5 的私有方法调整为可复用（保留私有，另加 4 个 public 方法）
public List<Map<String, Object>> listSubRows(String formKey, String id, String field) {
    BizDataContext ctx = loadContext(formKey);
    SubTableDef def = requireSubTable(ctx, field);
    findById(ctx.tableName, tenantProvider.getTenantId(), ctx, id); // 主表行 404 校验
    return readSubRows(def, id);
}
public Map<String, Object> addSubRow(String formKey, String id, String field, Map<String, Object> data) {
    BizDataContext ctx = loadContext(formKey);
    SubTableDef def = requireSubTable(ctx, field);
    findById(ctx.tableName, tenantProvider.getTenantId(), ctx, id);
    List<Map<String, Object>> rows = readSubRows(def, id);
    int sortNo = rows.size();
    Map<String, Object> inserted = insertOneSubRow(def, id, data, sortNo);
    return inserted;
}
public Map<String, Object> updateSubRow(String formKey, String id, String field, String rowId, Map<String, Object> data, Integer version) {
    BizDataContext ctx = loadContext(formKey);
    SubTableDef def = requireSubTable(ctx, field);
    findById(ctx.tableName, tenantProvider.getTenantId(), ctx, id);
    int affected = jdbcTemplate.update("UPDATE " + def.tableName()
            + " SET " + setClause(def, data) + " version = version + 1 WHERE tenant_id = ? AND biz_id = ? AND id = ? AND version = ?",
            params(data), tenantProvider.getTenantId(), id, rowId, version == null ? 1 : version);
    if (affected == 0) throw new BusinessException(409, "子表行已被他人修改或不存在");
    return readSubRows(def, id).stream().filter(r -> rowId.equals(String.valueOf(r.get("id")))).findFirst().orElseThrow();
}
public void deleteSubRow(String formKey, String id, String field, String rowId) {
    BizDataContext ctx = loadContext(formKey);
    SubTableDef def = requireSubTable(ctx, field);
    findById(ctx.tableName, tenantProvider.getTenantId(), ctx, id);
    jdbcTemplate.update("DELETE FROM " + def.tableName() + " WHERE tenant_id = ? AND biz_id = ? AND id = ?",
            tenantProvider.getTenantId(), id, rowId);
}
private SubTableDef requireSubTable(BizDataContext ctx, String field) {
    SubTableDef def = ctx.subTables().get(field);
    if (def == null) throw new BusinessException(404, "子表字段不存在: " + field);
    return def;
}

// BizDataController.java 新增 4 个端点（租户隔离在 Service 内，参数白名单由 requireSubTable/字段校验保证）
```

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn -q test -Dtest=BizDataServiceTest`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/api/controller/BizDataController.java backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java
git commit -m "feat(bizdata): 独立子表行 CRUD 接口（list/add/update/delete）"
```

---

### Task 7: 前端 ColumnConfigDialog 子表配置 UI

**Files:**
- Modify: `frontend/src/views/form/components/ColumnConfigDialog.vue`

**Interfaces:**
- Consumes: 现有 `ColumnConfigItem` 接口与 `collectFields`
- Produces: `ColumnConfigItem` 增加 `subColumns?: ColumnConfigItem[]`、`subMode?: string`；`collectFields` 对 group/tableForm 生成子表配置项；`handleConfirm` 输出嵌套结构

- [ ] **Step 1: 更新 `UNSUPPORTED_TYPES` 与 `collectFields`**

```ts
const UNSUPPORTED_TYPES = ['divider', 'groupContainer'] // 移除 subTable 系列；userPicker/deptPicker 不在列表则走默认 unsupported
const SUBTABLE_TYPES = ['group', 'tableForm']

// collectFields 中：
if (SUBTABLE_TYPES.includes(type)) {
  const children = collectSubFields(rule.children || [], props.existingColumns?.find(c => c.key === field)?.subColumns)
  out.push({
    key: field, label, columnType: '', length: null, scale: null,
    required: false, unique: false, indexed: false,
    subColumns: children, subMode: existing?.subMode ?? 'embedded',
    unsupported: children.length === 0, // 无子列时视为不可映射
  })
  continue
}
// subForm → JSON 列（与 upload 同）
if (type === 'subForm') { out.push({ key: field, label, columnType: 'JSON', length: null, scale: null, required: ..., unique: false, indexed: false }); continue }
```

- [ ] **Step 2: 模板增加子表展开行**

在列映射表格中，`subColumns` 非空的行显示展开按钮；展开后展示子列列表（复用现有列映射控件循环渲染）+ 传输方式 `<el-select>`（embedded/dedicated）。

- [ ] **Step 3: `handleConfirm` 适配嵌套**

```ts
const items = editableItems.value
  .filter(i => !i.unsupported && (i.columnType || (i.subColumns && i.subColumns.length > 0)))
  .map(({ existingType, unsupported, ...rest }) => rest)
// 子表字段保留 subColumns + subMode
```

- [ ] **Step 4: 前端构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功，无类型错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/form/components/ColumnConfigDialog.vue
git commit -m "feat(designer): ColumnConfigDialog 支持子表子列配置与传输方式选择"
```

---

### Task 8: 端到端验证与回归

**Files:**
- 无代码改动（手工验证）

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && mvn -q test`
Expected: 全绿

- [ ] **Step 2: 手工验证发布含 group 子表的 BUSINESS 表单**

在浏览器设计器配置子表字段（含子列映射）→ 发布 → 检查 `wf_biz_<key>` 与 `wf_biz_<key>_<field>` 建表成功。

- [ ] **Step 3: 手工验证 CRUD 往返**

POST 主表带子表行 → GET 内嵌返回（sort_no 升序）→ PUT 增量 diff（增/删/改）→ DELETE 级联清空子表。

- [ ] **Step 4: 手工验证 subMode=dedicated 与 subForm**

dedicated 表单走独立子表接口 CRUD；subForm 值落主表 JSON 列。

- [ ] **Step 5: 回归验证**

既有无子表 BUSINESS 表单发布/CRUD 不变；WORKFLOW 表单子表能力不受影响。

- [ ] **Step 6: 提交（如有调试期修复）**

```bash
git add -A
git commit -m "fix: 端到端验证期修复"
```

---

## Self-Review 记录

- **Spec 覆盖**：`business-form-subtable` 五个 Requirement（发布支持/子表结构/主表 CRUD 内嵌/独立接口/列配置结构）分别由 Task 4/2-3/5/6/1 覆盖；`business-form-data` delta（发布校验修正）由 Task 4 覆盖。✅
- **占位符扫描**：无 TBD；所有 Step 含具体代码或命令。✅
- **类型一致性**：`ColumnConfig.getSubColumns()`/`getSubMode()`、`ensureSubTable(formKey, field, subColumns)`、`SubTableDef(tableName, subMode, subColumns, subKeys)`、独立接口 4 方法签名跨 Task 一致。✅
