/**
 * dash-todo 接入链路测试（设计器侧）。
 *
 * 分两层：
 *  1. DashConfigDialog 的 todo 模式——真实 mount，验证「不依赖数据源、不暴露身份」这条契约；
 *  2. 接入锚点（源码级）——PageDesigner 面板注册与弹窗模式映射、main.ts 全局注册、
 *     PageRendererPage 把组件纳入仪表盘实例集合（筛选器广播与动作总线刷新靠它）。
 *     PageDesigner 整体挂载代价过高，这里沿用仓库既有的源码锚点做法。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DashConfigDialog from '../DashConfigDialog.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    aggregate: vi.fn(),
    getMetadata: vi.fn(),
  },
}))

async function openTodoDialog(bindingProps: Record<string, any>) {
  // 弹窗按「打开时回填」设计（watch modelValue），故先关着挂载再置 true，与设计器点「配置待办」一致
  const wrapper = mount(DashConfigDialog, {
    props: {
      modelValue: false,
      mode: 'todo',
      bindingProps,
      formDataSources: [],
      enabledDataSources: [],
    },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

function confirmButton(): HTMLButtonElement | undefined {
  const btns = Array.from(document.querySelectorAll('.el-dialog__footer button')) as HTMLButtonElement[]
  return btns.find((b) => (b.textContent || '').includes('确定'))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('DashConfigDialog：待办清单（todo 模式）', () => {
  it('不要求数据源：无数据源告警、无「数据源/聚合方式」项，确定按钮可直接点', async () => {
    await openTodoDialog({})
    const text = document.body.textContent || ''
    expect(text).not.toContain('数据源')
    expect(text).not.toContain('聚合方式')
    expect(text).toContain('视图')
    expect(text).toContain('待办')
    expect(text).toContain('已办')
    expect(text).toContain('列表条数')
    expect(confirmButton()?.disabled).toBe(false)
  })

  it('没有身份配置项：弹窗不出现负责人/用户输入', async () => {
    await openTodoDialog({})
    const text = document.body.textContent || ''
    expect(text).not.toContain('负责人')
    expect(text).not.toContain('办理人')
  })

  it('confirm 回传视图/条数/排序与宽高，且绝不含 assignee / userId', async () => {
    const wrapper = await openTodoDialog({
      title: '我的待办',
      view: 'todo',
      limit: 8,
      orderBy: 'priority',
      span: 12,
      height: '260px',
    })
    confirmButton()!.click()
    await flushPromises()
    const payload = (wrapper.emitted('confirm') as any[])[0][0]
    expect(payload).toMatchObject({
      mode: 'todo',
      title: '我的待办',
      view: 'todo',
      limit: 8,
      orderBy: 'priority',
      span: 12,
      height: '260px',
    })
    expect(payload).not.toHaveProperty('assignee')
    expect(payload).not.toHaveProperty('userId')
    wrapper.unmount()
  })

  it('已办视图回填：bindingProps.view=done 原样带回，不改写成待办', async () => {
    const wrapper = await openTodoDialog({ view: 'done', limit: 5, orderBy: '' })
    confirmButton()!.click()
    await flushPromises()
    const payload = (wrapper.emitted('confirm') as any[])[0][0]
    expect(payload).toMatchObject({ mode: 'todo', view: 'done', limit: 5, orderBy: '' })
    wrapper.unmount()
  })
})

describe('dash-todo 接入锚点', () => {
  const designer = readFileSync(resolve(__dirname, '../../../page/PageDesigner.vue'), 'utf8')
  const main = readFileSync(resolve(__dirname, '../../../../main.ts'), 'utf8')
  const renderer = readFileSync(resolve(__dirname, '../../../page/PageRendererPage.vue'), 'utf8')

  it('PageDesigner：面板拖入项 + 属性面板配置按钮 + 弹窗模式映射', () => {
    expect(designer).toContain('name: DASH_TODO_NAME')
    expect(designer).toContain('rule: () => dashTodoRule() as any')
    expect(designer).toContain("openDashConfig('todo')")
    expect(designer).toContain('todo: DASH_TODO_NAME')
  })

  it('全局注册组件（设计器画布与运行时渲染共用同一 form-create 单例）', () => {
    expect(main).toContain("FcDesigner.component('dash-todo', DashTodo)")
  })

  it('运行时把 dash-todo 纳入仪表盘实例集合：接筛选器广播 + 动作总线刷新', () => {
    const line = renderer.match(/const DASH_DATA_TYPES = new Set\(\[([^\]]*)\]\)/)?.[1] || ''
    expect(line).toContain("'dash-todo'")
  })
})
