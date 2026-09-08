# 数据源字段元数据可编辑（探测获取 + 行内/详情编辑）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 SQL/API 数据源的「字段元数据」tab 从只读展示改造为可编辑：显性按钮探测数据库/接口取列、从主表单覆盖、行内编辑主要属性 + 详情表单编辑全部属性，单一来源持久化到数据源 params.columns。

**Architecture:** 后端新增两个「探测」端点（SQL 用 JdbcTemplate 执行 `LIMIT 1` 读 ResultSetMetaData；API 用 HttpLogicExecutor 拉样例推断 JSON 键），并让 `UnifiedDataSourceAdapter.metadata()` 的 SQL/API case 直接返回 params.columns（移除表单列默认合并）。前端把「字段元数据」tab 升级为可编辑表格 + 详情 dialog，编辑对象即 sqlConfig.declaredColumns / apiColumns（升级为全字段），保存时全字段序列化。

**Tech Stack:** Spring Boot 3 / JdbcTemplate / HttpLogicExecutor / Vue 3 `<script setup>` / Element Plus / Vitest / Mockito

## Global Constraints

- worktree：`.worktrees/form-join-sql-engine/`；后端 Maven 单模块，前端 Vite
- TDD（RED→GREEN→REFACTOR）；新增后端源文件后先 `mvn compile` 再依赖 devtools 热重启（见 learnings/maven-incremental-compile-misses-new-source-files.md）
- 后端测试：Mockito 纯单测（mock JdbcTemplate/HttpLogicExecutor）；Controller 测试直构 `new Controller(mockService)` + `R.ok(...)`/`result.getData()`
- 前端测试：Vitest；`vi.mock('@/api/data-source')` 补齐所有新增 api；`stubList()` 返回 `{ data: { content: [], totalElements: 0 } }`
- 不兼容老数据源（无回退/迁移逻辑）；执行引擎不改
- componentType 编辑本期仅文本显示（下拉来源后续设计）
- 中文回复/注释

---

### Task 1: 后端探测列元数据基础——`ColumnMeta` DTO + 探测执行器 `SqlMetadataProbe`

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/bizdata/SqlMetadataProbe.java`
- Create: `backend/src/main/java/com/workflow/api/dto/ColumnMeta.java`
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/SqlMetadataProbeTest.java`

**Interfaces:**
- Produces: `record ColumnMeta(String key, String label, String columnType, Integer length, Integer scale, boolean nullable)`（Jackson 序列化）
- Produces: `SqlMetadataProbe.probe(String sql): List<ColumnMeta>` —— 执行 `SELECT * FROM (<sql>) _probe LIMIT 1`，从 ResultSetMetaData 映射列；SQL 非 SELECT/非法 → `BusinessException(400, ...)`；模板含参数占位符 `:xxx` 时全部置 `null` 绑定（复用现有 SQL 引擎的参数占位符 `:tenantId`/`:param` 约定）

- [ ] **Step 1: 写 `ColumnMeta` DTO（无测试，纯数据载体）**

```java
package com.workflow.api.dto;

/** 探测结果列元数据（SQL 执行 / API 样例推断统一返回） */
public record ColumnMeta(String key, String label, String columnType,
                         Integer length, Integer scale, boolean nullable) {}
```

- [ ] **Step 2: 写失败测试 `SqlMetadataProbeTest`**

