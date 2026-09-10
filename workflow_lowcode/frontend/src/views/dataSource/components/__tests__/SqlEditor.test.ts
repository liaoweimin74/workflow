// ----- TDD: SqlEditor SQL 编辑器组件 -----
// SQL 文本编辑、columns 列声明编辑、运行时参数标签、「从 SQL 解析列」
// npx vitest run src/views/dataSource/components/__tests__/SqlEditor.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import ElementPlus from 'element-plus'
import SqlEditor from '../SqlEditor.vue'
import type { ColumnConfigItem } from '@/api/bizData'

vi.mock('@element-plus/icons-vue', () => ({
  Plus: { name: 'Plus', render: () => h('span', '+') },
  Delete: { name: 'Delete', render: () => h('span', '×') },
}))

function makeColumn(key: string, label?: string): ColumnConfigItem {
  return {
    key,
    label: label ?? key,
    columnType: 'VARCHAR',
    length: null,
    scale: null,
    required: false,
    unique: false,
    indexed: false,
    sortable: false,
    filterable: false,
  }
}

function mountEditor(props: Record<string, unknown> = {}) {
  return mount(SqlEditor, {
    props: {
      modelValue: 'SELECT * FROM wf_biz_order WHERE tenant_id = :tenantId',
      columns: [makeColumn('order_no', '订单号')],
      params: [],
      disabled: false,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

/** 取最近一次 update:columns 载荷 */
function lastColumns(wrapper: ReturnType<typeof mountEditor>): ColumnConfigItem[] {
  const emitted = wrapper.emitted('update:columns')
  expect(emitted).toBeTruthy()
  return emitted!.at(-1)![0] as ColumnConfigItem[]
}

describe('SqlEditor', () => {
  it('渲染 SQL 文本编辑区（textarea）', () => {
    const wrapper = mountEditor()
    const textarea = wrapper.find('textarea[data-testid="sqleditor-sql"]')
    expect(textarea.exists()).toBe(true)
    expect((textarea.element as HTMLTextAreaElement).value).toContain('SELECT * FROM wf_biz_order')
  })

  it('编辑 SQL 文本时触发 update:modelValue', async () => {
    const wrapper = mountEditor()
    const textarea = wrapper.find('textarea[data-testid="sqleditor-sql"]')
    await textarea.setValue('SELECT order_no FROM wf_biz_order')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted!.at(-1)![0]).toBe('SELECT order_no FROM wf_biz_order')
  })

  it('渲染列声明编辑区并支持添加列', async () => {
    const wrapper = mountEditor()
    await nextTick()
    await flushPromises()
    await nextTick()
    expect(wrapper.text()).toContain('列声明')
    expect(wrapper.find('input[data-testid="sqleditor-col-key-0"]').exists()).toBe(true)
    await wrapper.find('[data-testid="sqleditor-add-column"]').trigger('click')
    const cols = lastColumns(wrapper)
    expect(cols).toHaveLength(2)
  })

  it('编辑列 key 时触发 update:columns', async () => {
    const wrapper = mountEditor()
    await nextTick()
    await flushPromises()
    await nextTick()
    const keyInput = wrapper.find('input[data-testid="sqleditor-col-key-0"]')
    await keyInput.setValue('amount')
    const cols = lastColumns(wrapper)
    expect(cols[0].key).toBe('amount')
  })

  it('删除列触发 update:columns', async () => {
    const wrapper = mountEditor()
    await nextTick()
    await flushPromises()
    await nextTick()
    await wrapper.find('[data-testid="sqleditor-del-column-0"]').trigger('click')
    const cols = lastColumns(wrapper)
    expect(cols).toHaveLength(0)
  })

  it('渲染运行时参数标签并支持回车添加', async () => {
    const wrapper = mountEditor({ params: ['startTime'] })
    expect(wrapper.text()).toContain('startTime')
    const input = wrapper.find('input[data-testid="sqleditor-param-input"]')
    await input.setValue('endTime')
    await input.trigger('keyup.enter')
    const emitted = wrapper.emitted('update:params')
    expect(emitted).toBeTruthy()
    expect(emitted!.at(-1)![0]).toEqual(['startTime', 'endTime'])
  })

  it('「从 SQL 解析列」：解析 AS 别名与列名生成 columns', async () => {
    const wrapper = mountEditor({
      modelValue:
        'SELECT o.order_no, c.name AS customer_name FROM wf_biz_order o ' +
        'LEFT JOIN wf_biz_customer c ON c.id = o.customer_id WHERE o.tenant_id = :tenantId',
    })
    await wrapper.find('[data-testid="sqleditor-parse-sql"]').trigger('click')
    const cols = lastColumns(wrapper)
    expect(cols.map((c) => c.key)).toEqual(['order_no', 'customer_name'])
  })

  it('「从 SQL 解析列」：无别名时取点号后列名', async () => {
    const wrapper = mountEditor({
      modelValue: 'SELECT m.order_no, m.status FROM wf_biz_order m',
    })
    await wrapper.find('[data-testid="sqleditor-parse-sql"]').trigger('click')
    const cols = lastColumns(wrapper)
    expect(cols.map((c) => c.key)).toEqual(['order_no', 'status'])
  })

  it('disabled 时添加列按钮禁用', () => {
    const wrapper = mountEditor({ disabled: true })
    expect(wrapper.find('[data-testid="sqleditor-add-column"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="sqleditor-parse-sql"]').attributes('disabled')).toBeDefined()
  })
})