import { describe, expect, it } from 'vitest'

import {
  makePreviewReady,
  makePreviewSchema,
  parsePreviewMessage,
} from '../mobilePreviewBridge'

/**
 * 设计器 ↔ 移动预览 iframe 的 postMessage 协议（§5.2 裁定形态的通信底座）。
 * 只读实时预览：设计器推 schema，iframe 回 ready 握手；非本协议的 message 一律忽略。
 */
describe('mobilePreviewBridge（预览 postMessage 协议）', () => {
  it('schema message round-trips its payload through the parser', () => {
    const payload = { rule: [{ type: 'page-table', field: 't1' }], dataSources: [], channelProfiles: {} }
    const msg = makePreviewSchema(payload)
    expect(parsePreviewMessage(msg)).toEqual({ kind: 'schema', payload })
  })

  it('ready message round-trips as kind=ready', () => {
    expect(parsePreviewMessage(makePreviewReady())).toEqual({ kind: 'ready' })
  })

  it('ignores foreign / malformed messages', () => {
    expect(parsePreviewMessage(null)).toBeNull()
    expect(parsePreviewMessage('string')).toBeNull()
    expect(parsePreviewMessage({ source: 'webpack-dev-server', type: 'hot-update' })).toBeNull()
    expect(parsePreviewMessage({ source: 'lc-designer-preview', type: 'unknown' })).toBeNull()
    // 无 payload 的 schema 消息=脏数据，忽略（渲染器宁可保持上一帧）
    expect(parsePreviewMessage({ source: 'lc-designer-preview', type: 'schema' })).toBeNull()
  })

  it('sources distinguish the two ends (designer pushes schema, preview replies ready)', () => {
    expect(makePreviewSchema({}).source).toBe('lc-designer-preview')
    expect(makePreviewReady().source).toBe('lc-mobile-preview')
    // ready 只认预览端来源；设计端来源的 ready=伪造，忽略
    expect(parsePreviewMessage({ source: 'lc-designer-preview', type: 'ready' })).toBeNull()
  })
})
