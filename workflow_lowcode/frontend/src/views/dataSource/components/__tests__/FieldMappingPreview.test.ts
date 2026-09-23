// ----- TDD: FieldMappingPreview 字段映射预览组件 -----
// formKey 有值时：表单列 + SQL 声明列合并去重展示（来源/key/label/类型/可写）
// npx vitest run src/views/dataSource/components/__tests__/FieldMappingPreview.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import FieldMappingPreview from '../FieldMappingPreview.vue'
import type { ColumnConfigItem } from '@/api/bizData'

vi.mock('@/api/form', () => ({
  formApi: { getFormDefinitionByKey: vi.fn() },
}))

const { formApi } = (await import('@/api/form')) as any

function formColumn(key: string, label: string, columnType = 'VARCHAR'): ColumnConfigItem {
  return { key, label, columnType, length: null, scale: null, required: false, unique: false, indexed: false }
}

function sqlColumn(key: string, label?: string): ColumnConfigItem {
  return { key, label: label ?? key, columnType: 'VARCHAR', length: null, scale: null, required: false, unique: false, indexed: false, sortable: true, filterable: true }
}

function mountPreview(props: Record<string, unknown> = {}) {
  return mount(FieldMappingPreview, {
    props: {
      formKey: 'order',
      columns: [],
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

// 统计：格式化为 "主表单 2 列 · SQL 声明 1 列 · 合并后 3 列（1 列去重）"
function summaryText(wrapper: ReturnType<typeof mountPreview>): string {
  return wrapper.find('.fmp-summary').text()
}

describe('FieldMappingPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('加载表单列并渲染合并表格（来源/key/label/类型/可写）', async () => {
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: { columnConfig: JSON.stringify([formColumn('customer_id', '客户ID'), formColumn('order_no', '订单号')]) },
    })
    const wrapper = mountPreview({ columns: [sqlColumn('customer_name', '客户名称')] })
    await flushPromises()

    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledWith('order')
    const text = wrapper.text()
    // 表单列
    expect(text).toContain('客户ID')
    expect(text).toContain('订单号')
    // SQL 声明列
    expect(text).toContain('客户名称')
    // 列标题
    expect(wrapper.html()).toContain('来源')
    expect(wrapper.html()).toContain('可写')
    // 统计
    expect(summaryText(wrapper)).toContain('主表单 2 列')
    expect(summaryText(wrapper)).toContain('SQL 声明 1 列')
    expect(summaryText(wrapper)).toContain('合并后 3 列')
  })

  it('合并去重：SQL 声明列与表单列 key 相同时保留表单列（表单优先）', async () => {
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: { columnConfig: JSON.stringify([formColumn('order_no', '订单号'), formColumn('total', '总金额', 'DECIMAL')]) },
    })
    const wrapper = mountPreview({
      columns: [sqlColumn('order_no', '重复列'), sqlColumn('customer_name', '客户名称')],
    })
    await flushPromises()

    // order_no 仅出现一次（表单优先，label 为表单的「订单号」而非「重复列」）
    const tableHtml = wrapper.find('.fmp-table').html()
    expect(tableHtml).toContain('订单号')
    expect(tableHtml).not.toContain('重复列')
    expect((tableHtml.match(/order_no/g) || []).length).toBe(1)
    // 统计去重数
    expect(summaryText(wrapper)).toContain('合并后 3 列')
    expect(summaryText(wrapper)).toContain('1 列去重')
  })

  it('可写标记：表单列 ✓、SQL 声明列 ✗', async () => {
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: { columnConfig: JSON.stringify([formColumn('order_no', '订单号')]) },
    })
    const wrapper = mountPreview({ columns: [sqlColumn('customer_name')] })
    await flushPromises()

    const ok = wrapper.findAll('.fmp-writable-ok')
    const no = wrapper.findAll('.fmp-writable-no')
    expect(ok.length).toBe(1)
    expect(no.length).toBe(1)
  })

  it('formKey 变化时重新加载表单列', async () => {
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: { columnConfig: JSON.stringify([formColumn('order_no', '订单号')]) },
    })
    const wrapper = mountPreview()
    await flushPromises()
    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ formKey: 'customer' })
    await flushPromises()
    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledTimes(2)
    expect(formApi.getFormDefinitionByKey).toHaveBeenLastCalledWith('customer')
  })

  it('加载失败：显示错误提示而非崩溃', async () => {
    ;(formApi.getFormDefinitionByKey as any).mockRejectedValue(new Error('表单不存在'))
    const wrapper = mountPreview()
    await flushPromises()

    expect(wrapper.text()).toContain('表单不存在')
  })

  it('columnConfig 非法 JSON：视为无表单列，不崩溃', async () => {
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: { columnConfig: '{broken' },
    })
    const wrapper = mountPreview({ columns: [sqlColumn('customer_name', '客户名称')] })
    await flushPromises()

    // 仅渲染 SQL 声明列
    expect(wrapper.text()).toContain('客户名称')
    expect(summaryText(wrapper)).toContain('主表单 0 列')
  })

  it('formKey 为空：不调用接口且渲染空提示', async () => {
    const wrapper = mountPreview({ formKey: '' })
    await flushPromises()
    expect(formApi.getFormDefinitionByKey).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('未绑定主表单')
  })
})