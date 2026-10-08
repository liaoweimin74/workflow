// ----- TDD: ProcessListPage 操作列按钮配置验证 -----
// npx vitest run src/views/process/__tests__/ProcessListPage.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import ProcessListPage from '../ProcessListPage.vue'

vi.mock('@/api/processDefinition', () => ({
  processDesignApi: {
    listDrafts: vi.fn(),
    createDraft: vi.fn(),
    saveDesign: vi.fn(),
    deploy: vi.fn(),
    copyProcess: vi.fn(),
    deleteDraft: vi.fn(),
    loadEditor: vi.fn(),
  },
  deployedProcessApi: {
    getVersions: vi.fn(),
  },
}))
vi.mock('@/api/category', () => ({
  categoryApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: vi.fn(), alert: vi.fn() } }
})
vi.mock('@element-plus/icons-vue', () => ({
  Plus: { name: 'Plus', render: () => h('span', '+') },
  Fold: { name: 'Fold', render: () => h('span', '◁') },
  Expand: { name: 'Expand', render: () => h('span', '▷') },
  Edit: { name: 'Edit', render: () => h('span', '✎') },
  Upload: { name: 'Upload', render: () => h('span', '↑') },
  CopyDocument: { name: 'CopyDocument', render: () => h('span', '⊕') },
  Delete: { name: 'Delete', render: () => h('span', '×') },
  Clock: { name: 'Clock', render: () => h('span', '◷') },
  FolderOpened: { name: 'FolderOpened', render: () => h('span', '▽') },
  Close: { name: 'Close', render: () => h('span', '×') },
}))

const ElMessage = (await import('element-plus')).ElMessage as any
const { processDesignApi, deployedProcessApi } = await import('@/api/processDefinition') as any
const { categoryApi } = await import('@/api/category') as any

const SearchTableStub = defineComponent({
  name: 'SearchTableStub',
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig', 'defaultPageSize', 'maxVisibleButtons', 'treeProps', 'tableSize', 'showSearch'],
  emits: ['row-click'],
  setup(props, { expose }) {
    expose({ fetchList: vi.fn() })
    return () => h('div', 'search-table-stub')
  },
})

