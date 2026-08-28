# datasource-field-sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 数据源 metadata 声明字段排序能力，前端列表页（VIEW/PAGE/BizDataList）获得端到端服务器端排序，WORKFLOW 数据源补齐动态排序。

**Architecture:** 排序能力由后端按列类型推导（SortableResolver）并随 metadata 下发；WORKFLOW 查询支持 sort/order 白名单 + 动态 ORDER BY（JSON_EXTRACT + 数值 CAST）；前端 SearchTable 内部维护排序状态并携带参数重新请求；视图设计器移除排序开关。

**Tech Stack:** Java 17 / Spring Boot / JPA + JdbcTemplate / MySQL（JSON_EXTRACT）；Vue 3 / Element Plus / Vitest / TypeScript。

## Global Constraints

- 后端排序字段 MUST 白名单校验（非法 400），order 仅接受 `asc`/`desc`
- WORKFLOW 数值列排序 MUST `CAST AS SIGNED/DECIMAL`（避免 JSON 字符串字典序）
- WORKFLOW 缺省排序 MUST 保持 `COALESCE(h.START_TIME_, f.created_at) DESC`
- 前端 SearchTable 排序 SHALL 保留翻页/搜索，重置清空；`sort-change` 事件 MUST 仍转发
- 视图设计器 SHALL NOT 提供排序开关；旧 schema 残留 `sortable` 被忽略（不迁移不报错）
- 测试命令：后端 `mvn test`（workdir `backend/`）；前端 `npm test`（workdir `frontend/`）
- 变更范围：`backend/src/main/java/com/workflow/engine/`、`frontend/src/`

---

### Task 1: ColumnConfig 增加 sortable 字段

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/column/ColumnConfig.java`

**Interfaces:**
- Produces: `ColumnConfig.sortable`（`Boolean`，getter/setter），后续 Task 2/3/4 依赖

- [ ] **Step 1: 加字段与访问器**

在 `ColumnConfig.java` 中（现有字段 `componentType` 与 `subColumns` 之间）添加：

```java
/** 是否可排序（缺省 null=未推导，由 SortableResolver 填充） */
private Boolean sortable;

public Boolean getSortable() { return sortable; }
public void setSortable(Boolean sortable) { this.sortable = sortable; }
```

- [ ] **Step 2: 编译验证**

Run: `mvn -q compile`（workdir `backend/`）
Expected: BUILD SUCCESS，无新告警

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/form/column/ColumnConfig.java
git commit -m "feat: add sortable field to ColumnConfig"
```

---

### Task 2: 新增 SortableResolver 推导工具

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/datasource/SortableResolver.java`
- Test: `backend/src/test/java/com/workflow/engine/datasource/SortableResolverTest.java`

**Interfaces:**
- Produces: `SortableResolver.resolve(List<ColumnConfig>)`、`SortableResolver.isSortable(ColumnConfig)`
- Consumes: `ColumnConfig`（Task 1）

- [ ] **Step 1: 写失败测试**

`SortableResolverTest.java`：

```java
package com.workflow.engine.datasource;

