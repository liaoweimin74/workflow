import { describe, expect, it } from 'vitest'

import { MOBILE_MISSING_BLOCKS } from '../channelTemplates'
import { MOBILE_PLACEHOLDER_TYPE, transformRuleForMobile } from '../mobileRuleTransform'

/**
 * 移动渲染器的 rule 变换单点：把「块归属 × 实现进度」解析成可渲染节点——
 * 已实现=原类型（由 @form-create/vant 实例注册的移动组件承接）；
 * pending/unsupported=占位组件（避免 form-create 缺组件只渲染 label 的历史坑）。
 */
const IMPLEMENTED = ['card-list']

describe('transformRuleForMobile', () => {
  it('keeps blocks whose template is implemented unchanged', () => {
    const rules = [{ type: 'page-table', field: 'tbl', props: { dataSourceId: 'ds-1' } }]
    expect(transformRuleForMobile(rules, IMPLEMENTED)).toEqual(rules)
  })

  it('replaces a registered-but-unimplemented block with a pending placeholder', () => {
    const [node] = transformRuleForMobile([{ type: 'page-form', field: 'f1' }], IMPLEMENTED)
    expect(node.type).toBe(MOBILE_PLACEHOLDER_TYPE)
    expect(node.props).toEqual({ block: 'page-form', kind: 'pending' })
  })

  it('replaces a definitively missing block with an unsupported placeholder carrying the reason', () => {
    const [node] = transformRuleForMobile([{ type: 'page-tree-table', field: 't1' }], IMPLEMENTED)
    expect(node.type).toBe(MOBILE_PLACEHOLDER_TYPE)
    expect(node.props).toEqual({
      block: 'page-tree-table',
      kind: 'unsupported',
      reason: MOBILE_MISSING_BLOCKS['page-tree-table'],
    })
  })

  it('treats unknown page-/dash- prefixed types as pending (never silently label-only)', () => {
    const [node] = transformRuleForMobile([{ type: 'page-something-new' }], IMPLEMENTED)
    expect(node.type).toBe(MOBILE_PLACEHOLDER_TYPE)
    expect((node.props as Record<string, unknown>).kind).toBe('pending')
  })

  it('passes built-in form/layout rules through untouched', () => {
    const rules = [
      { type: 'input', field: 'name', title: '名称' },
      { type: 'row', children: [{ type: 'col' }] },
    ]
    expect(transformRuleForMobile(rules, IMPLEMENTED)).toEqual(rules)
  })

  it('recurses into children, replacing nested blocks while preserving structure', () => {
    const rules = [
      {
        type: 'row',
        children: [
          { type: 'col', children: [{ type: 'page-calendar', field: 'cal' }] },
          { type: 'page-list-cards', field: 'cards', props: { dataSourceId: 'ds-2' } },
        ],
      },
    ]
    const out = transformRuleForMobile(rules, IMPLEMENTED)
    expect(out[0].type).toBe('row')
    const nested = (out[0].children as Record<string, any>[])[0].children[0]
    expect(nested.type).toBe(MOBILE_PLACEHOLDER_TYPE)
    expect((nested.props as Record<string, unknown>).kind).toBe('unsupported')
    expect((out[0].children as Record<string, any>[])[1].type).toBe('page-list-cards')
  })

  it('keeps children of replaced block nodes so container content is not silently dropped', () => {
    const [node] = transformRuleForMobile(
      [{ type: 'page-data-container', children: [{ type: 'input', field: 'x' }] }],
      IMPLEMENTED,
    )
    expect(node.type).toBe(MOBILE_PLACEHOLDER_TYPE)
    expect(node.children).toEqual([{ type: 'input', field: 'x' }])
  })

  it('does not mutate the input rules', () => {
    const rules = [{ type: 'page-form', field: 'f1', children: [{ type: 'page-calendar' }] }]
    transformRuleForMobile(rules, IMPLEMENTED)
    expect(rules[0].type).toBe('page-form')
    expect(rules[0].children?.[0].type).toBe('page-calendar')
  })
})
