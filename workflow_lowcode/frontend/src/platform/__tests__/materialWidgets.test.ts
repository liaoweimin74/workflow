// ----- TDD：WIDGET 物料 schema 识别、批量注册与缺失占位（remote-materials 5.1）-----
// npx vitest run src/platform/__tests__/materialWidgets.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../materialLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../materialLoader')>()
  return { ...actual, loadWidgetComponent: vi.fn() }
})

import {
  MATERIAL_TYPE_PREFIX,
  widgetTypeOf,
  parseMaterialType,
  collectWidgetKeys,
  registerWidgetComponents,
  createWidgetPlaceholder,
} from '../materialWidgets'
import { loadWidgetComponent, MaterialLoadError } from '../materialLoader'

describe('物料组件名约定 material:<key>', () => {
  it('widgetTypeOf / parseMaterialType 互逆', () => {
    expect(widgetTypeOf('stock-chart')).toBe('material:stock-chart')
    expect(parseMaterialType('material:stock-chart')).toBe('stock-chart')
  })

  it('非物料类型返回 null（含页面型菜单的 material:<key> 不在 schema 里）', () => {
    expect(parseMaterialType('page-table')).toBeNull()
    expect(parseMaterialType('material:')).toBeNull()
    expect(parseMaterialType(undefined)).toBeNull()
    expect(parseMaterialType(123)).toBeNull()
  })
})

describe('collectWidgetKeys', () => {
  it('收集主树、容器子规则与数据容器 childRules 中的物料引用并去重', () => {
    const rules = [
      { type: 'material:stock-chart', field: 'a' },
      {
        type: 'formContainer',
        props: { rule: [{ type: 'material:demo-widget' }, { type: 'material:stock-chart' }] },
      },
      {
        type: 'page-data-container',
        props: { childRules: [{ type: 'input' }, { type: 'material:notice-list' }] },
      },
      { type: 'el-row', children: [{ type: 'material:stock-chart', children: [{ type: 'el-col', children: '文字' }] }] },
    ]
    expect(collectWidgetKeys(rules).sort()).toEqual(['demo-widget', 'notice-list', 'stock-chart'])
  })

  it('空/非数组输入返回空数组', () => {
    expect(collectWidgetKeys(null as any)).toEqual([])
    expect(collectWidgetKeys([])).toEqual([])
  })
})

/** form-create / FcDesigner 的注册面：只需要 component(name, comp) */
function createRegistryTarget() {
  const registered = new Map<string, any>()
  return {
    component: (name: string, comp: any) => registered.set(name, comp),
    registered,
  }
}

describe('registerWidgetComponents', () => {
  beforeEach(() => {
    vi.mocked(loadWidgetComponent).mockReset()
  })

  it('加载成功时注册真实组件到 material:<key>', async () => {
    const real = { name: 'StockChart', render: () => h('div', 'chart') }
    vi.mocked(loadWidgetComponent).mockResolvedValue(real as any)
    const target = createRegistryTarget()

    await registerWidgetComponents(target, ['stock-chart'])

    expect(target.registered.get('material:stock-chart')).toBe(real)
  })

  it('物料缺失时注册占位错误块，其余物料照常注册，整体不抛异常', async () => {
    const real = { name: 'Ok', render: () => h('div', 'ok') }
    vi.mocked(loadWidgetComponent).mockImplementation(async (key: string) => {
      if (key === 'gone') throw new MaterialLoadError('NOT_FOUND', '物料不存在：gone')
      return real as any
    })
    const target = createRegistryTarget()

    await expect(registerWidgetComponents(target, ['gone', 'ok-widget'])).resolves.toBeDefined()
    expect(target.registered.has('material:gone')).toBe(true)
    expect(target.registered.get('material:ok-widget')).toBe(real)
  })

  it('占位组件渲染出标注物料缺失的错误块', async () => {
    const wrapper = mount(
      createWidgetPlaceholder('stock-chart', new MaterialLoadError('DISABLED', '物料「库存趋势图」已停用')),
    )
    const text = wrapper.text()
    expect(text).toContain('stock-chart')
    expect(text).toContain('已停用')
  })
})
