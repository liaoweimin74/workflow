import type { MaterialWidgetItem } from '@/api/material'
import { metaDefaults, metaToRules } from './materialMetaRules'
import { collectWidgetKeys, registerWidgetComponents, widgetTypeOf } from './materialWidgets'

/**
 * 组件型物料 → 设计器（change: remote-materials 二期 5.2/5.4）。
 *
 * 三件事一次做完：
 * 1. 加载并注册组件（复用运行时同一加载器 loadWidgetComponent 与 sdkVersion 校验，
 *    画布预览与线上渲染因此是同一份实现）；
 * 2. 面板建「自定义物料」分组，逐项可拖入；
 * 3. 拖入节点的属性面板按 manifest.meta 出控件，配置值直写节点 rule.props。
 *
 * 加载失败（停用/删除/版本不符/bundle 挂）只降级为占位错误块，不影响其他物料。
 */

export const MATERIAL_MENU_NAME = 'material'
export const MATERIAL_MENU_TITLE = '自定义物料'
/** 必须取 FcDesigner 内置 iconfont 类名，自造类名会渲染成空白 */
export const MATERIAL_MENU_ICON = 'icon-stack'

/** FcDesigner 组件实例暴露的面板 API（取用到的子集） */
export interface MaterialDesignerTarget {
  addMenu(config: { name: string; title: string }): void
  addComponent(item: {
    label: string
    name: string
    icon: string
    menu: string
    rule: () => Record<string, unknown>
  }): void
  setComponentRuleConfig(name: string, rule: () => unknown[], append: boolean): void
}

export interface RegisterMaterialWidgetsOptions {
  designer: MaterialDesignerTarget
  registry: Parameters<typeof registerWidgetComponents>[0]
  /** GET /materials/widgets 返回的启用 WIDGET 物料 */
  widgets: readonly MaterialWidgetItem[]
  /** 当前页面 schema 的 rule：引用了已停用/删除物料时也要注册，否则画布空白 */
  schemaRules?: unknown
}

/** 拖入节点的字段名：物料 key 转合法标识符 + 时间戳，避免同页多实例撞 key */
function widgetField(materialKey: string): string {
  return `material_${materialKey.replace(/[^A-Za-z0-9_]/g, '_')}_${Date.now()}`
}

export async function registerMaterialWidgetsToDesigner(
  opts: RegisterMaterialWidgetsOptions
): Promise<void> {
  const { designer, registry, widgets, schemaRules } = opts

  const enabledKeys = widgets.map((w) => w.materialKey)
  const staleKeys = collectWidgetKeys(schemaRules ?? []).filter((k) => !enabledKeys.includes(k))
  if (!widgets.length && !staleKeys.length) return

  // 启用项与遗留引用一起注册；失败项内部降级占位块，不向外抛
  await registerWidgetComponents(registry, [...enabledKeys, ...staleKeys])

  if (!widgets.length) return

  designer.addMenu({ name: MATERIAL_MENU_NAME, title: MATERIAL_MENU_TITLE })
  for (const w of widgets) {
    const type = widgetTypeOf(w.materialKey)
    designer.addComponent({
      label: w.name || w.materialKey,
      name: type,
      icon: MATERIAL_MENU_ICON,
      menu: MATERIAL_MENU_NAME,
      rule: () => ({ type, field: widgetField(w.materialKey), title: '', props: metaDefaults(w.meta) }),
    })
    designer.setComponentRuleConfig(type, () => metaToRules(w.meta), true)
  }
}
