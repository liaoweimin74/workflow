// ----- errorAction 动态提示三态（error 出边联动 + {{__lastError}} 引用提示） -----
// npx vitest run src/views/logicflow/components/__tests__/PropertyPanelLastErrorHint.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PropertyPanel from '../PropertyPanel.vue'
import type { FlowEdge, FlowNode } from '../../utils/dsl'

beforeEach(() => {
  vi.clearAllMocks()
})

vi.mock('@/api/logicFlow', () => ({
  logicFlowApi: { list: vi.fn().mockResolvedValue({ data: { content: [] } }) },
}))
vi.mock('@/api/data-source', () => ({
  dataSourceApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
}))
vi.mock('@/api/form', () => ({
  formApi: { getFormDefinitions: vi.fn().mockResolvedValue({ data: { rows: [] } }) },
}))

function httpNode(data: Partial<FlowNode['data']> = {}): FlowNode {
  return {
    id: 'http_1',
    type: 'logic',
    position: { x: 0, y: 0 },
    data: {
      nodeType: 'HTTP',
      name: '调用接口',
      config: { url: 'https://x/api', method: 'GET', headers: {}, queryParams: [], bodyParams: [] },
      ...data,
    },
  }
}

function errorEdge(source = 'http_1'): FlowEdge {
  return {
    id: `e_${source}_fb`,
    source,
    target: 'fb',
    sourceHandle: 'error',
    targetHandle: null as unknown as string,
    data: { branch: 'error' },
  }
}

function alertText(wrapper: ReturnType<typeof mount>): string {
  return wrapper.find('.panel-alert .el-alert__title').text()
}

/** errorAction 选择器置灰（element-plus 2.14：disabled 类落在 .el-select__wrapper） */
function selectDisabled(wrapper: ReturnType<typeof mount>): boolean {
  return wrapper.find('.el-select__wrapper.is-disabled').exists()
}

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(PropertyPanel, {
    props: { node: httpNode(), variables: [], ...props },
    global: { plugins: [ElementPlus] },
  })
}

describe('PropertyPanel errorAction 动态提示', () => {
  it('无 error 出边且未设置 errorAction → 中性说明，选择器可用', () => {
    const wrapper = mountPanel({ edges: [] })
    expect(alertText(wrapper)).toContain('失败时中断整个流程')
    expect(selectDisabled(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('已连 error 出边 → warning 提示优先级，选择器置灰', () => {
    const wrapper = mountPanel({ edges: [errorEdge()] })
    expect(wrapper.find('.panel-alert .el-alert--warning').exists()).toBe(true)
    expect(alertText(wrapper)).toContain('已连接失败分支（error 出边）')
    expect(alertText(wrapper)).toContain('此属性不生效')
    expect(selectDisabled(wrapper)).toBe(true)
    wrapper.unmount()
  })

  it('IGNORE_CONTINUE 且无 error 出边 → 提示 {{__lastError}} 引用', () => {
    const wrapper = mountPanel({ edges: [], node: httpNode({ errorAction: 'IGNORE_CONTINUE' }) })
    expect(alertText(wrapper)).toContain('失败时记录后继续主流程')
    expect(alertText(wrapper)).toContain('__lastError')
    expect(selectDisabled(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('响应式：连接/删边后提示与置灰实时切换；切换节点重算', async () => {
    const wrapper = mountPanel({ edges: [] })
    expect(alertText(wrapper)).toContain('失败时中断整个流程')

    // 连上 error 出边 → warning + 置灰
    await wrapper.setProps({ edges: [errorEdge()] })
    expect(alertText(wrapper)).toContain('已连接失败分支（error 出边）')
    expect(selectDisabled(wrapper)).toBe(true)

    // 删除 error 出边 → 恢复中性说明
    await wrapper.setProps({ edges: [] })
    expect(alertText(wrapper)).toContain('失败时中断整个流程')
    expect(selectDisabled(wrapper)).toBe(false)

    // 切到 IGNORE_CONTINUE 节点 → 提示 __lastError 引用
    await wrapper.setProps({ node: httpNode({ errorAction: 'IGNORE_CONTINUE' }) })
    expect(alertText(wrapper)).toContain('__lastError')
    wrapper.unmount()
  })

  it('error 出边按 source 定位：他节点的 error 出边不影响当前节点', () => {
    const wrapper = mountPanel({ edges: [errorEdge('http_other')] })
    expect(alertText(wrapper)).toContain('失败时中断整个流程')
    expect(selectDisabled(wrapper)).toBe(false)
    wrapper.unmount()
  })
})
