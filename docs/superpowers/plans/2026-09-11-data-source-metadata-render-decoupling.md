# 数据源字段元数据渲染解耦 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 数据源 metadata 链路的渲染决策不再依赖 componentType——改为「表单 schema `rule.type` 优先 + `<key>_text` 列存在性 + columnType 降级」，数据源只声明查询能力。

**Architecture:** 复用现成的 `_text` 冗余列机制（后端表单发布时生成，metadata.columns 中 hidden=true）作为数组值/引用列显示信号；查询栏组件分支在有 formKey 时读表单 schema rule.type，无则按 columnType 降级。后端仅更新注释（metadata 结构不变，向后兼容），全部逻辑变更在前端 6 个文件 + 对应测试。

**Tech Stack:** Vue 3 + Element Plus + TypeScript（前端）；Java 17 + Spring Boot（后端仅注释）。测试：vitest + @vue/test-utils；类型检查 vue-tsc。

## Global Constraints

- **不物理删除** metadata.columns 的 componentType 字段（保留向后兼容，仅标注弃用）。
- **不改 matchType 查询链路**（ViewCompiler / 后端筛选条件构造 / 管理页 matchType 编辑）。
- **不改 `BizDataListPage.vue`**（表单自身列表页，消费表单定义，已是正确样板）。
- 无 formKey 数据源（SQL/API 无表单绑定）查询栏按 columnType 降级基础组件；数组列显示原始值——行为诚实化，非回归。
- 判断 `<key>_text` 存在性必须基于**完整 metadata.columns**（`_text` 列 hidden=true，可能被过滤掉）。
- 测试命令：`npx vitest run <file>`；类型检查：`npx vue-tsc --noEmit`（**预存在 4 个错误**在 `PageRendererPage.vue`/`ProcessListPage.vue`，与本计划无关，验收时排除）。
- 每个任务末尾独立 commit，提交信息含 `feat:` / `test:` / `docs:` 前缀。

---

### Task 1: 后端注释标注 componentType 弃用

**Files:**
- Modify: `backend/src/main/java/com/workflow/api/dto/DataSourceMetadata.java:9`

**Interfaces:**
- Produces: 无代码接口变化；仅文档注释。

- [ ] **Step 1: 更新类注释**

在 `DataSourceMetadata.java` 的 Javadoc 中补充 componentType 弃用说明，改为：

```java
/**
 * 数据源元数据（统一 SPI metadata 方法返回）。
 * columns 复用 ColumnConfig 列定义字段（key/label/columnType/length/scale/required/unique/indexed/hidden/sortable/filterable/matchType）。
 * 注意：componentType 属表单渲染属性，metadata 链路已不再消费（渲染改由表单 schema rule.type 与 <key>_text 冗余列驱动），
 * 字段保留仅为向后兼容，标注 @Deprecated 语义，后续可独立移除。
 */
```

- [ ] **Step 2: 编译验证**

