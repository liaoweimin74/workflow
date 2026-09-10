// ----- TDD: useLinkageContainer 共享联动容器机制 -----
// npx vitest run src/views/form/composables/__tests__/useLinkageContainer.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElMessageBox, ElMessage } from 'element-plus'

// Mock element-plus 消息/确认框（delete/copy 依赖）
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: vi.fn(async () => true) },
  ElMessage: { success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

// Mock dataSourceApi
vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getMetadata: vi.fn(async () => ({ data: { columns: [], writable: true } })),
    getData: vi.fn(async () => ({ data: {} })),
    updateData: vi.fn(async () => ({ data: null })),
    queryData: vi.fn(),
    createData: vi.fn(async () => ({ data: {} })),
    deleteData: vi.fn(async () => ({ data: null })),
  },
}))

import { dataSourceApi } from '@/api/data-source'

// Mock DsBindingEngine：提供可观测的假引擎（vi.hoisted 保证在 mock 工厂内安全引用）
const engineFns = vi.hoisted(() => ({ value: undefined as { engine: any; deps: any } | undefined }))
vi.mock('@/views/form/components/DsBindingEngine', () => ({
  createDsBindingEngine: vi.fn((dsApi, deps) => {
    const engine = {
      mount: vi.fn(),
      loadRecord: vi.fn(async () => {}),
      flush: vi.fn(async () => {}),
      saveAll: vi.fn(async () => true),
      getLastRecord: vi.fn(() => ({})),
    }
    engineFns.value = { engine, deps }
    return engine
  }),
}))

import { useLinkageContainer, type LinkageContainer } from '../useLinkageContainer'

// ---- 常用构造 ----
function linkRule(dataSourceId: string, displayMode = 'dialog', extra: any = {}): any {
  return {
    type: 'formContainer',
    props: {
      dataSourceId,
      displayMode,
      tabTitle: '编辑',
      dialogWidth: '500px',
      dialogHeight: '400px',
      rule: [{ type: 'input', field: 'name', title: '名称', value: '' }],
      ...extra,
    },
    children: [],
  }
}

function makeDefault(dataSources: any[] = []) {
  const api = useLinkageContainer({
    dsApi: dataSourceApi as any,
    dataSources: () => dataSources,
    formDataApi: {
      getValue: (c, field) => c.formData[field],
      setValue: (c, field, value) => {
        c.formData = { ...c.formData, [field]: value }
      },
    },
    findComponent: (key) => components.get(key),
    onCustomAction: vi.fn(),
    openNewTab: vi.fn(),
  })
  const components = new Map<string, any>()
  return { api, components }
}

beforeEach(() => {
  vi.clearAllMocks()
  engineFns.value = undefined
})

describe('extractContainers：从主树提取联动容器', () => {
  it('dialog 容器从主树移除并注册为独立容器，返回无容器主树', () => {
    const { api } = makeDefault()
    const tree = [linkRule('ds1', 'dialog'), { type: 'input', field: 'a' }]
    const main = api.extractContainers(tree as any)
    expect(main).toHaveLength(1)
    expect((main[0] as any).type).toBe('input')
    expect(api.containers.value).toHaveLength(1)
    expect(api.containers.value[0].key).toBe('ds1')
    expect(api.containers.value[0].displayMode).toBe('dialog')
  })

  it('dialog/inline/newTab 统一提取（仅渲染位置不同），且含子 rule 的容器也提取', () => {
    const { api } = makeDefault()
    const tree = [
      linkRule('ds1', 'dialog'),
      linkRule('ds2', 'inline'),
      linkRule('ds3', 'newTab'),
      { type: 'grid', children: [linkRule('ds4', 'dialog')] },
    ]
    const main = api.extractContainers(tree as any)
    // 仅剩 grid（其 children 内容器也被移除）
    expect(main).toHaveLength(1)
    const modes = api.containers.value.map((c) => c.displayMode)
    expect(modes).toEqual(['dialog', 'inline', 'newTab', 'dialog'])
    // 各容器子 rule 保留
    expect(api.containers.value[0].renderRule).toHaveLength(1)
  })

  it('容器 props.rule 内的嵌套容器不在顶层递归提取（与原版 extractDialogContainers 行为一致）', () => {
    const { api } = makeDefault()
    const tree = [linkRule('outer', 'dialog', { rule: [linkRule('inner', 'inline')] })]
    api.extractContainers(tree as any)
    // 仅提取顶层 outer；inner 保留在其 props.rule 内作为子表单字段集
    expect(api.containers.value).toHaveLength(1)
    expect(api.containers.value[0].key).toBe('outer')
  })

  it('无 dataSourceId 的 formContainer 保留在主树', () => {
    const { api } = makeDefault()
    const tree = [{ type: 'formContainer', props: {} }]
    const main = api.extractContainers(tree as any)
    expect(main).toHaveLength(1)
    expect(api.containers.value).toHaveLength(0)
  })
})

