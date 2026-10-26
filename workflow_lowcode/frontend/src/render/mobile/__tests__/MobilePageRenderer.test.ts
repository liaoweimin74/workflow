import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Vant, { List as VanList } from 'vant'

import { dataSourceApi } from '@/api/data-source'
import MobileCardList from '../blocks/MobileCardList.vue'
import MobileDataContainer from '../blocks/MobileDataContainer.vue'
import MobilePageRenderer from '../MobilePageRenderer.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: { queryData: vi.fn() },
}))

const queryData = vi.mocked(dataSourceApi.queryData)

/** @form-create/vant 内置按 app 注册表解析 van-*；测试挂载环境对齐 main.ts 的 app.use(Vant) */
const GLOBALS = { plugins: [Vant] }

/**
 * 渲染器骨架端到端（@form-create/vant 独立实例）：同一份 rule 进移动渲染，
 * 已实现块=移动组件挂载；无等价块=「该端不支持」占位。
 */
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(dataSourceApi.queryData).mockResolvedValue({
    data: { records: [{ id: 'r0', data: { code: 'C001' }, version: 1 }], total: 1, page: 1, size: 20 },
  } as never)
})

describe('MobilePageRenderer（Vant 渲染器骨架）', () => {
  it('renders implemented blocks with mobile components and missing blocks with the unsupported notice', async () => {
    const wrapper = mount(MobilePageRenderer, {
      props: {
        rule: [
          { type: 'page-table', field: 'tbl', props: { dataSourceId: 'ds-1', columns: [{ key: 'code', label: '编号' }] } },
          { type: 'page-tree-table', field: 'tt' },
        ],
      },
      global: GLOBALS,
    })
    await flushPromises()

    // card-list 模板已实现 → 移动卡片块组件挂载并取数
    expect(wrapper.findComponent(MobileCardList).exists()).toBe(true)
    // 无移动等价 → 占位与理由
    expect(wrapper.text()).toContain('该端不支持')
    expect(wrapper.text()).toContain('page-tree-table')
    expect(wrapper.text()).toContain('复杂树形表格')
  })

  it('renders built-in form rules through the vant instance without placeholders', async () => {
    const wrapper = mount(MobilePageRenderer, {
      props: { rule: [{ type: 'input', field: 'name', title: '名称' }] },
      global: GLOBALS,
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('暂不支持')
    expect(wrapper.text()).not.toContain('暂未支持')
  })

  it('injects dsRefId from page dataSources so blocks fetch the real source', async () => {
    const wrapper = mount(MobilePageRenderer, {
      props: {
        rule: [{ type: 'page-table', field: 'tbl', props: { dataSourceId: 'ds-1', columns: [{ key: 'code', label: '编号' }] } }],
        dataSources: [{ id: 'ds-1', refId: 'ref-9' }],
      },
      global: GLOBALS,
    })
    await flushPromises()
    wrapper.findComponent(MobileCardList).findComponent(VanList).vm.$emit('load')
    await flushPromises()
    expect(dataSourceApi.queryData).toHaveBeenCalledWith('ref-9', expect.anything())
  })

  it('applies channelProfiles overlay for the active channel to card blocks', async () => {
    queryData.mockResolvedValue({
      data: { records: [{ id: 'r0', data: { code: 'C001', name: '张三' }, version: 1 }], total: 1, page: 1, size: 20 },
    } as never)
    const wrapper = mount(MobilePageRenderer, {
      props: {
        rule: [
          {
            type: 'page-table',
            field: 'tbl',
            props: {
              dataSourceId: 'ds-1',
              columns: [
                { key: 'code', label: '编号' },
                { key: 'name', label: '名称' },
              ],
            },
          },
        ],
        dataSources: [{ id: 'ds-1', refId: 'ref-9' }],
        channel: 'H5',
        channelProfiles: { H5: { tbl: { card: { title: 'name' } } }, WEB: { tbl: { card: { title: 'code' } } } },
      },
      global: GLOBALS,
    })
    await flushPromises()
    wrapper.findComponent(MobileCardList).findComponent(VanList).vm.$emit('load')
    await flushPromises()
    // 生效渠道=H5：标题槽=name（缺省会拿第1列 code）
    expect(wrapper.find('.m-card__title').text()).toBe('张三')
  })

  it('normalizes a saved data container into childRules and renders it with the mobile container', async () => {
    queryData.mockResolvedValue({
      data: { records: [{ id: 'r0', data: { name: '张三' }, version: 1 }], total: 1, page: 1, size: 20 },
    } as never)
    const wrapper = mount(MobilePageRenderer, {
      props: {
        rule: [
          {
            type: 'page-data-container',
            field: 'dc1',
            props: { dataSourceId: 'ds-1', rule: [{ type: 'input', field: 'x', title: '{rows[0].name}的记录' }] },
          },
        ],
        dataSources: [{ id: 'ds-1', refId: 'ref-9' }],
      },
      global: GLOBALS,
    })
    await flushPromises()
    // 容器移动实现挂载，保存态 rule → childRules，内嵌 vant 渲染作用域插值后的子规则
    expect(wrapper.findComponent(MobileDataContainer).exists()).toBe(true)
    expect(wrapper.text()).toContain('张三的记录')
    expect(wrapper.text()).not.toContain('该端不支持')
    expect(wrapper.text()).not.toContain('暂未支持')
  })

  it('shows an empty hint when the rule tree is empty', () => {
    const wrapper = mount(MobilePageRenderer, { props: { rule: [] }, global: GLOBALS })
    expect(wrapper.text()).toContain('页面内容为空')
  })
})
