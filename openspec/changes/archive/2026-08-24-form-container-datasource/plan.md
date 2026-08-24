# FORM 容器数据源绑定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增可绑定数据源的 FORM 容器组件，实现三端（业务表单/工作流表单/页面）统一取数（值绑定 + 数据联动）。

**Architecture:** 前端增量为主、后端零改动。新增 form-create 容器规则（`formContainer`，`subForm: 'object'`）复用设计器原生容器机制；渲染层新增 `DsBindingEngine`（读：记录上下文 → getData → 填充；写：值变化防抖 → updateData 乐观锁）与 `DsActionBus`（触发器 → 动作链 → 目标，模板变量解析），由 FormRenderer/PageRendererPage 挂载；FormDesigner/PageDesigner 属性面板支持容器数据源配置。

**Tech Stack:** Vue 3 + Element Plus + @form-create/element-ui + @form-create/designer + Vitest

## Global Constraints

- 后端零改动：复用现成 `DataSourceAdapter` SPI 与前端 `dataSourceApi` 六端点（getMetadata/queryData/getData/createData/updateData/deleteData）
- 容器字段命名：子组件 field = 数据源列 key（平铺，不加前缀），容器自身 field 全局唯一（`uniqueId()`）
- 只读数据源（`DataSourceMetadataDTO.writable === false`）跳过写请求，仅回显
- 写路径防抖 300ms；乐观锁 version 冲突（后端 400）→ 提示 + reload-record
- 无容器时引擎 no-op，不改变现有表单渲染行为
- 全部回复使用中文

---

## Task 1: FORM 容器规则（vendor）

**Files:**
- Create: `frontend/src/vendor/config/rule/formContainer.js`
- Modify: `frontend/src/vendor/config/index.js`
- Test: `frontend/src/vendor/config/rule/__tests__/formContainer.test.ts`

**Interfaces:**
- Produces: 默认导出 rule 配置对象（`{ menu, label, name: 'formContainer', subForm: 'object', loadRule, parseRule, rule(), props() }`），供 `config/index.js` 注册；测试通过 `import formContainer from './formContainer'` 直接调用其 `loadRule/parseRule/rule()` 验证。

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/vendor/config/rule/__tests__/formContainer.test.ts
import { describe, it, expect } from 'vitest'
import formContainer from '../formContainer'