```java
package com.workflow.engine.form.bizdata;

import com.workflow.api.dto.ColumnMeta;
import com.workflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SqlMetadataProbeTest {

    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    private final SqlMetadataProbe probe = new SqlMetadataProbe(jdbcTemplate);

    @Test
    void probe_mapsResultSetMetaDataToColumns() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        ResultSetMetaData md = mock(ResultSetMetaData.class);
        when(md.getColumnCount()).thenReturn(2);
        when(md.getColumnLabel(1)).thenReturn("order_no");
        when(md.getColumnLabel(2)).thenReturn("amount");
        when(md.getColumnTypeName(1)).thenReturn("VARCHAR");
        when(md.getColumnTypeName(2)).thenReturn("DECIMAL");
        when(md.getPrecision(1)).thenReturn(64);
        when(md.getPrecision(2)).thenReturn(18);
        when(md.getScale(1)).thenReturn(0);
        when(md.getScale(2)).thenReturn(2);
        when(md.isNullable(1)).thenReturn(ResultSetMetaData.columnNullable);
        when(md.isNullable(2)).thenReturn(ResultSetMetaData.columnNoNulls);
        when(rs.getMetaData()).thenReturn(md);

        when(jdbcTemplate.query(any(org.springframework.jdbc.core.PreparedStatementCreator.class),
                any(org.springframework.jdbc.core.ResultSetExtractor.class)))
                .thenAnswer(inv -> {
                    org.springframework.jdbc.core.ResultSetExtractor<?> ext =
                            inv.getArgument(1);
                    return ext.extractData(rs);
                });

        List<ColumnMeta> cols = probe.probe("SELECT order_no, amount FROM wf_biz_order WHERE tenant_id = :tenantId");

        assertThat(cols).hasSize(2);
        assertThat(cols.get(0).key()).isEqualTo("order_no");
        assertThat(cols.get(0).columnType()).isEqualTo("VARCHAR");
        assertThat(cols.get(0).length()).isEqualTo(64);
        assertThat(cols.get(1).columnType()).isEqualTo("DECIMAL");
        assertThat(cols.get(1).length()).isEqualTo(18);
        assertThat(cols.get(1).scale()).isEqualTo(2);
        assertThat(cols.get(1).nullable()).isFalse();
    }

    @Test
    void probe_nonSelectSql_rejected() {
        assertThatThrownBy(() -> probe.probe("DELETE FROM wf_biz_order"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void probe_placeholderBoundToNull() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        ResultSetMetaData md = mock(ResultSetMetaData.class);
        when(md.getColumnCount()).thenReturn(1);
        when(md.getColumnLabel(1)).thenReturn("id");
        when(md.getColumnTypeName(1)).thenReturn("VARCHAR");
        when(md.getPrecision(1)).thenReturn(64);
        when(md.getScale(1)).thenReturn(0);
        when(rs.getMetaData()).thenReturn(md);

        when(jdbcTemplate.query(any(org.springframework.jdbc.core.PreparedStatementCreator.class),
                any(org.springframework.jdbc.core.ResultSetExtractor.class)))
                .thenAnswer(inv -> ((org.springframework.jdbc.core.ResultSetExtractor<?>) inv.getArgument(1)).extractData(rs));

        probe.probe("SELECT id FROM wf_biz_order WHERE created_at > :startTime");

        // 捕获传给 connection.prepareStatement 的最终 SQL：占位符已替换成 NULL，不再残留 :startTime，且已包 LIMIT 1
        java.sql.Connection conn = mock(java.sql.Connection.class);
        org.mockito.ArgumentCaptor<java.sql.PreparedStatementCreator> captor =
                org.mockito.ArgumentCaptor.forClass(org.springframework.jdbc.core.PreparedStatementCreator.class);
        org.mockito.Mockito.verify(jdbcTemplate).query(captor.capture(), any());
        captor.getValue().createPreparedStatement(conn);
        org.mockito.Mockito.verify(conn).prepareStatement(org.mockito.ArgumentMatchers.argThat(sql ->
                !sql.contains(":startTime") && sql.contains("LIMIT 1")));
    }
```

- [ ] **Step 3: 运行测试确认失败**

Run: `mvn test -Dtest=SqlMetadataProbeTest -Dsurefire.failIfNoSpecifiedTests=false`（在 backend 目录）
Expected: 编译失败（SqlMetadataProbe 不存在）

- [ ] **Step 4: 实现 `SqlMetadataProbe`**

