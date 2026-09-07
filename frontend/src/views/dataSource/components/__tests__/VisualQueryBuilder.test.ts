// ----- TDD: VisualQueryBuilder 可视化查询构建组件 -----
// 前端可视化配置：主表/别名、JOIN 卡片、选择列、筛选条件、排序、运行时参数、只读 SQL 预览
// npx vitest run src/views/dataSource/components/__tests__/VisualQueryBuilder.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import ElementPlus from 'element-plus'
import VisualQueryBuilder, { type VisualQueryConfig } from '../VisualQueryBuilder.vue'

vi.mock('@element-plus/icons-vue', () => ({
  Plus: { name: 'Plus', render: () => h('span', '+') },
  Delete: { name: 'Delete', render: () => h('span', '×') },
}))

function makeModel(overrides: Partial<VisualQueryConfig> = {}): VisualQueryConfig {
  return {
    mainTable: 'wf_biz_order',
    mainAlias: 'm',
    joins: [],
    selectColumns: [],
    selectColumnsInput: 'm.order_no, c.name',
    where: [],
    orderBy: [],
    ...overrides,
  }
}

function mountBuilder(props: Record<string, unknown> = {}) {
  return mount(VisualQueryBuilder, {
    props: {
      modelValue: makeModel(),
      params: [],
      tables: ['wf_biz_order', 'wf_biz_customer'],
      disabled: false,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

/** 取最近一次 update:modelValue 载荷 */
function lastModel(wrapper: ReturnType<typeof mountBuilder>): VisualQueryConfig {
  const emitted = wrapper.emitted('update:modelValue')
  expect(emitted).toBeTruthy()
  return emitted!.at(-1)![0] as VisualQueryConfig
}

describe('VisualQueryBuilder', () => {
  it('渲染主表选择器与别名输入', () => {
    const wrapper = mountBuilder()
    expect(wrapper.text()).toContain('主表')
    expect(wrapper.find('[data-testid="vqb-main-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vqb-main-alias"]').exists()).toBe(true)
  })

  it('点击添加关联新增 JOIN 行并触发 update:modelValue', async () => {
    const wrapper = mountBuilder()
    await wrapper.find('[data-testid="vqb-add-join"]').trigger('click')
    await nextTick()
    const model = lastModel(wrapper)
    expect(model.joins).toHaveLength(1)
    expect(model.joins[0].joinType).toBe('LEFT JOIN')
  })

  it('添加筛选条件行', async () => {
    const wrapper = mountBuilder()
    await wrapper.find('[data-testid="vqb-add-where"]').trigger('click')
    await nextTick()
    const model = lastModel(wrapper)
    expect(model.where).toHaveLength(1)
    expect(model.where[0].op).toBe('=')
  })

  it('添加排序行', async () => {
    const wrapper = mountBuilder()
    await wrapper.find('[data-testid="vqb-add-order"]').trigger('click')
    await nextTick()
    const model = lastModel(wrapper)
    expect(model.orderBy).toHaveLength(1)
    expect(model.orderBy[0].order).toBe('ASC')
  })

  it('选择列 blur 时将逗号文本解析为数组', async () => {
    const wrapper = mountBuilder()
    const textarea = wrapper.find('textarea[data-testid="vqb-select-columns"]')
    await textarea.trigger('blur')
    await nextTick()
    const model = lastModel(wrapper)
    expect(model.selectColumns).toEqual(['m.order_no', 'c.name'])
  })

  it('输入参数名回车后触发 update:params', async () => {
    const wrapper = mountBuilder()
    const input = wrapper.find('input[data-testid="vqb-param-input"]')
    await input.setValue('startTime')
    await input.trigger('keyup.enter')
    const emitted = wrapper.emitted('update:params')
    expect(emitted).toBeTruthy()
    expect(emitted!.at(-1)![0]).toContain('startTime')
  })

  it('SQL 预览随可视化配置实时生成（JOIN/WHERE/ORDER BY）', async () => {
    const wrapper = mountBuilder({
      modelValue: makeModel({
        mainTable: 'wf_biz_order',
        mainAlias: 'm',
        joins: [{ alias: 'c', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: 'c.id = m.customer_id', columns: [] }],
        selectColumnsInput: 'm.order_no, c.name',
        where: [{ column: 'm.status', op: '=', value: '1' }],
        orderBy: [{ column: 'm.created_at', order: 'DESC' }],
      }),
    })
    await nextTick()
    const preview = wrapper.find('textarea[data-testid="vqb-sql-preview"]').element as HTMLTextAreaElement
    expect(preview.value).toContain('SELECT m.order_no, c.name')
    expect(preview.value).toContain('FROM wf_biz_order m')
    expect(preview.value).toContain('LEFT JOIN wf_biz_customer c ON c.id = m.customer_id')
    expect(preview.value).toContain('WHERE m.tenant_id = :tenantId')
    expect(preview.value).toContain('AND m.status = ?')
    expect(preview.value).toContain('ORDER BY m.created_at DESC')
  })

  it('disabled 时添加按钮禁用', () => {
    const wrapper = mountBuilder({ disabled: true })
    expect(wrapper.find('[data-testid="vqb-add-join"]').attributes('disabled')).toBeDefined()
  })
})