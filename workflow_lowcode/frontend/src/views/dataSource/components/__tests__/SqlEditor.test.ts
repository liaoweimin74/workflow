// ----- TDD: SqlEditor SQL 编辑器组件 -----
// SQL 文本编辑、columns 列声明编辑、运行时参数标签、「从 SQL 解析列」
// npx vitest run src/views/dataSource/components/__tests__/SqlEditor.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import ElementPlus from 'element-plus'
import type { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { CompletionContext, type CompletionSource } from '@codemirror/autocomplete'
import SqlEditor from '../SqlEditor.vue'
import ExpressionEditor from '@/components/expression/ExpressionEditor.vue'
import type { ColumnConfigItem } from '@/api/bizData'

vi.mock('@element-plus/icons-vue', async () => {
  // 部分 mock：element-plus 自身也要从图标包取组件，整份替换会让它加载失败
  const actual = await vi.importActual<Record<string, unknown>>('@element-plus/icons-vue')
  return {
    ...actual,
    Plus: { name: 'Plus', render: () => h('span', '+') },
    Delete: { name: 'Delete', render: () => h('span', '×') },
    Rank: { name: 'Rank', render: () => h('span', '⇅') },
  }
})

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
  it('渲染 SQL 文本编辑区（CM6）', async () => {
    const wrapper = mountEditor()
    await nextTick()
    const content = wrapper.find('[data-testid="sqleditor-sql"] .cm-content')
    expect(content.exists()).toBe(true)
    expect(content.text()).toContain('SELECT * FROM wf_biz_order')
  })

  it('编辑 SQL 文本时触发 update:modelValue', async () => {
    const wrapper = mountEditor()
    await nextTick()
    const ed = wrapper.findComponent(ExpressionEditor)
    // script setup 的 defineExpose 成员经内部实例 exposed 访问
    const exposed = (ed.vm.$ as unknown as { exposed: { getView: () => EditorView } }).exposed
    const view = exposed.getView()
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'SELECT order_no FROM wf_biz_order' } })
    await nextTick()
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

  // ==================== 数据表/字段代码提示（schemaMeta → 补全源） ====================

  /** 取注入 ExpressionEditor 的优先补全源 */
  function prioritySources(wrapper: ReturnType<typeof mountEditor>): CompletionSource[] {
    const ed = wrapper.findComponent(ExpressionEditor)
    return ed.props('prioritySources') as CompletionSource[]
  }

  /** 构造补全上下文：doc 末尾请求补全（explicit = 手动呼出） */
  function contextAtEnd(doc: string): CompletionContext {
    const state = EditorState.create({ doc })
    return new CompletionContext(state, doc.length, true)
  }

  function stubSchemaMeta() {
    return {
      getTables: () => ['wf_biz_order', 'wf_biz_customer'],
      getColumns: (t: string) =>
        t === 'wf_biz_order'
          ? [{ key: 'order_no', type: 'VARCHAR' }, { key: 'amount', type: 'DECIMAL' }]
          : [{ key: 'id', type: 'VARCHAR' }],
      onMiss: vi.fn(),
    }
  }

  it('未注入 schemaMeta 时不追加补全源（保持仅关键字补全）', async () => {
    const wrapper = mountEditor()
    await nextTick()
    expect(prioritySources(wrapper)).toHaveLength(0)
  })

  it('注入 schemaMeta 时向 SQL 编辑器传入 1 个表/字段补全源', async () => {
    const wrapper = mountEditor({ schemaMeta: stubSchemaMeta() })
    await nextTick()
    const sources = prioritySources(wrapper)
    expect(sources).toHaveLength(1)
    expect(typeof sources[0]).toBe('function')
  })

  it('FROM 后补全数据表名', async () => {
    const wrapper = mountEditor({ schemaMeta: stubSchemaMeta() })
    await nextTick()
    const res = prioritySources(wrapper)[0](contextAtEnd('SELECT * FROM '))
    expect(res).toBeTruthy()
    expect(res!.options.map((o) => o.label)).toEqual(['wf_biz_order', 'wf_biz_customer'])
  })

  it('列位置补全已引用表的字段（带类型标注）', async () => {
    const wrapper = mountEditor({ schemaMeta: stubSchemaMeta() })
    await nextTick()
    const res = prioritySources(wrapper)[0](contextAtEnd('SELECT * FROM wf_biz_order WHERE '))
    expect(res).toBeTruthy()
    const labels = res!.options.map((o) => o.label)
    expect(labels).toContain('order_no')
    expect(labels).toContain('amount')
    expect(res!.options.find((o) => o.label === 'amount')?.detail).toBe('DECIMAL')
  })

  it('别名限定：别名. 后只补该表字段', async () => {
    const wrapper = mountEditor({ schemaMeta: stubSchemaMeta() })
    await nextTick()
    const res = prioritySources(wrapper)[0](contextAtEnd('SELECT * FROM wf_biz_order o WHERE o.'))
    expect(res).toBeTruthy()
    expect(res!.options.map((o) => o.label)).toEqual(['order_no', 'amount'])
  })

  it('字段缓存缺失时经 onMiss 预取（本次不弹候选）', async () => {
    const meta = {
      getTables: () => ['wf_biz_order'],
      getColumns: () => [],
      onMiss: vi.fn(),
    }
    const wrapper = mountEditor({ schemaMeta: meta })
    await nextTick()
    const res = prioritySources(wrapper)[0](contextAtEnd('SELECT * FROM wf_biz_order WHERE '))
    expect(res).toBeNull()
    expect(meta.onMiss).toHaveBeenCalledWith('wf_biz_order')
  })
})