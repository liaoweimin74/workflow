/**
 * 移动渲染前的 rule 预备：兑现桌面宿主（PageRendererPage.transformComponent）的两条
 * 数据块协议——移动渲染器必须同构，否则块内组件拿不到真实数据源：
 *  ① 页面内 dataSourceId → schema.dataSources 查全局 refId，注入 props.dsRefId
 *    （块内渲染按 dsRefId 优先取数）；
 *  ② page-data-container 保存态 props.rule → 运行态 props.childRules + children 清空
 *    （容器自渲染子树；直接复用桌面 normalizeDataContainerForRender，单实现不分叉）。
 * 纯函数一律产副本：页面 schema 解析对象被设计器/渲染共享，改入参=污染画布。
 */
import {
  PAGE_DATA_CONTAINER_NAME,
  normalizeDataContainerForRender,
} from '@/views/page/dataContainer'

import { isPageBlockType } from './mobileRuleTransform'

export interface MobileRuleNode {
  type?: string
  props?: Record<string, any>
  children?: unknown[]
  [key: string]: unknown
}

export interface MobileDataSourceBinding {
  id: string
  refId?: string
  [key: string]: unknown
}

function resolveRefId(dataSourceId: unknown, dataSources: readonly MobileDataSourceBinding[]): string | undefined {
  if (typeof dataSourceId !== 'string' || !dataSourceId) return undefined
  const refId = dataSources.find((d) => d.id === dataSourceId)?.refId
  return typeof refId === 'string' && refId ? refId : undefined
}

function prepareNode(node: MobileRuleNode, dataSources: readonly MobileDataSourceBinding[]): MobileRuleNode {
  let next: MobileRuleNode = node
  if (node.type === PAGE_DATA_CONTAINER_NAME) {
    next = normalizeDataContainerForRender(node) as MobileRuleNode
  }

  const refId = isPageBlockType(next.type) ? resolveRefId(next.props?.dataSourceId, dataSources) : undefined
  if (refId && next.props && !next.props.dsRefId) {
    next = { ...next, props: { ...next.props, dsRefId: refId } }
  }

  if (next.type === PAGE_DATA_CONTAINER_NAME && Array.isArray(next.props?.childRules)) {
    const childRules = (next.props.childRules as MobileRuleNode[]).map((child) => prepareNode(child, dataSources))
    next = { ...next, props: { ...next.props, childRules } }
  }

  if (Array.isArray(next.children)) {
    next = {
      ...next,
      children: next.children.map((child) =>
        child && typeof child === 'object' && typeof (child as MobileRuleNode).type === 'string'
          ? prepareNode(child as MobileRuleNode, dataSources)
          : child,
      ),
    }
  }
  return next
}

/** 预处理整棵主 rule 树（副本语义） */
export function prepareMobileRule(
  rules: readonly MobileRuleNode[],
  dataSources: readonly MobileDataSourceBinding[],
): MobileRuleNode[] {
  return rules.map((node) => prepareNode(node, dataSources))
}