```java
package com.workflow.engine.form.bizdata;

import com.workflow.api.dto.ColumnMeta;
import com.workflow.common.exception.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SQL 列元数据探测器：执行完整 SQL（LIMIT 1 包裹）并读取 ResultSetMetaData。
 * 仅接受 SELECT；模板中的 :placeholder 全部以 null 绑定（探测不依赖参数值）。
 * 只取列结构，不返回数据行。
 */
@Component
public class SqlMetadataProbe {

    private static final Pattern PLACEHOLDER = Pattern.compile(":[A-Za-z_][A-Za-z0-9_]*");

    private final JdbcTemplate jdbcTemplate;

    public SqlMetadataProbe(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ColumnMeta> probe(String sql) {
        if (sql == null || sql.isBlank()) {
            throw new BusinessException(400, "SQL 不能为空");
        }
        String trimmed = sql.trim();
        // 去掉末尾分号
        if (trimmed.endsWith(";")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        if (!trimmed.regionMatches(true, 0, "SELECT", 0, 6)) {
            throw new BusinessException(400, "仅支持 SELECT 查询");
        }
        if (trimmed.matches("(?is).*;(\\s*)(FROM|UPDATE|DELETE|INSERT|DROP|ALTER).*")) {
            throw new BusinessException(400, "仅支持单条 SELECT 查询");
        }
        String wrapped = "SELECT * FROM (" + trimmed + ") _probe LIMIT 1";
        // 参数占位符全部置 null，避免探测因缺参数值失败
        String bound = bindPlaceholdersNull(wrapped);
        String finalSql = bound;

        PreparedStatementCreator psc = (Connection conn) -> conn.prepareStatement(finalSql);
        ResultSetExtractor<List<ColumnMeta>> extractor = (ResultSet rs) -> {
            try {
                return mapColumns(rs.getMetaData());
            } catch (SQLException e) {
                throw new BusinessException(400, "读取列元数据失败: " + e.getMessage());
            }
        };
        return jdbcTemplate.query(psc, extractor);
    }

    private static String bindPlaceholdersNull(String sql) {
        Matcher m = PLACEHOLDER.matcher(sql);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            m.appendReplacement(sb, "NULL");
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private static List<ColumnMeta> mapColumns(ResultSetMetaData md) throws SQLException {
        List<ColumnMeta> out = new ArrayList<>();
        int count = md.getColumnCount();
        for (int i = 1; i <= count; i++) {
            String label = md.getColumnLabel(i);
            String jdbcType = md.getColumnTypeName(i);
            Integer length = md.getPrecision(i) == 0 ? null : md.getPrecision(i);
            int scale = md.getScale(i);
            boolean nullable = md.isNullable(i) != ResultSetMetaData.columnNoNulls;
            out.add(new ColumnMeta(label, label, normalizeType(jdbcType),
                    length, scale == 0 ? null : scale, nullable));
        }
        return out;
    }

    /** JDBC 类型名 → 业务列类型白名单 */
    private static String normalizeType(String typeName) {
        if (typeName == null) return "VARCHAR";
        return switch (typeName.toUpperCase()) {
            case "VARCHAR", "CHAR" -> "VARCHAR";
            case "LONGVARCHAR", "CLOB" -> "TEXT";
            case "LONGNVARCHAR", "NCLOB" -> "LONGTEXT";
            case "INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT" -> "INT";
            case "DECIMAL", "NUMERIC" -> "DECIMAL";
            case "DATE" -> "DATE";
            case "TIMESTAMP", "DATETIME" -> "DATETIME";
            case "BOOLEAN", "BIT" -> "TINYINT";
            default -> "VARCHAR";
        };
    }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `mvn test -Dtest=SqlMetadataProbeTest -Dsurefire.failIfNoSpecifiedTests=false`
Expected: PASS（3 个用例）

- [ ] **Step 6: 编译并确认类已进 target**

Run: `mvn compile`
Expected: BUILD SUCCESS；确认 `backend/target/classes/.../SqlMetadataProbe.class` 存在（防增量编译漏编新文件）

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata/SqlMetadataProbe.java backend/src/main/java/com/workflow/api/dto/ColumnMeta.java backend/src/test/java/com/workflow/engine/form/bizdata/SqlMetadataProbeTest.java
git commit -m "feat: SQL 列元数据探测器（SELECT+ResultSetMetaData）"
```

---

### Task 2: 后端 Controller 端点——`explore-sql` 与 `explore-api`

**Files:**
- Modify: `backend/src/main/java/com/workflow/api/controller/DataSourceController.java`（追加两个 `@PostMapping`）
- Test: `backend/src/test/java/com/workflow/api/controller/DataSourceControllerTest.java`（追加用例）或新建 `MetadataProbeControllerTest.java`

**Interfaces:**
- Consumes: `SqlMetadataProbe.probe(String): List<ColumnMeta>`（Task 1）
- Consumes: `HttpLogicExecutor.execute(String action, String method, Map<String,String> headers, List<ParamMapping> query, List<ParamMapping> body, Map<String,Object> vars, int ct, int rt, int retry): Object`（已存在）
- Produces: `POST /api/v1/data-sources/explore-sql` body `{sql}` → `R<List<ColumnMeta>>`
- Produces: `POST /api/v1/data-sources/explore-api` body `{action, method, headers?, data?}` → `R<List<ColumnMeta>>`

**决策**：`explore-api` 的入参由前端传「当前填写的 list 操作配置」，后端不依赖已保存数据源（与新建解耦）。

- [ ] **Step 1: 新建失败测试 `MetadataProbeControllerTest`**

```java
package com.workflow.api.controller;

import com.workflow.api.dto.ColumnMeta;
import com.workflow.common.domain.R;
import com.workflow.engine.form.bizdata.SqlMetadataProbe;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MetadataProbeControllerTest {

    private SqlMetadataProbe probe;
    private HttpLogicExecutor httpExecutor;
    private ObjectMapper objectMapper;
    private MetadataProbeController controller;

    @BeforeEach
    void setUp() {
        probe = mock(SqlMetadataProbe.class);
        httpExecutor = mock(HttpLogicExecutor.class);
        objectMapper = new ObjectMapper();
        controller = new MetadataProbeController(probe, httpExecutor, objectMapper);
    }

    @Test
    void exploreSql_delegatesAndWraps() {
        when(probe.probe("SELECT id FROM t")).thenReturn(List.of(new ColumnMeta("id", "id", "VARCHAR", 64, null, false)));
        R<List<ColumnMeta>> result = controller.exploreSql(Map.of("sql", "SELECT id FROM t"));
        assertThat(result.getData()).hasSize(1);
        assertThat(result.getData().get(0).key()).isEqualTo("id");
    }
}
```

**实现决策（固定）**：新建**独立** `MetadataProbeController`（`@RequestMapping("/api/v1/data-sources")`），不扩展既有 `DataSourceController`（避免破坏其既有构造与测试）。