import com.workflow.engine.form.column.ColumnConfig;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SortableResolverTest {

    private ColumnConfig col(String key, String type, String component) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType(type);
        c.setComponentType(component);
        return c;
    }

    @Test
    void jsonTextAndColorPickerAreNotSortable() {
        assertThat(SortableResolver.isSortable(col("a", "JSON", null))).isFalse();
        assertThat(SortableResolver.isSortable(col("b", "TEXT", null))).isFalse();
        assertThat(SortableResolver.isSortable(col("c", "VARCHAR", "colorPicker"))).isFalse();
    }

    @Test
    void subTableColumnIsNotSortable() {
        ColumnConfig c = col("sub", "JSON", null);
        c.setSubColumns(List.of(col("x", "VARCHAR", null)));
        assertThat(SortableResolver.isSortable(c)).isFalse();
    }

    @Test
    void numericDateAndShortTextAreSortable() {
        assertThat(SortableResolver.isSortable(col("n", "INTEGER", null))).isTrue();
        assertThat(SortableResolver.isSortable(col("d", "DATETIME", null))).isTrue();
        assertThat(SortableResolver.isSortable(col("s", "VARCHAR", null))).isTrue();
    }

    @Test
    void resolveFillsOnlyUnsetColumns() {
        ColumnConfig set = col("x", "VARCHAR", null);
        set.setSortable(false);
        List<ColumnConfig> list = List.of(set, col("y", "INTEGER", null));
        SortableResolver.resolve(list);
        assertThat(list.get(0).getSortable()).isFalse();   // 已显式标注不覆盖
        assertThat(list.get(1).getSortable()).isTrue();    // 未标注按类型推导
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `mvn test -Dtest=SortableResolverTest`（workdir `backend/`）
Expected: FAIL（`SortableResolver` 不存在，编译错误）

- [ ] **Step 3: 实现 SortableResolver**

`SortableResolver.java`：

```java
package com.workflow.engine.datasource;

import com.workflow.engine.form.column.ColumnConfig;

import java.util.List;
import java.util.Set;

/**
 * 字段排序能力推导：按列类型判定该列是否可参与服务器端排序。
 * 规则：JSON/TEXT/colorPicker/含子表 → 不可排；数值/日期/短文本/VARCHAR → 可排。
 */
public final class SortableResolver {

    private static final Set<String> UNSORTABLE_TYPES = Set.of("JSON", "TEXT");
    private static final Set<String> UNSORTABLE_COMPONENTS = Set.of("colorPicker");

    private SortableResolver() {}

    /** 就地填充未标注列的 sortable（已显式标注的列不覆盖）。 */
    public static void resolve(List<ColumnConfig> columns) {
        if (columns == null) {
            return;
        }
        for (ColumnConfig c : columns) {
            if (c.getSortable() == null) {
                c.setSortable(isSortable(c));
            }
        }
    }

    public static boolean isSortable(ColumnConfig c) {
        if (c.getSubColumns() != null && !c.getSubColumns().isEmpty()) {
            return false;
        }
        String type = c.getColumnType();
        if (type != null && UNSORTABLE_TYPES.contains(type.toUpperCase())) {
            return false;
        }
        String comp = c.getComponentType();
        return comp == null || !UNSORTABLE_COMPONENTS.contains(comp);
    }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `mvn test -Dtest=SortableResolverTest`（workdir `backend/`）
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/datasource/SortableResolver.java backend/src/test/java/com/workflow/engine/datasource/SortableResolverTest.java
git commit -m "feat: add SortableResolver for field sortability derivation"
```

---

### Task 3: metadata 填充 sortable（FORM/WORKFLOW/SYSTEM/API）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/datasource/UnifiedDataSourceAdapter.java`（metadata 方法 ~line 88-101）
- Modify: `backend/src/main/java/com/workflow/engine/datasource/WorkflowFormDataQueryService.java`（systemColumns ~line 86-93）

**Interfaces:**
- Consumes: `SortableResolver`（Task 2）、`ColumnConfig.sortable`
- Produces: metadata 各列 `sortable` 已填充；WORKFLOW 系统列显式标注（startTime=true，派生列=false）

- [ ] **Step 1: 写失败测试（metadata 含 sortable）**

在 `UnifiedDataSourceAdapterTest.java` 中新增（沿用既有 setup）：

```java
@Test
void formMetadataDeclaresSortableByColumnType() {
    // WHEN 请求 FORM 数据源 metadata
    DataSourceMetadata meta = adapter.metadata(formDataSource());
    // THEN 数值/日期/短文本列 sortable=true，JSON/TEXT/子表列 sortable=false
    assertThat(meta.columns()).anyMatch(c -> Boolean.TRUE.equals(c.getSortable()));
    assertThat(meta.columns())
            .filteredOn(c -> "JSON".equals(c.getColumnType()))
            .allMatch(c -> Boolean.FALSE.equals(c.getSortable()));
}
```

（若测试基建与既有用例差异较大，改为在实现后用手工 curl 验证并依赖 SortableResolverTest 覆盖推导逻辑。）

- [ ] **Step 2: 实现 metadata 填充**

`UnifiedDataSourceAdapter.metadata` 的 FORM/WORKFLOW 分支改为：

```java
case "FORM" -> {
    List<ColumnConfig> cols = formDefService.getBusinessColumnsByKey(ds.getFormKey());
    SortableResolver.resolve(cols);
    yield new DataSourceMetadata(cols, true);
}
case "WORKFLOW" -> {
    List<ColumnConfig> cols = workflowQueryService.columnsFor(ds.getFormKey());
    SortableResolver.resolve(cols);
    yield new DataSourceMetadata(cols, false);
}
```

SYSTEM/API 分支：在构造 metadata 前对常量列**副本**标记不可排，避免污染共享常量：

```java
case "SYSTEM" -> {
    List<ColumnConfig> cols = "user-tree".equals(ds.getSourceKey())
            ? copyWithSortableFalse(USER_COLUMNS) : copyWithSortableFalse(DEPT_COLUMNS);
    yield new DataSourceMetadata(cols, false);
}
case "API" -> {
    DataSourceMetadata m = apiMetadata(ds);
    yield new DataSourceMetadata(copyWithSortableFalse(m.columns()), m.writable());
}
```

新增私有 helper（文件内）：

```java
private List<ColumnConfig> copyWithSortableFalse(List<ColumnConfig> src) {
    List<ColumnConfig> out = new ArrayList<>();
    if (src != null) {
        for (ColumnConfig c : src) {
            ColumnConfig copy = new ColumnConfig();
            copy.setKey(c.getKey());
            copy.setLabel(c.getLabel());
            copy.setColumnType(c.getColumnType());
            copy.setSortable(false);
            out.add(copy);
        }
    }
    return out;
}
```

`WorkflowFormDataQueryService.systemColumns()` 显式标注（`startTime` 可排、其余派生列不可排）：

```java
public static List<ColumnConfig> systemColumns() {
    ColumnConfig startTime = col("startTime", "发起时间", "DATETIME");
    startTime.setSortable(true);
    return List.of(
            col("instanceId", "流程实例ID"),
            col("processStatus", "流程状态"),
            col("initiatorName", "发起人"),
            startTime,
            col("currentNodeName", "当前节点"));
}
```

注意：`col(...)` 返回的派生列保持 `sortable=null`，由 Task 2 的 `resolve` 推导——但派生列是 VARCHAR 会被推为可排，**必须在 resolve 之后强制覆盖**。将 `metadata` 的 WORKFLOW 分支改为显式回写：

```java
case "WORKFLOW" -> {
    List<ColumnConfig> cols = workflowQueryService.columnsFor(ds.getFormKey());
    SortableResolver.resolve(cols);
    // 派生系统列强制不可排（sortable 优先级：显式 false > 类型推导）
    for (ColumnConfig c : cols) {
        if (c.getKey() != null && DERIVED_SYSTEM_KEYS.contains(c.getKey())) {
            c.setSortable(false);
        }
    }
    yield new DataSourceMetadata(cols, false);
}
```

其中 `DERIVED_SYSTEM_KEYS = Set.of("instanceId", "processStatus", "initiatorName", "currentNodeName")` 为类内常量。

- [ ] **Step 3: 编译 + 运行相关测试**

Run: `mvn test -Dtest=SortableResolverTest,UnifiedDataSourceAdapterTest`（workdir `backend/`）
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/datasource/UnifiedDataSourceAdapter.java backend/src/main/java/com/workflow/engine/datasource/WorkflowFormDataQueryService.java
git commit -m "feat: declare field sortability in datasource metadata"
```

---

### Task 4: WORKFLOW 数据源动态排序

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/datasource/WorkflowFormDataQueryService.java`（query ~line 104-145）
- Test: `backend/src/test/java/com/workflow/engine/datasource/WorkflowFormDataQueryServiceTest.java`

**Interfaces:**
- Consumes: `BizDataQueryRequest.getSort()/getOrder()`、`businessColumns(...)` 白名单、`systemColumns()`
- Produces: `query(formKey, req)` 支持 sort/order 动态 ORDER BY

- [ ] **Step 1: 写失败测试**

`WorkflowFormDataQueryServiceTest.java` 新增（沿用既有 setup 基建，如 @SpringBootTest/H2 或 Mockito；按既有用例风格）：

```java
@Test
void query_withSortOnNumericColumn_ordersNumerically() {
    BizDataQueryRequest req = new BizDataQueryRequest();
    req.setSort("amount");
    req.setOrder("desc");
    BizDataPageVO vo = service.query("expense", req);
    List<Object> amounts = vo.getRecords().stream()
            .map(r -> r.getData().get("amount")).toList();
    // 数值降序：10 应排在 2 之前（CAST 生效，而非 JSON 字符串字典序 10<2）
    assertThat(amounts).containsExactly(10, 2);
}

@Test
void query_withSortOnSystemStartTime_mapsToStartTimeColumn() {
    BizDataQueryRequest req = new BizDataQueryRequest();
    req.setSort("startTime");
    req.setOrder("asc");
    BizDataPageVO vo = service.query("expense", req);
    assertThat(vo.getTotal()).isGreaterThan(0); // 不抛异常，按发起时间升序
}

@Test
void query_withSortOnDerivedColumn_rejects400() {
    BizDataQueryRequest req = new BizDataQueryRequest();
    req.setSort("currentNodeName");
    assertThatThrownBy(() -> service.query("expense", req))
            .isInstanceOf(BusinessException.class)
            .extracting("code").isEqualTo(400);
}

@Test
void query_withoutSort_keepsDefaultOrdering() {
    BizDataPageVO vo = service.query("expense", new BizDataQueryRequest());
    // 不抛异常，默认 COALESCE(h.START_TIME_, f.created_at) DESC
    assertThat(vo.getTotal()).isGreaterThan(0);
}
```

- [ ] **Step 2: 运行确认失败**

Run: `mvn test -Dtest=WorkflowFormDataQueryServiceTest`（workdir `backend/`）
Expected: FAIL（排序被忽略，数值列按字符串字典序或白名单不校验）

- [ ] **Step 3: 实现动态排序**

在 `WorkflowFormDataQueryService` 中：

a) 新增常量与 helper：

