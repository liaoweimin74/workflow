/**
 * dash-notice（公告栏）接入链路测试。
 *
 * 两层，与 dash-todo 同一守法：
 *  1. DashConfigDialog 的 notice 模式——真实 mount，验「不依赖数据源、不暴露身份」；
 *  2. 接入锚点（源码级）——注册表 rule、PageDesigner 面板项与弹窗模式映射、main.ts 全局注册、
 *     PageRendererPage 把组件纳入仪表盘实例集合（筛选器广播与动作总线刷新靠它）。
 *     PageDesigner 整体挂载代价过高，沿用仓库既有的源码锚点做法。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DashConfigDialog from '../DashConfigDialog.vue'
import { DASH_NOTICE_NAME, dashNoticeRule } from '../../register'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    aggregate: vi.fn(),
    getMetadata: vi.fn(),
  },
}))

async function openNoticeDialog(bindingProps: Record<string, any>) {
  // 弹窗按「打开时回填」设计（watch modelValue），先关着挂载再置 true，与设计器点「配置公告」一致
  const wrapper = mount(DashConfigDialog, {
    props: {
      modelValue: false,
      mode: 'notice',
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

describe('DashConfigDialog：公告栏（notice 模式）', () => {
  it('不要求数据源：面板无「数据源/聚合方式」，无公告也能直接确定', async () => {
    await openNoticeDialog({})
    const text = document.body.textContent || ''
    expect(text).not.toContain('数据源')
    expect(text).not.toContain('聚合方式')
    expect(text).toContain('标题')
    expect(text).toContain('列表条数')
    expect(text).toContain('显示方式')
    expect(confirmButton()?.disabled).toBe(false)
  })

  it('没有身份配置项：不看得到「接收人/用户」这类能翻别人公告的入口', async () => {
    await openNoticeDialog({})
    const text = document.body.textContent || ''
    expect(text).not.toContain('接收人')
    expect(text).not.toContain('用户')
  })

  it('confirm 回传条数/显示方式/轮播间隔与宽高，且不含身份与数据源键', async () => {
    const wrapper = await openNoticeDialog({
      title: '公司公告',
      limit: 6,
      display: 'carousel',
      interval: 3000,
      span: 12,
      height: '180px',
    })
    confirmButton()!.click()
    await flushPromises()
    const payload = (wrapper.emitted('confirm') as any[])[0][0]
    expect(payload).toMatchObject({
      mode: 'notice',
      title: '公司公告',
      limit: 6,
      display: 'carousel',
      interval: 3000,
      span: 12,
      height: '180px',
    })
    for (const forbidden of ['userId', 'assignee', 'receiverId', 'senderId', 'dataSourceId']) {
      expect(payload, `载荷不应出现 ${forbidden}`).not.toHaveProperty(forbidden)
    }
    wrapper.unmount()
  })

  it('列表形态回填后原样带回，轮播间隔不被改写成默认值', async () => {
    const wrapper = await openNoticeDialog({ display: 'list', limit: 10, interval: 5000 })
    confirmButton()!.click()
    await flushPromises()
    const payload = (wrapper.emitted('confirm') as any[])[0][0]
    expect(payload).toMatchObject({ mode: 'notice', display: 'list', limit: 10, interval: 5000 })
    wrapper.unmount()
  })
})

describe('dashNoticeRule：注册表契约', () => {
  it('类型常量与 rule 工厂成对导出', () => {
    expect(DASH_NOTICE_NAME).toBe('dash-notice')
    expect((dashNoticeRule() as any).type).toBe(DASH_NOTICE_NAME)
  })
})

describe('dash-notice 接入锚点', () => {
  const designer = readFileSync(resolve(__dirname, '../../../page/PageDesigner.vue'), 'utf8')
  const main = readFileSync(resolve(__dirname, '../../../../main.ts'), 'utf8')
  const renderer = readFileSync(resolve(__dirname, '../../../page/PageRendererPage.vue'), 'utf8')

  it('PageDesigner：面板拖入项 + 属性面板配置按钮 + 弹窗模式映射', () => {
    expect(designer).toContain('name: DASH_NOTICE_NAME')
    expect(designer).toContain('rule: () => dashNoticeRule() as any')
    expect(designer).toContain("openDashConfig('notice')")
    expect(designer).toContain('notice: DASH_NOTICE_NAME')
  })

  it('全局注册组件（设计器画布与运行时渲染共用同一 form-create 单例）', () => {
    expect(main).toContain("FcDesigner.component('dash-notice', DashNotice)")
  })

  it('运行时把 dash-notice 纳入仪表盘实例集合：接筛选器广播 + 动作总线刷新', () => {
    const line = renderer.match(/const DASH_DATA_TYPES = new Set\(\[([^\]]*)\]\)/)?.[1] || ''
    expect(line).toContain("'dash-notice'")
  })
})
