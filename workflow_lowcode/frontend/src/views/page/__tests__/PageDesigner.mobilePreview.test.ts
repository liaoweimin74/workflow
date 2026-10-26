// ----- 批C C2 移动预览接线（源码锚定） -----
// npx vitest run src/views/page/__tests__/PageDesigner.mobilePreview.test.ts

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('C2 移动预览接线（iframe 手机框 + postMessage 实时同步）', () => {
  const designer = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')
  const router = readFileSync(resolve(__dirname, '../../../router/index.ts'), 'utf8')

  it('预览弹窗加「移动」页签挂手机框组件，桌面预览链路保持原样', () => {
    expect(designer).toContain("import MobilePreviewFrame from './components/MobilePreviewFrame.vue'")
    expect(designer).toContain(`name="mobile"`)
    expect(designer).toContain('<MobilePreviewFrame')
    expect(designer).toContain(`:active="status === 'mobile'"`)
    // 桌面预览=新标签页协议不变（iframe 只进预览弹窗页签，不顶替 handlePreview）
    expect(designer).toContain("window.open(`/page/${pageKey.value}?preview=true`, '_blank')")
  })

  it('手机框吃与保存同口径的 canvasSchema 序列化', () => {
    expect(designer).toContain(':get-schema="canvasSchema"')
  })

  it('iframe 宿主路由独立全屏登记（不进 AdminLayout 壳）', () => {
    expect(router).toContain("path: '/mobile/preview'")
    expect(router).toContain("import('@/views/page/MobilePreviewPage.vue')")
    expect(router).toContain('fullScreen: true')
    // pageKey 走 query → 路由 props 透传（宿主自加载 DRAFT 兜首帧的入口）
    expect(router).toContain('props: (route) => ({ pageKey: route.query.pageKey as string })')
  })

  it('手机框组件：ready 握手推首帧 + 画布指纹去抖追帧', () => {
    const frame = readFileSync(resolve(__dirname, '../components/MobilePreviewFrame.vue'), 'utf8')
    expect(frame).toContain('makePreviewSchema')
    expect(frame).toContain('parsePreviewMessage')
    expect(frame).toContain('postMessage')
    expect(frame).toContain('300')
    expect(frame).toContain('/mobile/preview?pageKey=')
  })
})
