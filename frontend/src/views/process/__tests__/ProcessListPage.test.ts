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
    deploy: vi.fn(),
    copyProcess: vi.fn(),
    deleteDraft: vi.fn(),
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
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }
})
vi.mock('@element-plus/icons-vue', () => ({
  Plus: { name: 'Plus', render: () => h('span', '+') },
  Fold: { name: 'Fold', render: () => h('span', '◁') },
  Expand: { name: 'Expand', render: () => h('span', '▷') },
  Edit: { name: 'Edit', render: () => h('span', '✎') },
  Upload: { name: 'Upload', render: () => h('span', '↑') },
  CopyDocument: { name: 'CopyDocument', render: () => h('span', '⊕') },
  Delete: { name: 'Delete', render: () => h('span', '×') },
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

  it('操作列包含 5 个按钮：设计/部署/复制/版本/删除', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[1]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const labels = actionButtons.map((b: any) => b.label)
    expect(labels).toEqual(['设计', '部署', '复制', '版本', '删除'])
    wrapper.unmount()
  })

  it('max-visible-buttons 为 5', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[1]
    expect(rightTable.props('maxVisibleButtons')).toBe(5)
    wrapper.unmount()
  })

  it('设计/部署/复制/删除按钮有 icon 字段', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[1]
    const actionButtons = rightTable.props('actionButtons') as any[]
    expect(actionButtons.find((b: any) => b.label === '设计').icon).toBeDefined()
    expect(actionButtons.find((b: any) => b.label === '部署').icon).toBeDefined()
    expect(actionButtons.find((b: any) => b.label === '复制').icon).toBeDefined()
    expect(actionButtons.find((b: any) => b.label === '删除').icon).toBeDefined()
    wrapper.unmount()
  })

  it('版本按钮无 icon（文本按钮）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[1]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const versionBtn = actionButtons.find((b: any) => b.label === '版本')
    expect(versionBtn).toBeDefined()
    expect(versionBtn.icon).toBeUndefined()
    wrapper.unmount()
  })

  it('版本按钮 show: deployId 存在时为 true，不存在时为 false', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[1]
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
    const rightTable = stubs[1]
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
    const rightTable = stubs[1]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const deleteBtn = actionButtons.find((b: any) => b.label === '删除')
    expect(deleteBtn.confirm).toBeTruthy()
    wrapper.unmount()
  })

  it('部署按钮有 confirm 确认弹窗', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stubs = wrapper.findAllComponents(SearchTableStub)
    const rightTable = stubs[1]
    const actionButtons = rightTable.props('actionButtons') as any[]
    const deployBtn = actionButtons.find((b: any) => b.label === '部署')
    expect(deployBtn.confirm).toBeTruthy()
    wrapper.unmount()
  })

  it('categoryCollapsed 默认为 false，点击切换为 true', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    // 左侧卡片宽度应为 480px（展开状态）
    const leftCard = wrapper.find('.category-card')
    expect(leftCard.attributes('style')).toContain('480px')
    // 点击折叠按钮
    const collapseBtn = wrapper.find('.category-collapse-btn')
    await collapseBtn.trigger('click')
    await nextTick()
    // 折叠后宽度应为 40px
    expect(leftCard.attributes('style')).toContain('40px')
    wrapper.unmount()
  })

  it('categoryCollapsed 为 true 时左侧 SearchTable 隐藏', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    // 点击折叠按钮
    const collapseBtn = wrapper.find('.category-collapse-btn')
    await collapseBtn.trigger('click')
    await nextTick()
    // SearchTable 应该有 v-show=false（display:none）
    const leftSearchTable = wrapper.findAllComponents(SearchTableStub)[0]
    expect((leftSearchTable.element as HTMLElement).style.display).toBe('none')
    wrapper.unmount()
  })
})