```java
private static final String START_TIME_KEY = "startTime";
private static final Set<String> DERIVED_SYSTEM_KEYS =
        Set.of("instanceId", "processStatus", "initiatorName", "currentNodeName");
```

b) `query` 方法中构造 `where` 后，将 rowsQ 的 SQL 改为：

```java
String orderBy = buildOrderBy(req, bizCols);
Query rowsQ = em.createNativeQuery(PAGE_SELECT + where + orderBy
        + " LIMIT :limit OFFSET :offset");
```

c) 新增方法：

```java
/** 解析 sort/order 生成 ORDER BY 片段；缺省保持默认排序。 */
private String buildOrderBy(BizDataQueryRequest req, Map<String, ColumnConfig> bizCols) {
    String sort = req.getSort();
    if (sort == null || sort.isBlank()) {
        return " ORDER BY COALESCE(h.START_TIME_, f.created_at) DESC";
    }
    String dir = "asc".equalsIgnoreCase(req.getOrder()) ? "ASC" : "DESC";
    if (START_TIME_KEY.equals(sort)) {
        return " ORDER BY h.START_TIME_ " + dir;
    }
    if (DERIVED_SYSTEM_KEYS.contains(sort)) {
        throw new BusinessException(400, "排序字段不可排序: " + sort);
    }
    ColumnConfig col = bizCols.get(sort);
    if (col == null || !COL_PATTERN.matcher(sort).matches()) {
        throw new BusinessException(400, "排序字段不在表单字段中: " + sort);
    }
    String type = col.getColumnType() == null ? "VARCHAR" : col.getColumnType().toUpperCase();
    if (type.contains("INT") || type.contains("DECIMAL")) {
        String cast = type.contains("DECIMAL")
                ? "DECIMAL(20," + (col.getScale() == null ? 2 : col.getScale()) + ")"
                : "SIGNED";
        return " ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(f.data_json, '$." + sort + "')) AS " + cast + ") " + dir;
    }
    return " ORDER BY JSON_UNQUOTE(JSON_EXTRACT(f.data_json, '$." + sort + "')) " + dir;
}
```

