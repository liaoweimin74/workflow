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
})