- [ ] **Step 2: 运行确认失败**

Run: `mvn test -Dtest=MetadataProbeControllerTest -Dsurefire.failIfNoSpecifiedTests=false`
Expected: 编译失败（controller/方法不存在）

- [ ] **Step 3: 实现 `MetadataProbeController`**

```java
package com.workflow.api.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.ColumnMeta;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.bizdata.SqlMetadataProbe;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 数据源字段元数据探测端点（SQL 执行 / API 样例推断） */
@RestController
@RequestMapping("/api/v1/data-sources")
public class MetadataProbeController {

    private static final int TIMEOUT_MS = 10000;

    private final SqlMetadataProbe sqlProbe;
    private final HttpLogicExecutor httpExecutor;
    private final ObjectMapper objectMapper;

    public MetadataProbeController(SqlMetadataProbe sqlProbe, HttpLogicExecutor httpExecutor, ObjectMapper objectMapper) {
        this.sqlProbe = sqlProbe;
        this.httpExecutor = httpExecutor;
        this.objectMapper = objectMapper;
    }

    /** 执行完整 SQL，返回列元数据（LIMIT 1 包裹，不返回数据） */
    @PostMapping("/explore-sql")
    public R<List<ColumnMeta>> exploreSql(@RequestBody Map<String, String> body) {
        String sql = body == null ? null : body.get("sql");
        return R.ok(sqlProbe.probe(sql));
    }

    /** 调用 API list 操作拉样例，从返回 JSON 推断列 */
    @PostMapping("/explore-api")
    public R<List<ColumnMeta>> exploreApi(@RequestBody Map<String, Object> body) {
        if (body == null || body.get("action") == null) {
            throw new BusinessException(400, "缺少 action（list 操作地址）");
        }
        String action = String.valueOf(body.get("action"));
        String method = body.get("method") == null ? "GET" : String.valueOf(body.get("method"));
        Map<String, Object> vars = new java.util.HashMap<>();
        if (body.get("data") instanceof Map<?, ?> data) {
            for (Map.Entry<?, ?> e : data.entrySet()) vars.put(String.valueOf(e.getKey()), e.getValue());
        }
        vars.put("page", 1);
        vars.put("size", 1);
        Object raw = httpExecutor.execute(action, method, Map.of(), List.of(), List.of(),
                vars, TIMEOUT_MS, TIMEOUT_MS, 0);
        return R.ok(inferColumns(raw));
    }

    /** 从 HTTP 响应 JSON 推断列：定位第一个数组节点，取首元素对象字段推断类型 */
    private List<ColumnMeta> inferColumns(Object raw) {
        try {
            JsonNode root = raw instanceof String s ? objectMapper.readTree(s) : objectMapper.valueToTree(raw);
            JsonNode arr = findFirstArray(root);
            if (arr == null || arr.isEmpty()) {
                throw new BusinessException(400, "接口返回中未找到数组数据，无法推断字段");
            }
            JsonNode sample = arr.get(0);
            List<ColumnMeta> out = new ArrayList<>();
            if (sample.isObject()) {
                sample.fields().forEachRemaining(e -> out.add(new ColumnMeta(e.getKey(), e.getKey(),
                        inferType(e.getValue()), null, null, true)));
            }
            return out;
        } catch (BusinessException be) {
            throw be;
        } catch (Exception e) {
            throw new BusinessException(400, "接口返回解析失败: " + e.getMessage());
        }
    }

    private static JsonNode findFirstArray(JsonNode node) {
        if (node == null) return null;
        if (node.isArray()) return node;
        if (node.isObject()) {
            for (JsonNode child : node) {
                JsonNode hit = findFirstArray(child);
                if (hit != null) return hit;
            }
        }
        return null;
    }

    private static String inferType(JsonNode v) {
        if (v == null || v.isNull()) return "VARCHAR";
        if (v.isTextual()) return "VARCHAR";
        if (v.isIntegralNumber()) return "INT";
        if (v.isFloatingPointNumber()) return "DECIMAL";
        if (v.isBoolean()) return "TINYINT";
        if (v.isArray() || v.isObject()) return "JSON";
        return "VARCHAR";
    }
}
```

- [ ] **Step 4: 运行测试通过**

Run: `mvn test -Dtest=MetadataProbeControllerTest -Dsurefire.failIfNoSpecifiedTests=false`
Expected: PASS

- [ ] **Step 5: 全量后端测试回归 + 编译**