（`bizCols` 即 `businessColumns(tenantId, formKey)` 的返回值，需传入 `buildOrderBy`。）

- [ ] **Step 4: 运行确认通过**

Run: `mvn test -Dtest=WorkflowFormDataQueryServiceTest,SortableResolverTest`（workdir `backend/`）
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/datasource/WorkflowFormDataQueryService.java backend/src/test/java/com/workflow/engine/datasource/WorkflowFormDataQueryServiceTest.java
git commit -m "feat: support dynamic ordering in workflow form datasource query"
```

---

### Task 5: FORM 路径排序白名单确认

**Files:**
- Inspect: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataQueryBuilder.java:34-57`

**Interfaces:**
- Consumes: `BizDataQueryBuilder.buildSelect` 已有 sort/order 处理
- Produces: 确认 FORM 排序白名单与 SortableResolver 推导来源一致（均为 column_config）

- [ ] **Step 1: 核对白名单来源**

阅读 `BizDataQueryBuilder.buildSelect`：`validateColumn(sortColumn, allowedColumns, "排序字段")` 的 `allowedColumns` 来自调用方传入的 `columnKeys`（即绑定表单 column_config 的 key 集合）。

- 若 `columnKeys` 与 metadata 列同源（column_config）→ 白名单一致，无需改代码。
- 若不一致（如含 JSON/TEXT/子表 key）→ 在 `BizDataService.query` 传入 `columnKeys` 前过滤掉不可排列，或在 `validateColumn` 内联 `SortableResolver.isSortable` 校验列类型。

