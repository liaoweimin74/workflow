import { describe, it, expect, vi, beforeEach } from 'vitest'

const httpGet = vi.fn()
vi.mock('@/utils/http', () => ({
  default: {
    get: (...args: unknown[]) => httpGet(...args)
  }
}))

import {
  clearMaterialCache,
  isSdkVersionCompatible,
  loadMaterialComponent,
  loadWidgetComponent,
  MaterialLoadError
} from '../materialLoader'

function detail(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 1,
      materialKey: 'demo-board',
      name: '示例物料看板',
      type: 'PAGE',
      version: 1,
      sdkVersion: '1',
      status: 1,
      manifest: { key: 'demo-board' },
      downloadUrl: '/api/materials/demo-board/bundle',
      hostSdkVersion: '1',
      ...overrides
    }
  }
}

describe('SDK 版本协商', () => {
  it('主版本相同即可加载', () => {
    expect(isSdkVersionCompatible('1', '1')).toBe(true)
    expect(isSdkVersionCompatible('1.2', '1.0')).toBe(true)
  })

  it('主版本不同拒绝', () => {
    expect(isSdkVersionCompatible('1.2', '2')).toBe(false)
    expect(isSdkVersionCompatible('2', '1.2')).toBe(false)
  })

  it('次版本低于物料要求拒绝', () => {
    expect(isSdkVersionCompatible('1.0', '1.2')).toBe(false)
  })

  it('空值视为不兼容', () => {
    expect(isSdkVersionCompatible('', '1')).toBe(false)
    expect(isSdkVersionCompatible('1', undefined as unknown as string)).toBe(false)
  })
})

describe('物料加载器', () => {
  beforeEach(() => {
    httpGet.mockReset()
    clearMaterialCache()
  })

  it('启用且版本匹配的物料返回组件定义', async () => {
    httpGet.mockResolvedValue(detail())
    const importer = vi.fn().mockResolvedValue({ default: { name: 'DemoBoard', render() {} } })

    const component = await loadMaterialComponent('demo-board', importer)

    expect(component).toBeTruthy()
    expect(importer).toHaveBeenCalledWith('http://localhost:3000/api/materials/demo-board/bundle')
  })

  it('停用物料抛 DISABLED 且不请求 bundle', async () => {
    httpGet.mockResolvedValue(detail({ status: 0 }))
    const importer = vi.fn()

    await expect(loadMaterialComponent('demo-board', importer)).rejects.toMatchObject({ reason: 'DISABLED' })
    expect(importer).not.toHaveBeenCalled()
  })

  it('SDK 主版本不符抛 SDK_INCOMPATIBLE', async () => {
    httpGet.mockResolvedValue(detail({ sdkVersion: '2', hostSdkVersion: '1' }))

    await expect(loadMaterialComponent('demo-board', vi.fn())).rejects.toMatchObject({
      reason: 'SDK_INCOMPATIBLE'
    })
  })

  it('key 不存在（R 业务码 404）抛 NOT_FOUND', async () => {
    const bizError = Object.assign(new Error('物料不存在: ghost'), { code: 404 })
    httpGet.mockRejectedValue(bizError)

    await expect(loadMaterialComponent('ghost', vi.fn())).rejects.toMatchObject({ reason: 'NOT_FOUND' })
  })

  it('key 不存在（HTTP 404）抛 NOT_FOUND', async () => {
    httpGet.mockRejectedValue({ response: { status: 404 } })

    await expect(loadMaterialComponent('ghost', vi.fn())).rejects.toMatchObject({ reason: 'NOT_FOUND' })
  })

  it('查详情带 X-Skip-Error-Toast（错误态由渲染器呈现，不叠全局 toast）', async () => {
    httpGet.mockResolvedValue(detail())

    await loadMaterialComponent('demo-board', vi.fn().mockResolvedValue({ default: { render() {} } }))

    expect(httpGet.mock.calls[0][1]).toMatchObject({ headers: { 'X-Skip-Error-Toast': '1' } })
  })

  it('其他业务错误（如 403）归为 NETWORK 并带上后端消息', async () => {
    httpGet.mockRejectedValue(Object.assign(new Error('无权限'), { code: 403 }))

    await expect(loadMaterialComponent('demo-board', vi.fn())).rejects.toMatchObject({
      reason: 'NETWORK',
      message: '物料信息获取失败：无权限'
    })
  })

  it('bundle 加载失败抛 NETWORK', async () => {
    httpGet.mockResolvedValue(detail())

    await expect(
      loadMaterialComponent('demo-board', vi.fn().mockRejectedValue(new Error('failed to fetch')))
    ).rejects.toMatchObject({ reason: 'NETWORK' })
  })

  it('bundle 无默认导出抛 INVALID_MODULE', async () => {
    httpGet.mockResolvedValue(detail())

    await expect(
      loadMaterialComponent('demo-board', vi.fn().mockResolvedValue({}))
    ).rejects.toMatchObject({ reason: 'INVALID_MODULE' })
  })

  it('组件型物料不能整页挂载（一期）', async () => {
    httpGet.mockResolvedValue(detail({ type: 'WIDGET' }))

    await expect(loadMaterialComponent('w', vi.fn())).rejects.toThrow(MaterialLoadError)
  })

  it('同 key 二次加载复用缓存', async () => {
    httpGet.mockResolvedValue(detail())
    const importer = vi.fn().mockResolvedValue({ default: { name: 'DemoBoard', render() {} } })

    await loadMaterialComponent('demo-board', importer)
    await loadMaterialComponent('demo-board', importer)

    expect(importer).toHaveBeenCalledTimes(1)
  })
})

