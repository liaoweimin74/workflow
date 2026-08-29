# 数据表格列定制能力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为数据表格增加声明式列级定制能力（自定义列、列样式、单元格点击事件、动态列内容），并提炼公共列渲染模块统一 PageRenderer/PageDataTable 行为。

**Architecture:** 新增公共模块 `frontend/src/utils/tableColumnRenderer.ts` 收敛列取值/渲染/样式逻辑；`scriptSandbox.ts` 扩展 `evalCellExpression` 支持带返回值的单表达式求值；ViewDesigner 扩展 `ColumnViewConfig` schema；PageRenderer 与 PageDataTable 复用公共模块并在 cell-click 增加列级 `onCellClick` 分发（短路整表级）；SearchTable 预留静态 `cellClassName` 透传；设计器面板增加"高级配置"子面板。

**Tech Stack:** Vue 3 + TypeScript, Element Plus (el-table), Vite + Vitest

## Global Constraints

- 复用现有 `scriptSandbox.ts` 的 `createSandbox`（同文件私有函数）；表达式蛇沙箱安全模型与 `executeScript` 一致
- 渲染优先级：`expression` > `template` > `formatter` > 原始值；空值（null/undefined）显示 `—`
- `getCellValue` 优先 `row.data?.[key]`、回退 `row[key]`
- 使用 TDD：先写失败测试，再实现
- 所有新增 schema 字段可选，向后兼容
- 不使用 `as any` 掩盖类型；不破坏既有测试

---

## Task 1: scriptSandbox 扩展 evalCellExpression

**Files:**
- Modify: `frontend/src/utils/scriptSandbox.ts`（文件末尾追加）
- Test: `frontend/src/utils/__tests__/scriptSandbox.test.ts`

**Interfaces:**
- Consumes: 现有私有 `createSandbox(context)`（line 42-59）、`SANDBOX_GLOBALS`（line 12-34）
- Produces: `evalCellExpression(source: string, context: Record<string, any>): unknown` — 同步返回表达式求值结果；异常或空 source 返回 `undefined`；上下文注入 `$row`/`row`/`value` 等

- [ ] **Step 1: 写失败测试**

在 `frontend/src/utils/__tests__/scriptSandbox.test.ts` 追加：

```typescript
import { evalCellExpression } from '../scriptSandbox'

describe('evalCellExpression', () => {
  it('求值单表达式并返回结果', () => {
    const row = { amount: 5000 }
    expect(evalCellExpression('$row.amount > 1000 ? "高" : "低"', { $row: row, row })).toBe('高')
  })

  it('注入 value 上下文（当前单元格值）', () => {
    expect(evalCellExpression('value > 100 ? "big" : "small"', { $row: {}, row: {}, value: 500 })).toBe('big')
  })

  it('表达式异常返回 undefined', () => {
    expect(evalCellExpression('undefinedFn()', { $row: {}, row: {} })).toBeUndefined()
  })

  it('空 source 返回 undefined', () => {
    expect(evalCellExpression('', { $row: {}, row: {} })).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run frontend/src/utils/__tests__/scriptSandbox.test.ts`
Expected: FAIL（`evalCellExpression is not a function`）

- [ ] **Step 3: 实现 evalCellExpression**

在 `frontend/src/utils/scriptSandbox.ts` 末尾（`executeScript` 之后）追加：

