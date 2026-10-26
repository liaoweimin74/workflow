import { describe, expect, it } from 'vitest'

import {
  KNOWN_PAGE_BLOCKS,
  MOBILE_BLOCK_TEMPLATES,
  MOBILE_MISSING_BLOCKS,
  listPublishBlockedBlocks,
  resolveMobileBlock,
} from '../channelTemplates'

/**
 * 渠道模板映射唯一口径（designs §5.1 组件集层的兑现点）：
 * 页面块语义类型 → 移动端模板的归属必须全量、互斥、可枚举——
 * 新增块类型未登记归属时完备性用例必须红，防映射面与渲染器漂移。
 */
describe('channelTemplates（块→移动模板单点）', () => {
  it('every known page block has exactly one disposition (template or missing)', () => {
    for (const block of KNOWN_PAGE_BLOCKS) {
      const hasTemplate = Object.prototype.hasOwnProperty.call(MOBILE_BLOCK_TEMPLATES, block)
      const hasMissing = Object.prototype.hasOwnProperty.call(MOBILE_MISSING_BLOCKS, block)
      expect(hasTemplate !== hasMissing, `block ${block} 必须且只能有一种归属`).toBe(true)
    }
  })

  it('no orphan entries beyond the known block list', () => {
    const known = new Set(KNOWN_PAGE_BLOCKS)
    for (const block of [...Object.keys(MOBILE_BLOCK_TEMPLATES), ...Object.keys(MOBILE_MISSING_BLOCKS)]) {
      expect(known.has(block), `映射表出现未知块 ${block}（先补 KNOWN_PAGE_BLOCKS）`).toBe(true)
    }
  })

  it('missing dispositions carry a reason', () => {
    for (const [block, reason] of Object.entries(MOBILE_MISSING_BLOCKS)) {
      expect(reason, `缺失登记 ${block} 必须写明理由`).toBeTruthy()
    }
  })

  it('resolves a known block to its template when the renderer implements it', () => {
    expect(resolveMobileBlock('page-table', ['card-list'])).toEqual({
      kind: 'render',
      template: 'card-list',
    })
  })

  it('resolves a template registered but not yet implemented as pending', () => {
    // 模板键已定（设计归属），实现分批补齐——渲染器按「暂未支持」占位
    expect(resolveMobileBlock('page-form', ['card-list'])).toEqual({ kind: 'pending' })
  })

  it('resolves a definitively missing block as unsupported with its reason', () => {
    expect(resolveMobileBlock('page-tree-table', [])).toMatchObject({
      kind: 'unsupported',
      reason: MOBILE_MISSING_BLOCKS['page-tree-table'],
    })
  })

  it('unknown block types fall back to pending (renderer decides, never crash)', () => {
    expect(resolveMobileBlock('page-something-new', ['card-list'])).toEqual({ kind: 'pending' })
  })

  it('lists publish-blocked targets for a set of used blocks (A5 发布拦截输入)', () => {
    const used = ['page-table', 'page-calendar', 'page-tree-table']
    expect(listPublishBlockedBlocks(used)).toEqual([
      { block: 'page-calendar', reason: MOBILE_MISSING_BLOCKS['page-calendar'] },
      { block: 'page-tree-table', reason: MOBILE_MISSING_BLOCKS['page-tree-table'] },
    ])
  })

  it('publishes unblocked lists empty', () => {
    expect(listPublishBlockedBlocks(['page-table', 'page-list-cards'])).toEqual([])
  })
})