describe('组件型物料加载（二期 5.1）', () => {
  beforeEach(() => {
    httpGet.mockReset()
    clearMaterialCache()
  })

  function widgetDetail(overrides: Record<string, unknown> = {}) {
    return detail({
      id: 2,
      materialKey: 'stock-chart',
      name: '库存趋势图',
      type: 'WIDGET',
      downloadUrl: '/api/materials/stock-chart/bundle',
      manifest: { key: 'stock-chart', meta: { title: { type: 'text' } } },
      ...overrides,
    })
  }

  it('启用的 WIDGET 物料返回组件定义', async () => {
    httpGet.mockResolvedValue(widgetDetail())
    const importer = vi.fn().mockResolvedValue({ default: { name: 'StockChart', render() {} } })

    const component = await loadWidgetComponent('stock-chart', importer)

    expect(component).toBeTruthy()
    expect(importer).toHaveBeenCalledWith('http://localhost:3000/api/materials/stock-chart/bundle')
  })

  it('页面型物料不能作为组件加载', async () => {
    httpGet.mockResolvedValue(detail({ type: 'PAGE' }))

    await expect(loadWidgetComponent('demo-board', vi.fn())).rejects.toMatchObject({
      reason: 'NOT_WIDGET',
    })
  })

  it('停用与 SDK 不符沿用同一套校验', async () => {
    httpGet.mockResolvedValue(widgetDetail({ status: 0 }))
    await expect(loadWidgetComponent('stock-chart', vi.fn())).rejects.toMatchObject({ reason: 'DISABLED' })

    httpGet.mockResolvedValue(widgetDetail({ sdkVersion: '2', hostSdkVersion: '1' }))
    await expect(loadWidgetComponent('stock-chart', vi.fn())).rejects.toMatchObject({
      reason: 'SDK_INCOMPATIBLE',
    })
  })

  it('同 key 的缓存按类型隔离：页面加载记录不会被组件加载误用', async () => {
    httpGet.mockResolvedValue(detail({ type: 'PAGE' }))
    await loadMaterialComponent('demo-board', vi.fn().mockResolvedValue({ default: { render() {} } }))

    await expect(loadWidgetComponent('demo-board', vi.fn())).rejects.toMatchObject({ reason: 'NOT_WIDGET' })
  })

  it('组件加载失败抛 INVALID_MODULE（bundle 无默认导出）', async () => {
    httpGet.mockResolvedValue(widgetDetail())

    await expect(loadWidgetComponent('stock-chart', vi.fn().mockResolvedValue({}))).rejects.toMatchObject({
      reason: 'INVALID_MODULE',
    })
  })
})