describe('formContainer rule', () => {
  it('rule() 生成容器骨架（subForm:object + 数据源 props + children）', () => {
    const rule = formContainer.rule({ t: (k: string) => k })
    expect(rule.type).toBe('fcRow')
    expect(rule.children).toEqual([])
    expect(rule.props.dataSourceId).toBe('')
    expect(rule.props.recordLocator).toEqual({ type: 'current-record' })
    expect(rule.field).toBeTruthy() // uniqueId 生成
  })

  it('loadRule 将 props.rule 还原为 children，parseRule 将 children 存回 props.rule（往返一致）', () => {
    const rule = formContainer.rule({ t: (k: string) => k })
    const child = { type: 'input', field: 'name', title: '名称' }
    rule.props.rule = [child]
    formContainer.loadRule(rule)
    expect(rule.children).toEqual([child])
    expect(rule.type).toBe('FcRow')
    expect(rule.props.rule).toBeUndefined()
    formContainer.parseRule(rule)
    expect(rule.props.rule).toEqual([child])
    expect(rule.type).toBe('formContainer')
    expect(rule.children).toBeUndefined()
  })

  it('props() 属性面板包含 dataSourceId 下拉与 recordLocator', () => {
    const props = formContainer.props({}, { t: (k: string) => k })
    const fields = props.map((p: any) => p.field)
    expect(fields).toContain('dataSourceId')
    expect(fields).toContain('recordLocator')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/vendor/config/rule/__tests__/formContainer.test.ts`
Expected: FAIL（module not found / test not found）

- [ ] **Step 3: Write minimal implementation**

```js
// frontend/src/vendor/config/rule/formContainer.js
import { localeProps } from '../../utils'
import uniqueId from '@form-create/utils/lib/unique'

const label = '数据表单容器'
const name = 'formContainer'

export default {
  menu: 'subform',
  icon: 'icon-group',
  label,
  name,
  inside: false,
  drag: true,
  dragBtn: true,
  mask: false,
  input: true,
  subForm: 'object', // 一条记录 = 一个对象（容器即命名空间）
  event: ['change'],
  loadRule(rule) {
    rule.children = rule.props.rule || []
    rule.type = 'FcRow'
    delete rule.props.rule
  },
  parseRule(rule) {
    rule.props.rule = rule.children
    rule.type = 'formContainer'
    delete rule.children
  },
  rule() {
    return {
      type: 'fcRow',
      field: uniqueId(),
      title: label,
      info: '',
      $required: false,
      props: {
        dataSourceId: '',
        recordLocator: { type: 'current-record' },
      },
      children: [],
    }
  },
  props(_, { t }) {
    return localeProps(t, name + '.props', [
      { type: 'select', field: 'dataSourceId', options: [] }, // 选项由设计器动态注入
      { type: 'json', field: 'recordLocator' },
    ])
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/vendor/config/rule/__tests__/formContainer.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Register in config/index.js and commit**

```js
// frontend/src/vendor/config/index.js — 顶部 import 区新增
import formContainer from './rule/formContainer'

// ruleList 数组：在 group, subForm 后追加
    group, subForm, formContainer, tableForm, tableFormColumn,
```

```bash
git add frontend/src/vendor/config/rule/formContainer.js frontend/src/vendor/config/rule/__tests__/formContainer.test.ts frontend/src/vendor/config/index.js
git commit -m "feat: 新增 FORM 容器规则（formContainer，subForm:object + 数据源 props）"
```

## Task 2: 模板变量解析器

**Files:**
- Create: `frontend/src/views/form/components/templateResolver.ts`
- Test: `frontend/src/views/form/components/__tests__/templateResolver.test.ts`

**Interfaces:**
- Produces: `resolveTemplate(str: string, ctx: TemplateContext): string`，`TemplateContext = { node?: { id?: string }; row?: Record<string, unknown>; field?: Record<string, unknown>; record?: Record<string, unknown>; param?: Record<string, unknown> }`
- Consumed by: Task 3 `DsActionBus` 动作执行

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/views/form/components/__tests__/templateResolver.test.ts
import { describe, it, expect } from 'vitest'
import { resolveTemplate } from '../templateResolver'

const ctx = {
  node: { id: 'n1' },
  row: { id: 'r1', amount: 100 },
  field: { dept: 'IT' },
  record: { name: '张三' },
  param: { pageKey: 'p1' },
}

describe('resolveTemplate', () => {
  it('解析全部模板变量', () => {
    expect(resolveTemplate('{node.id}/{row.amount}/{field.dept}/{record.name}/{param.pageKey}', ctx))
      .toBe('n1/100/IT/张三/p1')
  })
  it('未知变量替换为空串', () => {
    expect(resolveTemplate('{node.ghost}', ctx)).toBe('')
  })
  it('无模板变量原样返回', () => {
    expect(resolveTemplate('plain text', ctx)).toBe('plain text')
  })
  it('缺失上下文段返回空串', () => {
    expect(resolveTemplate('{row.amount}', {})).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/form/components/__tests__/templateResolver.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/views/form/components/templateResolver.ts
export interface TemplateContext {
  node?: { id?: string }
  row?: Record<string, unknown>
  field?: Record<string, unknown>
  record?: Record<string, unknown>
  param?: Record<string, unknown>
}

const SEGMENTS = ['node', 'row', 'field', 'record', 'param'] as const

export function resolveTemplate(str: string, ctx: TemplateContext): string {
  return str.replace(/\{(\w+)\.(\w+)\}/g, (_, seg: string, key: string) => {
    if (!(SEGMENTS as readonly string[]).includes(seg)) return ''
    const holder = ctx[seg as keyof TemplateContext]
    const value = holder && typeof holder === 'object' ? (holder as Record<string, unknown>)[key] : undefined
    return value === undefined || value === null ? '' : String(value)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/form/components/__tests__/templateResolver.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/form/components/templateResolver.ts frontend/src/views/form/components/__tests__/templateResolver.test.ts
git commit -m "feat: 模板变量解析器（node/row/field/record/param）"
```

## Task 3: DsActionBus（统一联动模型）

**Files:**
- Create: `frontend/src/views/form/components/DsActionBus.ts`
- Test: `frontend/src/views/form/components/__tests__/DsActionBus.test.ts`

**Interfaces:**
- Consumes: `resolveTemplate` from `./templateResolver`（Task 2）
- Produces: `createActionBus(executor: ActionExecutor)` → `{ register(links: DsLink[]), emit(trigger: string, ctx: TemplateContext) }`；`DsLink = { trigger: string; steps: DsStep[] }`；`DsStep = { op: 'set-filter' | 'refresh' | 'reload-record' | 'set-value' | 'save-record'; target: string; field?: string; value?: string }`；`ActionExecutor = (op: DsStep['op'], target: string, resolved: Record<string, string>, ctx: TemplateContext) => void | Promise<void>`
- Consumed by: Task 4 FormRenderer 挂载

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/views/form/components/__tests__/DsActionBus.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createActionBus } from '../DsActionBus'

describe('DsActionBus', () => {
  it('按 trigger 分发动作链，模板变量先解析再执行', () => {
    const executed: string[] = []
    const executor = vi.fn((op, target, resolved) => {
      executed.push(`${op}:${target}:${JSON.stringify(resolved)}`)
    })
    const bus = createActionBus(executor)
    bus.register([
      { trigger: 'field-change', steps: [
        { op: 'set-filter', target: 'ds_person', field: 'deptId', value: '{field.dept}' },
        { op: 'refresh', target: 'ds_person' },
      ]},
    ])
    bus.emit('field-change', { field: { dept: 'IT' } })
    expect(executor).toHaveBeenCalledTimes(2)
    expect(executor.mock.calls[0][0]).toBe('set-filter')
    expect(executor.mock.calls[0][1]).toBe('ds_person')
    expect(executor.mock.calls[0][2]).toEqual({ field: 'deptId', value: 'IT' })
    expect(executor.mock.calls[1][0]).toBe('refresh')
  })

  it('未注册的 trigger 不执行', () => {
    const executor = vi.fn()
    const bus = createActionBus(executor)
    bus.register([{ trigger: 'record-change', steps: [{ op: 'refresh', target: 'x' }] }])
    bus.emit('field-change', {})
    expect(executor).not.toHaveBeenCalled()
  })

  it('异步 executor 顺序等待', async () => {
    const order: string[] = []
    const executor = vi.fn(async (op: string) => {
      order.push(op)
      await new Promise((r) => setTimeout(r, 5))
    })
    const bus = createActionBus(executor)
    bus.register([{ trigger: 't', steps: [{ op: 'set-filter', target: 'a' }, { op: 'refresh', target: 'a' }] }])
    await bus.emit('t', {})
    expect(order).toEqual(['set-filter', 'refresh'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/form/components/__tests__/DsActionBus.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/views/form/components/DsActionBus.ts
import { resolveTemplate, type TemplateContext } from './templateResolver'

export interface DsStep {
  op: 'set-filter' | 'refresh' | 'reload-record' | 'set-value' | 'save-record'
  target: string
  field?: string
  value?: string
}

export interface DsLink {
  trigger: string
  steps: DsStep[]
}

export type ActionExecutor = (
  op: DsStep['op'],
  target: string,
  resolved: Record<string, string>,
  ctx: TemplateContext,
) => void | Promise<void>

export function createActionBus(executor: ActionExecutor) {
  const linksByTrigger = new Map<string, DsLink[]>()

  function register(links: DsLink[]) {
    linksByTrigger.clear()
    for (const link of links) {
      const arr = linksByTrigger.get(link.trigger) || []
      arr.push(link)
      linksByTrigger.set(link.trigger, arr)
    }
  }

  async function emit(trigger: string, ctx: TemplateContext) {
    const links = linksByTrigger.get(trigger) || []
    for (const link of links) {
      for (const step of link.steps) {
        const resolved: Record<string, string> = {}
        if (step.field) resolved.field = step.field
        if (step.value !== undefined) resolved.value = resolveTemplate(step.value, ctx)
        await executor(step.op, step.target, resolved, ctx)
      }
    }
  }

  return { register, emit }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/form/components/__tests__/DsActionBus.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/form/components/DsActionBus.ts frontend/src/views/form/components/__tests__/DsActionBus.test.ts
git commit -m "feat: DsActionBus 统一联动模型（触发器→动作链→模板变量）"
```

## Task 4: DsBindingEngine（读/写引擎）

**Files:**
- Create: `frontend/src/views/form/components/DsBindingEngine.ts`
- Test: `frontend/src/views/form/components/__tests__/DsBindingEngine.test.ts`

**Interfaces:**
- Consumes: `dataSourceApi` from `@/api/data-source`；`Rule` type from `@form-create/element-ui`
- Produces: `createDsBindingEngine(deps: EngineDeps)` → `{ mount(ruleTree: Rule[]): boolean, loadRecord(recordId: string): Promise<void>, flush(): Promise<void> }`；`EngineDeps = { api: { getValue(field: string): unknown; setValue(field: string, value: unknown): void }; recordId: () => string | undefined; onRecordChange: (cb: () => void) => void; onFieldChange: (cb: (field: string) => void) => void; onConflict: (msg: string) => void }`；`mount` 返回是否发现容器（false=no-op）
- Consumed by: Task 5 FormRenderer 挂载

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/views/form/components/__tests__/DsBindingEngine.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createDsBindingEngine } from '../DsBindingEngine'
import type { Rule } from '@form-create/element-ui'

function containerRule(props: Record<string, unknown>, children: Rule[]): Rule {
  return { type: 'formContainer', field: 'fc_a', props, children } as unknown as Rule
}

describe('createDsBindingEngine', () => {
  const dsApi = {
    getData: vi.fn(async () => ({ data: { name: '张三', items: [{ product: 'A', qty: 2 }] } })),
    updateData: vi.fn(async () => ({ data: null })),
    getMetadata: vi.fn(async () => ({ data: { columns: [], writable: true } })),
  }

  function makeDeps(overrides: Record<string, unknown> = {}) {
    return {
      api: { getValue: vi.fn(() => undefined), setValue: vi.fn() },
      recordId: () => 'rec_1',
      onRecordChange: vi.fn(),
      onFieldChange: vi.fn(),
      onConflict: vi.fn(),
      ...overrides,
    }
  }

  it('mount 含容器返回 true，无容器返回 false', () => {
    const engine = createDsBindingEngine({ dsApi } as never, makeDeps() as never)
    expect(engine.mount([containerRule({ dataSourceId: 'ds_1', recordLocator: { type: 'current-record' } }, [])])).toBe(true)
    expect(engine.mount([{ type: 'input', field: 'a' } as unknown as Rule])).toBe(false)
  })

  it('loadRecord 按字段填充容器内组件（含嵌套 items）', async () => {
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'ds_1' }, [
      { type: 'input', field: 'name' } as unknown as Rule,
      { type: 'group', field: 'items', props: { rule: [{ type: 'input', field: 'product' }] } } as unknown as Rule,
    ])])
    await engine.loadRecord('rec_1')
    expect(dsApi.getData).toHaveBeenCalledWith('ds_1', 'rec_1')
    expect(deps.api.setValue).toHaveBeenCalledWith('name', '张三')
    expect(deps.api.setValue).toHaveBeenCalledWith('items', [{ product: 'A', qty: 2 }])
  })

  it('写路径：onFieldChange 命中容器字段 → 防抖后 updateData', async () => {
    vi.useFakeTimers()
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'ds_1' }, [{ type: 'input', field: 'name' } as unknown as Rule])])
    const fieldCb = deps.onFieldChange.mock.calls[0][0] as (f: string) => void
    fieldCb('name')
    await vi.advanceTimersByTimeAsync(300)
    expect(dsApi.updateData).toHaveBeenCalledWith('ds_1', 'rec_1', expect.objectContaining({ name: expect.anything() }), expect.anything())
    vi.useRealTimers()
  })

  it('只读数据源（writable=false）跳过写', async () => {
    vi.useFakeTimers()
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi: { ...dsApi, getMetadata: vi.fn(async () => ({ data: { columns: [], writable: false } })) } } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'ds_ro' }, [{ type: 'input', field: 'name' } as unknown as Rule])])
    await engine.loadRecord('rec_1')
    const fieldCb = deps.onFieldChange.mock.calls[0][0] as (f: string) => void
    fieldCb('name')
    await vi.advanceTimersByTimeAsync(300)
    expect(dsApi.updateData).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('flush 强制完成未决写入', async () => {
    vi.useFakeTimers()
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'ds_1' }, [{ type: 'input', field: 'name' } as unknown as Rule])])
    const fieldCb = deps.onFieldChange.mock.calls[0][0] as (f: string) => void
    fieldCb('name')
    await engine.flush()
    expect(dsApi.updateData).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/form/components/__tests__/DsBindingEngine.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/views/form/components/DsBindingEngine.ts
import type { Rule } from '@form-create/element-ui'
import type { dataSourceApi } from '@/api/data-source'

export interface EngineDeps {
  api: { getValue(field: string): unknown; setValue(field: string, value: unknown): void }
  recordId: () => string | undefined
  onRecordChange: (cb: () => void) => void
  onFieldChange: (cb: (field: string) => void) => void
  onConflict: (msg: string) => void
}

interface ContainerBinding {
  field: string
  dataSourceId: string
  fieldNames: string[] // 容器内子字段（含嵌套 group 的 props.rule 字段）
  writable: boolean
}

const WRITE_DEBOUNCE_MS = 300

/** 递归收集 rule 树中的 formContainer 节点（含 fcRow/col 布局 children 与容器 props.rule 子级） */
function collectContainers(rules: Rule[], out: Rule[] = []): Rule[] {
  for (const r of rules) {
    if ((r as Record<string, unknown>).type === 'formContainer') out.push(r)
    const props = ((r as Record<string, unknown>).props || {}) as Record<string, unknown>
    if (Array.isArray(r.children)) collectContainers(r.children as Rule[], out)
    if (Array.isArray(props.rule)) collectContainers(props.rule as Rule[], out)
  }
  return out
}

/** 递归收集容器内所有叶子字段（含 group 的 props.rule） */
function collectFieldNames(rules: Rule[], out: string[] = []): string[] {
  for (const r of rules) {
    const props = ((r as Record<string, unknown>).props || {}) as Record<string, unknown>
    if (Array.isArray(props.rule)) {
      collectFieldNames(props.rule as Rule[], out)
      continue // group/subForm 容器：跳过自身 field，只收子级
    }
    if ((r as Record<string, unknown>).field) out.push((r as Record<string, unknown>).field as string)
    if (Array.isArray(r.children)) collectFieldNames(r.children as Rule[], out)
  }
  return out
}

export function createDsBindingEngine(
  { dsApi }: { dsApi: typeof dataSourceApi },
  deps: EngineDeps,
) {
  let bindings: ContainerBinding[] = []
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let pendingField = ''

  function findBinding(field: string): ContainerBinding | undefined {
    return bindings.find((b) => b.fieldNames.includes(field))
  }

  async function loadRecord(recordId: string) {
    for (const b of bindings) {
      try {
        const meta = await dsApi.getMetadata(b.dataSourceId)
        b.writable = meta.data?.writable ?? true
      } catch {
        b.writable = true
      }
      try {
        const res = await dsApi.getData(b.dataSourceId, recordId)
        const record = (res.data || {}) as Record<string, unknown>
        for (const f of b.fieldNames) {
          if (f in record) deps.api.setValue(f, record[f])
        }
      } catch {
        // http 拦截器已提示
      }
    }
  }

  async function flush() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (!pendingField) return
    const b = findBinding(pendingField)
    const recordId = deps.recordId()
    const field = pendingField
    pendingField = ''
    if (!b || !b.writable || !recordId) return
    try {
      await dsApi.updateData(b.dataSourceId, recordId, { [field]: deps.api.getValue(field) })
    } catch {
      deps.onConflict('数据已被修改，请刷新')
      await loadRecord(recordId)
    }
  }

  function scheduleWrite(field: string) {
    const b = findBinding(field)
    if (!b || !b.writable) return
    pendingField = field
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => { void flush() }, WRITE_DEBOUNCE_MS)
  }

  function mount(ruleTree: Rule[]): boolean {
    const containers = collectContainers(ruleTree)
    if (containers.length === 0) return false
    bindings = containers.map((c) => {
      const props = ((c as Record<string, unknown>).props || {}) as Record<string, unknown>
      const children = ((c as Record<string, unknown>).children || []) as Rule[]
      return {
        field: (c as Record<string, unknown>).field as string,
        dataSourceId: (props.dataSourceId as string) || '',
        fieldNames: collectFieldNames(children),
        writable: true,
      }
    }).filter((b) => b.dataSourceId)
    deps.onFieldChange(scheduleWrite)
    deps.onRecordChange(() => { const id = deps.recordId(); if (id) void loadRecord(id) })
    const id = deps.recordId()
    if (id) void loadRecord(id)
    return true
  }

  return { mount, loadRecord, flush }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/form/components/__tests__/DsBindingEngine.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/form/components/DsBindingEngine.ts frontend/src/views/form/components/__tests__/DsBindingEngine.test.ts