Run: `mvn test`
Expected: 972+（原 1 个 PageDefinitionPublishIntegrationTest 基线失败除外，无新失败）

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/workflow/api/controller/MetadataProbeController.java backend/src/test/java/com/workflow/api/controller/MetadataProbeControllerTest.java
git commit -m "feat: 数据源字段元数据探测端点（explore-sql/explore-api）"
```

---

### Task 3: 后端 `metadata()` 改造——SQL/API 直接返回 params.columns

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/datasource/UnifiedDataSourceAdapter.java`（SQL case L128-141、API case 移除子集逻辑）
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/FormQueryConfig.java`（`parseColumns` 支持全字段）
- Test: `backend/src/test/java/com/workflow/engine/datasource/UnifiedDataSourceAdapterTest.java`

**Interfaces:**
- Consumes: `FormQueryConfig.parse(String, ObjectMapper): FormQueryConfig`（已存在）
- Produces: SQL case metadata 返回 `params.columns`（解析为 ColumnConfig 全字段）；空 columns → 空列表
- Produces: `FormQueryConfig.parseColumns` 解析 key/label/columnType/length/scale/required/unique/indexed/hidden/componentType/sortable/filterable

- [ ] **Step 1: 更新 `FormQueryConfig.parseColumns` 支持全字段**

`FormQueryConfig.java` 的 `parseColumns`（L112-130）现仅解析 5 字段，扩展为全字段：

```java
private static List<ColumnConfig> parseColumns(JsonNode node) {
    List<ColumnConfig> out = new ArrayList<>();
    if (node == null || !node.isArray()) {
        return out;
    }
    for (JsonNode n : node) {
        if (n == null || !n.isObject()) {
            continue;
        }
        ColumnConfig c = new ColumnConfig();
        c.setKey(text(n, "key"));
        c.setLabel(text(n, "label"));
        c.setColumnType(text(n, "columnType"));
        c.setLength(intVal(n, "length"));
        c.setScale(intVal(n, "scale"));
        c.setRequired(bool(n, "required"));
        c.setUnique(bool(n, "unique"));
        c.setIndexed(bool(n, "indexed"));
        c.setHidden(bool(n, "hidden"));
        c.setComponentType(text(n, "componentType"));
        c.setSortable(nullableBool(n, "sortable"));
        c.setFilterable(nullableBool(n, "filterable"));
        out.add(c);
    }
    return out;
}
```

同时新增私有 helper（替换/扩展现有 `bool`，保留 `bool` 语义给 joins）：`nullableBool(node, field)` 返回 `Boolean`（null 当未声明），`intVal` 返回 `Integer`。注意 `bool` 现有实现 `v != null && v.isBoolean() && v.asBoolean()` —— `required`/`unique`/`indexed`/`hidden` 缺省应 false（保持非 null），`sortable`/`filterable` 缺省应 null（未推导）。因此 required 等用现有 `bool`（缺省 false），sortable/filterable 用新 `nullableBool`。

- [ ] **Step 2: 更新 `UnifiedDataSourceAdapter.metadata()` SQL case**

改 L128-141 为直接返回 params.columns：

```java
case "SQL" -> {
    FormQueryConfig cfg = FormQueryConfig.parse(ds.getParams(), objectMapper);
    List<ColumnConfig> cols = cfg.isConfigMode() ? List.of() : cfg.columns();
    boolean writable = ds.getFormKey() != null && !ds.getFormKey().isBlank();
    DataSourceMetadata m = new DataSourceMetadata(cols, writable);
    if (ds.getFormKey() != null && !ds.getFormKey().isBlank()) {
        m.setFormKey(ds.getFormKey());
    }
    yield m;
}
```

> 注意：`FormQueryConfig.parse` 在 queryMode=config 时返回空 columns（config 仅 FORM JOIN 模式用，SQL 数据源 queryMode 只有 visual/sql）。SQL 可视化模式与 SQL 模式均把字段元数据（探测/编辑结果）全字段写入 params.columns，`parse` 对 visual/sql 分支均返回 `cfg.columns()`，后端 metadata 因此直接返回前端编辑的同一份列定义。Task 5 前端负责在两种模式下都把探测/覆盖/行内编辑结果全字段序列化进 params.columns。

- [ ] **Step 3: API case 移除列定义子集逻辑**

现 API case（L122-127）`apiMetadata` 返回 columns 来自 params.columns —— 确认 `apiMetadata` 已解析全字段（若只 key/label/columnType 需补全字段解析），并保留 writable/formKey 透传。若 `apiMetadata` 用 objectMapper.convertValue(node, ColumnConfig.class)，则天然支持全字段，无需改。

- [ ] **Step 4: 追加/更新 `UnifiedDataSourceAdapterTest` 用例**

新增：
```java
@Test
void metadata_sql_returnsParamsColumnsDirectly() {
    DataSourceDefinition ds = new DataSourceDefinition();
    ds.setType("SQL");
    ds.setParams("""
        {"queryMode":"sql","query":"SELECT a,b FROM t WHERE tenant_id=:tenantId",
         "columns":[{"key":"a","label":"A","columnType":"VARCHAR","length":64,"required":true,"sortable":true}]}""");
    DataSourceMetadata meta = adapter.metadata(ds);
    assertThat(meta.getColumns()).hasSize(1);
    assertThat(meta.getColumns().get(0).getKey()).isEqualTo("a");
    assertThat(meta.getColumns().get(0).getLabel()).isEqualTo("A");
    assertThat(meta.getColumns().get(0).getLength()).isEqualTo(64);
    assertThat(meta.getColumns().get(0).isRequired()).isTrue();
}
```
（mock formDefService 不再被调用——verify no interaction 或按现有 setUp 调整）

- [ ] **Step 5: 运行测试**

Run: `mvn test -Dtest=UnifiedDataSourceAdapterTest,FormQueryConfigTest -Dsurefire.failIfNoSpecifiedTests=false`
Expected: PASS（新增用例 + 既有不回归）

- [ ] **Step 6: 全量后端回归**

Run: `mvn test`
Expected: 无新增失败

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata/FormQueryConfig.java backend/src/main/java/com/workflow/engine/datasource/UnifiedDataSourceAdapter.java backend/src/test/java/com/workflow/engine/datasource/UnifiedDataSourceAdapterTest.java
git commit -m "feat: SQL/API 数据源 metadata 直接返回 params.columns 全字段"
```