describe('makeContainer：按钮配置默认值', () => {
  it('showNew/showCancel/showConfirm 默认 true，showDelete/showCopy 默认 false', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    const b = api.containers.value[0].buttons
    expect(b.showNew).toBe(true)
    expect(b.showCancel).toBe(true)
    expect(b.showConfirm).toBe(true)
    expect(b.showDelete).toBe(false)
    expect(b.showCopy).toBe(false)
  })

  it('showDeleteButton/showCopyButton/showNewButton=false 等配置生效', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog', { showDeleteButton: true, showCopyButton: true, showNewButton: false, showCancelButton: false })] as any)
    const b = api.containers.value[0].buttons
    expect(b.showDelete).toBe(true)
    expect(b.showCopy).toBe(true)
    expect(b.showNew).toBe(false)
    expect(b.showCancel).toBe(false)
  })

  it('custom 按钮从 customButtons 解析', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog', { customButtons: [{ key: 'x', label: 'X' }] })] as any)
    expect(api.containers.value[0].buttons.custom).toHaveLength(1)
  })
})

describe('mountContainerEngine：引擎读写容器独立 formData', () => {
  it('引擎 setValue 写入容器 formData（与主表单隔离）', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    const eng = engineFns.value
    expect(eng).toBeTruthy()
    const deps = eng.deps
    deps.api.setValue('name', '张三')
    expect(api.containers.value[0].formData.name).toBe('张三')
  })

  it('引擎 getValue 读容器 formData', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    const deps = engineFns.value.deps
    api.containers.value[0].formData = { name: '李四' }
    expect(deps.api.getValue('name')).toBe('李四')
  })

  it('引擎 recordId 返回容器 currentRecordId', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    const deps = engineFns.value.deps
    api.containers.value[0].currentRecordId = 'r1'
    expect(deps.recordId()).toBe('r1')
  })
})

describe('containerAction：默认按钮行为', () => {
  it('new 清空建新', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    const c = api.containers.value[0]
    c.formData = { name: 'old' }
    c.currentRecordId = 'r1'
    api.containerAction(c, 'new')
    expect(c.formData).toEqual({})
    expect(c.currentRecordId).toBeUndefined()
  })

  it('cancel 关闭容器', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    const c = api.containers.value[0]
    c.visible = true
    api.containerAction(c, 'cancel')
    expect(c.visible).toBe(false)
  })

  it('confirm 编辑记录 → 引擎 saveAll 并刷新关联表格、关闭', async () => {
    const { api } = makeDefault()
    const refresh = vi.fn()
    const components = new Map<string, any>([['ds1', { refresh }]])
    const a2 = useLinkageContainer({
      dsApi: dataSourceApi as any,
      dataSources: () => [{ id: 'ds1', refId: 'ref1' }],
      formDataApi: { getValue: (c: any, f: string) => c.formData[f], setValue: (c: any, f: string, v: unknown) => { c.formData = { ...c.formData, [f]: v } } },
      findComponent: (key) => components.get(key),
      onCustomAction: vi.fn(),
    })
    a2.extractContainers([linkRule('ds1', 'dialog')] as any)
    const c = a2.containers.value[0]
    c.currentRecordId = 'r1'
    c.visible = true
    await a2.containerAction(c, 'confirm')
    const eng = engineFns.value.engine
    expect(eng.saveAll).toHaveBeenCalledWith('r1')
    expect(refresh).toHaveBeenCalled()
    expect(c.visible).toBe(false)
  })

  it('confirm 新增记录（无 currentRecordId）→ createData 并刷新、关闭', async () => {
    const { api } = makeDefault()
    const refresh = vi.fn()
    const components = new Map<string, any>([['ds1', { refresh }]])
    const a2 = useLinkageContainer({
      dsApi: dataSourceApi as any,
      dataSources: () => [{ id: 'ds1', refId: 'ref1' }],
      formDataApi: { getValue: (c: any, f: string) => c.formData[f], setValue: (c: any, f: string, v: unknown) => { c.formData = { ...c.formData, [f]: v } } },
      findComponent: (key) => components.get(key),
      onCustomAction: vi.fn(),
    })
    a2.extractContainers([linkRule('ds1', 'dialog')] as any)
    const c = a2.containers.value[0]
    c.formData = { name: '新记录' }
    c.visible = true
    await a2.containerAction(c, 'confirm')
    expect(dataSourceApi.createData).toHaveBeenCalledWith('ref1', { name: '新记录' })
    expect(refresh).toHaveBeenCalled()
    expect(c.visible).toBe(false)
  })

  it('delete：确认后 deleteData 并刷新、关闭', async () => {
    const { api } = makeDefault()
    const refresh = vi.fn()
    const components = new Map<string, any>([['ds1', { refresh }]])
    const a2 = useLinkageContainer({
      dsApi: dataSourceApi as any,
      dataSources: () => [{ id: 'ds1', refId: 'ref1' }],
      formDataApi: { getValue: (c: any, f: string) => c.formData[f], setValue: (c: any, f: string, v: unknown) => { c.formData = { ...c.formData, [f]: v } } },
      findComponent: (key) => components.get(key),
      onCustomAction: vi.fn(),
    })
    a2.extractContainers([linkRule('ds1', 'dialog')] as any)
    const c = a2.containers.value[0]
    c.currentRecordId = 'r1'
    c.visible = true
    await a2.containerAction(c, 'delete')
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(dataSourceApi.deleteData).toHaveBeenCalledWith('ref1', 'r1')
    expect(refresh).toHaveBeenCalled()
    expect(c.visible).toBe(false)
  })

  it('copy：以当前 formData 为模板 createData（去除 id/version）', async () => {
    const { api } = makeDefault()
    const refresh = vi.fn()
    const components = new Map<string, any>([['ds1', { refresh }]])
    const a2 = useLinkageContainer({
      dsApi: dataSourceApi as any,
      dataSources: () => [{ id: 'ds1', refId: 'ref1' }],
      formDataApi: { getValue: (c: any, f: string) => c.formData[f], setValue: (c: any, f: string, v: unknown) => { c.formData = { ...c.formData, [f]: v } } },
      findComponent: (key) => components.get(key),
      onCustomAction: vi.fn(),
    })
    a2.extractContainers([linkRule('ds1', 'dialog')] as any)
    const c = a2.containers.value[0]
    c.formData = { id: 'old', version: 1, name: '复制' }
    c.visible = true
    await a2.containerAction(c, 'copy')
    expect(dataSourceApi.createData).toHaveBeenCalledWith('ref1', { name: '复制' })
    expect(refresh).toHaveBeenCalled()
    expect(c.visible).toBe(false)
  })
})

