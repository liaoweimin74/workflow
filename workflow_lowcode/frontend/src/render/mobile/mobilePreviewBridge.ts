/**
 * 设计器 ↔ 移动预览 iframe 的 postMessage 协议（§5.2 裁定形态：iframe 手机框 +
 * 同一 Vant 渲染器的通信底座）。只读实时预览=单向推 schema，握手用 ready 回帧。
 *
 * 来源标记区分两端，防误吃 dev-server HMR 等第三方 message：
 *  - 设计端来源 `lc-designer-preview` 推 `{ type:'schema', payload }`（payload=canvasSchema）
 *  - 预览端来源 `lc-mobile-preview` 回 `{ type:'ready' }`（iframe 就绪，可推首帧）
 * 纯函数无副作用，两端 listener 各自只挑自己该认的那一帧。
 */

export const DESIGNER_PREVIEW_SOURCE = 'lc-designer-preview'
export const MOBILE_PREVIEW_SOURCE = 'lc-mobile-preview'

/** 推给 iframe 的 schema 帧（payload 与 canvasSchema() 同构：{rule,option,dataSources,actions,channelProfiles}） */
export interface PreviewSchemaPayload {
  rule?: unknown[]
  option?: Record<string, unknown>
  dataSources?: unknown[]
  channelProfiles?: Record<string, unknown>
  [key: string]: unknown
}

export type PreviewMessage =
  | { source: typeof DESIGNER_PREVIEW_SOURCE; type: 'schema'; payload: PreviewSchemaPayload }
  | { source: typeof MOBILE_PREVIEW_SOURCE; type: 'ready' }

export type ParsedPreviewMessage = { kind: 'schema'; payload: PreviewSchemaPayload } | { kind: 'ready' }

export function makePreviewSchema(payload: PreviewSchemaPayload): PreviewMessage {
  return { source: DESIGNER_PREVIEW_SOURCE, type: 'schema', payload }
}

export function makePreviewReady(): PreviewMessage {
  return { source: MOBILE_PREVIEW_SOURCE, type: 'ready' }
}

/**
 * 归一化收到的 message：只认本协议且「来源-类型」配对正确的帧，其余一律 null。
 * 脏 schema 帧（payload 缺失）也返回 null——渲染端保持上一帧，不被空数据打穿。
 */
export function parsePreviewMessage(data: unknown): ParsedPreviewMessage | null {
  if (!data || typeof data !== 'object') return null
  const msg = data as Partial<Record<'source' | 'type', unknown>>
  if (msg.source === DESIGNER_PREVIEW_SOURCE && msg.type === 'schema') {
    const payload = (msg as { payload?: unknown }).payload
    if (!payload || typeof payload !== 'object') return null
    return { kind: 'schema', payload: payload as PreviewSchemaPayload }
  }
  if (msg.source === MOBILE_PREVIEW_SOURCE && msg.type === 'ready') {
    return { kind: 'ready' }
  }
  return null
}