---

### Task 4: 前端 api 层——exploreSql/exploreApi + 类型

**Files:**
- Modify: `frontend/src/api/data-source.ts`

**Interfaces:**
- Consumes: 后端 `POST /api/v1/data-sources/explore-sql`、`POST /api/v1/data-sources/explore-api`
- Produces:
  - `export interface ColumnMeta { key: string; label: string; columnType: string; length?: number | null; scale?: number | null; nullable?: boolean }`
  - `exploreSql(sql: string): Promise<R<ColumnMeta[]>>`
  - `exploreApi(op: { action: string; method: string; data?: Record<string, unknown> }): Promise<R<ColumnMeta[]>>`

- [ ] **Step 1: 在 `data-source.ts` 追加类型与接口**

```ts
/** 探测结果列元数据（对齐后端 ColumnMeta） */
export interface ColumnMeta {
  key: string
  label: string
  columnType: string
  length?: number | null
  scale?: number | null
  nullable?: boolean
}
```

在 `dataSourceApi` 对象内（getDbSchemaColumns 之后）加：
```ts
/** 执行 SQL 探测列元数据（LIMIT 1，只取结构不返回数据） */
exploreSql(sql: string): Promise<R<ColumnMeta[]>> {
  return http.post('/v1/data-sources/explore-sql', { sql })
},

/** 调用 API list 操作拉样例推断列元数据 */
exploreApi(op: { action: string; method: string; data?: Record<string, unknown> }): Promise<R<ColumnMeta[]>> {
  return http.post('/v1/data-sources/explore-api', op)
},
```

- [ ] **Step 2: 确认 `http.post` 签名**

查 `frontend/src/utils/http.ts` 确认 `post<T>(url, data): Promise<R<T>>` 形态（与既有 createDataSource 用法一致即可，无需改动）。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/data-source.ts
git commit -m "feat: 前端 explore-sql/explore-api 接口"
```

---

### Task 5: 前端「字段元数据」tab 可编辑改造

**Files:**
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue`（模板「字段元数据」tab L331-363 + 相关 script）
- Modify: `frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts`
- (可选) Create: `frontend/src/views/dataSource/components/ColumnMetaDialog.vue` —— 详情编辑弹窗子组件（若组件已过长则抽离）

**Interfaces:**
- Consumes: Task 4 `dataSourceApi.exploreSql/exploreApi/ColumnMeta`；`formApi.getFormDefinitions`（既有）；`ColumnConfigItem`（既有，已含全字段）
- Consumes: 后端 getDbSchemaColumns（既有，探测主表/可视化列备选）
- Produces: `sqlConfig.declaredColumns` / `apiColumns` 全字段承载 + 保存全字段序列化

**布局目标（字段元数据 tab）：**

```
[可写/只读 tag] [列数 N]
[执行SQL获取字段]  (SQL 类型)
[从接口推断字段]  (API 类型)
[从主表单覆盖]    (formKey 非空时)
------------------------------------------
| 标识 key | 字段名 label | 组件 componentType | 必填 | 隐藏 | 排序 | 筛选 | 操作(详情/删除) |
（行内 input/checkbox + 每行「详情」按钮）
[添加列]
```

**详细步骤（每步含测试）**

- [ ] **Step 1: 抽离 `ColumnMetaDialog.vue`（详情编辑弹窗）**

子组件：props `{ modelValue: ColumnConfigItem | null }`，emit `save(updated)`/`close`。表单字段 = 全属性：
key(label 标识/input)、label(字段名/input)、columnType(el-select COLUMN_TYPES)、length(el-input-number，仅 columnType 为 VARCHAR)、scale(el-input-number，仅 DECIMAL)、required/unique/indexed/hidden/componentType/sortable/filterable（checkbox/switch）。componentType 仅文本框（本期文本显示）。

