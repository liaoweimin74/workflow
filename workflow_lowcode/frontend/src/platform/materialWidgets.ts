import { defineComponent, h, type Component } from 'vue'
import { loadWidgetComponent, MaterialLoadError } from './materialLoader'

/**
 * 组件型物料（WIDGET）与设计器/渲染器的接线（change: remote-materials 二期 5.1/5.4）。
 *
 * schema 里物料节点的组件名约定为 `material:<key>`（与页面型菜单 component 同一前缀口径），
 * 渲染前把引用到的物料批量加载并注册进 form-create（渲染侧）或 FcDesigner（画布侧）；
 * 两者共用同一加载器与注册通道，因此画布预览与线上渲染是同一份组件实现。
 *
 * 物料被删除/停用/版本不符时注册占位错误块：引用了缺失物料的那一段渲染错误块，
 * 页面其余部分照常渲染，不抛未捕获异常。
 */

export const MATERIAL_TYPE_PREFIX = 'material:'

/** schema 里引用物料组件的 type 值 */
export function widgetTypeOf(key: string): string {
  return `${MATERIAL_TYPE_PREFIX}${key}`
}

/** 从 rule.type 解析物料 key；非物料节点返回 null */
export function parseMaterialType(type: unknown): string | null {
  if (typeof type !== 'string' || !type.startsWith(MATERIAL_TYPE_PREFIX)) return null
  const key = type.slice(MATERIAL_TYPE_PREFIX.length)
  return key || null
}

/**
 * 递归收集 schema 引用到的物料 key（去重）。
 * 三条子规则通道都要走：children（普通嵌套）、props.rule（表单容器/子表单）、
 * props.childRules（数据容器）——物料可以嵌在这些容器里。
 */
export function collectWidgetKeys(rules: unknown): string[] {
  const found = new Set<string>()
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      const r = node as Record<string, any>
      const key = parseMaterialType(r.type)
      if (key) found.add(key)
      walk(r.children)
      walk(r.props?.rule)
      walk(r.props?.childRules)
    }
  }
  walk(rules)
  return [...found]
}

/** form-create / FcDesigner 的注册面：两者的 component(name, component) 签名一致 */
export interface WidgetComponentRegistry {
  component(name: string, component: Component): unknown
}

/** 物料缺失时的占位错误块（画布与渲染侧共用同一形态） */
export function createWidgetPlaceholder(key: string, error: unknown): Component {
  const reason =
    error instanceof MaterialLoadError ? error.message : (error as Error)?.message || '未知错误'
  return defineComponent({
    name: `MaterialWidgetMissing-${key}`,
    setup() {
      return () =>
        h(
          'div',
          {
            class: 'material-widget-missing',
            style: 'padding:12px 16px;border:1px dashed var(--el-color-danger,#f56c6c);border-radius:6px;background:var(--el-color-danger-light-9,#fef0f0);color:var(--el-color-danger,#f56c6c);font-size:13px;line-height:1.6;',
          },
          [
            h('div', { style: 'font-weight:600;' }, `物料组件「${key}」不可用`),
            h('div', { style: 'color:var(--el-text-color-regular,#606266);' }, reason),
          ],
        )
    },
  })
}

/**
 * 批量加载并注册物料组件，返回 key → 组件（真实组件或占位错误块）。
 * 单个物料失败只影响它自己，绝不向外抛——引用了已删除物料的老页面仍可完整渲染。
 */
export async function registerWidgetComponents(
  target: WidgetComponentRegistry,
  keys: readonly string[]
): Promise<Map<string, Component>> {
  const registered = new Map<string, Component>()
  await Promise.all(
    keys.map(async (key) => {
      let component: Component
      try {
        component = await loadWidgetComponent(key)
      } catch (e) {
        console.warn(`[material] 组件物料「${key}」加载失败，渲染占位错误块`, e)
        component = createWidgetPlaceholder(key, e)
      }
      target.component(widgetTypeOf(key), component)
      registered.set(key, component)
    })
  )
  return registered
}