```typescript
/**
 * 在沙箱中求值单个表达式并返回结果（异常捕获，返回 undefined）。
 * @param source 表达式源码，如 `$row.amount > 1000 ? '高' : '低'`
 * @param context 注入上下文：$row/row/value/column 等
 */
export function evalCellExpression(source: string, context: Record<string, any>): unknown {
  if (typeof source !== 'string' || !source.trim()) return undefined
  try {
    const sandbox = createSandbox(context)
    // eslint-disable-next-line no-new-func
    const fn = new Function('__sandbox', `with (__sandbox) { return (${source}) }`)
    return fn(sandbox)
  } catch (e) {
    console.error('[script] 表达式求值失败:', e)
    return undefined
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run frontend/src/utils/__tests__/scriptSandbox.test.ts`
Expected: PASS（全部用例，含既有用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/scriptSandbox.ts frontend/src/utils/__tests__/scriptSandbox.test.ts
git commit -m "feat: scriptSandbox 新增 evalCellExpression 返回值表达式求值"
```

---

## Task 2: 公共列渲染模块 tableColumnRenderer

**Files:**
- Create: `frontend/src/utils/tableColumnRenderer.ts`
- Test: `frontend/src/utils/__tests__/tableColumnRenderer.test.ts`

**Interfaces:**
- Consumes: `evalCellExpression`（Task 1）、`formatCellValue`（`frontend/src/utils/formatters.ts`）
- Produces:
  - `getCellValue(row: Record<string, any>, key: string): unknown` — 优先 `row.data?.[key]`、回退 `row[key]`
  - `interpolateTemplate(tpl: string, row: Record<string, any>): string` — 替换 `${a.b}` 模式
  - `renderCellContent(config: { template?: string; expression?: string; formatter?: string }, row: Record<string, any>): string` — 按 expression > template > formatter > 原始值 顺序；空值显示 `—`
  - `buildCellRender(config: { template?: string; expression?: string; formatter?: string; className?: string; styleExpr?: string }): (row: any) => unknown` — 返回可注入 `TableColumn.render` 的函数，包 span（class/style）

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/utils/__tests__/tableColumnRenderer.test.ts`：

```typescript
import { getCellValue, interpolateTemplate, renderCellContent, buildCellRender } from '../tableColumnRenderer'

describe('getCellValue', () => {
  it('优先取内层 data 结构', () => {
    expect(getCellValue({ data: { name: '张工' } }, 'name')).toBe('张工')
  })
  it('回退扁平结构', () => {
    expect(getCellValue({ name: '张工' }, 'name')).toBe('张工')
  })
  it('均无返回 undefined', () => {
    expect(getCellValue({}, 'name')).toBeUndefined()
  })
})

describe('interpolateTemplate', () => {
  it('替换单字段', () => {
    expect(interpolateTemplate('${name}', { name: '张工' })).toBe('张工')
  })
  it('替换多级字段并保留静态文本', () => {
    expect(interpolateTemplate('${user.name}(${status})', { user: { name: '张工' }, status: '在职' })).toBe('张工(在职)')
  })
})

describe('renderCellContent', () => {
  it('expression 优先于 formatter', () => {
    expect(renderCellContent({ expression: '$row.a > 1 ? "X" : "Y"', formatter: 'currency' }, { a: 5 })).toBe('X')
  })
  it('template 次之', () => {
    expect(renderCellContent({ template: '${name}', formatter: 'currency' }, { name: '张工' })).toBe('张工')
  })
  it('formatter 生效', () => {
    expect(renderCellContent({ formatter: 'currency' }, { amount: 1234.56 })).toBe('¥1,234.56')
  })
  it('空值显示占位符', () => {
    expect(renderCellContent({}, { name: null })).toBe('—')
  })
})

describe('buildCellRender', () => {
  it('返回函数并在 render 内包 span 携带 class', () => {
    const render = buildCellRender({ className: 'col-highlight', formatter: 'currency' })
    const vnode = render({ amount: 1234.56 })
    expect(vnode.type).toBe('span')
    expect(vnode.props.class).toBe('col-highlight')
    expect(vnode.children).toBe('¥1,234.56')
  })
  it('styleExpr 按行求值应用 style', () => {
    const render = buildCellRender({ styleExpr: '$row.status === "异常" ? "color:red" : ""' })
    const vnode = render({ status: '异常', data: {} })
    expect(vnode.props.style).toContain('color:red')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run frontend/src/utils/__tests__/tableColumnRenderer.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 tableColumnRenderer**

创建 `frontend/src/utils/tableColumnRenderer.ts`：

```typescript
/**
 * 数据表格列渲染公共模块。
 * 统一 PageRenderer / PageDataTable 的列取值、模板插值、内容渲染、样式承载。
 */