- [ ] **Step 2: 改「字段元数据」tab 模板为可编辑表格**

用 `el-table :data="metadataColumns"`（本地 ref），行内列：
- key → `el-input v-model="row.key"`
- label → `el-input v-model="row.label"`
- componentType → 纯文本 `{{ row.componentType || '—' }}`
- required/hidden/sortable/filterable → `el-checkbox v-model="row.required"` 等
- 操作列：`详情` 按钮（打开 dialog）+ 删除按钮（splice）

表格下方 `添加列` 按钮 → push 空行 `{ key:'', label:'', columnType:'VARCHAR', required:false, unique:false, indexed:false, hidden:false, sortable:true, filterable:true }`。

`metadataColumns` 计算属性绑定：SQL 类型 → `sqlConfig.declaredColumns`；API 类型 → `apiColumns`。用 `v-model` 行内直接编辑数组元素。

> 关键：**编辑对象是本地 sqlConfig.declaredColumns / apiColumns**（与「接口配置」保存的 params.columns 同一来源 A1）。「字段元数据」tab 的 `metadata`（后端 getMetadata 计算值）改造为只用于「数据预览」等其它消费；字段元数据 tab 改为本地列编辑。若现有 tab 用 `metadata.value.columns` 展示，改为本地数组并去掉对 getMetadata 的依赖（或保留 getMetadata 仅初始化一次）。实施时确认 sqlConfig.declaredColumns 在 openEdit 时已从 params.columns 回填（现有 L850/L921 已回填，但只 5 字段——Task 5 需全字段回填）。

- [ ] **Step 3: 工具栏按钮 handler**

```ts
async function handleExploreSql() {
  const sql = sqlConfig.queryMode === 'visual' ? generatePreviewSql() : sqlConfig.queryText
  if (!sql?.trim()) { ElMessage.warning('请先填写 SQL（可视化或 SQL 模式）'); return }
  const res = await dataSourceApi.exploreSql(sql)
  const cols = (res.data || []).map((c) => ({
    key: c.key, label: c.label, columnType: c.columnType,
    length: c.length ?? null, scale: c.scale ?? null,
    required: false, unique: false, indexed: false, hidden: false,
    sortable: true, filterable: true,
  } as ColumnConfigItem))
  sqlConfig.declaredColumns = cols
  ElMessage.success(`已获取 ${cols.length} 个字段`)
}

async function handleExploreApi() {
  const op = apiOps.list
  if (!op.action?.trim()) { ElMessage.warning('请先配置 list 操作地址'); return }
  const res = await dataSourceApi.exploreApi({ action: op.action, method: op.method, data: JSON.parse(form.data || '{}') })
  apiColumns.value = (res.data || []).map((c) => ({ /* 同 SQL 映射 */ } as ColumnConfigItem))
  ElMessage.success(...)
}

async function handleOverlayFromForm() {
  // 拉绑定表单已发布的 columnConfig（策略 C：key 命中 → 全属性覆盖；表单多余 key → 追加）
  if (!form.formKey) { ElMessage.warning('未绑定主表单，无法覆盖'); return }
  const res = await formApi.getFormDefinitionByKey(form.formKey)  // FormDefinitionDetailDTO：{ formKey, columnConfig: string|null }
  const cfg = (res.data as any)?.columnConfig
  let formCols: ColumnConfigItem[] = []
  if (typeof cfg === 'string' && cfg) {
    try { formCols = JSON.parse(cfg) as ColumnConfigItem[] } catch { formCols = [] }
  } else if (Array.isArray(cfg)) {
    formCols = cfg as ColumnConfigItem[]
  }
  if (formCols.length === 0) { ElMessage.warning('主表单无可用列定义'); return }
  overlayFromFormColumns(formCols)
  ElMessage.success(`已按主表单覆盖 ${formCols.length} 个字段`)
}
```

> 说明：`formApi.getFormDefinitionByKey` 在 `frontend/src/api/form.ts` 已存在（L77），返回 `R<FormDefinitionDetailDTO>`（`columnConfig: string | null` 为 JSON 字符串）。组件中 `form.formKey` 即 SQL/API 数据源绑定的表单 key。

- [ ] **Step 4: 覆盖策略 C 实现**

```ts
function overlayFromFormColumns(formCols: ColumnConfigItem[]) {
  const target = form.type === 'API' ? apiColumns : sqlConfig.declaredColumns
  const byKey = new Map(target.map((c) => [c.key, c]))
  for (const fc of formCols) {
    if (byKey.has(fc.key)) {
      // 命中：全属性覆盖（保留 key）
      Object.assign(byKey.get(fc.key)!, fc, { key: fc.key })
    } else {
      target.push({ ...fc })
      byKey.set(fc.key, target[target.length - 1])
    }
  }
}
```

- [ ] **Step 5: 保存全字段序列化**

