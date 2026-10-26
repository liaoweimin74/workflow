import { describe, expect, it } from 'vitest'

import { collectMobilePublishIssues } from '../mobilePublishGate'

/**
 * 发布拦截两级清单（§5.1「无移动等价→发布对话框标记并拦截」+ 批B裁定：
 * EP-only 字段=拦截依据不阻塞）。walk 全树：page-/dash- 前缀=块级口径，
 * 其余按字段级白名单判定；只列登记过的缺失项（未知类型不猜理由）。
 */
describe('collectMobilePublishIssues（块+字段两级扫描）', () => {
  it('empty rule has no issues', () => {
    expect(collectMobilePublishIssues([])).toEqual({ blocks: [], fields: [] })
  })

  it('flags missing blocks with registered reasons', () => {
    const { blocks, fields } = collectMobilePublishIssues([
      { type: 'page-table', field: 't1', props: {} },
      { type: 'page-tree-table', field: 'tt1' },
      { type: 'page-calendar', field: 'cal' },
    ])
    expect(blocks.map((b) => b.block)).toEqual(['page-tree-table', 'page-calendar'])
    expect(blocks[0].reason).toContain('树形')
    expect(fields).toEqual([])
  })

  it('walks nested layout children, container childRules and form children', () => {
    const { blocks, fields } = collectMobilePublishIssues([
      {
        type: 'fcRow',
        children: [
          {
            type: 'col',
            children: [
              {
                type: 'page-form',
                field: 'f1',
                children: [
                  { type: 'input', field: 'a' },
                  { type: 'LookupPicker', field: 'b' },
                  { type: 'subForm', children: [{ type: 'dataPicker', field: 'c' }] },
                ],
              },
            ],
          },
        ],
      },
      { type: 'page-data-container', props: { childRules: [{ type: 'page-calendar', field: 'cal' }] } },
    ])
    expect(blocks.map((b) => b.block)).toEqual(['page-calendar'])
    expect(fields.map((f) => f.type).sort()).toEqual(['LookupPicker', 'dataPicker'])
  })

  it('dedupes repeated occurrences keeping first-seen order', () => {
    const { fields } = collectMobilePublishIssues([
      { type: 'page-form', children: [{ type: 'SystemUserPicker' }, { type: 'input' }, { type: 'SystemUserPicker' }] },
    ])
    expect(fields.map((f) => f.type)).toEqual(['SystemUserPicker'])
  })

  it('unregistered unknown types are not invented into the list', () => {
    const { blocks, fields } = collectMobilePublishIssues([{ type: 'weird-widget' }, { type: 'page-unknown' }])
    expect(fields).toEqual([])
    // 块级只认 MOBILE_MISSING_BLOCKS 登记项；page-unknown= pending 占位不拦截
    expect(blocks).toEqual([])
  })
})