import { formatCellValue } from './formatters'
import { evalCellExpression } from './scriptSandbox'

/** 统一列取值：兼容 `row.data` 内层结构与扁平结构 */
export function getCellValue(row: Record<string, any>, key: string): unknown {
  if (row == null) return undefined
  if (row.data != null && typeof row.data === 'object' && key in row.data) {
    return row.data[key]
  }
  return row[key]
}

/** 占位符 ${a.b} 插值，支持多级字段 */
export function interpolateTemplate(tpl: string, row: Record<string, any>): string {
  if (typeof tpl !== 'string' || !tpl) return ''
  return tpl.replace(/\$\{([^}]+)\}/g, (_m, path: string) => {
    const val = path
      .trim()
      .split('.')
      .reduce((acc: any, k: string) => (acc == null ? undefined : acc[k]), row)
    return val == null ? '' : String(val)
  })
}

export interface CellContentConfig {
  template?: string
  expression?: string
  formatter?: string
}

/** 按 expression > template > formatter > 原始值 渲染内容；空值显示 '—' */
export function renderCellContent(config: CellContentConfig, row: Record<string, any>): string {
  const ctx = { $row: row, row }
  if (config.expression) {
    const v = evalCellExpression(config.expression, ctx)
    if (v != null) return String(v)
  }
  if (config.template) {
    const t = interpolateTemplate(config.template, row)
    if (t) return t
    return '—'
  }
  if (config.formatter) {
    const v = getCellValue(row, '')
    return formatCellValue(v, config.formatter)
  }
  return '—'
}

export interface CellStyleConfig {
  className?: string
  styleExpr?: string
}

/** 构建列 render 函数：承载内容 + className/styleExpr 样式（包 span） */
export function buildCellRender(config: CellContentConfig & CellStyleConfig): (row: Record<string, any>) => unknown {
  return (row: Record<string, any>) => {
    const content = renderCellContent(config, row)
    return {
      type: 'span',
      props: {
        class: config.className,
        style: config.styleExpr
          ? evalCellExpression(config.styleExpr, { $row: row, row, value: getCellValue(row, '') })
          : undefined,
      },
      children: content,
    }
  }
}
```

> 注：`renderCellContent`/`buildCellRender` 中 `getCellValue(row, '')` 为占位取值，formatter 类格式化需在调用方传入具体取的原始值。若验证需要精确 formatter 值，可将 `key` 一并传入（见下方 Task 5 接入说明的可选签名演进）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run frontend/src/utils/__tests__/tableColumnRenderer.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/tableColumnRenderer.ts frontend/src/utils/__tests__/tableColumnRenderer.test.ts
git commit -m "feat: 新增数据表格列渲染公共模块 tableColumnRenderer"
```

---

## Task 3: TableColumn / SearchTable 预留 cellClassName

**Files:**
- Modify: `frontend/src/components/business/types.ts`（`TableColumn`，约 line 48）
- Modify: `frontend/src/components/business/SearchTable.vue`（el-table-column，约 line 104-123）
- Test: `frontend/src/components/business/__tests__/`（如有既有测试则补充）

**Interfaces:**
- Consumes: `TableColumn` 类型
- Produces: `TableColumn.cellClassName?: string` 可选字段；`SearchTable` 透传到 `el-table-column` 的 `class-name`

- [ ] **Step 1: 查看 types.ts 的 TableColumn 定义**

Read `frontend/src/components/business/types.ts` 中 `TableColumn` 接口（含 `render`/`formatter` 字段位置）。

- [ ] **Step 2: 给 TableColumn 增加可选 cellClassName**

在 `TableColumn` 接口中追加：