改 `buildSqlParams`（L1021-1030）与 API 对应序列化，把 declaredColumns/apiColumns 全字段序列化写入 params.columns（不再是 5 字段裁剪）。API 在 buildApiParams 同改。

- [ ] **Step 6: 测试更新**

在 `DataSourceListPage.test.ts`：
- mock `dataSourceApi` 补 `exploreSql`/`exploreApi`
- stubList 或用例内 stub `exploreSql` 返回 `{ data: [{key:'id',label:'id',columnType:'VARCHAR',length:64}, ...] }`
- 新用例：
  1. 字段元数据 tab 行内编辑 key/label → 触发保存时 params.columns 带更新值
  2. 点「执行SQL获取字段」→ exploreSql 被调用 + declaredColumns 被替换
  3. 点「详情」→ dialog 打开 → 改 columnType/length → 保存 → 列表行更新
  4. 点「从主表单覆盖」→ 按 key 覆盖 + 追加新列
  5. 「添加列」→ 列表多一行

（既有受影响用例：若原「字段元数据」依赖 metadata 展示逻辑被改，更新相应断言）

- [ ] **Step 7: 前端全量测试 + 类型检查**

Run: `npx vitest run`
Expected: 全绿
Run: `npx vue-tsc --noEmit`
Expected: 39 error 基线（零新增）

- [ ] **Step 8: Commit**

```bash
git add frontend/src/views/dataSource/
git commit -m "feat: 数据源字段元数据 tab 可编辑（探测/覆盖/行内+详情）"
```

---

### Task 6: 移除 API 接口配置 tab 的列定义编辑器

**Files:**
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue`（模板「接口配置」column-editor 区 L210-272）
- Test: `frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts`

**目标**：API 类型「接口配置」tab 移除列定义表格（column-editor div，含 apiColumns 表格 + 添加列按钮），列定义统一在「字段元数据」tab。接口配置仅保留 URL/方法/操作配置。

- [ ] **Step 1: 移除 column-editor 模板区**

删除 L210-272 的 `<div class="column-editor">...</div>`（含 apiColumns el-table、addColumn 按钮），保留 API 操作配置表单（apiOps/params 等）。

- [ ] **Step 2: 清理相关 script**

移除不再引用的 `addColumn`、`apiColumns` 在 column-editor 的用法（apiColumns ref 保留——改由字段元数据 tab 编辑）。确认 COLUMN_TYPES 仍被字段元数据详情 dialog 使用。

- [ ] **Step 3: 更新受影响测试**

搜索 test 中引用「接口配置列定义表格」/addColumn/apiColumns 编辑的用例，改为断言 column-editor 已不存在、或改到字段元数据 tab 操作。

- [ ] **Step 4: 前端全量测试 + 类型检查**

Run: `npx vitest run` + `npx vue-tsc --noEmit`
Expected: 全绿 / 39 error 基线

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/dataSource/
git commit -m "refactor: API 列定义编辑收敛到字段元数据 tab，移除接口配置列编辑器"
```

---

### Task 7: 端到端浏览器验证

**Files:** 无代码改动（手工 E2E）

**验证点：**
1. 后端编译 + devtools 热重启生效（先 `mvn compile`）
2. 登录 → `/data-source/list` → 打开 SQL 数据源1 编辑 → 「字段元数据」tab
3. 点「执行SQL获取字段」→ 列表出现物理列（含 id/tenant_id/created_at 等），无 flyway 干扰
4. 行内改 label/必填 → 保存 → 重开确认持久化
5. 点某行「详情」→ dialog 改 columnType/length/scale → 保存 → 列表更新
6. （若绑定表单）点「从主表单覆盖」→ 匹配 key 的列 label 等变表单值、多出列追加
7. API 数据源：「从接口推断字段」→ 从 list 接口样例推断列
8. 「数据预览」tab 列头随编辑后的 columns 更新

- [ ] **Step 1: 后端编译 + 接口探测**

Run: `mvn compile`（backend）
浏览器 evaluate：`POST /api/v1/data-sources/explore-sql` body `{sql:"SELECT id,name FROM wf_biz_emp_profile LIMIT 5"}` → 200 返回列

- [ ] **Step 2: 前端逐项 E2E（浏览器点击 + 断言）**

按上述 8 项验证点逐一执行，截图/快照留存

---

### Task 8: 汇总验证 + 全量回归报告

**Files:** 无代码改动

- [ ] **Step 1: 全量后端测试**
Run: `mvn test`（backend）Expected: 无新增失败（PageDefinitionPublishIntegrationTest 基线失败除外）

- [ ] **Step 2: 全量前端测试 + 类型**
Run: `npx vitest run` Expected: 1041+（新增用例）全绿
Run: `npx vue-tsc --noEmit` Expected: 39 error 基线

- [ ] **Step 3: 更新 learnings（如有新坑）**

- [ ] **Step 4: 向用户交付验证报告**
