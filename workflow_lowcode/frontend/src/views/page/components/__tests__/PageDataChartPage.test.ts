// ----- Task 3-e: page-chart 数据源驱动图表（PageDataChartPage 自取数 + PageChartConfigDialog 配置弹窗） -----
// npx vitest run src/views/page/components/__tests__/PageDataChartPage.test.ts
//
// mock 手法对齐既有基线：
// - @/api/data-source / @/utils/formDsBindingsStore → 照抄 PageDataTable.test.ts（api vi.fn + 绑定存储 plain object）
// - echarts 不 mock：jsdom 无 canvas，PageDataChart.render() 经 canvasAvailable/0 尺寸守卫静默跳过（照抄 PageDataChart.test.ts）

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import PageDataChartPage from '../PageDataChartPage.vue'
import PageChartConfigDialog from '../PageChartConfigDialog.vue'
import PageDataChart from '../PageDataChart.vue'
import { buildChartDataset } from '../chartDataset'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getMetadata: vi.fn(),
    queryData: vi.fn(),
  },
}))

vi.mock('@/utils/formDsBindingsStore', () => ({
  activeDsBindings: { value: [] as any[] },
}))

import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'

/** BizDataVO 行形态（dataSourceApi.queryData 返回：{id, data:{...}, version}） */
const voRecords = [
  { id: '1', data: { dept: '研发', amount: 100 }, version: 1 },
  { id: '2', data: { dept: '研发', amount: 50 }, version: 1 },
  { id: '3', data: { dept: '销售', amount: 80 }, version: 1 },
]

const metadata = {
  writable: false,
  columns: [
    { key: 'dept', label: '部门', columnType: 'VARCHAR' },
    { key: 'amount', label: '', columnType: 'DECIMAL' },
  ],
}

const barConfig = { type: 'bar', dimension: 'dept', measures: [{ key: 'amount', agg: 'sum', label: '金额' }] }

/** 数据源候选列（配置弹窗用） */
const dialogCandidates = [
  { key: 'dept', label: '部门', columnType: 'VARCHAR' },
  { key: 'amount', label: '金额', columnType: 'DECIMAL' },
  { key: 'qty', label: null, columnType: 'INT' },
]

beforeEach(() => {
  vi.clearAllMocks()
  ;(activeDsBindings as any).value = []
})

const busRegister = vi.fn()

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(PageDataChartPage, {
    props: {
      pageKey: 'page-emp',
      dsRefId: 'ds-emp',
      ...props,
    },
    global: {
      plugins: [ElementPlus],
      provide: {
        // 动作总线 stub（对齐 PageDataTable.test）：register 可观测，供实例上报断言
        pageActionBus: { dispatch: vi.fn(() => false), register: busRegister },
      },
    },
  })
}