- [ ] **Step 2: 按核对结果实现（如需要）**

Run: `mvn test -Dtest=BizDataQueryBuilderTest,BizDataServiceTest`（workdir `backend/`）
Expected: PASS

- [ ] **Step 3: Commit（如有代码变更）**

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata/
git commit -m "chore: align form datasource sort whitelist with SortableResolver"
```

---

### Task 6: 前端 ColumnConfigItem 类型扩展

**Files:**
- Modify: `frontend/src/api/bizData.ts`（`ColumnConfigItem` 接口）

**Interfaces:**
- Produces: `ColumnConfigItem.sortable?: boolean`，Task 7/8/9 依赖

- [ ] **Step 1: 加字段**

`ColumnConfigItem` 接口内（参照现有字段注释风格）加：

```typescript
/** 是否可排序（数据源 metadata 声明） */
sortable?: boolean
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`（workdir `frontend/`）
Expected: 无新错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/bizData.ts
git commit -m "feat: extend ColumnConfigItem with sortable"
```

---

### Task 7: SearchTable 内部排序状态

**Files:**
- Modify: `frontend/src/components/business/SearchTable.vue`（模板 line ~101、script `fetchList` line ~398、`handleReset` line ~414、`sort` line ~520）
- Test: `frontend/src/components/business/__tests__/SearchTable.test.ts`（如不存在则新建）

**Interfaces:**
- Consumes: `TableColumn.sortable`、`fetchApi(params)`
- Produces: 内部 `sortState`；`fetchList()` 在 params 中携带 `sort`/`order`；`@sort-change` 仍 emit；`handleReset()` 清空 `sortState`

- [ ] **Step 1: 写失败测试**

`SearchTable.test.ts`（若既有测试基建为 @vue/test-utils，沿用；核心断言 fetchApi 收到 sort/order）：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SearchTable from '../SearchTable.vue'

function mountWithFetch(fetchApi = vi.fn().mockResolvedValue({ rows: [], total: 0 })) {
  return mount(SearchTable, {
    props: {
      columns: [{ prop: 'name', label: '名称', sortable: true }],
      fetchApi,
      showSearch: false,
    },
  })
}

