/**
 * 数据容器运行时组件（语义 A：容器自己取数，子树不复制，子组件文案按作用域插值）。
 *
 * 关键契约三条：
 *  1. 取数只走容器自己绑定的数据源（dsRefId 优先，回退页面数据源绑定表），一页或单条；
 *  2. 子规则交给我们自己的内嵌 form-create 渲染，且渲染前才做作用域插值——
 *     数据是异步回来的，插值发生在规则树里就必然拿到空值；
 *  3. 容器不吞掉子组件的独立性：子规则里带的 dsRefId / ready 上报照旧生效，
 *     容器只负责提供 {rows}/{row} 这层文案作用域。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PageDataContainer from '../PageDataContainer.vue'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    queryData: vi.fn(),
    aggregate: vi.fn(),
  },
}))

/** 内嵌 form-create 用假组件替身：把它收到的 rule 打出来，就能断言插值结果 */
const FormCreateStub = {
  name: 'form-create',
  props: ['rule', 'modelValue', 'option'],
  template: '<div class="fc-stub">{{ JSON.stringify(rule) }}</div>',
}

const CHILD_RULES = [
  { type: 'el-text', title: '共 {rows.length} 条' },
  { type: 'el-text', title: '首条 {rows[0].name}（{row.status}）' },
]

function queryDataMock(): ReturnType<typeof vi.fn> {
  return dataSourceApi.queryData as ReturnType<typeof vi.fn>
}

/**
 * 后端 queryData 的 records 是 BizDataVO：业务列嵌在 r.data 里，行 id/version 在外层。
 * 容器必须先把记录展开成扁平行，{row.name} / {row.id} 才可能取到值。
 */
function pageResult(records: unknown[], total = records.length) {
  return {
    code: 200,
    data: {
      records: records.map((r, i) => ({ id: `row-${i + 1}`, data: r, version: 1 })),
      total,
      page: 1,
      size: 20,
    },
  }
}

function mountContainer(props: Record<string, unknown> = {}) {
  return mount(PageDataContainer, {
    props: { childRules: CHILD_RULES, dataSourceId: 'ds-1', ...props },
    global: { plugins: [ElementPlus], stubs: { 'form-create': FormCreateStub } },
  })
}

function stubRules(wrapper: ReturnType<typeof mountContainer>): Array<{ title?: string }> {
  const text = wrapper.find('.fc-stub').text()
  return JSON.parse(text)
}

beforeEach(() => {
  vi.clearAllMocks()
  activeDsBindings.value = [{ id: 'ds-1', refId: 'ref-1' } as never]
  queryDataMock().mockResolvedValue(pageResult([{ name: '甲', status: 'NEW' }, { name: '乙' }]))
})

describe('PageDataContainer 取数', () => {
  it('绑了数据源就按绑定表的 refId 取一页，列表形态用 pageSize', async () => {
    mountContainer({ pageSize: 7 })
    await flushPromises()
    expect(queryDataMock()).toHaveBeenCalledWith('ref-1', { page: 1, size: 7 })
  })

  it('dsRefId 由宿主注入时优先用它，不再回退绑定表', async () => {
    mountContainer({ dsRefId: 'injected-ref' })
    await flushPromises()
    expect(queryDataMock().mock.calls[0][0]).toBe('injected-ref')
  })

  it('单条形态只取 1 条，{row.x} 出这条记录', async () => {
    const wrapper = mountContainer({ queryMode: 'single' })
    await flushPromises()
    expect(queryDataMock()).toHaveBeenCalledWith('ref-1', { page: 1, size: 1 })
    expect(stubRules(wrapper)[1].title).toBe('首条 甲（NEW）')
  })

  it('未绑数据源不发请求，出占位提示', async () => {
    const wrapper = mountContainer({ dataSourceId: '', childRules: [] })
    await flushPromises()
    expect(queryDataMock()).not.toHaveBeenCalled()
    expect(wrapper.find('.pdc-empty').text()).toBe('未绑定数据源')
  })

  it('取数失败落到空态但不抛错（页面其他组件不受牵连）', async () => {
    queryDataMock().mockRejectedValue(new Error('boom'))
    const wrapper = mountContainer()
    await flushPromises()
    expect(wrapper.find('.pdc-empty').text()).toBe('没有数据')
  })

  it('零条记录时变量出空值、计数出 0（已知根取不到值不显示花括号）', async () => {
    queryDataMock().mockResolvedValue(pageResult([]))
    const wrapper = mountContainer()
    await flushPromises()
    const rules = stubRules(wrapper)
    expect(rules[0].title).toBe('共 0 条')
    expect(rules[1].title).toBe('首条 （）')
  })

  it('计数徽标取后端 total，不是本页条数', async () => {
    queryDataMock().mockResolvedValue(pageResult([{ name: '甲' }], 138))
    const wrapper = mountContainer()
    await flushPromises()
    expect(wrapper.find('.pdc-count').text()).toBe('138')
  })

  it('BizDataVO 的 id / version 提升到行上，{row.id} 出记录标识', async () => {
    const wrapper = mountContainer({ childRules: [{ type: 'el-text', title: '{row.id} v{row.version}' }] })
    await flushPromises()
    expect(stubRules(wrapper)[0].title).toBe('row-1 v1')
  })
})