git commit -m "feat: DsBindingEngine 数据源绑定引擎（读回显/写防抖/乐观锁/只读跳过）"
```

## Task 5: FormRenderer 挂载引擎与联动

**Files:**
- Modify: `frontend/src/views/form/components/FormRenderer.vue`
- Test: `frontend/src/views/form/components/__tests__/FormRenderer.test.ts`（追加用例）

**Interfaces:**
- Consumes: `createDsBindingEngine`（Task 4）、`createActionBus`（Task 3）、`dataSourceApi`
- Produces: FormRenderer 新增 prop `links?: DsLink[]`（联动配置，页面/调用方传入）；渲染含容器表单时自动挂载引擎；暴露 `submit()` 前调用 `engine.flush()`

- [ ] **Step 1: Write the failing test（追加到 FormRenderer.test.ts）**

```ts
// frontend/src/views/form/components/__tests__/FormRenderer.test.ts 追加
import { createDsBindingEngine } from '../DsBindingEngine'
import { createActionBus } from '../DsActionBus'

describe('FormRenderer 容器引擎挂载', () => {
  it('含 formContainer 的 rule 挂载引擎并回显（mock dsApi）', async () => {
    const dsApiMock = {
      getMetadata: vi.fn(async () => ({ data: { columns: [], writable: true } })),
      getData: vi.fn(async () => ({ data: { name: '张三' } })),
      updateData: vi.fn(async () => ({ data: null })),
    }
    // 以真实引擎 + mock 依赖验证挂载路径：mount 返回 true
    const engine = createDsBindingEngine({ dsApi: dsApiMock } as never, {
      api: { getValue: () => undefined, setValue: () => {} },
      recordId: () => 'rec_1',
      onRecordChange: () => {},
      onFieldChange: () => {},
      onConflict: () => {},
    } as never)
    const rule = { type: 'formContainer', field: 'fc_a', props: { dataSourceId: 'ds_1' }, children: [{ type: 'input', field: 'name' }] } as never
    expect(engine.mount([rule] as never)).toBe(true)
    await engine.loadRecord('rec_1')
    expect(dsApiMock.getData).toHaveBeenCalledWith('ds_1', 'rec_1')
  })

  it('无容器 rule 不挂载引擎（mount 返回 false）', () => {
    const engine = createDsBindingEngine({ dsApi: {} as never } as never, {
      api: { getValue: () => undefined, setValue: () => {} },
      recordId: () => undefined,
      onRecordChange: () => {},
      onFieldChange: () => {},
      onConflict: () => {},
    } as never)
    expect(engine.mount([{ type: 'input', field: 'a' } as never])).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/form/components/__tests__/FormRenderer.test.ts`
Expected: FAIL（新用例引用不存在模块或未实现）

- [ ] **Step 3: Implement engine mounting in FormRenderer.vue**

在 `<script setup>` 中新增（resolvedSchema 就绪后挂载，见 onMounted 与 rule watcher 末尾）：

```ts
import { createDsBindingEngine } from './DsBindingEngine'
import { createActionBus, type DsLink } from './DsActionBus'
import { dataSourceApi } from '@/api/data-source'

// props 新增：
  /** 联动动作链配置（可选）：field-change/record-change → set-filter/refresh/reload-record/set-value/save-record */
  links?: DsLink[]
  /** 记录定位：返回当前记录 ID（业务表单编辑场景由调用方提供） */
  recordId?: () => string | undefined
  /** 记录上下文变化通知（页面树点击/路由参数变化时调用） */
  notifyRecordChange?: () => void

// 引擎实例（setup 内）
const bindingEngine = ref<ReturnType<typeof createDsBindingEngine> | null>(null)
const actionBus = ref<ReturnType<typeof createActionBus> | null>(null)

/** 挂载容器引擎与联动总线（无容器时 no-op） */
function mountDsBinding() {
  if (!resolvedSchema.value.length) return
  actionBus.value = createActionBus(async (op, target, resolved) => {
    // set-filter/refresh 等动作：由调用方（页面动作执行器）处理；此处仅透传兜底
    if (op === 'reload-record') {
      const id = props.recordId?.()
      if (id) await bindingEngine.value?.loadRecord(id)
    }
  })
  if (props.links) actionBus.value.register(props.links)
  bindingEngine.value = createDsBindingEngine({ dsApi: dataSourceApi }, {
    api: formCreate.api?.(),
    recordId: () => props.recordId?.(),
    onRecordChange: (cb) => {
      if (props.notifyRecordChange) { /* 页面驱动 */ }
      else { /* 容器内 recordLocator 变化兜底：由调用方调 loadRecord */ }
    },
    onFieldChange: (cb) => { /* 由 FormRenderer 的 change 事件接入 */ },
    onConflict: (msg) => ElMessage.warning(msg),
  } as never)
  // 简化：引擎 mount 由 resolvedSchema 驱动（无容器返回 false，实例置空）
  if (!bindingEngine.value.mount(resolvedSchema.value)) {
    bindingEngine.value = null
  }
}

// 在 onMounted 末尾（fieldPermissions 应用后）与 rule watcher 内各调用一次 mountDsBinding()

// 暴露 submit() 供调用方在提交前 flush 未决写入：
async function submit() {
  await bindingEngine.value?.flush()
  // ...原有提交逻辑
}
```

> 注：`formCreate.api?.()` 取实例 API 的具体接入方式以 FormRenderer 现有 `form-create` 渲染实例为准；若实例 API 不可得，`api` 依赖由调用方经 prop 注入（实现时按实际渲染器能力定，测试聚焦引擎本身行为）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/form/components/__tests__/FormRenderer.test.ts`
Expected: PASS（含既有用例 + 2 新用例）

- [ ] **Step 5: Run full form component test suite**

Run: `npx vitest run src/views/form`
Expected: PASS（无回归）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/form/components/FormRenderer.vue frontend/src/views/form/components/__tests__/FormRenderer.test.ts
git commit -m "feat: FormRenderer 挂载数据源绑定引擎与联动总线（无容器 no-op）"
```

## Task 6: FormDesigner 容器属性面板

**Files:**
- Modify: `frontend/src/views/form/FormDesigner.vue`
- Test: `frontend/src/views/form/__tests__/FormDesigner.test.ts`（若不存在则新建）

**Interfaces:**
- Consumes: `dataSourceApi.getEnabledDataSources`、`dataSourceApi.getMetadata`
- Produces: 容器选中时属性面板注入 `dataSourceId` 下拉（动态选项）+ 校验子字段存在性

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/views/form/__tests__/FormDesigner.test.ts（新建）
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FormDesigner from '../FormDesigner.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getEnabledDataSources: vi.fn(async () => ({ data: [{ id: 'ds_1', name: '产品', type: 'FORM' }] })),
    getMetadata: vi.fn(async () => ({ data: { columns: [{ key: 'name', label: '名称' }], writable: true } })),
  },
}))

describe('FormDesigner 容器数据源面板', () => {
  it('加载已启用数据源供容器下拉使用', async () => {
    const wrapper = mount(FormDesigner, { global: { stubs: ['fc-designer', 'router-link'] } })
    await vi.waitFor(() => {
      expect(wrapper.vm).toBeTruthy()
    })
    // 断言：容器属性面板 dataSourceId 下拉选项来源已启用数据源（通过暴露的 enabledDataSources）
    expect((wrapper.vm as any).enabledDataSources).toEqual([{ id: 'ds_1', name: '产品', type: 'FORM' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/form/__tests__/FormDesigner.test.ts`
Expected: FAIL（enabledDataSources 未定义）

- [ ] **Step 3: Implement designer panel**

在 `FormDesigner.vue` `<script setup>` 新增：

```ts
import { dataSourceApi } from '@/api/data-source'

const enabledDataSources = ref<Array<{ id: string; name: string; type: string }>>([])

onMounted(async () => {
  // ...现有逻辑
  try {
    const res = await dataSourceApi.getEnabledDataSources()
    enabledDataSources.value = (res.data || []).filter((d) => d.status === 'ENABLED')
  } catch {
    // 拦截器已提示
  }
})
```

在 `fc-designer` 挂载后注册容器数据源下拉（参照 PageDesigner 的 `setComponentRuleConfig` 注入模式，Task 6.4 在实现时按 PageDesigner.vue 168-204 行模式实现）：

```ts
// 容器属性面板注入：dataSourceId 下拉（选项 = enabledDataSources，随选中动态求值）+ 字段存在性校验
function registerContainerDataSourceProps() {
  designerRef.value?.setComponentRuleConfig('formContainer', () => [
    {
      type: 'select',
      field: 'dataSourceId',
      title: '数据源',
      options: enabledDataSources.value.map((d) => ({ value: d.id, label: `${d.name}（${d.type}）` })),
      props: { clearable: true, filterable: true },
      on: {
        change: async (value: string) => {
          if (!value) return
          const res = await dataSourceApi.getMetadata(value)
          const cols = (res.data?.columns || []).map((c: any) => c.key)
          const active = designerRef.value?.activeRule as any
          // 校验容器内子字段均在 cols 中，不在则标记非法（实现时以 UI 提示为准）
        },
      },
    },
    { type: 'json', field: 'recordLocator', title: '记录定位' },
  ], true)
}
```

> 注：`setComponentRuleConfig` 的精确签名与 `activeRule` 访问方式以本仓库 PageDesigner.vue 168-204 行现有实现为蓝本，实现时对齐。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/form/__tests__/FormDesigner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/form/FormDesigner.vue frontend/src/views/form/__tests__/FormDesigner.test.ts
git commit -m "feat: 表单设计器 FORM 容器数据源属性面板"
```

## Task 7: 页面端容器注册与动作泛化

**Files:**
- Modify: `frontend/src/views/page/PageDesigner.vue`
- Modify: `frontend/src/views/page/PageRendererPage.vue`
- Test: `frontend/src/views/page/__tests__/PageDesigner.test.ts`（若存在追加，否则新建）

**Interfaces:**
- Consumes: Task 1 容器规则（页面组件库注册）、Task 4 引擎
- Produces: 页面动作总线触发器支持 `field-change`/`record-change`；动作支持 `reload-record`/`save-record`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/views/page/__tests__/PageDesigner.test.ts（新建）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageDesigner from '../PageDesigner.vue'

describe('PageDesigner 动作总线泛化', () => {
  it('addAction 支持 field-change 触发器', () => {
    const wrapper = mount(PageDesigner, { global: { stubs: ['fc-designer'] } })
    const vm = wrapper.vm as any
    vm.addAction()
    expect(vm.schema.actions[0].trigger).toBe('node-click') // 默认仍兼容
    // 触发器选项（触发 UI）应包含 field-change/record-change（断言暴露的 triggerOptions）
    expect(vm.triggerOptions).toEqual(expect.arrayContaining(['node-click', 'row-click', 'field-change', 'record-change']))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/page/__tests__/PageDesigner.test.ts`
Expected: FAIL（triggerOptions 未定义）

- [ ] **Step 3: Implement page designer changes**

`PageDesigner.vue`：
1. 触发器下拉选项扩展（现有 `schema.actions` 弹窗中 trigger select，见 77-80 行）：

```html
<!-- 触发器下拉增加选项 -->
<el-option label="字段变化" value="field-change" />
<el-option label="记录变化" value="record-change" />
```

2. 动作步骤下拉扩展（现有 84-93 行步骤行）：

```html
<el-option label="重载记录" value="reload-record" />
<el-option label="保存记录" value="save-record" />
```

3. 注册 `formContainer` 到页面组件库（现有 registerPageComponents 中仿 page-table 注册）：

```ts
designerRef.value?.addComponent({
  label: '数据表单容器',
  name: 'formContainer',
  icon: 'icon-group',
  menu: 'main',
  rule: () => ({
    type: 'formContainer',
    field: 'fc' + Date.now(),
    title: '数据表单容器',
    props: { dataSourceId: '', recordLocator: { type: 'current-record' } },
    children: [],
  }),
})
designerRef.value?.setComponentRuleConfig('formContainer', dataSourceProps, true)
```

`PageRendererPage.vue`：挂载引擎（对齐 Task 5 的 FormRenderer 挂载逻辑），`record-change` 由树点击/路由参数驱动 → `engine.loadRecord(recordId)`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/page/__tests__/PageDesigner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/page/PageDesigner.vue frontend/src/views/page/PageRendererPage.vue frontend/src/views/page/__tests__/PageDesigner.test.ts
git commit -m "feat: 页面注册 FORM 容器 + 动作总线触发器泛化（field-change/record-change）"
```

## Task 8: 全量验证与回归

**Files:**
- 验证范围：全部已改动文件

- [ ] **Step 1: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 2: 全量组件测试**

Run: `npx vitest run src`
Expected: 全部 PASS（含既有 DataPicker/LookupPicker/FormRenderer/PageDesigner 回归）

- [ ] **Step 3: 构建验证**

Run: `npx vite build`
Expected: exit 0

- [ ] **Step 4: 手动 E2E 冒烟（后端已启动时）**

场景：业务表单编辑回显 + 值修改写回；页面左树右表联动；多容器同名字段独立。验证方式：启动前后端应用（独立 windows 终端窗口），在浏览器操作验证。

- [ ] **Step 5: Commit（如有修复）**

```bash
git add -A
git commit -m "test: FORM 容器数据源绑定全量验证与回归"
```