describe('SearchTable sorting', () => {
  it('sends sort/order params and still emits sort-change', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ rows: [], total: 0 })
    const wrapper = mountWithFetch(fetchApi)
    const calls = fetchApi.mock.calls.length

    ;(wrapper.vm as any).tableRef = { sort: vi.fn() } // 若需要
    wrapper.vm.$emit('sort-change', { column: {}, prop: 'name', order: 'ascending' })
    // 或通过触发 el-table 事件（依测试基建而定）
    await wrapper.vm.$nextTick()

    // fetchApi 重新调用且携带 sort/order
    const lastCall = fetchApi.mock.calls[fetchApi.mock.calls.length - 1][0] as any
    expect(lastCall.sort).toBe('name')
    expect(lastCall.order).toBe('asc')
    // sort-change 事件仍向外转发
    expect(wrapper.emitted('sort-change')).toBeTruthy()
    void calls
  })

  it('clears sort state on reset', async () => {
    // 设置排序后调用 handleReset，fetchApi 最后一次调用不含 sort
    const fetchApi = vi.fn().mockResolvedValue({ rows: [], total: 0 })
    const wrapper = mountWithFetch(fetchApi)
    ;(wrapper.vm as any).sortState = { prop: 'name', order: 'asc' }
    await wrapper.vm.$nextTick()
    ;(wrapper.vm as any).handleReset()
    await wrapper.vm.$nextTick()
    const lastCall = fetchApi.mock.calls[fetchApi.mock.calls.length - 1][0] as any
    expect(lastCall.sort).toBeUndefined()
  })
})
```

（若既有测试基建不支持直接触发内部 handler，测试可改为断言「组件内新增的 `handleSortChange` 被 el-table 的 sort-change 绑定」，并以既有 SearchTable 测试文件中的模式为准。）

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- SearchTable`（workdir `frontend/`）
Expected: FAIL（无 sortState 行为）

- [ ] **Step 3: 实现**

`SearchTable.vue` script 内新增状态与 handler，模板 `@sort-change` 改为调用 handler：

```typescript
/** 当前排序状态（服务器端排序；与 query 并列，组件内部自管） */
const sortState = ref<{ prop: string; order: string } | null>(null)

function handleSortChange(args: { column: any; prop: string; order: string }) {
  sortState.value = args.order
    ? { prop: args.prop, order: args.order === 'ascending' ? 'asc' : 'desc' }
    : null
  emit('sort-change', args)   // 保持对外转发，不破坏事件总线
  fetchList()
}
```

模板（line ~101）：

```html
@sort-change="handleSortChange"
```

`fetchList()` 内：

```typescript
async function fetchList() {
  loading.value = true
  try {
    const params: Record<string, any> = { ...query }
    if (sortState.value) {
      params.sort = sortState.value.prop
      params.order = sortState.value.order
    }
    const res = await props.fetchApi(params)
    list.value = Array.isArray(res.rows) ? res.rows : []
    total.value = Number(res.total) || 0
  } finally {
    loading.value = false
  }
}
```

`handleReset()` 内开头加：

```typescript
sortState.value = null
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- SearchTable`（workdir `frontend/`）
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/business/SearchTable.vue frontend/src/components/business/__tests__/SearchTable.test.ts
git commit -m "feat: manage server-side sort state inside SearchTable"
```

---

### Task 8: 各列表页透传 sort/order 并按数据源能力渲染排序入口

**Files:**
- Modify: `frontend/src/views/page/PageRenderer.vue`（`searchTableColumns`/`searchTableFetchApi`）
- Modify: `frontend/src/views/page/components/PageDataTable.vue`（列定义 line ~154、`fetchApi` line ~247-273）
- Modify: `frontend/src/views/form/BizDataListPage.vue`（`columns` line ~118-162、`fetchApi` line ~239-253）

**Interfaces:**
- Consumes: `ColumnConfigItem.sortable`（Task 6）、SearchTable sortState（Task 7）
- Produces: 三个列表页渲染排序入口（列显示 + 数据源可排）+ fetchApi 透传 `sort`/`order`

- [ ] **Step 1: PageRenderer（VIEW）实现**

`PageRenderer.vue` 的 `searchTableColumns` computed 中，渲染 schema 列时合并 metadata 能力（在既有列映射处追加）：

```typescript
sortable: !!dataSourceMeta.value?.columns?.find((c: any) => c.key === col.prop)?.sortable,
```

`searchTableFetchApi` 中把 params 的 sort/order 透传（在既有 query 组装处追加）：

```typescript
if (params.sort) query.sort = params.sort
if (params.order) query.order = params.order
```

- [ ] **Step 2: PageDataTable（PAGE）实现**

`PageDataTable.vue` 列定义（line ~154 `sortable: !!c.sortable`）改为取 metadata 列能力（`metaColumns` 已含 sortable）：

```typescript
sortable: !!c.sortable,   // metaColumns 来自数据源 metadata，sortable 已由后端声明
```

`fetchApi`（line ~264 query 组装处）追加：

```typescript
if (params.sort) query.sort = params.sort
if (params.order) query.order = params.order
```

- [ ] **Step 3: BizDataListPage 实现**

`BizDataListPage.vue` 新增列可排推导（与 filterable 同源规则），在 `columns` computed 的列对象中加：

```typescript
sortable: isColumnSortable(c),
```

并新增函数（文件内）：

```typescript
/** 按列类型推导排序能力（对齐 filterableColumns 规则：非 JSON/TEXT/colorPicker/子表） */
function isColumnSortable(c: ColumnConfigItem): boolean {
  if (c.subColumns && c.subColumns.length > 0) return false
  if (c.columnType === 'JSON' || c.columnType === 'TEXT') return false
  if (c.componentType === 'colorPicker') return false
  return true
}
```

`fetchApi`（line ~247-252 组装处）追加：

```typescript
const res = await bizDataApi.list(formKey.value, {
  page: (params.page || 1) - 1,
  size: params.size || 20,
  filter,
  sort: params.sort,
  order: params.order,
})
```

- [ ] **Step 4: 类型检查 + 既有测试**

Run: `npx tsc --noEmit`；`npm test -- PageRenderer PageDataTable BizDataListPage`（workdir `frontend/`）
Expected: 无新错误，既有用例 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/page/PageRenderer.vue frontend/src/views/page/components/PageDataTable.vue frontend/src/views/form/BizDataListPage.vue
git commit -m "feat: wire server-side sorting through list pages"
```

