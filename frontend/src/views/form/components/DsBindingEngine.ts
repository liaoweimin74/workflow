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

/** 递归收集容器内所有可赋值字段（含 group/subForm 容器自身 field——作为整体数组/对象赋值，及其 props.rule 子级） */
function collectFieldNames(rules: Rule[], out: string[] = []): string[] {
  for (const r of rules) {
    const props = ((r as Record<string, unknown>).props || {}) as Record<string, unknown>
    const field = (r as Record<string, unknown>).field as string | undefined
    if (field) out.push(field) // 叶子字段与 group/subForm 容器字段都收集（容器整体赋值）
    if (Array.isArray(props.rule)) collectFieldNames(props.rule as Rule[], out)
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
        const res = await dsApi.getData(b.dataSourceId, recordId)
        const record = (res.data || {}) as unknown as Record<string, unknown>
        for (const f of b.fieldNames) {
          if (f in record) deps.api.setValue(f, record[f])
        }
      } catch {
        // http 拦截器已提示
      }
    }
  }

  /** mount 时预取 metadata，确定各容器 writable（写路径依赖） */
  async function resolveWritable() {
    await Promise.all(bindings.map(async (b) => {
      try {
        const meta = await dsApi.getMetadata(b.dataSourceId)
        b.writable = meta.data?.writable ?? true
      } catch {
        b.writable = true
      }
    }))
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
    void resolveWritable()
    return true
  }

  return { mount, loadRecord, flush }
}