describe('ProcessListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(categoryApi.list as any).mockResolvedValue({ data: [] })
    ;(processDesignApi.listDrafts as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
  })

  function createWrapper() {
    return mount(ProcessListPage, {
      global: {
        plugins: [ElementPlus],
        stubs: { SearchTable: SearchTableStub },
      },
    })
  }

  it('操作列包含 6 个按钮：设计/部署/复制/移动/版本/删除', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[0]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const labels = actionButtons.map((b: any) => b.label)
    expect(labels).toEqual(['设计', '部署', '复制', '移动', '版本', '删除'])
    wrapper.unmount()
  })

  it('max-visible-buttons 为 6（移动分类为高频操作需常显）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[0]
    expect(rightTable.props('maxVisibleButtons')).toBe(6)
    wrapper.unmount()
  })

  it('设计/部署/复制/删除按钮有 icon 字段', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[0]
    const actionButtons = rightTable.props('actionButtons') as any[]
    expect(actionButtons.find((b: any) => b.label === '设计').icon).toBeDefined()
    expect(actionButtons.find((b: any) => b.label === '部署').icon).toBeDefined()
    expect(actionButtons.find((b: any) => b.label === '复制').icon).toBeDefined()
    expect(actionButtons.find((b: any) => b.label === '删除').icon).toBeDefined()
    wrapper.unmount()
  })

  it('版本按钮有 Clock icon', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[0]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const versionBtn = actionButtons.find((b: any) => b.label === '版本')
    expect(versionBtn).toBeDefined()
    expect(versionBtn.icon).toBeDefined()
    wrapper.unmount()
  })

  it('版本按钮 show: deployId 存在时为 true，不存在时为 false', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[0]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const versionBtn = actionButtons.find((b: any) => b.label === '版本')
    expect(versionBtn.show({ deployId: 'abc' })).toBe(true)
    expect(versionBtn.show({ deployId: '' })).toBe(false)
    expect(versionBtn.show({})).toBe(false)
    wrapper.unmount()
  })

  it('删除按钮 show: version 为 0/undefined/null 时显示，version >= 1 时隐藏', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[0]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const deleteBtn = actionButtons.find((b: any) => b.label === '删除')
    expect(deleteBtn.show({ version: 0 })).toBe(true)
    expect(deleteBtn.show({ version: undefined })).toBe(true)
    expect(deleteBtn.show({ version: null })).toBe(true)
    expect(deleteBtn.show({})).toBe(true)
    expect(deleteBtn.show({ version: 1 })).toBe(false)
    expect(deleteBtn.show({ version: 3 })).toBe(false)
    wrapper.unmount()
  })

  it('删除按钮有 confirm 确认弹窗', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[0]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const deleteBtn = actionButtons.find((b: any) => b.label === '删除')
    expect(deleteBtn.confirm).toBeTruthy()
    wrapper.unmount()
  })

  it('部署按钮先预校验（loadEditor），校验失败弹 alert 并不调 deploy', async () => {
    const ElMessageBox = (await import('element-plus')).ElMessageBox as any
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[0]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const deployBtn = actionButtons.find((b: any) => b.label === '部署')
    // 新交互：不再用 SearchTable 的 confirm 弹窗，改为点击后先预校验
    expect(deployBtn.confirm).toBeUndefined()
    // 模拟草稿缺结束事件（用户实测场景）
    ;(processDesignApi.loadEditor as any).mockResolvedValue({
      data: {
        id: 'd1',
        name: '请假',
        key: 'leave',
        categoryId: null,
        description: '',
        status: 'DRAFT',
        nodeConfigs: {},
        bpmnXml: `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf"><process id="leave" isExecutable="true">
          <startEvent id="startEvent_1"/>
          <userTask id="A1" wf:nodeRole="initiator"/>
          <sequenceFlow id="F1" sourceRef="startEvent_1" targetRef="A1"/>
        </process></definitions>`,
      },
    })
    await deployBtn.onClick({ id: 'd1' })
    await flushPromises()
    expect(ElMessageBox.alert).toHaveBeenCalledTimes(1)
    const alertMsg = String(ElMessageBox.alert.mock.calls[0][0])
    expect(alertMsg).toContain('缺少结束事件')
    expect(processDesignApi.deploy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('校验通过后弹确认框并调用 deploy', async () => {
    const ElMessageBox = (await import('element-plus')).ElMessageBox as any
    ;(ElMessageBox.confirm as any).mockResolvedValue(true)
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[0]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const deployBtn = actionButtons.find((b: any) => b.label === '部署')
    ;(processDesignApi.loadEditor as any).mockResolvedValue({
      data: {
        id: 'd1',
        name: '请假',
        key: 'leave',
        categoryId: null,
        description: '',
        status: 'DRAFT',
        nodeConfigs: {},
        bpmnXml: `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf"><process id="leave" isExecutable="true">
          <startEvent id="startEvent_1"/>
          <userTask id="A1" wf:nodeRole="initiator"/>
          <endEvent id="e1"/>
          <sequenceFlow id="F1" sourceRef="startEvent_1" targetRef="A1"/>
          <sequenceFlow id="F2" sourceRef="A1" targetRef="e1"/>
        </process></definitions>`,
      },
    })
    ;(processDesignApi.deploy as any).mockResolvedValue({ data: {} })
    await deployBtn.onClick({ id: 'd1' })
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
    expect(processDesignApi.deploy).toHaveBeenCalledWith('d1')
    expect(ElMessage.success).toHaveBeenCalledWith('部署成功')
    wrapper.unmount()
  })

  it('顶部渲染分类胶囊条（全部 + 各分类），点击胶囊切换筛选', async () => {
    ;(categoryApi.list as any).mockResolvedValue({ data: [
      { id: 'c1', tenantId: 'default', name: '行政办公', sortOrder: 1, createdAt: '' },
      { id: 'c2', tenantId: 'default', name: '财务报销', sortOrder: 2, createdAt: '' },
    ] })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const chips = wrapper.findAll('.chip')
    expect(chips.length).toBe(4) // 全部 + 2 分类 + ＋
    expect(chips[0].text()).toBe('全部')
    expect(chips[1].text()).toContain('行政办公')
    expect(chips[2].text()).toContain('财务报销')
    // 点击「行政办公」→ fetchApi 携带 categoryId=c1
    await chips[1].trigger('click')
    const table = wrapper.findAllComponents(SearchTableStub)[0]
    const fetchApi = table.props('fetchApi') as any
    await fetchApi({})
    expect(processDesignApi.listDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'c1' }),
    )
    // 点「全部」→ categoryId 不筛选
    await chips[0].trigger('click')
    await fetchApi({})
    expect(processDesignApi.listDrafts).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: undefined }),
    )
    wrapper.unmount()
  })

  it('内联新建分类：点击＋ → 输入名称回车 → create 调用并刷新分类', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    await wrapper.find('.chip-add').trigger('click')
    await nextTick()
    const input = wrapper.find('.chip-input input')
    expect(input.exists()).toBe(true)
    await input.setValue('  新分类  ')
    await input.trigger('keydown.enter')
    await flushPromises()
    expect(categoryApi.create).toHaveBeenCalledWith({ name: '新分类' })
    // changed 后父页面重新拉取分类列表
    expect(categoryApi.list).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('内联新建分类：空名称回车不提交', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    await wrapper.find('.chip-add').trigger('click')
    await nextTick()
    const input = wrapper.find('.chip-input input')
    await input.setValue('   ')
    await input.trigger('keydown.enter')
    await flushPromises()
    expect(categoryApi.create).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('双击胶囊内联改名：回车提交 update', async () => {
    ;(categoryApi.list as any).mockResolvedValue({ data: [
      { id: 'c1', tenantId: 'default', name: '旧名', sortOrder: 1, createdAt: '' },
    ] })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const chip = wrapper.findAll('.chip').find(c => c.text().includes('旧名'))!
    await chip.trigger('dblclick')
    await nextTick()
    const input = wrapper.find('.chip-input input')
    expect(input.exists()).toBe(true)
    await input.setValue('新名')
    await input.trigger('keydown.enter')
    await flushPromises()
    expect(categoryApi.update).toHaveBeenCalledWith('c1', { name: '新名' })
    wrapper.unmount()
  })

  it('删除分类：确认后调 delete，且选中分类被删时回置「全部」', async () => {
    const ElMessageBox = (await import('element-plus')).ElMessageBox as any
    ;(ElMessageBox.confirm as any).mockResolvedValue(true)
    ;(categoryApi.list as any).mockResolvedValue({ data: [
      { id: 'c1', tenantId: 'default', name: '行政办公', sortOrder: 1, createdAt: '' },
    ] })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    // 选中 c1
    await wrapper.findAll('.chip')[1].trigger('click')
    const del = wrapper.find('.chip-delete')
    expect(del.exists()).toBe(true)
    await del.trigger('click')
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
    expect(categoryApi.delete).toHaveBeenCalledWith('c1')
    // 删除的是当前选中分类 → 筛选回置「全部」
    const fetchApi = wrapper.findAllComponents(SearchTableStub)[0].props('fetchApi') as any
    await fetchApi({})
    expect(processDesignApi.listDrafts).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: undefined }),
    )
    wrapper.unmount()
  })

  it('表格包含「分类」列（slotName category）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const columns = wrapper.findAllComponents(SearchTableStub)[0].props('columns') as any[]
    expect(columns.find(c => c.prop === 'categoryId')).toMatchObject({ label: '分类', slotName: 'category' })
    wrapper.unmount()
  })

  it('拖拽排序：drag c2 → drop 在 c1 前半段 → 全量按新顺序落库并刷新分类', async () => {
    ;(categoryApi.list as any).mockResolvedValue({ data: [
      { id: 'c1', tenantId: 'default', name: '行政办公', sortOrder: 0, createdAt: '' },
      { id: 'c2', tenantId: 'default', name: '财务报销', sortOrder: 1, createdAt: '' },
    ] })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const chips = wrapper.findAll('.chip') // [全部, c1, c2, ＋]
    expect(chips.length).toBe(4)
    const dataTransfer = { setData: vi.fn(), dropEffect: '', effectAllowed: '' }
    const fire = (el: Element, type: string, extra: Record<string, unknown> = {}) =>
      el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer, ...extra }))
    // 开始拖 c2 → 悬停在 c1 左半段（jsdom getBoundingClientRect 全 0，clientX<0 即前半段）
    fire(chips[2].element, 'dragstart')
    await nextTick()
    fire(chips[1].element, 'dragover', { clientX: -10 })
    await nextTick()
    // 落点指示条出现在 c1 前
    expect(chips[1].classes()).toContain('drop-before')
    fire(chips[1].element, 'drop')
    await flushPromises()
    // 新顺序 [c2, c1] → 全量落库 sortOrder=下标
    expect(categoryApi.update).toHaveBeenCalledTimes(2)
    expect(categoryApi.update).toHaveBeenNthCalledWith(1, 'c2', { sortOrder: 0 })
    expect(categoryApi.update).toHaveBeenNthCalledWith(2, 'c1', { sortOrder: 1 })
    // changed → 分类列表重拉自愈
    expect(categoryApi.list).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('拖拽排序：拖回原位（drop 在自己右侧）不落库', async () => {
    ;(categoryApi.list as any).mockResolvedValue({ data: [
      { id: 'c1', tenantId: 'default', name: '行政办公', sortOrder: 0, createdAt: '' },
      { id: 'c2', tenantId: 'default', name: '财务报销', sortOrder: 1, createdAt: '' },
    ] })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const chips = wrapper.findAll('.chip')
    const dataTransfer = { setData: vi.fn(), dropEffect: '', effectAllowed: '' }
    const fire = (el: Element, type: string, extra: Record<string, unknown> = {}) =>
      el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer, ...extra }))
    // 拖 c1 → 悬停在 c2 左半段（插入点=索引 0，即 c1 原位）→ 位置不变
    fire(chips[1].element, 'dragstart')
    await nextTick()
    fire(chips[2].element, 'dragover', { clientX: -10 })
    await nextTick()
    fire(chips[2].element, 'drop')
    await flushPromises()
    expect(categoryApi.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('移动分类弹窗：选择分类后确定 → saveDesign 仅传 categoryId', async () => {
    ;(categoryApi.list as any).mockResolvedValue({ data: [
      { id: 'c1', tenantId: 'default', name: '行政办公', sortOrder: 1, createdAt: '' },
      { id: 'c2', tenantId: 'default', name: '财务报销', sortOrder: 2, createdAt: '' },
    ] })
    const wrapper = mount(ProcessListPage, {
      global: { plugins: [ElementPlus], stubs: { SearchTable: SearchTableStub } },
      attachTo: document.body,
    })
    await nextTick()
    await flushPromises()
    const table = wrapper.findAllComponents(SearchTableStub)[0]
    const moveBtn = (table.props('actionButtons') as any[]).find((b: any) => b.label === '移动')!
    await moveBtn.onClick({ id: 'd1', name: '请假流程', categoryId: null })
    await flushPromises()
    // 弹窗出现（teleport 到 body），展示流程名
    const dialog = document.body.querySelector('.el-dialog')!
    expect(dialog.textContent).toContain('调整分类')
    expect(dialog.textContent).toContain('请假流程')
    // 打开下拉并选「财务报销」
    ;(dialog.querySelector('.el-select__wrapper') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await flushPromises()
    const option = [...document.querySelectorAll('.el-select-dropdown__item')].find(el =>
      el.textContent!.includes('财务报销'),
    ) as HTMLElement
    expect(option).toBeDefined()
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    // 确定
    const confirmBtn = [...(dialog.querySelector('.el-dialog__footer') as HTMLElement).querySelectorAll('button')]
      .find(b => b.textContent!.includes('确定')) as HTMLElement
    confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(processDesignApi.saveDesign).toHaveBeenCalledWith('d1', { categoryId: 'c2' })
    expect(ElMessage.success).toHaveBeenCalledWith('分类已调整')
    wrapper.unmount()
  })

  it('移动分类弹窗：未分类流程不选直接确定 → saveDesign 传 clearCategory 清空', async () => {
    const wrapper = mount(ProcessListPage, {
      global: { plugins: [ElementPlus], stubs: { SearchTable: SearchTableStub } },
      attachTo: document.body,
    })
    await nextTick()
    await flushPromises()
    const table = wrapper.findAllComponents(SearchTableStub)[0]
    const moveBtn = (table.props('actionButtons') as any[]).find((b: any) => b.label === '移动')!
    await moveBtn.onClick({ id: 'd2', name: '未归类流程', categoryId: null })
    await flushPromises()
    const dialog = document.body.querySelector('.el-dialog')!
    const confirmBtn = [...(dialog.querySelector('.el-dialog__footer') as HTMLElement).querySelectorAll('button')]
      .find(b => b.textContent!.includes('确定')) as HTMLElement
    confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(processDesignApi.saveDesign).toHaveBeenCalledWith('d2', { clearCategory: true })
    wrapper.unmount()
  })
})
