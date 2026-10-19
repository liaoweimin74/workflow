// ----- TDD: PageRendererPage 组件型物料注册（remote-materials 二期 5.1） -----
// npx vitest run src/views/page/__tests__/PageRendererPage.widget.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/page', () => ({
  pageApi: { getPageByKey: vi.fn() },
}))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getData: vi.fn(),
    updateData: vi.fn(),
    createData: vi.fn(),
    deleteData: vi.fn(),
    getMetadata: vi.fn(() => Promise.resolve({ data: { writable: true, columns: [] } })),
    queryData: vi.fn(),
  },
}))

vi.mock('@/views/form/schemaRules', () => ({
  normalizeForRender: (rules: any[]) => rules,
  deepDisableRules: (rules: any[]) => rules,
}))

// form-create 桩：保留 component() 注册面，渲染节点 JSON
const componentRegister = vi.fn()
vi.mock('@form-create/element-ui', () => {
  const FormCreateStub = defineComponent({
    name: 'FormCreate',
    props: ['modelValue', 'rule', 'option'],
    setup(props) {
      return () =>
        h('div', { class: 'fc-stub' }, [
          ...(props.rule || []).map((node: any, i: number) =>
            h('div', { key: i, class: 'fc-node' }, JSON.stringify(node?.type ?? node))
          ),
        ])
    },
  })
  ;(FormCreateStub as any).component = (...args: any[]) => componentRegister(...args)
  return { default: FormCreateStub }
})

const loadWidgetComponent = vi.fn()
vi.mock('@/platform/materialLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/materialLoader')>()
  return {
    ...actual,
    loadWidgetComponent: (...args: any[]) => loadWidgetComponent(...args),
  }
})

const mockRoute = vi.hoisted(() => ({
  params: { pageKey: 'emp_page' },
  query: {} as Record<string, string>,
}))

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn(), resolve: (to: any) => ({ href: '/x' }) }),
}))

import { pageApi } from '@/api/page'
import PageRendererPage from '../PageRendererPage.vue'

const RealWidget = { name: 'StockChart', render: () => h('div', 'chart') }

/** 页面里既有普通组件也有物料组件（物料嵌在容器子规则里也要能被发现） */
function pageSchemaWithWidget(): any {
  return {
    type: 'PAGE',
    rule: [
      { type: 'input', field: 'name', title: '姓名' },
      { type: 'material:stock-chart', field: 'w1', title: '', props: { title: '库存趋势' } },
      {
        type: 'formContainer',
        field: 'FC1',
        title: '容器',
        props: { dataSourceId: 'dsForm', rule: [{ type: 'material:demo-widget', field: 'w2' }] },
      },
    ],
    dataSources: [{ id: 'dsForm', refId: 'global-form' }],
    actions: [],
  }
}

async function mountPage(schema: any) {
  ;(pageApi.getPageByKey as any).mockResolvedValue({
    data: { type: 'PAGE', schema: JSON.stringify(schema) },
  })
  const wrapper = mount(PageRendererPage, {
    global: {
      plugins: [ElementPlus],
      stubs: { 'el-result': { template: '<div class="result-stub" />' } },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  componentRegister.mockClear()
  loadWidgetComponent.mockReset()
  mockRoute.query = {}
})

describe('PageRendererPage 物料组件注册', () => {
  it('渲染前把引用到的物料注册进 form-create（含容器子规则里的引用）', async () => {
    loadWidgetComponent.mockResolvedValue(RealWidget as any)

    await mountPage(pageSchemaWithWidget())

    const names = componentRegister.mock.calls.map((c: any[]) => c[0])
    expect(names).toContain('material:stock-chart')
    expect(names).toContain('material:demo-widget')
    expect(componentRegister).toHaveBeenCalledWith('material:stock-chart', RealWidget)
  })

  it('物料缺失时注册占位错误块，页面其余部分照常渲染', async () => {
    loadWidgetComponent.mockRejectedValue(new Error('物料不存在：stock-chart'))

    const wrapper = await mountPage(pageSchemaWithWidget())

    expect(componentRegister).toHaveBeenCalledWith(
      'material:stock-chart',
      expect.objectContaining({ name: 'MaterialWidgetMissing-stock-chart' }),
    )
    // 页面没有整体报错，普通节点仍在渲染树里
    expect(wrapper.find('.result-stub').exists()).toBe(false)
    expect(wrapper.findAll('.fc-node').length).toBeGreaterThan(0)
  })

  it('页面不引用物料时不触发物料加载', async () => {
    await mountPage({ type: 'PAGE', rule: [{ type: 'input', field: 'name' }], dataSources: [], actions: [] })

    expect(loadWidgetComponent).not.toHaveBeenCalled()
  })
})