describe('PageDataContainer 子规则渲染', () => {
  it('子规则交内嵌 form-create 渲染，且模板已按作用域替换', async () => {
    const wrapper = mountContainer()
    await flushPromises()
    expect(wrapper.find('.fc-stub').exists()).toBe(true)
    expect(stubRules(wrapper)[0].title).toBe('共 2 条')
  })

  it('数据到达前不渲染子规则（避免先出一屏花括号再闪一次）', async () => {
    let resolve: (v: unknown) => void = () => {}
    queryDataMock().mockReturnValue(new Promise((r) => { resolve = r }))
    const wrapper = mountContainer()
    await flushPromises()
    expect(wrapper.find('.fc-stub').exists()).toBe(false)
    resolve(pageResult([{ name: '甲' }]))
    await flushPromises()
    expect(wrapper.find('.fc-stub').exists()).toBe(true)
  })

  it('没有子规则时出设计期提示，不空转一个 form-create', async () => {
    const wrapper = mountContainer({ childRules: [] })
    await flushPromises()
    expect(wrapper.find('.fc-stub').exists()).toBe(false)
    expect(wrapper.find('.pdc-empty').text()).toBe('容器里还没有组件')
  })

  it('子规则里的结构值不被容器改写（数据源 ID 与动作参数原样留给各自时机）', async () => {
    const wrapper = mountContainer({
      childRules: [
        { type: 'dash-kpi', props: { dataSourceId: '{row.ds}', title: '{row.name}' } },
      ],
    })
    await flushPromises()
    const rules = stubRules(wrapper)
    expect(rules[0].props.dataSourceId).toBe('{row.ds}')
    expect(rules[0].props.title).toBe('甲')
  })
})

describe('PageDataContainer 与动作总线/筛选器', () => {
  it('ready 上报 refresh / setFilter，与其他数据组件同一套契约', async () => {
    const wrapper = mountContainer()
    await flushPromises()
    const emitted = wrapper.emitted('ready') as Array<[{ refresh: unknown; setFilter: unknown }]>
    expect(typeof emitted[0][0].refresh).toBe('function')
    expect(typeof emitted[0][0].setFilter).toBe('function')
  })

  it('refresh 重新取数', async () => {
    const wrapper = mountContainer()
    await flushPromises()
    ;(wrapper.vm as { refresh: () => void }).refresh()
    await flushPromises()
    expect(queryDataMock()).toHaveBeenCalledTimes(2)
  })

  it('筛选器广播的条件进 filter 参数后重查（列表按筛选刷新）', async () => {
    const wrapper = mountContainer()
    await flushPromises()
    ;(wrapper.vm as { setFilter: (c: Record<string, unknown>) => void }).setFilter({
      status: { op: 'eq', value: 'NEW' },
    })
    await flushPromises()
    const params = queryDataMock().mock.calls[1][1] as { filter: string }
    expect(JSON.parse(params.filter).conditions).toEqual([{ column: 'status', op: 'eq', value: 'NEW' }])
  })

  it('refresh 清掉广播条件（与仪表盘组件语义一致）', async () => {
    const wrapper = mountContainer()
    await flushPromises()
    const vm = wrapper.vm as { setFilter: (c: Record<string, unknown>) => void; refresh: () => void }
    vm.setFilter({ status: { op: 'eq', value: 'NEW' } })
    await flushPromises()
    vm.refresh()
    await flushPromises()
    expect(queryDataMock().mock.calls[2][1]).not.toHaveProperty('filter')
  })

  it('容器配置的固定筛选与广播条件合并，不互相覆盖', async () => {
    const wrapper = mountContainer({ filter: JSON.stringify({ logic: 'and', conditions: [{ column: 'dept', op: 'eq', value: '财务' }] }) })
    await flushPromises()
    ;(wrapper.vm as { setFilter: (c: Record<string, unknown>) => void }).setFilter({
      status: { op: 'eq', value: 'NEW' },
    })
    await flushPromises()
    const conditions = (JSON.parse(queryDataMock().mock.calls[1][1].filter) as { conditions: unknown[] }).conditions
    expect(conditions).toHaveLength(2)
    expect(conditions[0]).toMatchObject({ column: 'dept' })
  })
})