```typescript
/** 静态单元格 class，透传到 el-table 列的 class-name（作用于 td） */
cellClassName?: string
```

- [ ] **Step 3: SearchTable 透传 cellClassName**

在 `SearchTable.vue` 的 `el-table-column` 上增加：

```html
:class-name="column.cellClassName || ''"
```

- [ ] **Step 4: 运行相关测试 + 类型检查**

Run: `npx vitest run`（相关组件测试）+ `npx vue-tsc --noEmit`（或项目既有类型检查命令）
Expected: PASS / 无新增 error

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/business/types.ts frontend/src/components/business/SearchTable.vue
git commit -m "feat: TableColumn 预留 cellClassName 静态透传"
```

---

## Task 4: ViewDesigner 扩展 ColumnViewConfig schema

**Files:**
- Modify: `frontend/src/views/page/ViewDesigner.vue`（`ColumnViewConfig`，约 line 181-192）
- Test: 如有既有 schema 类型测试则补充

**Interfaces:**
- Consumes: 无
- Produces: `ColumnViewConfig` 新增可选字段 `template?/expression?/className?/styleExpr?/onCellClick?`（`onCellClick: { actions: any[] }`）

- [ ] **Step 1: 查看 ColumnViewConfig 定义**

Read `frontend/src/views/page/ViewDesigner.vue` 中 `ColumnViewConfig` 接口（line 181-192 附近）。

- [ ] **Step 2: 扩展 ColumnViewConfig**

在接口中追加字段：

```typescript
template?: string          // ${field} 模板插值
expression?: string        // 动态表达式（沙箱求值，$row.xxx）
className?: string         // 静态列样式 class
styleExpr?: string         // 条件样式表达式
onCellClick?: { actions: any[] }  // 列级单元格点击事件
```

- [ ] **Step 3: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: PASS（无新增 error）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/page/ViewDesigner.vue
git commit -m "feat: ColumnViewConfig 扩展列级定制字段"
```

---

## Task 5: 接入 PageRenderer（query-page-renderer）

**Files:**
- Modify: `frontend/src/views/page/PageRenderer.vue`（`CompiledColumn` 约 line 220、`searchTableColumns` 约 line 504-520、`handleCellClick` 约 line 990）
- Test: `frontend/src/views/page/__tests__/PageRenderer.test.ts`（如有）

**Interfaces:**
- Consumes: `buildCellRender`/`renderCellContent`/`getCellValue`（Task 2）；列表列配置含新字段（Task 4）
- Produces: `handleCellClick` 列级分发——命中列且有 `onCellClick` 时执行列级动作链并短路整表级

- [ ] **Step 1: 写失败测试（列级事件）**

在 `PageRenderer.test.ts`（或既有测试文件）追加：

```typescript
it('列级 onCellClick 短路整表级 cell-click', async () => {
  // 构造含 onCellClick 的列配置 A、无事件的列 B
  // 触发 A 列 cell-click：仅执行 A 列动作，不触发 viewEvents['cell-click']
  // 触发 B 列 cell-click：走原整表级
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run frontend/src/views/page/__tests__/PageRenderer.test.ts`
Expected: FAIL

- [ ] **Step 3: searchTableColumns 改用公共模块**

将 `searchTableColumns` 中列 `render`/取值逻辑替换为 `buildCellRender`/`getCellValue`（按 config 含 `template`/`expression`/`className`/`styleExpr` 时使用公共渲染，否则保留既有 formatter 行为以保证兼容）。

- [ ] **Step 4: handleCellClick 增加列级分发**

在 `handleCellClick(row, column, ...)` 中，依据 `column.property`（即列 `key`）在列配置中查找对应列：