describe('hasContainerButtons：footer 显隐', () => {
  it('任一按钮可见 → true', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'inline')] as any)
    expect(api.hasContainerButtons(api.containers.value[0])).toBe(true)
  })

  it('所有按钮隐藏 → false', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'inline', { showNewButton: false, showCancelButton: false, showConfirmButton: false, showDeleteButton: false, showCopyButton: false, customButtons: [] })] as any)
    expect(api.hasContainerButtons(api.containers.value[0])).toBe(false)
  })
})

describe('动作分发：open/load/save/close', () => {
  it('openContainer dialog：清空、显示、加载行记录', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    const c = api.containers.value[0]
    api.openContainer('ds1', 'r1')
    expect(c.visible).toBe(true)
    expect(c.currentRecordId).toBe('r1')
    expect(engineFns.value.engine.loadRecord).toHaveBeenCalledWith('r1')
  })

  it('openContainer inline：同样统一打开（点击显示）', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'inline')] as any)
    const c = api.containers.value[0]
    api.openContainer('ds1', '')
    expect(c.visible).toBe(true)
    expect(engineFns.value.engine.loadRecord).not.toHaveBeenCalled() // 无 rid 不加载
  })

  it('openContainer newTab：调用 openNewTab 回调', () => {
    const openNewTab = vi.fn()
    const a2 = useLinkageContainer({
      dsApi: dataSourceApi as any,
      dataSources: () => [],
      formDataApi: { getValue: (c: any, f: string) => c.formData[f], setValue: (c: any, f: string, v: unknown) => { c.formData = { ...c.formData, [f]: v } } },
      openNewTab,
      onCustomAction: vi.fn(),
    })
    a2.extractContainers([linkRule('ds1', 'newTab')] as any)
    a2.openContainer('ds1', 'r1')
    expect(openNewTab).toHaveBeenCalled()
  })

  it('loadRecord：加载到目标容器引擎', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    api.loadRecord('ds1', 'r9')
    expect(engineFns.value.engine.loadRecord).toHaveBeenCalledWith('r9')
  })

  it('loadRecord：无容器时回退', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    const fallback = vi.fn()
    api.loadRecord('nope', 'r9', fallback)
    expect(fallback).toHaveBeenCalled()
  })

  it('flushContainer：冲刷容器引擎', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    api.flushContainer('ds1')
    expect(engineFns.value.engine.flush).toHaveBeenCalled()
  })

  it('closeContainer：关闭目标容器', () => {
    const { api } = makeDefault()
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    const c = api.containers.value[0]
    c.visible = true
    api.closeContainer('ds1')
    expect(c.visible).toBe(false)
  })
})

describe('containerRefId：解析数据源 refId', () => {
  it('按 dataSourceId 返回 refId', () => {
    const { api } = makeDefault([{ id: 'ds1', refId: 'ref9' }])
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    expect(api.containerRefId(api.containers.value[0])).toBe('ref9')
  })

  it('未匹配返回 undefined', () => {
    const { api } = makeDefault([])
    api.extractContainers([linkRule('ds1', 'dialog')] as any)
    expect(api.containerRefId(api.containers.value[0])).toBeUndefined()
  })
})