---

### Task 9: ViewDesigner 移除排序开关

**Files:**
- Modify: `frontend/src/views/page/components/ColumnsConfig.vue`（"排序"列 line ~44-53、`sortableOf`/`setProp`）
- Modify: `frontend/src/views/page/components/QueryColumnsConfig.vue`（若内嵌/复用排序开关）
- Modify: `frontend/src/views/page/ViewDesigner.vue`（`ColumnViewConfig.sortable` 注释 line ~154）

**Interfaces:**
- Consumes: 无新依赖
- Produces: 列配置区无排序开关；`ColumnViewConfig.sortable` 标记废弃

- [ ] **Step 1: 移除 ColumnsConfig 排序列**

`ColumnsConfig.vue`：删除模板中"排序"`el-table-column`（line ~44-53），删除 `sortableOf` 函数与 `setProp` 的 `'sortable'` 分支（`setProp` 参数类型改为 `'width' | 'align'`）。新增列时默认对象（line ~98）移除 `sortable: false`。

- [ ] **Step 2: QueryColumnsConfig 同步**

检查 `QueryColumnsConfig.vue` 是否独立渲染排序开关；若复用 `ColumnsConfig` 则无需改动；否则按同样方式移除。

- [ ] **Step 3: 废弃字段注释**

`ViewDesigner.vue` 的 `ColumnViewConfig`：

```typescript
/** @deprecated 排序能力由数据源 metadata 声明，本字段不再配置；历史残留被忽略 */
sortable?: boolean
```

- [ ] **Step 4: 类型检查 + 既有测试**

Run: `npx tsc --noEmit`；`npm test`（workdir `frontend/`）
Expected: 无新错误（若既有用例断言 ColumnsConfig 含排序开关，同步更新用例）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/page/components/ColumnsConfig.vue frontend/src/views/page/components/QueryColumnsConfig.vue frontend/src/views/page/ViewDesigner.vue
git commit -m "refactor: remove sortable switch from view designer column config"
```

---

### Task 10: 全量验证

**Files:**
- 无代码变更，验证收尾

- [ ] **Step 1: 后端全量测试**

Run: `mvn test`（workdir `backend/`）
Expected: 全部 PASS

- [ ] **Step 2: 前端全量检查**

Run: `npm test`；`npx tsc --noEmit`（workdir `frontend/`）
Expected: 全部 PASS，无类型错误

- [ ] **Step 3: 冒烟验证（可选）**

启动后端 + 前端，验证：VIEW 列表页点可排列表头 → 请求带 sort/order → 数据按序返回；WORKFLOW 数据源列表数值列排序正确；视图设计器列配置无排序开关。

- [ ] **Step 4: 最终 Commit（如有遗留）**

```bash
git add -A
git commit -m "chore: finalize datasource-field-sorting"
```
