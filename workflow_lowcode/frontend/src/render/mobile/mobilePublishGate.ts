/**
 * 发布拦截两级清单（§5.1 组件集层「无移动等价 → 发布对话框（A5）标记并拦截」+ §8.3）。
 *
 * 块级=阻断依据：用到的块命中 MOBILE_MISSING_BLOCKS（确定无移动等价）。
 * 字段级=提示依据（批 B 裁定：EP-only 字段占位降级不阻塞发布，但列入清单让配置者知情）。
 * 未知块/未知类型不进清单——pending 语义渲染期占位即可，发布期不猜理由。
 */
import { MOBILE_MISSING_BLOCKS } from './channelTemplates'
import { MOBILE_MISSING_FIELDS, isMobileSupportedFieldType } from './fieldTemplates'

export interface MobilePublishIssues {
  /** 块级缺失（发布到移动渠道应阻断） */
  blocks: Array<{ block: string; reason: string }>
  /** 字段级缺失（提示不阻断） */
  fields: Array<{ type: string; reason: string }>
}

interface GateRuleNode {
  type?: string
  children?: unknown[]
  props?: { childRules?: unknown[] } & Record<string, unknown>
  [key: string]: unknown
}

/** 从 rule 全树收集块/字段两级移动缺失清单（layout/container 递归下钻） */
export function collectMobilePublishIssues(rules: readonly unknown[]): MobilePublishIssues {
  const seenBlocks = new Set<string>()
  const seenFields = new Set<string>()
  const blocks: MobilePublishIssues['blocks'] = []
  const fields: MobilePublishIssues['fields'] = []

  const walk = (nodes: readonly unknown[]) => {
    for (const raw of nodes) {
      if (!raw || typeof raw !== 'object') continue
      const node = raw as GateRuleNode
      const type = typeof node.type === 'string' ? node.type : ''
      if (type) {
        if (Object.prototype.hasOwnProperty.call(MOBILE_MISSING_BLOCKS, type) && !seenBlocks.has(type)) {
          seenBlocks.add(type)
          blocks.push({ block: type, reason: MOBILE_MISSING_BLOCKS[type] })
        } else if (!isMobileSupportedFieldType(type) && MOBILE_MISSING_FIELDS[type] && !seenFields.has(type)) {
          // 只列登记过理由的缺失字段：未知类型保守占位但无拦截文案，不猜
          seenFields.add(type)
          fields.push({ type, reason: MOBILE_MISSING_FIELDS[type] })
        }
      }
      if (Array.isArray(node.children)) walk(node.children)
      if (Array.isArray(node.props?.childRules)) walk(node.props.childRules)
    }
  }

  walk(rules)
  return { blocks, fields }
}

/** 目标端里是否存在移动形态渠道（H5/APP/MP；WEB-only 不拦） */
export function hasMobileChannel(channelTypes: readonly string[] | undefined | null): boolean {
  return (channelTypes ?? []).some((t) => t === 'H5' || t === 'APP' || t === 'MP')
}