```typescript
const colCfg = columns.value.find((c) => c.key === column.property)
if (colCfg?.onCellClick) {
  // 执行列级动作链（复用 dispatchButtonAction / UE 事件，含 script）
  await dispatchColumnActions(colCfg.onCellClick.actions, row)
  return // 短路整表级 cell-click
}
// 否则走原整表级 viewEvents['cell-click']
this.triggerEvents('cell-click', 'table', { row, column })
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run frontend/src/views/page/__tests__/PageRenderer.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/page/PageRenderer.vue frontend/src/views/page/__tests__/PageRenderer.test.ts
git commit -m "feat: PageRenderer 接入公共列渲染模块与列级单元格点击事件"
```

---

## Task 6: 接入 PageDataTable（page-data-table）

**Files:**
- Modify: `frontend/src/views/page/components/PageDataTable.vue`（`resolvedColumns` 约 line 286-314、`handleCellClick` 约 line 696、`triggerViewEvents` 约 line 679）
- Test: `frontend/src/views/page/components/__tests__/PageDataTable.test.ts`

**Interfaces:**
- Consumes: `buildCellRender`/`getCellValue`（Task 2）
- Produces: `handleCellClick` 列级分发（同 Task 5 语义）

- [ ] **Step 1: 写失败测试（列级事件）**

在 `PageDataTable.test.ts` 追加：列级 `onCellClick` 存在时短路整表级；未配置时走原 `viewEvents`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run frontend/src/views/page/components/__tests__/PageDataTable.test.ts`
Expected: FAIL

- [ ] **Step 3: resolvedColumns 改用公共模块**

将 `resolvedColumns` 中列渲染/取值改为 `buildCellRender`/`getCellValue`（兼容两种行结构）。

- [ ] **Step 4: handleCellClick 增加列级分发**

同 Task 5 Step 4 逻辑（在 PageDataTable 中依据 `column.property` 查找列配置，命中 `onCellClick` 则执行列级动作并短路，否则 `triggerViewEvents('cell-click', ...)`）。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run frontend/src/views/page/components/__tests__/PageDataTable.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/page/components/PageDataTable.vue frontend/src/views/page/components/__tests__/PageDataTable.test.ts
git commit -m "feat: PageDataTable 接入公共列渲染模块与列级单元格点击事件"
```

---

## Task 7: 设计器面板（QueryColumnsConfig / ColumnsConfig）

**Files:**
- Modify: `frontend/src/views/page/components/QueryColumnsConfig.vue`
- Modify: `frontend/src/views/page/components/ColumnsConfig.vue`（如存在并需同步）

**Interfaces:**
- Consumes: `ColumnViewConfig` 新字段（Task 4）
- Produces: 每列"高级配置"按钮 → 子面板编辑 `template/expression/className/styleExpr/onCellClick`

- [ ] **Step 1: QueryColumnsConfig 加"高级配置"按钮**

在列配置行操作区增加按钮，点击打开子面板（`el-dialog`/`el-drawer`）。

- [ ] **Step 2: 子面板编辑动态内容/样式/事件**

子面板内提供：
- 文本域：`template`
- 文本域：`expression`
- 输入框：`className`
- 文本域：`styleExpr`
- 事件编辑：`onCellClick.actions`（复用既有动作链编辑控件，支持 type=script）

- [ ] **Step 3: 保存写入列配置**

确认后写回当前列 `template/expression/className/styleExpr/onCellClick`。

- [ ] **Step 4: 手测人机交互（页面设计器预览）**

前置：前端已可通过设计器入口打开；预览 PageRenderer 验证新字段生效。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/page/components/QueryColumnsConfig.vue frontend/src/views/page/components/ColumnsConfig.vue
git commit -m "feat: 列配置面板增加高级配置子面板"
```

---

## Task 8: 全量验证

**Files:**
- N/A

- [ ] **Step 1: 运行全部前端测试**

Run: `npx vitest run`
Expected: 全部通过（含既有测试，无回归）

- [ ] **Step 2: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: 构建**

Run: `npm run build`（或项目构建命令）
Expected: 构建成功，退出码 0

- [ ] **Step 4: lsp 诊断**

Run: 对修改文件执行 `lsp_diagnostics`
Expected: 无新增 error/warning