describe('PageDataChartPage — 自取数 + dataset 转换链路', () => {
  it('运行态 size=-1 全量拉取 → 行扁平化 + config 归一化为 ViewChartConfig 交 PageDataChart；聚合链路 buildChartDataset 可复算', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: metadata })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: voRecords, total: 3 } })

    const wrapper = createWrapper({ config: barConfig })
    await flushPromises()

    // 取数：getMetadata（显示名映射）+ queryData（全量拉取，对齐 PageRenderer chart 分支 size=-1）
    expect(dataSourceApi.getMetadata).toHaveBeenCalledWith('ds-emp')
    expect(dataSourceApi.queryData).toHaveBeenCalledTimes(1)
    expect(dataSourceApi.queryData).toHaveBeenCalledWith('ds-emp', { size: -1 })

    // 动作总线上报：实例（refresh/setFilter/resetFilter/records）注册（未传 dataSourceId 时以 '' 键上报）
    expect(busRegister).toHaveBeenCalledWith('', expect.objectContaining({
      refresh: expect.any(Function),
      setFilter: expect.any(Function),
      resetFilter: expect.any(Function),
    }))

    const chart = wrapper.findComponent(PageDataChart)
    expect(chart.exists()).toBe(true)
    // 行扁平化：BizDataVO → {...字段, id, version}（PageDataTable fetchApi 同款）
    expect(chart.props('rows')).toEqual([
      { dept: '研发', amount: 100, id: '1', version: 1 },
      { dept: '研发', amount: 50, id: '2', version: 1 },
      { dept: '销售', amount: 80, id: '3', version: 1 },
    ])
    // PAGE 形态 {type, dimension, measures} → VIEW 轨 ViewChartConfig {type, xField, yFields, limit}
    expect(chart.props('config')).toEqual({
      type: 'bar',
      xField: 'dept',
      yFields: [{ key: 'amount', agg: 'sum' }],
      limit: 20,
    })
    // 列显示名：metadata label 为底 + 指标显示名覆盖（图例/系列名）
    expect(chart.props('columns')).toEqual([
      { key: 'dept', label: '部门' },
      { key: 'amount', label: '金额' },
    ])
    // 端到端复算：rows + 归一化 config 经 chartDataset 聚合出预期数据集（研发 150 / 销售 80）
    const ds = buildChartDataset(
      chart.props('rows') as any[],
      chart.props('config') as any,
      (key: string) => (key === 'amount' ? '金额' : key),
    )
    expect(ds).toEqual({
      dimensions: ['研发', '销售'],
      series: [{ key: 'amount', name: '金额', data: [150, 80] }],
    })
    wrapper.unmount()
  })

  it('designMode=true 取数固定首页 10 条（对齐 PageDataTable 设计态口径）', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: metadata })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: voRecords, total: 3 } })

    const wrapper = createWrapper({ config: barConfig, designMode: true })
    await flushPromises()

    expect(dataSourceApi.queryData).toHaveBeenCalledWith('ds-emp', { page: 1, size: 10 })
    wrapper.unmount()
  })

  it('取数中：loading 透传 PageDataChart（v-loading 遮罩）', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: metadata })
    ;(dataSourceApi.queryData as any).mockImplementation(() => new Promise(() => {})) // 挂起不落定

    const wrapper = createWrapper({ config: barConfig })
    await flushPromises()
    await nextTick()

    expect(wrapper.findComponent(PageDataChart).props('loading')).toBe(true)
    expect(wrapper.find('.el-loading-mask').exists()).toBe(true)
    wrapper.unmount()
  })

  it('空数据：画布退化为「暂无数据」空态不白屏', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: metadata })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })

    const wrapper = createWrapper({ config: barConfig })
    await flushPromises()

    expect(wrapper.findComponent(PageDataChart).exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无数据')
    wrapper.unmount()
  })

  it('config 缺失（未配置维度/指标）：自身 el-empty 占位且不发起取数', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.findComponent(PageDataChart).exists()).toBe(false)
    expect(wrapper.text()).toContain('请在属性面板「配置图表」中设置图表类型、维度列与指标列')
    // 未配置不发起取数；metadata（显示名映射）仍独立加载（渐进增强，失败不阻断）
    expect(dataSourceApi.queryData).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('取数失败：静默退化为「暂无数据」，不抛错', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: metadata })
    ;(dataSourceApi.queryData as any).mockRejectedValue(new Error('network down'))

    const wrapper = createWrapper({ config: barConfig })
    await flushPromises()

    expect(wrapper.text()).toContain('暂无数据')
    expect(wrapper.findComponent(PageDataChart).props('rows')).toEqual([])
    wrapper.unmount()
  })

  it('dsRefId 缺省：经绑定存储（activeDsBindings）按 dataSourceId 解析 refId 取数', async () => {
    ;(activeDsBindings as any).value = [{ id: 'ds-inner', refId: 'ds-global' }]
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: metadata })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })

    const wrapper = createWrapper({ config: barConfig, dsRefId: undefined, dataSourceId: 'ds-inner' })
    await flushPromises()

    expect(dataSourceApi.queryData).toHaveBeenCalledWith('ds-global', { size: -1 })
    wrapper.unmount()
  })
})

