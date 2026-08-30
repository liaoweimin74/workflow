# PAGE 页面 page-table 自定义列高级配置修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `DsBindingConfigDialog.vue` 加载/保存列配置时丢弃高级字段的问题，使 PAGE 页面 page-table 自定义列（模板/表达式/样式/点击事件/计算列/隐藏）端到端生效。

**Architecture:** 问题根因是 `DsBindingConfigDialog.vue` 的 `initTableData()`（加载）与 `handleConfirm()`（保存）对 `columns` 做字段白名单重建，丢弃 `contentType/contentValue/className/styleExpr/onCellClick/custom/hidden`。渲染端（`PageDataTable.resolvedColumns` → `buildCellRender`）与后端（`ViewCompiler.compileColumns`）均已支持这些字段，故只需修复弹窗的两个函数，并通过回归测试锁定行为。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript、Vitest + @vue/test-utils、Element Plus。

## Global Constraints

- 改动仅限 `frontend/src/views/form/components/DsBindingConfigDialog.vue` 及其测试文件；不得修改渲染端（PageDataTable.vue）、公共渲染模块（tableColumnRenderer.ts）、后端（ViewCompiler.java）。
- 字段清单必须与 `QueryColumnsConfig.saveAdvanced` 及 `ViewCompiler.compileColumns` 的透传集合一致：`contentType/contentValue/className/styleExpr/onCellClick/custom/hidden`。
- 遵循 TDD：先写失败测试（RED），再实现（GREEN）。
- schema 列对象保留现有 `prop` 命名（PageDataTable 双命名 `prop: c.key ?? c.prop` 兼容）。

---

### Task 1: 回归测试 — 回填与保存保留高级字段（RED）

**Files:**
- Modify: `frontend/src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts`（追加两个用例）

**Interfaces:**
- Consumes: `mountDialog(props)` 辅助函数、`(wrapper.vm as any).handleConfirm()`、`wrapper.emitted('confirm')`（该文件既有模式）
- Produces: 两个失败用例，断言高级字段在回填/保存时保留

- [ ] **Step 1: 追加"回填保留高级字段"用例**

在 `DsBindingConfigDialog.table.test.ts` 文件末尾（现有 describe 内）追加：

```ts
it('回填已有列时保留高级配置字段（contentType/contentValue/className/styleExpr/onCellClick/custom/hidden）', async () => {
  mockMetadata()
  const advanced = {
    prop: 'name', label: '姓名',
    contentType: 'template', contentValue: '${name}(${status})',
    className: 'col-highlight', styleExpr: '$row.status === "PENDING" ? "color:red" : ""',
    onCellClick: { actions: [{ type: 'message', params: [{ key: 'text', value: '点击' }] }] },
    custom: true, hidden: false,
  }
  const wrapper = mountDialog({ dataSourceId: 'ds1', columns: [advanced] })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()

  const vm = wrapper.vm as any
  expect(vm.tableData.columns[0].contentType).toBe('template')
  expect(vm.tableData.columns[0].contentValue).toBe('${name}(${status})')
  expect(vm.tableData.columns[0].className).toBe('col-highlight')
  expect(vm.tableData.columns[0].styleExpr).toBe('$row.status === "PENDING" ? "color:red" : ""')
  expect(vm.tableData.columns[0].onCellClick.actions).toHaveLength(1)
  expect(vm.tableData.columns[0].custom).toBe(true)
  expect(vm.tableData.columns[0].hidden).toBe(false)
  wrapper.unmount()
})
```

- [ ] **Step 2: 追加"保存透传高级字段"用例**

同文件继续追加：

```ts
it('确认保存时透传列高级配置字段', async () => {
  mockMetadata()
  const wrapper = mountDialog({ dataSourceId: 'ds1', columns: [
    { prop: 'name', label: '姓名',
      contentType: 'expression', contentValue: '$row.price * $row.qty',
      className: 'col-highlight', styleExpr: 'color:blue',
      onCellClick: { actions: [{ type: 'message', params: [] }] },
      custom: true, hidden: true },
  ] })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()

  ;(wrapper.vm as any).handleConfirm()
  const result = (wrapper.emitted('confirm') as any[])[0][0]
  const col = result.columns[0]
  expect(col.contentType).toBe('expression')
  expect(col.contentValue).toBe('$row.price * $row.qty')
  expect(col.className).toBe('col-highlight')
  expect(col.styleExpr).toBe('color:blue')
  expect(col.onCellClick.actions).toHaveLength(1)
  expect(col.custom).toBe(true)
  expect(col.hidden).toBe(true)
  wrapper.unmount()
})
```

- [ ] **Step 3: 运行测试确认失败（RED）**

