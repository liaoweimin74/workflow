/**
 * 移动渲染器 rule 变换：把「块归属 × 实现进度」解析成 @form-create/vant 可渲染的节点树。
 *
 * 已实现模板的块保持原类型（移动组件已注册到 vant 实例）；pending/unsupported 块
 * 替换为占位组件——不能留着让 form-create 找不到组件只渲染 label（设计器画布踩过的坑）。
 * 纯函数无状态：设计器预览与 H5 运行时共用。
 */
import { MOBILE_BLOCK_TEMPLATES, MOBILE_MISSING_BLOCKS, resolveMobileBlock } from './channelTemplates'

/** 占位块组件名（MobilePageRenderer 注册到 vant 实例的键） */
export const MOBILE_PLACEHOLDER_TYPE = 'mobile-block-placeholder'

export interface RuleNode {
  type?: string
  props?: Record<string, unknown>
  children?: unknown[]
  [key: string]: unknown
}

/** 页面块判定：显式登记过的块，或 page-/dash- 前缀的未知类型（安全兜底 pending） */
export function isPageBlockType(type: unknown): type is string {
  return (
    typeof type === 'string' &&
    (/^(page|dash)-/.test(type) ||
      Object.prototype.hasOwnProperty.call(MOBILE_BLOCK_TEMPLATES, type) ||
      Object.prototype.hasOwnProperty.call(MOBILE_MISSING_BLOCKS, type))
  )
}

function isRuleNode(value: unknown): value is RuleNode {
  return !!value && typeof value === 'object' && typeof (value as RuleNode).type === 'string'
}

function transformNode(node: RuleNode, implemented: readonly string[]): RuleNode {
  const children = Array.isArray(node.children)
    ? node.children.map((child) => (isRuleNode(child) ? transformNode(child, implemented) : child))
    : node.children

  if (!isPageBlockType(node.type)) {
    return children ? { ...node, children } : node
  }

  const resolution = resolveMobileBlock(node.type as string, implemented)
  if (resolution.kind === 'render') {
    return children ? { ...node, children } : node
  }

  const placeholder: RuleNode = {
    type: MOBILE_PLACEHOLDER_TYPE,
    props:
      resolution.kind === 'unsupported'
        ? { block: node.type, kind: 'unsupported', reason: resolution.reason }
        : { block: node.type, kind: 'pending' },
  }
  // 被替换块若是容器（如暂未实现的 page-data-container），子规则仍渲染，不静默丢内容
  return children ? { ...placeholder, children } : placeholder
}

/** 变换整棵 rule 树（不修改入参）；implemented=渲染器已注册模板键 */
export function transformRuleForMobile(rules: readonly RuleNode[], implemented: readonly string[]): RuleNode[] {
  return rules.map((node) => (isRuleNode(node) ? transformNode(node, implemented) : node))
}
