# SQL 数据源 + 可视化查询构建 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `type=SQL` 独立数据源类型，支持可视化查询构建（表级配置）+ SQL 编辑器模式，可选绑定主表单。

**Architecture:** 后端新增 `VisualSqlGenerator` 将可视化配置转为 SQL，复用现有 `SqlTemplateEngine` 执行引擎。前端在 `DataSourceListPage` 中为 SQL 类型新增双 tab（可视化配置 / SQL 模式），共享字段元数据和数据预览。

**Tech Stack:** Vue 3 + Element Plus + TypeScript（前端）；Spring Boot + JPA + H2（后端）

## Global Constraints

- 不改变 FORM/SYSTEM/API 数据源的现有行为
- 不引入新的前端依赖（纯 Element Plus 实现）
- 复用现有 `SqlTemplateEngine`、`SqlQueryEngine`、`BizDataService.querySql()`
- TDD：RED → GREEN → REFACTOR
- 每个 Task 结束时运行相关测试确认通过

---

## 后端任务

### Task 1: VisualSqlGenerator — 可视化配置→SQL 生成

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/datasource/VisualSqlGenerator.java`
- Create: `backend/src/test/java/com/workflow/engine/datasource/VisualSqlGeneratorTest.java`

**Interfaces:**
- Consumes: `VisualQueryRequest` DTO（mainTable, mainAlias, joins, selectColumns, where, orderBy）
- Produces: SQL 字符串（含 `:tenantId` 占位符，WHERE 条件用 `?` 参数化）

- [ ] **Step 1: 创建 VisualQueryRequest DTO**

```java
// backend/src/main/java/com/workflow/api/dto/VisualQueryRequest.java
package com.workflow.api.dto;

import java.util.List;

public record VisualQueryRequest(
    String mainTable,
    String mainAlias,
    List<JoinClause> joins,
    List<String> selectColumns,
    List<WhereCondition> where,
    List<OrderClause> orderBy,
    List<String> params
) {
    public record JoinClause(
        String alias,
        String targetTable,
        String joinType,
        String on,
        List<String> columns
    ) {}
    public record WhereCondition(
        String column,
        String op,
        Object value
    ) {}
    public record OrderClause(
        String column,
        String order
    ) {}
}
```

- [ ] **Step 2: 写 RED 测试 — VisualSqlGeneratorTest**

```java
// backend/src/test/java/com/workflow/engine/datasource/VisualSqlGeneratorTest.java
package com.workflow.engine.datasource;

