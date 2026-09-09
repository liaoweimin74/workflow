// ----- TDD: VisualQueryBuilder 可视化查询构建组件 -----
// 前端可视化配置：主表(自动别名 m)、JOIN 卡片(目标表下拉/别名自动生成/on 字段下拉/中文类型)、选择列(字段多选→tag 展示)、筛选(表名+字段名下拉)、排序(表名+字段名+排序方式)、参数、SQL 预览
// npx vitest run src/views/dataSource/components/__tests__/VisualQueryBuilder.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import ElementPlus from 'element-plus'
import VisualQueryBuilder, {
  type VisualQueryConfig,
  deriveJoinAlias,
  buildJoinOn,
  parseJoinOn,
} from '../VisualQueryBuilder.vue'

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
    selectColumnsInput: '',
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
      tableFields: {},
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

/** 通过 data-testid 定位 el-select */
function findSelect(wrapper: ReturnType<typeof mountBuilder>, testid: string) {
  const sel = wrapper.findAllComponents({ name: 'ElSelect' }).find((c) => (c.attributes('data-testid') || '') === testid)
  expect(sel, `未找到 el-select[data-testid=${testid}]`).toBeDefined()
  return sel!
}

/** 触发单值下拉 v-model 更新（携带 change 事件） */
async function setSelect(wrapper: ReturnType<typeof mountBuilder>, testid: string, value: string) {
  const sel = findSelect(wrapper, testid)
  await sel.vm.$emit('update:modelValue', value)
  await sel.vm.$emit('change', value)
  await nextTick()
}

/** 触发多选下拉 v-model 更新（数组） */
async function setMultiSelect(wrapper: ReturnType<typeof mountBuilder>, testid: string, values: string[]) {
  const sel = findSelect(wrapper, testid)
  await sel.vm.$emit('update:modelValue', values)
  await nextTick()
}

/** 某 el-select 的 modelValue */
function selectValue(wrapper: ReturnType<typeof mountBuilder>, testid: string): unknown {
  return findSelect(wrapper, testid).props('modelValue')
}

/** 添加一个 JOIN 行并选择目标表 */
async function addJoinWithTarget(wrapper: ReturnType<typeof mountBuilder>, targetTable: string) {
  await wrapper.find('[data-testid="vqb-add-join"]').trigger('click')
  await nextTick()
  await setSelect(wrapper, 'vqb-join-target-0', targetTable)
}

