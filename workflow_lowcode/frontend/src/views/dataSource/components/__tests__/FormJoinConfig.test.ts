// ----- TDD: FormJoinConfig 多字段 JOIN + SQL 预览 -----
// 行内无 alias 字段；点击「预览 SQL」调用 previewJoinSql 并展示返回 SQL
// npx vitest run frontend/src/views/dataSource/components/__tests__/FormJoinConfig.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import ElementPlus from 'element-plus'
import FormJoinConfig from '../FormJoinConfig.vue'
import type { FormJoinConfigValue } from '../FormJoinConfig.vue'

vi.mock('@element-plus/icons-vue', () => ({
  Plus: { name: 'Plus', render: () => h('span', '+') },
  Delete: { name: 'Delete', render: () => h('span', '×') },
  View: { name: 'View', render: () => h('span', '👁') },
  Rank: { name: 'Rank', render: () => h('span', '⇅') },
}))

vi.mock('@/api/form', () => ({
  formApi: {
    // 挂载时 immediate watch mainFormKey 会调用；返回空 schema 即可
    getFormDefinitionByKey: vi.fn().mockResolvedValue({ code: 0, data: { schema: '[]' } }),
  },
}))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    previewJoinSql: vi.fn(),
  },
}))

const modelValue = (): FormJoinConfigValue => ({
  queryMode: 'config',
  joins: [
    {
      targetFormKey: 'biz_customer',
      localField: 'customer_id',
      foreignField: 'id',
      joinField: 'name',
      virtualKey: 'customer_name',
      label: '客户名称',
      sortable: true,
      filterable: true,
    },
  ],
})

const targets = [{ key: 'biz_customer', name: '客户' }]

function mountConfig() {
  return mount(FormJoinConfig, {
    props: {
      modelValue: modelValue(),
      mainFormKey: 'biz_order',
      targetFormOptions: targets,
    },
    global: { plugins: [ElementPlus] },
  })
}

describe('FormJoinConfig 多字段 JOIN + SQL 预览', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('行内不包含 alias 字段（类型去掉 alias）', () => {
    const cfg = modelValue()
    expect(cfg.joins![0]).not.toHaveProperty('alias')
  })

  it('点击预览 SQL 调用接口并展示返回 SQL', async () => {
    const api = await import('@/api/data-source')
    vi.mocked(api.dataSourceApi.previewJoinSql).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        sql: 'SELECT m.*, j1.name AS customer_name FROM wf_biz_order m LEFT JOIN wf_biz_customer j1 ...',
        params: ['t1'],
      },
    })
    const wrapper = mountConfig()
    await wrapper.find('button.preview-sql-btn').trigger('click')
    expect(api.dataSourceApi.previewJoinSql).toHaveBeenCalledWith('biz_order', expect.any(Array))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('customer_name')
  })

  it('切换模式双段并存：config→sql→config 输入不丢失', async () => {
    const wrapper = mount(FormJoinConfig, {
      props: {
        modelValue: { ...modelValue(), query: 'SELECT m.id FROM wf_biz_order m WHERE m.tenant_id = :tenantId' },
        mainFormKey: 'biz_order',
        targetFormOptions: targets,
      },
      global: { plugins: [ElementPlus] },
    })
    // 切到 SQL 模板（radio: none=0 / config=1 / sql=2）
    const radios = () => wrapper.findAll('input[type="radio"]')
    await radios()[2].setValue()
    await wrapper.vm.$nextTick()
    let emitted = wrapper.emitted('update:modelValue') as FormJoinConfigValue[][]
    let last = emitted.at(-1)![0]
    expect(last.queryMode).toBe('sql')
    // sql 模式下 joins 草稿仍随事件带出（不再置 undefined）
    expect(last.joins).toHaveLength(1)
    expect(last.joins![0].virtualKey).toBe('customer_name')

    // 切回声明式 JOIN：sql 输入（query）也不丢失
    await radios()[1].setValue()
    await wrapper.vm.$nextTick()
    emitted = wrapper.emitted('update:modelValue') as FormJoinConfigValue[][]
    last = emitted.at(-1)![0]
    expect(last.queryMode).toBe('config')
    expect(last.joins).toHaveLength(1)
    expect(last.query).toContain(':tenantId')
    wrapper.unmount()
  })

  it('预览后「转为 SQL 模板」：SQL 填入 query 并切换模式，joins 草稿保留', async () => {
    const api = await import('@/api/data-source')
    const sql = 'SELECT m.*, j1.name AS customer_name FROM wf_biz_order m LEFT JOIN wf_biz_customer j1 ON j1.id = m.customer_id'
    vi.mocked(api.dataSourceApi.previewJoinSql).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { sql, params: ['t1'] },
    })
    const wrapper = mountConfig()
    await wrapper.find('button.preview-sql-btn').trigger('click')
    await wrapper.vm.$nextTick()
    // 预览面板出现后点击转换按钮
    const convertBtn = wrapper.findAll('button').find((b) => b.text().includes('转为 SQL 模板'))
    expect(convertBtn).toBeTruthy()
    await convertBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    const emitted = wrapper.emitted('update:modelValue') as FormJoinConfigValue[][]
    const last = emitted.at(-1)![0]
    expect(last.queryMode).toBe('sql')
    expect(last.query).toBe(sql)
    expect(last.joins).toHaveLength(1)
    wrapper.unmount()
  })
})