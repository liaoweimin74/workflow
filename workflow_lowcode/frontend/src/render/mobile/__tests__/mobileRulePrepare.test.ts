import { describe, expect, it } from 'vitest'

import { prepareMobileRule } from '../mobileRulePrepare'

/**
 * 移动渲染前的 rule 预备（对齐桌面 PageRendererPage 的两步宿主协议）：
 * ① 数据块 props.dataSourceId → 页面 schema.dataSources 查 refId 注入 props.dsRefId
 *    （块内渲染器按 dsRefId 优先取数，与桌面同源）；
 * ② page-data-container 保存态 props.rule → 运行态 props.childRules + children 清空
 *    （容器自渲染子树，主树递归到此为止——复用桌面 normalizeDataContainerForRender 口径）。
 * 纯函数产副本，不改入参（页面 schema 对象是设计器/渲染共享的）。
 */
describe('prepareMobileRule（dsRefId 注入 + 容器归一）', () => {
  const DATA_SOURCES = [
    { id: 'ds1', refId: 'ref-1' },
    { id: 'ds2' },
  ]

  it('injects dsRefId into a block bound to a resolvable dataSourceId', () => {
    const [node] = prepareMobileRule(
      [{ type: 'page-table', props: { dataSourceId: 'ds1' } }],
      DATA_SOURCES,
    )
    expect(node.props).toEqual({ dataSourceId: 'ds1', dsRefId: 'ref-1' })
  })

  it('leaves the block untouched when the binding has no refId', () => {
    const [node] = prepareMobileRule(
      [{ type: 'page-list-cards', props: { dataSourceId: 'ds2' } }],
      DATA_SOURCES,
    )
    expect(node.props).toEqual({ dataSourceId: 'ds2' })
  })

  it('does not inject into non-block nodes even with a dataSourceId prop', () => {
    const [node] = prepareMobileRule(
      [{ type: 'input', field: 'x', props: { dataSourceId: 'ds1' } }],
      DATA_SOURCES,
    )
    expect(node.props).toEqual({ dataSourceId: 'ds1' })
  })

  it('normalizes a saved data container: props.rule moves to props.childRules and children empties', () => {
    const child = { type: 'input', field: 'a' }
    const [node] = prepareMobileRule(
      [{ type: 'page-data-container', props: { dataSourceId: 'ds1', rule: [child] } }],
      DATA_SOURCES,
    )
    expect(node.props!.rule).toBeUndefined()
    expect(node.props!.childRules).toEqual([child])
    expect(node.props!.dsRefId).toBe('ref-1')
    expect(node.children).toEqual([])
  })

  it('prepares blocks nested in container childRules with dsRefId injection', () => {
    const [node] = prepareMobileRule(
      [
        {
          type: 'page-data-container',
          props: { rule: [{ type: 'page-form', props: { dataSourceId: 'ds1' } }] },
        },
      ],
      DATA_SOURCES,
    )
    const inner = (node.props!.childRules as Record<string, any>[])[0]
    expect(inner.props).toEqual({ dataSourceId: 'ds1', dsRefId: 'ref-1' })
  })

  it('recurses into layout children (fcRow/col) and injects there', () => {
    const [node] = prepareMobileRule(
      [
        {
          type: 'fcRow',
          children: [{ type: 'col', children: [{ type: 'page-table', props: { dataSourceId: 'ds1' } }] }],
        },
      ],
      DATA_SOURCES,
    )
    const deep = ((node.children as Record<string, any>[])[0].children as Record<string, any>[])[0]
    expect(deep.props).toEqual({ dataSourceId: 'ds1', dsRefId: 'ref-1' })
  })

  it('does not mutate the input rules', () => {
    const rules = [{ type: 'page-table', props: { dataSourceId: 'ds1' } }]
    prepareMobileRule(rules, DATA_SOURCES)
    expect(rules[0].props).toEqual({ dataSourceId: 'ds1' })
  })
})