describe('VisualQueryBuilder', () => {
  it('渲染主表选择器，不显示别名输入（主表别名固定 m）', () => {
    const wrapper = mountBuilder()
    expect(wrapper.text()).toContain('主表')
    expect(wrapper.find('[data-testid="vqb-main-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vqb-main-alias"]').exists()).toBe(false)
    expect(wrapper.find('input[placeholder="别名"]').exists()).toBe(false)
  })

  it('点击添加关联新增 JOIN 行并触发 update:modelValue', async () => {
    const wrapper = mountBuilder()
    await wrapper.find('[data-testid="vqb-add-join"]').trigger('click')
    await nextTick()
    const model = lastModel(wrapper)
    expect(model.joins).toHaveLength(1)
    expect(model.joins[0].joinType).toBe('LEFT JOIN')
  })

  it('JOIN 行渲染目标表下拉与字段下拉，无别名输入框、无 on 文本输入', async () => {
    const wrapper = mountBuilder({
      modelValue: makeModel({
        joins: [{ alias: '', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: '', columns: [] }],
      }),
    })
    await nextTick()
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[data-testid="vqb-join-target-0"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vqb-join-main-col-0"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vqb-join-target-col-0"]').exists()).toBe(true)
    expect(wrapper.find('input[placeholder="别名"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('ON 条件，如')
  })

  it('JOIN 类型下拉显示中文：左联/内联/右联（值保持 LEFT JOIN 等）', async () => {
    const wrapper = mountBuilder({
      modelValue: makeModel({
        joins: [{ alias: '', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: '', columns: [] }],
      }),
    })
    await nextTick()
    await flushPromises()
    await nextTick()
    const opts = wrapper.findAllComponents({ name: 'ElOption' })
    const labeled = (label: string, value: string) =>
      opts.some((o) => o.props('label') === label && o.props('value') === value)
    expect(labeled('左联', 'LEFT JOIN')).toBe(true)
    expect(labeled('内联', 'INNER JOIN')).toBe(true)
    expect(labeled('右联', 'RIGHT JOIN')).toBe(true)
  })

  it('on 条件前显示「当」字', async () => {
    const wrapper = mountBuilder({
      modelValue: makeModel({
        joins: [{ alias: 'c', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: 'c.id = m.customer_id', columns: [] }],
      }),
    })
    await nextTick()
    await flushPromises()
    await nextTick()
    expect(wrapper.text()).toContain('当')
  })

  it('选择目标表后自动生成别名（首字母规则）并 emit', async () => {
    const wrapper = mountBuilder()
    await addJoinWithTarget(wrapper, 'wf_biz_customer')
    const model = lastModel(wrapper)
    expect(model.joins[0].targetTable).toBe('wf_biz_customer')
    expect(model.joins[0].alias).toBe('c')
  })

  it('on 条件由 [主表字段]=[目标表字段] 两个下拉组装为 m.col = 别名.col', async () => {
    const wrapper = mountBuilder({
      tableFields: {
        wf_biz_order: ['order_no', 'customer_id'],
        wf_biz_customer: ['id', 'name'],
      },
    })
    await addJoinWithTarget(wrapper, 'wf_biz_customer')
    await setSelect(wrapper, 'vqb-join-main-col-0', 'customer_id')
    await setSelect(wrapper, 'vqb-join-target-col-0', 'id')
    const model = lastModel(wrapper)
    expect(model.joins[0].on).toBe('m.customer_id = c.id')
  })

  it('on 字段留空时不生成 on 条件', async () => {
    const wrapper = mountBuilder()
    await addJoinWithTarget(wrapper, 'wf_biz_customer')
    await setSelect(wrapper, 'vqb-join-main-col-0', 'customer_id')
    const model = lastModel(wrapper)
    expect(model.joins[0].on).toBe('')
  })

  it('纯函数：deriveJoinAlias / buildJoinOn / parseJoinOn', () => {
    expect(deriveJoinAlias('wf_biz_customer', ['m'])).toBe('c')
    expect(deriveJoinAlias('wf_biz_customer', ['m', 'c'])).toBe('c1')
    expect(deriveJoinAlias('wf_my_table', ['m'])).toBe('m1')
    expect(buildJoinOn('m', 'c', 'customer_id', 'id')).toBe('m.customer_id = c.id')
    // 旧格式 c.id = m.customer_id：右侧带 m. 前缀 → 右侧为主表字段
    expect(parseJoinOn('c.id = m.customer_id', 'm')).toEqual({ mainField: 'customer_id', targetField: 'id' })
    // 新格式 m.a = c.b：左侧带 m. 前缀 → 左侧为主表字段
    expect(parseJoinOn('m.a = c.b', 'm')).toEqual({ mainField: 'a', targetField: 'b' })
    // 无别名限定：默认左侧为主表字段
    expect(parseJoinOn('a = b', 'm')).toEqual({ mainField: 'a', targetField: 'b' })
  })

  // ==================== 选择列：字段多选 → tag 展示 ====================

  it('选择主表后出现主表字段多选下拉（vqb-main-cols）', async () => {
    const wrapper = mountBuilder({ modelValue: makeModel({ mainTable: '' }) })
    // 未选主表：不显示主表字段多选
    expect(wrapper.find('[data-testid="vqb-main-cols"]').exists()).toBe(false)
    await setSelect(wrapper, 'vqb-main-table', 'wf_biz_order')
    await nextTick()
    expect(wrapper.find('[data-testid="vqb-main-cols"]').exists()).toBe(true)
  })

  it('主表字段多选选中后，选择列追加 m.前缀字段（tag 展示）', async () => {
    const wrapper = mountBuilder({
      tableFields: { wf_biz_order: ['order_no', 'customer_id'] },
    })
    await setSelect(wrapper, 'vqb-main-table', 'wf_biz_order')
    await setMultiSelect(wrapper, 'vqb-main-cols', ['order_no', 'customer_id'])
    const model = lastModel(wrapper)
    expect(model.selectColumns).toContain('m.order_no')
    expect(model.selectColumns).toContain('m.customer_id')
    // 选择列区已隐藏（字段多选承担选择功能，不再单独展示 tag 区）
    expect(wrapper.find('[data-testid="vqb-select-columns"]').exists()).toBe(false)
  })

  it('主表字段多选取消后，对应 m.前缀列从选择列移除', async () => {
    const wrapper = mountBuilder({
      modelValue: makeModel({ selectColumns: ['m.order_no', 'm.customer_id'] }),
      tableFields: { wf_biz_order: ['order_no', 'customer_id'] },
    })
    await nextTick()
    await setMultiSelect(wrapper, 'vqb-main-cols', ['order_no'])
    const model = lastModel(wrapper)
    expect(model.selectColumns).toContain('m.order_no')
    expect(model.selectColumns).not.toContain('m.customer_id')
  })

  it('JOIN 选择目标表后出现目标表字段多选下拉（vqb-join-cols-0），选中追加别名前缀列', async () => {
    const wrapper = mountBuilder({
      tableFields: { wf_biz_customer: ['id', 'name'] },
    })
    expect(wrapper.find('[data-testid="vqb-join-cols-0"]').exists()).toBe(false)
    await addJoinWithTarget(wrapper, 'wf_biz_customer')
    expect(wrapper.find('[data-testid="vqb-join-cols-0"]').exists()).toBe(true)
    await setMultiSelect(wrapper, 'vqb-join-cols-0', ['name'])
    const model = lastModel(wrapper)
    expect(model.selectColumns).toContain('c.name')
    // 选择列区已隐藏：不再单独展示 tag
    expect(wrapper.find('[data-testid="vqb-select-columns"]').exists()).toBe(false)
  })

  it('主表字段多选单行显示（前2项可见），目标表字段多选启用 collapse-tags', async () => {
    const wrapper = mountBuilder({
      tableFields: { wf_biz_order: ['order_no', 'customer_id'], wf_biz_customer: ['id', 'name'] },
    })
    await setSelect(wrapper, 'vqb-main-table', 'wf_biz_order')
    await setMultiSelect(wrapper, 'vqb-main-cols', ['order_no', 'customer_id'])
    expect(findSelect(wrapper, 'vqb-main-cols').props('collapseTags')).toBe(true)
    await addJoinWithTarget(wrapper, 'wf_biz_customer')
    await setMultiSelect(wrapper, 'vqb-join-cols-0', ['id', 'name'])
    expect(findSelect(wrapper, 'vqb-join-cols-0').props('collapseTags')).toBe(true)
  })

  it('选择列数据隐藏：vqb-select-columns 区域整体不渲染（字段多选承担选择列功能）', async () => {
    const wrapper = mountBuilder({
      modelValue: makeModel({ selectColumns: ['m.order_no', 'c.name'] }),
    })
    await nextTick()
    expect(wrapper.find('[data-testid="vqb-select-columns"]').exists()).toBe(false)
  })

  // ==================== 筛选：表名 + 字段名下拉 ====================

  it('添加筛选条件行（默认 op =）', async () => {
    const wrapper = mountBuilder()
    await wrapper.find('[data-testid="vqb-add-where"]').trigger('click')
    await nextTick()
    const model = lastModel(wrapper)
    expect(model.where).toHaveLength(1)
    expect(model.where[0].op).toBe('=')
  })

  it('筛选行表名下拉选项 = 主表 + JOIN 目标表列表', async () => {
    const wrapper = mountBuilder({
      modelValue: makeModel({
        mainTable: 'wf_biz_order',
        joins: [{ alias: 'c', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: '', columns: [] }],
      }),
    })
    await wrapper.find('[data-testid="vqb-add-where"]').trigger('click')
    await nextTick()
    const opts = wrapper.findAllComponents({ name: 'ElOption' })
    const labels = opts.map((o) => o.props('label') as string)
    expect(labels).toContain('wf_biz_order')
    expect(labels).toContain('wf_biz_customer')
  })

  it('筛选行：选择表名+字段名组装 column 为 别名.字段', async () => {
    const wrapper = mountBuilder({
      tableFields: { wf_biz_order: ['status', 'created_at'] },
    })
    await wrapper.find('[data-testid="vqb-add-where"]').trigger('click')
    await nextTick()
    await setSelect(wrapper, 'vqb-where-table-0', 'wf_biz_order')
    await setSelect(wrapper, 'vqb-where-field-0', 'status')
    const model = lastModel(wrapper)
    expect(model.where[0].column).toBe('m.status')
  })

  it('筛选行回填：column=m.status 解析为 表名 wf_biz_order + 字段 status', async () => {
    const wrapper = mountBuilder({
      modelValue: makeModel({
        mainTable: 'wf_biz_order',
        where: [{ column: 'm.status', op: '=', value: 'PAID' }],
      }),
    })
    await nextTick()
    await flushPromises()
    await nextTick()
    expect(selectValue(wrapper, 'vqb-where-table-0')).toBe('wf_biz_order')
    expect(selectValue(wrapper, 'vqb-where-field-0')).toBe('status')
    // 值输入保留（el-input 的 value 为 DOM property，需读 element.value）
    const valInput = wrapper.find('[data-testid="vqb-where-value-0"]').element as HTMLInputElement
    expect(valInput.value).toBe('PAID')
  })

  it('筛选行回填：JOIN 目标表字段（c.name）解析为 表名 wf_biz_customer', async () => {
    const wrapper = mountBuilder({
      modelValue: makeModel({
        mainTable: 'wf_biz_order',
        joins: [{ alias: 'c', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: '', columns: [] }],
        where: [{ column: 'c.name', op: '=', value: '张三' }],
      }),
    })
    await nextTick()
    await flushPromises()
    await nextTick()
    expect(selectValue(wrapper, 'vqb-where-table-0')).toBe('wf_biz_customer')
    expect(selectValue(wrapper, 'vqb-where-field-0')).toBe('name')
  })

  // ==================== 排序：表名 + 字段名 + 排序方式 ====================

  it('添加排序行（默认 ASC）', async () => {
    const wrapper = mountBuilder()
    await wrapper.find('[data-testid="vqb-add-order"]').trigger('click')
    await nextTick()
    const model = lastModel(wrapper)
    expect(model.orderBy).toHaveLength(1)
    expect(model.orderBy[0].order).toBe('ASC')
  })

  it('排序行：选择表名+字段名+排序方式组装 column', async () => {
    const wrapper = mountBuilder({
      tableFields: { wf_biz_order: ['created_at', 'order_no'] },
    })
    await wrapper.find('[data-testid="vqb-add-order"]').trigger('click')
    await nextTick()
    await setSelect(wrapper, 'vqb-order-table-0', 'wf_biz_order')
    await setSelect(wrapper, 'vqb-order-field-0', 'created_at')
    await setSelect(wrapper, 'vqb-order-dir-0', 'DESC')
    const model = lastModel(wrapper)
    expect(model.orderBy[0].column).toBe('m.created_at')
    expect(model.orderBy[0].order).toBe('DESC')
  })

  it('排序行回填：column=m.created_at 解析为表名+字段', async () => {
    const wrapper = mountBuilder({
      modelValue: makeModel({
        mainTable: 'wf_biz_order',
        orderBy: [{ column: 'm.created_at', order: 'DESC' }],
      }),
    })
    await nextTick()
    await flushPromises()
    await nextTick()
    expect(selectValue(wrapper, 'vqb-order-table-0')).toBe('wf_biz_order')
    expect(selectValue(wrapper, 'vqb-order-field-0')).toBe('created_at')
    expect(selectValue(wrapper, 'vqb-order-dir-0')).toBe('DESC')
  })

  // ==================== 参数 / SQL 预览 ====================

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
        selectColumns: ['m.order_no', 'c.name'],
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