Run: `npx vitest run src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts`
Expected: 两个新用例 **FAIL**（当前 `initTableData`/`handleConfirm` 丢弃高级字段，断言取到 `undefined`）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts
git commit -m "test: DsBindingConfigDialog 列高级字段回填/保存回归用例（RED）"
```

---

### Task 2: 修复 `initTableData()` — 加载保留完整字段（GREEN）

**Files:**
- Modify: `frontend/src/views/form/components/DsBindingConfigDialog.vue:330-345`（`initTableData` 函数）

**Interfaces:**
- Consumes: Task 1 的回填用例
- Produces: `tableData.columns` 保留列完整字段（含高级字段），仅归一化 `key`/`label`

- [ ] **Step 1: 修改 `initTableData` 的列映射**

将 `DsBindingConfigDialog.vue` L338-345：

```ts
  tableData.columns = srcColumns.map((c: any) => ({
    key: c.prop ?? c.key,
    label: c.label || c.prop || c.key,
    width: c.width,
    align: c.align,
    formatter: c.formatter,
    fixed: c.fixed,
  }))
```

改为（保留完整字段，仅归一化命名）：

```ts
  tableData.columns = srcColumns.map((c: any) => ({
    ...c,
    key: c.prop ?? c.key,
    label: c.label || c.prop || c.key,
  }))
```

- [ ] **Step 2: 运行测试确认回填用例通过（GREEN）**

Run: `npx vitest run src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts`
Expected: Task 1 的"回填保留高级字段"用例 **PASS**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/form/components/DsBindingConfigDialog.vue
git commit -m "fix: initTableData 保留列高级字段，回填不再丢弃"
```

---

### Task 3: 修复 `handleConfirm()` — 保存透传高级字段（GREEN）

**Files:**
- Modify: `frontend/src/views/form/components/DsBindingConfigDialog.vue:407-411`（`handleConfirm` 的 columns 写回）

**Interfaces:**
- Consumes: Task 1 的保存用例
- Produces: `result.columns` 含基础字段 + 高级字段，字段集合与 `QueryColumnsConfig.saveAdvanced`/`ViewCompiler.compileColumns` 一致

- [ ] **Step 1: 修改 `handleConfirm` 的 columns 写回**

将 `DsBindingConfigDialog.vue` L407-411：

```ts
    result.columns = tableData.columns.map((c: any) => ({
      prop: c.key ?? c.prop, label: c.label || c.key,
      width: c.width, align: c.align,
      formatter: c.formatter, fixed: c.fixed,
    }))
```

改为：

```ts
    result.columns = tableData.columns.map((c: any) => ({
      prop: c.key ?? c.prop,
      label: c.label || c.key,
      width: c.width,
      align: c.align,
      formatter: c.formatter,
      fixed: c.fixed,
      ...(c.contentType !== undefined ? { contentType: c.contentType } : {}),
      ...(c.contentValue !== undefined ? { contentValue: c.contentValue } : {}),
      ...(c.className !== undefined ? { className: c.className } : {}),
      ...(c.styleExpr !== undefined ? { styleExpr: c.styleExpr } : {}),
      ...(c.onCellClick !== undefined ? { onCellClick: c.onCellClick } : {}),
      ...(c.custom !== undefined ? { custom: c.custom } : {}),
      ...(c.hidden !== undefined ? { hidden: c.hidden } : {}),
    }))
```

- [ ] **Step 2: 运行测试确认保存用例通过（GREEN）**

Run: `npx vitest run src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts`
Expected: Task 1 的"保存透传高级字段"用例 **PASS**，其余既有用例保持 PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/form/components/DsBindingConfigDialog.vue
git commit -m "fix: handleConfirm 保存列时透传高级字段"
```

---

### Task 4: 回归验证

- [ ] **Step 1: 运行渲染端测试（确认不受影响）**

Run: `npx vitest run src/views/page/components/__tests__/PageDataTable.test.ts`
Expected: 列级定制用例（template/formatter/styleExpr/onCellClick）全部 PASS

- [ ] **Step 2: 运行 DsBindingConfigDialog 全量测试**

Run: `npx vitest run src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts src/views/form/components/__tests__/DsBindingConfigDialog.container.test.ts`
Expected: 全部 PASS（非表格模式行为不变）

- [ ] **Step 3: 类型检查与 Lint**

Run: `npx vue-tsc --noEmit`（如项目配置）与 `npx eslint src/views/form/components/DsBindingConfigDialog.vue src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts`
Expected: 无错误

- [ ] **Step 4: Commit（如有 lint/类型修正）**

```bash
git add -A
git commit -m "chore: 修复后 lint/类型检查修正"
```