Run: `cd backend && mvn -q compile -DskipTests`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/workflow/api/dto/DataSourceMetadata.java
git commit -m "docs: 数据源 metadata 标注 componentType 弃用（渲染链路不再消费）"
```

---

### Task 2: PageDataTable 数组值列判断改 `_text` 列存在性

**Files:**
- Modify: `frontend/src/views/page/components/PageDataTable.vue`（新增 `hasTextColumn`；改 resolvedColumns 两处 + resolveSearchColumn；删 `ARRAY_COMPONENT_TYPES`）
- Test: `frontend/src/views/page/components/__tests__/PageDataTable.test.ts`

**Interfaces:**
- Consumes: `metaColumns`（crud composable 提供，已存在）
- Produces: `function hasTextColumn(key: string): boolean` —— metadata 中存在 `<key>_text` 列

- [ ] **Step 1: 改测试（先 RED）**

在 `PageDataTable.test.ts` 找到用例「透传 componentType，数组值组件列 formatter 逗号拼接且优先显示 `<key>_text`」（约 162 行）：
1. 将 metadata mock 调整为**包含** `tags_text` / `users_text` / `region_text` / `dept_text` 这些 hidden 冗余列（`{ key: 'dept_text', label: '部门（显示）', columnType: 'VARCHAR', hidden: true }`），**可移除各列的 componentType 字段**；
2. 断言不变（formatter 仍优先读 `_text`，缺失回退 value join）；
3. 新增反向用例：metadata 只有 `dept`（无 `dept_text` 列）时，该列**不挂 formatter**（直接显示原始值）：

```ts
it('metadata 无 <key>_text 列时不挂数组值 formatter（原始值直显）', async () => {
  // mock metadata 仅含 dept（VARCHAR，无 dept_text 列）
  // 断言: resolvedColumns 中 dept 列无 formatter 属性
  const cols = ... // 取 resolvedColumns
  expect(cols.find((c: any) => c.prop === 'dept')?.formatter).toBeUndefined()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/page/components/__tests__/PageDataTable.test.ts`
Expected: FAIL（数组值判断仍依赖 componentType，无 componentType 时 formatter 不挂）

- [ ] **Step 3: 实现**

在 `<script setup>` 的列适配区新增辅助，并替换三处判断：

```ts
/** metadata 中存在 <key>_text 冗余列（数组值/引用列显示信号，替代 componentType 判断） */
function hasTextColumn(key: string): boolean {
  return metaColumns.value.some((m) => m.key === `${key}_text`)
}
```

- resolvedColumns 的 metadata 分支（约 394 行）：`...(ARRAY_COMPONENT_TYPES.includes(c.componentType || '') ? {...} : {})` → `...(hasTextColumn(c.key) ? {...} : {})`
- resolvedColumns 的用户列分支（约 414 行）：`const isArrayCol = !!meta && ARRAY_COMPONENT_TYPES.includes(meta.componentType || '')` → `const isArrayCol = hasTextColumn(key)`
- resolveSearchColumn（约 553-557 行）：`if (col && ARRAY_COMPONENT_TYPES.includes(col.componentType || '')) return \`${key}_text\`` → `if (hasTextColumn(key)) return \`${key}_text\``
- 删除 `ARRAY_COMPONENT_TYPES` 常量定义（约 361 行）

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/page/components/__tests__/PageDataTable.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/page/components/PageDataTable.vue frontend/src/views/page/components/__tests__/PageDataTable.test.ts
git commit -m "feat: PageDataTable 数组值列判断改 <key>_text 列存在性（componentType 退出渲染链路）"
```

---

### Task 3: PageDataTable 查询栏组件分支改 schema rule.type + columnType 降级

**Files:**
- Modify: `frontend/src/views/page/components/PageDataTable.vue`（resolvedSearchFields，约 309-357 行）
- Test: `frontend/src/views/page/components/__tests__/PageDataTable.test.ts`

**Interfaces:**
- Consumes: `findFormRuleByKey(key)`（已存在，返回表单 schema rule 或 undefined）、`metaColumns`
- Produces: 无新接口；resolvedSearchFields 行为变更

- [ ] **Step 1: 改测试（先 RED）**

在 `PageDataTable.test.ts` 的「查询组件按字段组件类型 + 搜索映射 `<key>_text`」describe 块（约 359 行）中：
1. 保留有 formSchemaRule 时 select/lookupPicker 分支用例——确认其 rule 含 `type: 'select'` / options，断言不变；
2. 新增用例：**metadata 无 componentType 且无 schema rule**（如 SQL 数据源）时，查询组件按 columnType 降级：

```ts
it('无 schema rule 且无 componentType：日期列用 date-picker，其余按 columnType 降级 input', async () => {
  // mock metadata: created_at(DATETIME)、amount(DECIMAL)，无 componentType，无 formSchemaRule
  const fields = ... // resolvedSearchFields
  expect(fields.find((f: any) => f.prop === 'created_at')?.type).toBe('date-picker')
  expect(fields.find((f: any) => f.prop === 'amount')?.type).toBe('input')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/page/components/__tests__/PageDataTable.test.ts`
Expected: FAIL（created_at 无 componentType 时当前走 input）

- [ ] **Step 3: 实现**

改写 resolvedSearchFields 的组件类型来源与降级逻辑：

```ts
const resolvedSearchFields = computed<SearchField[]>(() =>
  (props.searchFields || []).map((f: any) => {
    const key = f.key ?? f.field
    const meta = metaColumns.value.find((m) => m.key === key)
    const rule = findFormRuleByKey(key)
    // 组件类型：优先表单 schema rule.type（含完整配置）；无 schema 时为空，走 columnType 降级
    const compType = rule?.type || ''
    const colType = meta?.columnType || ''
    const base = { label: f.label || f.key || key, prop: key, placeholder: f.label || key }
    if (f.matchType === 'like') {
      return { ...base, type: 'input' as const, style: 'width: 180px' }
    }
    if (QUERY_TREE_TYPES.includes(compType)) {
      return { ...base, type: 'tree-select' as const, treeProps: { data: rule?.props?.data ?? [], props: { label: 'label', value: 'label', children: 'children' } }, style: 'width: 200px' }
    }
    if (compType === 'cascader') {
      return { ...base, type: 'cascader' as const, cascaderProps: { options: rule?.props?.options ?? [], props: { label: 'label', value: 'label', children: 'children' } }, style: 'width: 200px' }
    }
    if (QUERY_SELECT_TYPES.includes(compType)) {
      return { ...base, type: 'select' as const, options: formOptionLabelItems(rule), style: 'width: 180px' }
    }
    if (QUERY_PICKER_TYPES.includes(compType)) {
      return { ...base, type: 'lookupPicker' as const, lookupProps: { ...(rule?.props || {}) }, style: 'width: 200px' }
    }
    if (compType === 'DatePicker' || compType === 'datePicker' || compType === 'date' || colType === 'DATE' || colType === 'DATETIME') {
      return { ...base, type: 'date-picker' as const }
    }
    return { ...base, type: 'input' as const, style: 'width: 180px' }
  }),
)
```

（改动点：`const compType = meta?.componentType || ''` → `const compType = rule?.type || ''`；date 分支追加 `colType` 判断。`meta` 保留用于取 columnType。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/page/components/__tests__/PageDataTable.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/page/components/PageDataTable.vue frontend/src/views/page/components/__tests__/PageDataTable.test.ts
git commit -m "feat: PageDataTable 查询栏组件改表单 schema rule.type 优先 + columnType 降级"
```

---

### Task 4: PageDataCards 数组值判断改 `_text` 列存在性

**Files:**
- Modify: `frontend/src/views/page/components/PageDataCards.vue`（约 163/181/186 行 + 查询组件映射 245 行）
- Test: `frontend/src/views/page/components/__tests__/PageDataCards.test.ts`

**Interfaces:**
- Produces: 同 Task 2 的 `hasTextColumn`（本组件内定义）

- [ ] **Step 1: 改测试（先 RED）**

在 `PageDataCards.test.ts`「数组值组件列 formatter 读 `<key>_text`（叶子 label），缺失回退 value join」用例（约 470 行）：mock metadata 改为含 `dept_text` hidden 列、移除 componentType；断言不变。新增反向用例（无 `_text` 列 → 无 formatter）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/page/components/__tests__/PageDataCards.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

对齐 Task 2 模式：
- 新增 `function hasTextColumn(key: string): boolean`（基于 `metaColumns` 或本组件等价的 metadata 引用）；
- 数组值判断（约 163 行 `ARRAY_COMPONENT_TYPES.includes(meta.componentType)`、186 行返回 `${key}_text` 处）→ `hasTextColumn(key)`；
- 查询组件映射（约 245 行 `meta?.componentType || ''`）→ 改为 schema rule.type 优先（若本组件有 formSchemaRule，参照 Task 3；否则仅按 columnType 降级）；
- 删除 `ARRAY_COMPONENT_TYPES` 常量（约 181 行）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/page/components/__tests__/PageDataCards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/page/components/PageDataCards.vue frontend/src/views/page/components/__tests__/PageDataCards.test.ts
git commit -m "feat: PageDataCards 数组值列判断改 <key>_text 列存在性"
```

---

### Task 5: ViewDesigner 可筛列判断改 `_text` 列存在性

**Files:**
- Modify: `frontend/src/views/page/ViewDesigner.vue`（filterableColumns，约 401-414 行；删 `ARRAY_QUERY_TYPES`）
- Test: `frontend/src/views/page/__tests__/ViewDesigner.test.ts`

**Interfaces:**
- Produces: 无新接口；filterableColumns 行为变更

- [ ] **Step 1: 改测试（先 RED）**

`ViewDesigner.test.ts` 中找到数组类可筛列用例（约 167 行「选项类组件主列（JSON，componentType=select）也可筛」）：mock 的列集合调整为**含 `<key>_text` 冗余列**（列对象含 `key: 'dept_text'`）、移除 componentType；断言不变（dept 仍可筛）。新增反向用例：无 `_text` 列的 JSON 列不可筛。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/page/__tests__/ViewDesigner.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
/** 可筛选列：存在 <key>_text 冗余列（数组值列，查询走 _text 显示列）或非 JSON/TEXT 且 indexed/短文本；colorPicker 不再从 componentType 特判（按常规列类型） */
const filterableColumns = computed(() =>
  viewColumns.value.filter(
    (c) =>
      viewColumns.value.some((x) => x.key === `${c.key}_text`)
      || (c.columnType !== 'JSON' &&
        c.columnType !== 'TEXT' &&
        (c.indexed || (c.length != null && c.length <= 64) || c.columnType === 'VARCHAR')),
  ),
)
```

删除 `ARRAY_QUERY_TYPES` 常量（约 402 行）。**行为变更说明**：colorPicker 列（VARCHAR）不再因 componentType 被排除出可筛列，改为按常规 VARCHAR 判断——这是方案 B 的既定语义（渲染/业务规则不再由 metadata componentType 表达）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/page/__tests__/ViewDesigner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/page/ViewDesigner.vue frontend/src/views/page/__tests__/ViewDesigner.test.ts
git commit -m "feat: ViewDesigner 可筛列判断改 <key>_text 列存在性（移除 colorPicker componentType 特判）"
```

---

### Task 6: DsBindingConfigDialog 可筛判断改 `_text` 列存在性

**Files:**
- Modify: `frontend/src/views/form/components/DsBindingConfigDialog.vue`（loadTableCandidates，约 399-408 行）
- Test: `frontend/src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts`

**Interfaces:**
- Produces: 无新接口；tableFilterableKeys 计算行为变更

- [ ] **Step 1: 改测试（先 RED）**

`DsBindingConfigDialog.table.test.ts` 中找到可筛列相关用例：mock `getMetadata` 返回含 `<key>_text` hidden 列（如 `dept_text`）且主列无 componentType；断言该数组值列仍进 `tableFilterableKeys`。移除对 componentType 的依赖断言。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
async function loadTableCandidates() {
  tableCandidates.value = []
  tableFilterableKeys.value = new Set()
  const binding = props.formDataSources.find(d => d.id === form.dataSourceId)
  if (!binding?.refId) return
  try {
    const res = await dataSourceApi.getMetadata(binding.refId)
    const meta = res.data as any
    const allCols = meta?.columns || []
    const cols = allCols.filter((c: any) => !c.hidden)
    tableCandidates.value = cols
    // 可筛：存在 <key>_text 冗余列（数组值/引用列，查询走 _text 显示列）或非 JSON/TEXT 且 indexed/短文本
    const hasText = (key: string) => allCols.some((x: any) => x.key === `${key}_text`)
    const filterable = cols.filter((c: any) =>
      hasText(c.key) ||
      (c.columnType !== 'JSON' && c.columnType !== 'TEXT' &&
        (c.indexed || (c.length != null && c.length <= 64) || c.columnType === 'VARCHAR')),
    )
    tableFilterableKeys.value = new Set(filterable.map((c: any) => c.key))
  } catch {
    tableCandidates.value = []
  }
}
```

**注意**：`hasText` 基于 `allCols`（完整 meta.columns），因 `_text` 列 hidden=true 已被 `cols` 过滤。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts src/views/form/components/__tests__/DsBindingConfigDialog.card.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/form/components/DsBindingConfigDialog.vue frontend/src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts
git commit -m "feat: DsBindingConfigDialog 可筛判断改 <key>_text 列存在性"
```

---

### Task 7: 数据源管理页 componentType 只读化 + 覆盖逻辑去 componentType

**Files:**
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue`（字段元数据 tab 可编辑表格 318 行、字段详情弹窗 403 行、只读表格 467 行、handleOverlayFromForm 1078 行）
- Test: `frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts`

**Interfaces:**
- Consumes: `isEditableType`（SQL/API 可编辑元数据）、`isReadonlyForm`
- Produces: 管理页不再产出 componentType 编辑/覆盖

- [ ] **Step 1: 改测试（先 RED）**

在 `DataSourceListPage.test.ts`：
1. 「从主表单覆盖：...schema 补 componentType」用例（约 1372/1418 行）——改断言：覆盖后列**不含 componentType**（移除「schema 补 componentType」断言）；
2. 新增用例：SQL 数据源字段元数据 tab **不渲染「组件类型」可编辑列**（`wrapper.html()` 不含组件类型 el-select 或该列标签，按可编辑表格实现确认）；FORM 只读表格仍展示组件类型列（已有 prop 展示）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/dataSource/__tests__/DataSourceListPage.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

1. 可编辑表格（`isEditableType` 分支，约 316-322 行）：**删除**「组件类型」列（含 `FORM_CREATE_COMPONENT_TYPES` 引入若仅此处用则一并清理）；
2. 字段详情弹窗（约 402-406 行）：删除 componentType 表单项；
3. 只读表格（约 467 行）：`prop="componentType"` 列保留展示（FORM/WORKFLOW 有值，SYSTEM 空显示 —），如该列对 SYSTEM 恒空可加 `formatter` 空值显示 `—`；
4. `handleOverlayFromForm`（约 1078 行）：删除 `if (c.componentType) item.componentType = c.componentType`；
5. 检查 `FORM_CREATE_COMPONENT_TYPES` 是否仅被 componentType 列使用，若是则删除定义。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/dataSource/__tests__/DataSourceListPage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/dataSource/DataSourceListPage.vue frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts
git commit -m "feat: 数据源管理页 componentType 只读化（SQL/API 移除编辑列，覆盖逻辑不再补 componentType）"
```

---

### Task 8: 全量回归验证

**Files:**
- 无代码改动

- [ ] **Step 1: 全量前端测试**

Run: `npx vitest run src/views/dataSource src/views/page src/views/form/components src/views/form/__tests__`
Expected: PASS（重点回归：PageDataTable/PageDataCards/ViewDesigner/DataSourceListPage/DsBindingConfigDialog/BizDataListPage）

- [ ] **Step 2: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 仅剩 4 个预存在错误（`PageRendererPage.vue` 2 个、`ProcessListPage.vue` 2 个），无本计划引入的新错误。

- [ ] **Step 3: 后端编译（Task 1 变更）**

Run: `cd backend && mvn -q compile -DskipTests`
Expected: BUILD SUCCESS

- [ ] **Step 4: 总结变更并确认提交历史干净**

```bash
git log --oneline -8
```

---

## Self-Review（执行后核对）

- **Spec 覆盖**：spec 的「变更明细」表每行都有对应 Task（PageDataTable→Task 2/3，PageDataCards→Task 4，ViewDesigner→Task 5，DsBindingConfigDialog→Task 6，DataSourceListPage→Task 7，后端注释→Task 1）；「边界行为」「测试」由 Task 8 回归覆盖。
- **占位符扫描**：无 TBD/TODO；每个 Task 的测试与实现代码均具体到可执行。
- **类型一致性**：`hasTextColumn(key: string): boolean` 在 Task 2/4 各自组件内定义（互不引用）；`rule?.type` 驱动查询栏分支在 Task 3/4 一致。
