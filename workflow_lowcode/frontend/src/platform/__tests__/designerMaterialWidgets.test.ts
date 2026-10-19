// ----- TDD: 设计器侧组件物料接线（remote-materials 二期 5.2/5.4）-----
// 验证三件事：面板分组与拖入规则来自启用的 WIDGET 物料、属性面板配置来自 manifest.meta、
// 加载通道与运行时同一个（loadWidgetComponent），缺失物料降级占位块且不影响其他项。
// npx vitest run src/platform/__tests__/designerMaterialWidgets.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import type { MaterialWidgetItem } from '@/api/material'

vi.mock('../materialLoader', () => {
  const loadWidgetComponent = vi.fn(async (key: string) => {
    // broken* 模拟 bundle 挂掉，gone* 模拟物料已删除/停用（加载器抛错）
    if (key.startsWith('broken')) throw new Error('bundle 404')
    if (key.startsWith('gone')) throw new Error('物料不存在')
    return defineComponent({ name: `Real-${key}`, setup: () => () => h('div', key) })
  })
  return { loadWidgetComponent, MaterialLoadError: class extends Error {} }
})

import { loadWidgetComponent } from '../materialLoader'
import {
  MATERIAL_MENU_ICON,
  MATERIAL_MENU_NAME,
  MATERIAL_MENU_TITLE,
  registerMaterialWidgetsToDesigner,
} from '../designerMaterialWidgets'

function widget(
  key: string,
  name: string,
  meta: MaterialWidgetItem['meta'] = [{ field: 'title', label: '标题', type: 'text' }]
): MaterialWidgetItem {
  return { id: 1, materialKey: key, name, version: 1, sdkVersion: '1.0.0', meta }
}

/** 设计器实例桩：只记录面板三件套的调用形态 */
function designerStub() {
  const addMenu = vi.fn()
  const addComponent = vi.fn()
  const setComponentRuleConfig = vi.fn()
  return { designer: { addMenu, addComponent, setComponentRuleConfig }, addMenu, addComponent, setComponentRuleConfig }
}

/** FcDesigner 静态注册面桩 */
function registryStub() {
  const component = vi.fn()
  return { registry: { component }, component }
}

describe('设计器组件物料接线', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('启用物料建「自定义物料」分组并逐项进面板，拖入规则带物料类型与 meta 默认 props', async () => {
    const { designer, addMenu, addComponent } = designerStub()
    const { registry } = registryStub()
    const widgets = [
      widget('stock-chart', '库存趋势', [
        { field: 'title', label: '标题', type: 'text', default: '库存' },
      ]),
      widget('kpi-mini', '迷你指标'),
    ]

    await registerMaterialWidgetsToDesigner({ designer, registry, widgets })

    expect(addMenu).toHaveBeenCalledTimes(1)
    expect(addMenu).toHaveBeenCalledWith({ name: MATERIAL_MENU_NAME, title: MATERIAL_MENU_TITLE })

    expect(addComponent).toHaveBeenCalledTimes(2)
    const first = addComponent.mock.calls[0][0]
    expect(first.label).toBe('库存趋势')
    expect(first.name).toBe('material:stock-chart')
    expect(first.menu).toBe(MATERIAL_MENU_NAME)
    expect(first.icon).toBe(MATERIAL_MENU_ICON)
    const rule = first.rule()
    expect(rule.type).toBe('material:stock-chart')
    expect(rule.title).toBe('')
    expect(rule.props).toEqual({ title: '库存' })
    // field 必须是合法标识符且含物料 key，便于在 schema 里认出处
    expect(rule.field).toMatch(/^material_stock_chart_\d+$/)
    expect(kpiCall(addComponent).rule().field).toMatch(/^material_kpi_mini_\d+$/)
  })

  it('属性面板用 metaToRules 注入，配置值写进节点 rule.props', async () => {
    const { designer, setComponentRuleConfig } = designerStub()
    const { registry } = registryStub()

    await registerMaterialWidgetsToDesigner({
      designer,
      registry,
      widgets: [
        widget('stock-chart', '库存趋势', [
          { field: 'refreshInterval', label: '刷新秒数', type: 'number', default: 30 },
          { field: 'autoRefresh', label: '自动刷新', type: 'switch', default: false },
        ]),
      ],
    })

    expect(setComponentRuleConfig).toHaveBeenCalledTimes(1)
    const [name, rules, append] = setComponentRuleConfig.mock.calls[0]
    expect(name).toBe('material:stock-chart')
    expect(append).toBe(true)
    expect(rules()).toEqual([
      { field: 'refreshInterval', title: '刷新秒数', type: 'inputNumber', value: 30 },
      { field: 'autoRefresh', title: '自动刷新', type: 'switch', value: false },
    ])
  })

  it('设计器与运行时共用同一加载器与类型校验', async () => {
    const { designer } = designerStub()
    const { registry, component } = registryStub()

    await registerMaterialWidgetsToDesigner({ designer, registry, widgets: [widget('stock-chart', '库存趋势')] })

    expect(loadWidgetComponent).toHaveBeenCalledWith('stock-chart')
    expect(component).toHaveBeenCalledWith('material:stock-chart', expect.objectContaining({ name: 'Real-stock-chart' }))
  })

  it('物料加载失败：注册占位错误块，面板项保留，其他物料不受影响', async () => {
    const { designer, addComponent } = designerStub()
    const { registry, component } = registryStub()

    await registerMaterialWidgetsToDesigner({
      designer,
      registry,
      widgets: [widget('broken-chart', '坏物料'), widget('stock-chart', '库存趋势')],
    })

    expect(component).toHaveBeenCalledWith(
      'material:broken-chart',
      expect.objectContaining({ name: 'MaterialWidgetMissing-broken-chart' }),
    )
    expect(component).toHaveBeenCalledWith('material:stock-chart', expect.objectContaining({ name: 'Real-stock-chart' }))
    expect(addComponent).toHaveBeenCalledTimes(2)
  })

  it('schema 引用的物料已不在启用列表（删除/停用）：仍注册占位块，老页面画布不空白', async () => {
    const { designer, addComponent } = designerStub()
    const { registry, component } = registryStub()

    await registerMaterialWidgetsToDesigner({
      designer,
      registry,
      widgets: [],
      schemaRules: [
        { type: 'material:gone-widget' },
        { type: 'formContainer', props: { rule: [{ type: 'material:stock-chart' }] } },
      ],
    })

    expect(component).toHaveBeenCalledWith(
      'material:gone-widget',
      expect.objectContaining({ name: 'MaterialWidgetMissing-gone-widget' }),
    )
    expect(component).toHaveBeenCalledWith('material:stock-chart', expect.objectContaining({ name: 'Real-stock-chart' }))
    // 没有启用物料就不建空分组
    expect(designer.addMenu).not.toHaveBeenCalled()
    expect(addComponent).not.toHaveBeenCalled()
  })

  it('既无启用物料也无引用：什么都不做', async () => {
    const { designer, addMenu } = designerStub()
    const { registry, component } = registryStub()

    await registerMaterialWidgetsToDesigner({ designer, registry, widgets: [], schemaRules: [{ type: 'input' }] })

    expect(addMenu).not.toHaveBeenCalled()
    expect(component).not.toHaveBeenCalled()
    expect(loadWidgetComponent).not.toHaveBeenCalled()
  })
})

function kpiCall(addComponent: ReturnType<typeof vi.fn>) {
  return addComponent.mock.calls.find((c: any[]) => c[0].name === 'material:kpi-mini')![0]
}