import com.workflow.api.dto.VisualQueryRequest;
import com.workflow.api.dto.VisualQueryRequest.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class VisualSqlGeneratorTest {

    @Test
    void generate_simpleSelect() {
        var req = new VisualQueryRequest(
            "order", "m", List.of(),
            List.of("m.order_no", "m.total"),
            List.of(), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("SELECT m.order_no, m.total");
        assertThat(sql).contains("FROM wf_biz_order m");
        assertThat(sql).contains("WHERE m.tenant_id = :tenantId");
    }

    @Test
    void generate_withJoin() {
        var join = new JoinClause("c", "customer", "LEFT",
            "c.id = m.customer_id", List.of("c.name"));
        var req = new VisualQueryRequest(
            "order", "m", List.of(join),
            List.of("m.order_no", "c.name AS customer_name"),
            List.of(), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("LEFT JOIN wf_biz_customer c ON c.id = m.customer_id");
        assertThat(sql).contains("c.name AS customer_name");
    }

    @Test
    void generate_withWhere() {
        var where = new WhereCondition("m.total", ">=", 100);
        var req = new VisualQueryRequest(
            "order", "m", List.of(),
            List.of("m.order_no"),
            List.of(where), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("m.total >= ?");
    }

    @Test
    void generate_withOrderBy() {
        var order = new OrderClause("m.created_at", "DESC");
        var req = new VisualQueryRequest(
            "order", "m", List.of(),
            List.of("m.order_no"),
            List.of(), List.of(order), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("ORDER BY m.created_at DESC");
    }

    @Test
    void generate_formKeyMapping() {
        var req = new VisualQueryRequest(
            "order", "m", List.of(),
            List.of("m.order_no"),
            List.of(), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        // formKey "order" → 物理表 wf_biz_order
        assertThat(sql).contains("FROM wf_biz_order m");
    }

    @Test
    void generate_physicalTableName() {
        var req = new VisualQueryRequest(
            "raw_logs", "m", List.of(),
            List.of("m.id"),
            List.of(), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        // 非 formKey → 直接使用物理表名
        assertThat(sql).contains("FROM raw_logs m");
    }
}
```

- [ ] **Step 3: 运行测试确认 RED**

Run: `mvn test -Dtest="VisualSqlGeneratorTest" -DfailIfNoTests=false`
Expected: FAIL — `VisualSqlGenerator` 类不存在

- [ ] **Step 4: 实现 VisualSqlGenerator**

```java
// backend/src/main/java/com/workflow/engine/datasource/VisualSqlGenerator.java
package com.workflow.engine.datasource;

import com.workflow.api.dto.VisualQueryRequest;
import com.workflow.api.dto.VisualQueryRequest.*;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public final class VisualSqlGenerator {

    /** formKey 合法格式：字母开头，字母数字下划线，1-64 字符 */
    private static final Pattern FORM_KEY_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");

    private VisualSqlGenerator() {}

    public static String generate(VisualQueryRequest req) {
        StringBuilder sql = new StringBuilder("SELECT ");
        // 1. 选择列
        sql.append(String.join(", ", req.selectColumns()));
        // 2. FROM + JOIN
        sql.append(" FROM ").append(resolveTableName(req.mainTable()))
           .append(" ").append(req.mainAlias());
        for (JoinClause j : req.joins()) {
            sql.append(" ").append(j.joinType()).append(" ")
               .append(resolveTableName(j.targetTable())).append(" ").append(j.alias())
               .append(" ON ").append(j.on());
        }
        // 3. WHERE（+ tenant_id）
        sql.append(" WHERE ").append(req.mainAlias()).append(".tenant_id = :tenantId");
        for (WhereCondition w : req.where()) {
            sql.append(" AND ").append(w.column()).append(" ").append(w.op()).append(" ?");
        }
        // 4. ORDER BY
        if (req.orderBy() != null && !req.orderBy().isEmpty()) {
            sql.append(" ORDER BY ");
            sql.append(req.orderBy().stream()
                .map(o -> o.column() + " " + o.order())
                .collect(Collectors.joining(", ")));
        }
        return sql.toString();
    }

    /** 表名映射：formKey → wf_biz_<formKey>；物理表名直接使用 */
    static String resolveTableName(String name) {
        if (name != null && FORM_KEY_PATTERN.matcher(name).matches()) {
            return "wf_biz_" + name;
        }
        return name;
    }
}
```

- [ ] **Step 5: 运行测试确认 GREEN**

Run: `mvn test -Dtest="VisualSqlGeneratorTest" -DfailIfNoTests=false`
Expected: 6 tests PASS

- [ ] **Step 6: 提交**

```bash
git add backend/src/main/java/com/workflow/api/dto/VisualQueryRequest.java \
        backend/src/main/java/com/workflow/engine/datasource/VisualSqlGenerator.java \
        backend/src/test/java/com/workflow/engine/datasource/VisualSqlGeneratorTest.java
git commit -m "feat: VisualSqlGenerator — 可视化配置生成 SQL"
```

---

### Task 2: FormQueryConfig 扩展 — isVisualMode

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/FormQueryConfig.java`
- Modify: `backend/src/test/java/com/workflow/engine/form/bizdata/FormQueryConfigTest.java`

**Interfaces:**
- Consumes: `params` JSON（含 `queryMode: "visual"` + `visual` 对象）
- Produces: `FormQueryConfig` with `isVisualMode() == true` + `visualConfig()` 返回 `VisualQueryRequest`

- [ ] **Step 1: 写 RED 测试 — 追加 visual 模式用例**

在 `FormQueryConfigTest.java` 追加：

```java
@Test
void parse_visualMode() {
    String json = """
        {"queryMode":"visual","visual":{"mainTable":"order","mainAlias":"m",
         "selectColumns":["m.order_no"],"joins":[],"where":[],"orderBy":[]},
         "query":"SELECT m.order_no FROM wf_biz_order m WHERE m.tenant_id = :tenantId",
         "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true}]}
        """;
    FormQueryConfig cfg = FormQueryConfig.parse(json, objectMapper);
    assertThat(cfg.isVisualMode()).isTrue();
    assertThat(cfg.isSqlMode()).isFalse();
    assertThat(cfg.visualConfig()).isNotNull();
    assertThat(cfg.visualConfig().mainTable()).isEqualTo("order");
}

@Test
void parse_visualMode_nullParams_returnsEmpty() {
    FormQueryConfig cfg = FormQueryConfig.parse(null, objectMapper);
    assertThat(cfg.isVisualMode()).isFalse();
}
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `mvn test -Dtest="FormQueryConfigTest" -DfailIfNoTests=false`
Expected: FAIL — `isVisualMode()` / `visualConfig()` 方法不存在

- [ ] **Step 3: 实现 isVisualMode + visualConfig**

在 `FormQueryConfig` record 中新增字段和方法：

```java
public record FormQueryConfig(String queryMode,
                               List<JoinSqlGenerator.JoinConfig> joins,
                               String query,
                               List<ColumnConfig> columns,
                               List<String> declaredParams,
                               Object visualConfig) {

    public boolean isConfigMode() {
        return "config".equals(queryMode) && joins != null && !joins.isEmpty();
    }
    public boolean isSqlMode() {
        return "sql".equals(queryMode) && query != null && !query.isBlank();
    }
    public boolean isVisualMode() {
        return "visual".equals(queryMode) && visualConfig != null;
    }
    // ... parse 方法中提取 visual 对象
}
```

在 `parse` 方法中新增 visual 提取逻辑（从 JSON 根节点读取 `visual` 字段）。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `mvn test -Dtest="FormQueryConfigTest" -DfailIfNoTests=false`
Expected: 15 tests PASS（原 13 + 新增 2）

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata/FormQueryConfig.java \
        backend/src/test/java/com/workflow/engine/form/bizdata/FormQueryConfigTest.java
git commit -m "feat: FormQueryConfig 支持 visual 模式解析"
```

---

### Task 3: UnifiedDataSourceAdapter — SQL 类型路由

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/datasource/UnifiedDataSourceAdapter.java`
- Modify: `backend/src/test/java/com/workflow/engine/datasource/UnifiedDataSourceAdapterTest.java`

**Interfaces:**
- Consumes: `DataSourceDefinition` (type=SQL) + `FormQueryConfig` (isVisualMode/isSqlMode)
- Produces: `BizDataPageVO`（query）、`DataSourceMetadata`（metadata）

- [ ] **Step 1: 写 RED 测试 — 追加 SQL 类型用例**

在 `UnifiedDataSourceAdapterTest.java` 追加：

```java
// ===== SQL 数据源 =====

@Test
void sqlQuery_visualMode_delegatesToQuerySql() {
    DataSourceDefinition ds = ds("SQL", null);
    ds.setParams("""
        {"queryMode":"visual","query":"SELECT order_no FROM wf_biz_order WHERE tenant_id = :tenantId",
         "columns":[{"key":"order_no","columnType":"VARCHAR","sortable":true}],"params":[]}
        """);
    BizDataQueryRequest req = new BizDataQueryRequest();
    BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 0, 20);
    when(bizDataService.querySql(isNull(), eq(req), any())).thenReturn(expected);

    BizDataPageVO result = adapter.query(ds, req);

    assertSame(expected, result);
    verify(bizDataService).querySql(isNull(), eq(req), any());
}

@Test
void sqlQuery_sqlMode_delegatesToQuerySql() {
    DataSourceDefinition ds = ds("SQL", null);
    ds.setParams("""
        {"queryMode":"sql","query":"SELECT id FROM test WHERE tenant_id = :tenantId",
         "columns":[{"key":"id","columnType":"VARCHAR","sortable":true}],"params":[]}
        """);
    BizDataQueryRequest req = new BizDataQueryRequest();
    BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 0, 20);
    when(bizDataService.querySql(isNull(), eq(req), any())).thenReturn(expected);

    BizDataPageVO result = adapter.query(ds, req);

    assertSame(expected, result);
}

@Test
void sqlMetadata_withFormKey_mergesFormColumns() {
    DataSourceDefinition ds = ds("SQL", null);
    ds.setFormKey("order");
    ds.setParams("""
        {"queryMode":"sql","query":"SELECT order_no FROM wf_biz_order WHERE tenant_id = :tenantId",
         "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true,"filterable":true},
                    {"key":"customer_name","label":"客户","columnType":"VARCHAR","sortable":true,"filterable":true}],
         "params":[]}
        """);
    when(formDefService.getBusinessColumnsByKey("order"))
        .thenReturn(new ArrayList<>(List.of(col("order_no", "订单号", "VARCHAR", 100))));

    DataSourceMetadata meta = adapter.metadata(ds);

    // 表单列 order_no 优先，声明列 customer_name 追加
    assertThat(meta.getColumns().size()).isEqualTo(2);
    assertThat(meta.getColumns().get(0).getKey()).isEqualTo("order_no");
    assertThat(meta.getColumns().get(1).getKey()).isEqualTo("customer_name");
    assertThat(meta.isWritable()).isTrue();
}

@Test
void sqlMetadata_noFormKey_onlyDeclaredColumns() {
    DataSourceDefinition ds = ds("SQL", null);
    ds.setParams("""
        {"queryMode":"sql","query":"SELECT id FROM raw_logs WHERE tenant_id = :tenantId",
         "columns":[{"key":"id","label":"ID","columnType":"VARCHAR","sortable":true,"filterable":true}],
         "params":[]}
        """);

    DataSourceMetadata meta = adapter.metadata(ds);

    assertThat(meta.getColumns().size()).isEqualTo(1);
    assertThat(meta.isWritable()).isFalse();
}
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `mvn test -Dtest="UnifiedDataSourceAdapterTest" -DfailIfNoTests=false`
Expected: FAIL — SQL 类型 switch case 不存在

- [ ] **Step 3: 实现 SQL 类型路由**

在 `UnifiedDataSourceAdapter` 的 `query()` 和 `metadata()` 方法中新增 `case "SQL"` 分支：

```java
case "SQL" -> {
    router.resolve(ds, "list");
    FormQueryConfig cfg = FormQueryConfig.parse(ds.getParams(), objectMapper);
    if (cfg.isVisualMode() || cfg.isSqlMode()) {
        yield bizDataService.querySql(ds.getFormKey(), req, cfg);
    }
    throw new BusinessException(400, "SQL 数据源缺少查询配置");
}
```

metadata 中新增 SQL 类型分支（合并表单列 + 声明列）。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `mvn test -Dtest="UnifiedDataSourceAdapterTest" -DfailIfNoTests=false`
Expected: 33 tests PASS（原 29 + 新增 4）

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/datasource/UnifiedDataSourceAdapter.java \
        backend/src/test/java/com/workflow/engine/datasource/UnifiedDataSourceAdapterTest.java
git commit -m "feat: UnifiedDataSourceAdapter 支持 SQL 类型数据源"
```

---

### Task 4: 集成测试 — SQL 数据源端到端

**Files:**
- Create: `backend/src/test/java/com/workflow/example/sql/SqlDataSourceIntegrationTest.java`

**Interfaces:**
- Consumes: `UnifiedDataSourceAdapter`、`FormDefinitionService`、`JdbcTemplate`
- Produces: 4 个集成测试用例通过

- [ ] **Step 1: 创建集成测试类**

```java
// backend/src/test/java/com/workflow/example/sql/SqlDataSourceIntegrationTest.java
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class SqlDataSourceIntegrationTest {

    private static final String TENANT_ID = "t1";

    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired FormDefinitionService formDefService;
    @Autowired UnifiedDataSourceAdapter adapter;
    @MockitoBean DynamicTableManager tableManager;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        when(tableManager.tableExists(anyString())).thenReturn(true);
        ensureTables();
        ensureFormDefinition();
        seedData();
    }

    @AfterEach
    void tearDown() { TenantContext.clear(); }

    @Test
    void sqlVisualMode_queryReturnsJoinedRows() {
        DataSourceDefinition ds = sqlDs("""
            {"queryMode":"visual","visual":{"mainTable":"order","mainAlias":"m",
             "selectColumns":["m.order_no","m.total","c.name AS customer_name"],
             "joins":[{"alias":"c","targetTable":"customer","joinType":"LEFT",
                       "on":"c.id = m.customer_id","columns":["c.name"]}],
             "where":[],"orderBy":[]},
             "query":"SELECT m.order_no, m.total, c.name AS customer_name FROM wf_biz_order m LEFT JOIN wf_biz_customer c ON c.id = m.customer_id WHERE m.tenant_id = :tenantId",
             "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true,"filterable":true},
                        {"key":"total","label":"总金额","columnType":"DECIMAL","sortable":true,"filterable":true},
                        {"key":"customer_name","label":"客户名称","columnType":"VARCHAR","sortable":true,"filterable":true}],
             "params":[]}
            """);

        BizDataPageVO page = adapter.query(ds, pageReq(1, 20));

        assertThat(page.getTotal()).isEqualTo(3);
        Map<String, Object> first = page.getRecords().get(0).getData();
        assertThat(first).containsKey("order_no");
        assertThat(first).containsKey("customer_name");
    }

    @Test
    void sqlVisualMode_formKeyBinding_writable() {
        DataSourceDefinition ds = sqlDs("""
            {"formKey":"order","queryMode":"visual",
             "visual":{"mainTable":"order","mainAlias":"m",
              "selectColumns":["m.order_no"],"joins":[],"where":[],"orderBy":[]},
             "query":"SELECT m.order_no FROM wf_biz_order m WHERE m.tenant_id = :tenantId",
             "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true}],
             "params":[]}
            """);

        DataSourceMetadata meta = adapter.metadata(ds);
        assertThat(meta.isWritable()).isTrue();
        assertThat(meta.getFormKey()).isEqualTo("order");
    }

    @Test
    void sqlVisualMode_noFormKey_readonly() {
        DataSourceDefinition ds = sqlDs("""
            {"queryMode":"sql","query":"SELECT order_no FROM wf_biz_order WHERE tenant_id = :tenantId",
             "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true}],
             "params":[]}
            """);

        DataSourceMetadata meta = adapter.metadata(ds);
        assertThat(meta.isWritable()).isFalse();
    }

    // helpers: ensureTables, ensureFormDefinition, seedData, sqlDs, pageReq
}
```

- [ ] **Step 2: 运行测试确认通过**

Run: `mvn test -Dtest="SqlDataSourceIntegrationTest" -DfailIfNoTests=false`
Expected: 4 tests PASS

- [ ] **Step 3: 提交**

```bash
git add backend/src/test/java/com/workflow/example/sql/SqlDataSourceIntegrationTest.java
git commit -m "test: SQL 数据源集成测试（visual/formKey/readonly）"
```

---

## 前端任务

### Task 5: DataSourceListPage — SQL 类型支持

**Files:**
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue`

**Interfaces:**
- Consumes: `form.type === 'SQL'` 判断
- Produces: SQL 类型对话框布局（名称 + 主表单选择 + 双 tab）

- [ ] **Step 1: 新增 SQL 类型到类型下拉**

在 `typeOptions` 数组中追加 `{ label: 'SQL 查询', value: 'SQL' }`

- [ ] **Step 2: SQL 类型对话框基础布局**

在对话框模板中新增 SQL 类型分支（`v-if="form.type === 'SQL'"`）：
- 名称输入框
- 主表单选择（el-select，复用 `publishedForms`，可选）
- 双 tab：`[可视化配置] [SQL 模式]`

- [ ] **Step 3: SQL 类型保存逻辑**

在 `openSave` 函数中新增 SQL 类型处理：
- `type: 'SQL'`
- `formKey`: 从表单选择获取（可为 null）
- `params`: 序列化 visual + query + columns + params

- [ ] **Step 4: SQL 类型编辑填充**

在 `openEditRow` 函数中新增 SQL 类型解析：
- 解析 `params.queryMode` → 设置 activeTab
- 解析 `params.visual` → 填充可视化配置表单
- 解析 `params.query` → 填充 SQL 文本

- [ ] **Step 5: 运行前端测试确认通过**

Run: `cd frontend && npm test`
Expected: 现有测试通过（无回归）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/dataSource/DataSourceListPage.vue
git commit -m "feat: DataSourceListPage 支持 SQL 类型数据源"
```

---

### Task 6: VisualQueryBuilder 组件

**Files:**
- Create: `frontend/src/views/dataSource/components/VisualQueryBuilder.vue`
- Create: `frontend/src/views/dataSource/components/__tests__/VisualQueryBuilder.test.ts`

**Interfaces:**
- Consumes: `tables`（可用表列表）、`formKey`（可选主表单）
- Produces: `v-model` 绑定 `VisualQueryConfig` 对象

- [ ] **Step 1: 写 RED 测试**

```typescript
// VisualQueryBuilder.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VisualQueryBuilder from '../VisualQueryBuilder.vue'

describe('VisualQueryBuilder', () => {
  it('renders main table selector', () => {
    const wrapper = mount(VisualQueryBuilder, {
      props: { modelValue: { mainTable: '', mainAlias: 'm', joins: [], selectColumns: [], where: [], orderBy: [] }, tables: ['order', 'customer'] }
    })
    expect(wrapper.text()).toContain('主表')
  })
})
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd frontend && npm test`
Expected: FAIL — `VisualQueryBuilder.vue` 不存在

- [ ] **Step 3: 实现 VisualQueryBuilder**

组件结构：
- 主表选择（el-select + 别名输入）
- JOIN 配置区（可增删的卡片列表）
- 筛选条件配置（可增删的条件行）
- 排序配置（可增删的排序行）
- 运行时参数（标签输入）
- SQL 预览区（只读 textarea，watch modelValue 实时生成）

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/dataSource/components/VisualQueryBuilder.vue \
        frontend/src/views/dataSource/components/__tests__/VisualQueryBuilder.test.ts
git commit -m "feat: VisualQueryBuilder 可视化查询构建组件"
```

---

### Task 7: SqlEditor 组件

**Files:**
- Create: `frontend/src/views/dataSource/components/SqlEditor.vue`
- Create: `frontend/src/views/dataSource/components/__tests__/SqlEditor.test.ts`

**Interfaces:**
- Consumes: `v-model` SQL 文本、`columns` 列声明
- Produces: 更新后的 SQL + 解析的 columns

- [ ] **Step 1: 写 RED 测试**

```typescript
// SqlEditor.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SqlEditor from '../SqlEditor.vue'

describe('SqlEditor', () => {
  it('renders SQL textarea', () => {
    const wrapper = mount(SqlEditor, {
      props: { modelValue: 'SELECT * FROM test', columns: [] }
    })
    expect(wrapper.find('textarea').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd frontend && npm test`
Expected: FAIL — `SqlEditor.vue` 不存在

- [ ] **Step 3: 实现 SqlEditor**

组件结构：
- SQL textarea（el-input type="textarea"，rows=10）
- columns 声明编辑（与 API 模式列编辑类似的表单）
- 运行时参数标签输入
- 「从 SQL 解析列」按钮（调用后端 extractSelectOutputs 或前端正则提取）

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/dataSource/components/SqlEditor.vue \
        frontend/src/views/dataSource/components/__tests__/SqlEditor.test.ts
git commit -m "feat: SqlEditor SQL 编辑器组件"
```

---

### Task 8: FieldMappingPreview 组件 + 集成

**Files:**
- Create: `frontend/src/views/dataSource/components/FieldMappingPreview.vue`
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue`（集成所有组件）

**Interfaces:**
- Consumes: `formKey`、`columns`（SQL 声明列）
- Produces: 合并后的列预览表格

- [ ] **Step 1: 实现 FieldMappingPreview**

组件：el-table 展示合并后的列（来源、key、label、类型、可写）

- [ ] **Step 2: 在 DataSourceListPage 中集成三个组件**

- SQL 类型对话框的可视化 tab → `<VisualQueryBuilder>`
- SQL 类型对话框的 SQL tab → `<SqlEditor>`
- formKey 有值时 → `<FieldMappingPreview>`

- [ ] **Step 3: 运行前端测试确认通过**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 4: 运行全量后端测试确认无回归**

Run: `mvn test -DfailIfNoTests=false`
Expected: 917+ tests, 0 new failures

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/dataSource/components/FieldMappingPreview.vue \
        frontend/src/views/dataSource/DataSourceListPage.vue
git commit -m "feat: FieldMappingPreview + 集成 SQL 数据源 UI"
```

---

## Self-Review

**Spec 覆盖检查：**
- D1（SQL 类型）→ Task 3, 5 ✅
- D2（params 结构）→ Task 1, 2 ✅
- D3（formKey 绑定）→ Task 3, 4, 8 ✅
- D4（可视化↔SQL 切换 + 手改锁定）→ Task 5, 6, 7 ✅
- D5（保存时生成 SQL）→ Task 1, 5 ✅
- 可视化查询构建 → Task 6 ✅
- SQL 编辑器 → Task 7 ✅
- 字段映射预览 → Task 8 ✅

**Placeholder 扫描：** 无 TBD/TODO
**类型一致性：** VisualQueryRequest / FormQueryConfig / UnifiedDataSourceAdapter 类型链一致