describe('PageChartConfigDialog — 图表配置弹窗', () => {
  /** el-dialog 内容 teleport 到 document.body：DOM 级断言用 document 查询（attachTo 保证树内挂载，unmount 清理） */
  function createDialog(props: Record<string, unknown> = {}) {
    return mount(PageChartConfigDialog, {
      props: {
        modelValue: true,
        candidates: dialogCandidates,
        ...props,
      },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
  }

  function dialogText(): string {
    return document.body.textContent || ''
  }

  it('类型切换：饼图且多指标时显示「仅取第一条」提示，切回柱状图提示消失', async () => {
    const wrapper = createDialog({
      config: { type: 'bar', dimension: 'dept', measures: [{ key: 'amount', agg: 'sum' }, { key: 'qty', agg: 'count' }] },
    })
    const vm = wrapper.vm as any
    expect(vm.local.type).toBe('bar')
    expect(dialogText()).not.toContain('饼图仅使用第一个指标列')

    vm.local.type = 'pie'
    await nextTick()
    expect(dialogText()).toContain('饼图仅使用第一个指标列')

    vm.local.type = 'line'
    await nextTick()
    expect(dialogText()).not.toContain('饼图仅使用第一个指标列')
    wrapper.unmount()
  })

  it('指标行增删：添加 +1 行 / 删除 -1 行，UI 行数同步', async () => {
    const wrapper = createDialog({
      config: { type: 'bar', dimension: 'dept', measures: [{ key: 'amount', agg: 'sum' }] },
    })
    const vm = wrapper.vm as any
    await nextTick() // el-dialog 内容经 onMounted 置 rendered 后下一 tick 落 DOM
    expect(document.querySelectorAll('.measure-row')).toHaveLength(1)

    vm.addMeasure()
    await nextTick()
    expect(vm.local.measures).toHaveLength(2)
    expect(document.querySelectorAll('.measure-row')).toHaveLength(2)

    vm.removeMeasure(1)
    await nextTick()
    expect(vm.local.measures).toHaveLength(1)
    expect(document.querySelectorAll('.measure-row')).toHaveLength(1)
    wrapper.unmount()
  })

  it('confirm 回传完整配置（update:config 与 confirm 同步触发并关闭弹窗）；回显已存配置', async () => {
    const wrapper = createDialog({
      config: { type: 'line', dimension: 'dept', measures: [{ key: 'amount', agg: 'avg', label: '平均金额' }] },
    })
    const vm = wrapper.vm as any
    // 回显
    expect(vm.local.dimension).toBe('dept')
    expect(vm.local.measures[0]).toMatchObject({ key: 'amount', agg: 'avg', label: '平均金额' })

    vm.handleConfirm()
    const payload = wrapper.emitted('confirm')?.[0]?.[0] as any
    expect(payload).toEqual({
      type: 'line',
      dimension: 'dept',
      measures: [{ key: 'amount', agg: 'avg', label: '平均金额' }],
    })
    expect(wrapper.emitted('update:config')?.[0]?.[0]).toEqual(payload)
    // 弹窗关闭（v-model 置 false）
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe(false)
    wrapper.unmount()
  })

  it('聚合口径复用 aggregateOptionsOf：数值列全量 5 项，文本列仅计数；切换到非数值字段时聚合回落 count', async () => {
    const wrapper = createDialog()
    const vm = wrapper.vm as any
    expect(vm.aggOptionsOf('amount')).toHaveLength(5) // DECIMAL
    expect(vm.aggOptionsOf('qty')).toHaveLength(5) // INT
    expect(vm.aggOptionsOf('dept')).toEqual([{ label: '计数', value: 'count' }]) // VARCHAR

    // 指标字段从数值切到文本：当前 agg=sum 不在可用口径 → 自动回落 count
    const row = { key: 'dept', agg: 'sum' as const }
    vm.onMeasureKeyChange(row)
    expect(row.agg).toBe('count')
    wrapper.unmount()
  })

  it('未配置维度/指标时确定按钮禁用（canConfirm 门控，无需 ElMessage 打断）', async () => {
    const wrapper = createDialog() // 无 config：预填一条空指标行
    const vm = wrapper.vm as any
    expect(vm.canConfirm).toBe(false)
    await nextTick() // 等弹窗内容落入 DOM
    const confirmBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === '确定') as HTMLButtonElement | undefined
    expect(confirmBtn?.disabled).toBe(true)

    // 补齐维度与有效指标后放行
    vm.local.dimension = 'dept'
    vm.local.measures[0].key = 'amount'
    await nextTick()
    expect(vm.canConfirm).toBe(true)
    expect(confirmBtn?.disabled).toBe(false)
    wrapper.unmount()
  })
})
