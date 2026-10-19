/**
 * 数据容器作用域插值（语义 A：容器取到记录集，子树不复制）。
 *
 * 变量根只有两个，都来自容器自己取到的数据：
 *   {rows[0].amount}  按序号取记录
 *   {rows.length}     条数
 *   {row.amount}      当前记录（等价 rows[0]，单条形态下就是那条）
 *
 * 两条失败路径语义不同，不能混成一个「什么都不显示」：
 *   - 根名不认识（{node.id} / {row} 写漏字段）：原样保留。这是「配错了」，
 *     悄悄渲染成空白会让用户以为是数据没到；留原文才能一眼看出引用写错。
 *   - 根认识但取不到值（路径不存在、序号越界、数据还没回）：出空串。
 *     这是「数据缺失」，是运行中的正常状态。
 */
import { describe, it, expect } from 'vitest'
import {
  SCOPE_TEMPLATE_PROPS,
  buildContainerScope,
  applyScopeToRules,
  resolveScopeTemplate,
} from '../containerScope'

const ROWS = [
  { id: 'r1', amount: 1200, status: 'PENDING', dept: { name: '财务' } },
  { id: 'r2', amount: 80, status: 'DONE', dept: { name: '采购' } },
]

describe('resolveScopeTemplate', () => {
  it('按序号与字段取值，支持嵌套点路径', () => {
    expect(resolveScopeTemplate('{rows[0].amount}', buildContainerScope(ROWS))).toBe('1200')
    expect(resolveScopeTemplate('{rows[1].dept.name}', buildContainerScope(ROWS))).toBe('采购')
    expect(resolveScopeTemplate('{rows[0].dept.name}', buildContainerScope(ROWS))).toBe('财务')
    expect(resolveScopeTemplate('{row.status}', buildContainerScope(ROWS))).toBe('PENDING')
  })

  it('{rows.length} 出条数，空列表是 0 而不是空串（这是已知根的正常值）', () => {
    expect(resolveScopeTemplate('{rows.length}', buildContainerScope(ROWS))).toBe('2')
    expect(resolveScopeTemplate('{rows.length}', buildContainerScope([]))).toBe('0')
  })

  it('一段文案里多个变量与前后文本混排', () => {
    const scope = buildContainerScope(ROWS)
    expect(resolveScopeTemplate('共 {rows.length} 条，首条 {rows[0].amount} 元（{row.status}）', scope)).toBe(
      '共 2 条，首条 1200 元（PENDING）',
    )
  })

  it('根不认识 → 原样保留（配错的引用必须看得见）', () => {
    const scope = buildContainerScope(ROWS)
    expect(resolveScopeTemplate('{node.id}', scope)).toBe('{node.id}')
    expect(resolveScopeTemplate('{param.x}', scope)).toBe('{param.x}')
    expect(resolveScopeTemplate('标题 {row}', scope)).toBe('标题 {row}')
  })

  it('根认识但取不到值 → 空串（数据缺失是运行期正常态）', () => {
    const scope = buildContainerScope(ROWS)
    expect(resolveScopeTemplate('{rows[9].amount}', scope)).toBe('')
    expect(resolveScopeTemplate('{rows[0].notExist}', scope)).toBe('')
    expect(resolveScopeTemplate('{row.x}', buildContainerScope([]))).toBe('')
  })

  it('非字符串值按显示需要转换：null/undefined 出空串，0 与 false 不能被当空丢掉', () => {
    const scope = buildContainerScope([{ amount: 0, flag: false, memo: null }])
    expect(resolveScopeTemplate('{row.amount}', scope)).toBe('0')
    expect(resolveScopeTemplate('{row.flag}', scope)).toBe('false')
    expect(resolveScopeTemplate('{row.memo}', scope)).toBe('')
  })

  it('没有变量标记的字符串原样返回，单个花括号不误判', () => {
    const scope = buildContainerScope(ROWS)
    expect(resolveScopeTemplate('普通标题', scope)).toBe('普通标题')
    expect(resolveScopeTemplate('{ 不是变量', scope)).toBe('{ 不是变量')
    expect(resolveScopeTemplate('{}', scope)).toBe('{}')
  })
})

describe('applyScopeToRules', () => {
  it('命中白名单字段才替换：顶层 title/info 与 props 里的文案项', () => {
    const rules = [
      {
        type: 'el-text',
        title: '记录 {row.id}',
        info: '共 {rows.length} 条',
        props: { label: '金额 {row.amount}', placeholder: '{row.notExist}' },
      },
    ]
    const out = applyScopeToRules(rules, buildContainerScope(ROWS))
    expect(out[0].title).toBe('记录 r1')
    expect(out[0].info).toBe('共 2 条')
    expect(out[0].props.label).toBe('金额 1200')
    expect(out[0].props.placeholder).toBe('')
  })

  it('白名单外一律不动：数据源 ID、动作参数、字段名等结构值不能被文案化', () => {
    const rules = [
      {
        type: 'dash-kpi',
        field: 'kpi1',
        props: {
          dataSourceId: '{row.id}',
          metric: 'amount',
          // 动作参数里的 {row.id} 由动作链在执行时解析，容器不许提前吃掉
          actions: [{ op: 'open-container', target: '{row.dept.name}' }],
        },
      },
    ]
    const out = applyScopeToRules(rules, buildContainerScope(ROWS))
    expect(out[0].props.dataSourceId).toBe('{row.id}')
    expect(out[0].props.metric).toBe('amount')
    expect(out[0].props.actions[0].target).toBe('{row.dept.name}')
  })

  it('递归进 children，深层子组件同样取到作用域', () => {
    const rules = [
      { type: 'fcRow', children: [{ type: 'el-text', title: '{rows[1].status}', children: [] }] },
    ]
    const out = applyScopeToRules(rules, buildContainerScope(ROWS))
    expect(out[0].children[0].title).toBe('DONE')
  })

  it('文字/标题这类原生节点的文案在 children 字符串里，同样要替换', () => {
    const rules = [
      { type: 'div', native: true, children: ['共 {rows.length} 条，首条 {row.dept.name}'] },
      { type: 'div', native: true, children: ['{node.id} 保持原文'] },
    ]
    const out = applyScopeToRules(rules, buildContainerScope(ROWS))
    expect(out[0].children[0]).toBe('共 2 条，首条 财务')
    expect(out[1].children[0]).toBe('{node.id} 保持原文')
  })

  it('返回副本，绝不改入参（入参是页面主树的共享对象）', () => {
    const rules = [{ type: 'el-text', title: '{row.id}', props: { label: '{row.id}' } }]
    const out = applyScopeToRules(rules, buildContainerScope(ROWS))
    expect(rules[0].title).toBe('{row.id}')
    expect(rules[0].props.label).toBe('{row.id}')
    expect(out[0]).not.toBe(rules[0])
    expect(out[0].props).not.toBe(rules[0].props)
  })

  it('非规则形状（字符串数组、null 节点、缺 props）不炸', () => {
    const scope = buildContainerScope(ROWS)
    expect(() => applyScopeToRules([null, undefined, 'x', {}] as any, scope)).not.toThrow()
    expect(applyScopeToRules([], scope)).toEqual([])
  })

  it('白名单本身是事实源：只允许展示型文案字段', () => {
    expect(SCOPE_TEMPLATE_PROPS).toEqual(
      new Set(['title', 'label', 'text', 'content', 'info', 'placeholder', 'prefix', 'suffix']),
    )
  })
})
