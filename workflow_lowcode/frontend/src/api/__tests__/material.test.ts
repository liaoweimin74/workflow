// ----- TDD: 物料 API 封装（remote-materials 6.3）-----
// 断言请求形态与后端 MaterialController 对齐：列表分页参数、上传 multipart、
// status/force 走 query 而非 body。
// npx vitest run src/api/__tests__/material.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'

const httpGet = vi.fn()
const httpPost = vi.fn()
const httpPut = vi.fn()
const httpDelete = vi.fn()
vi.mock('@/utils/http', () => ({
  default: {
    get: (...args: unknown[]) => httpGet(...args),
    post: (...args: unknown[]) => httpPost(...args),
    put: (...args: unknown[]) => httpPut(...args),
    delete: (...args: unknown[]) => httpDelete(...args),
  },
}))

import {
  deleteMaterial,
  downloadScaffoldTemplate,
  exportMaterials,
  importMaterialPackage,
  inspectMaterialPackage,
  listEnabledWidgets,
  listMaterials,
  setMaterialStatus,
  uploadMaterial,
} from '../material'

describe('物料 API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listMaterials 透传分页与筛选参数', async () => {
    httpGet.mockResolvedValue({ code: 200, data: { content: [], totalElements: 0 } })

    await listMaterials({ page: 2, size: 20, keyword: '看板', type: 'PAGE' })

    expect(httpGet).toHaveBeenCalledWith('/materials', {
      params: { page: 2, size: 20, keyword: '看板', type: 'PAGE' },
    })
  })

  it('uploadMaterial 用 FormData 提交 bundle 与 manifest 两个文件字段', async () => {
    httpPost.mockResolvedValue({ code: 200, data: { id: 1 } })
    const bundle = new File(['export default {}'], 'bundle.js', { type: 'application/javascript' })
    const manifest = new File(['{"key":"demo"}'], 'material.json', { type: 'application/json' })

    await uploadMaterial(bundle, manifest)

    const [url, body] = httpPost.mock.calls[0]
    expect(url).toBe('/materials')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('bundle')).toBeInstanceOf(File)
    expect((body as FormData).get('manifest')).toBeInstanceOf(File)
    expect(((body as FormData).get('bundle') as File).name).toBe('bundle.js')
  })

  it('setMaterialStatus 把 status 放在 query 上（后端 @RequestParam）', async () => {
    httpPut.mockResolvedValue({ code: 200, data: { id: 1, status: 0 } })

    await setMaterialStatus(1, 0)

    expect(httpPut).toHaveBeenCalledWith('/materials/1/status', null, { params: { status: 0 } })
  })

  it('deleteMaterial 默认不带 force，引用冲突重发时带 force=true', async () => {
    httpDelete.mockResolvedValue({ code: 200, data: null })

    await deleteMaterial(7)
    await deleteMaterial(7, true)

    expect(httpDelete).toHaveBeenNthCalledWith(1, '/materials/7', { params: { force: false } })
    expect(httpDelete).toHaveBeenNthCalledWith(2, '/materials/7', { params: { force: true } })
  })

  it('listEnabledWidgets 拉设计器面板用的启用组件物料（无分页参数）', async () => {
    httpGet.mockResolvedValue({
      code: 200,
      data: [{ id: 3, materialKey: 'stock-chart', name: '库存图', version: 2, sdkVersion: '1.0.0', meta: { title: { label: '标题', type: 'text' } } }],
    })

    const res = await listEnabledWidgets()

    expect(httpGet).toHaveBeenCalledWith('/materials/widgets')
    expect(res.data[0].materialKey).toBe('stock-chart')
    expect((res.data[0].meta as any).title.label).toBe('标题')
  })

  it('exportMaterials 走 blob 通道并按 ids 提交', async () => {
    const zip = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' })
    httpPost.mockResolvedValue(zip)

    const out = await exportMaterials([1, 5])

    expect(httpPost).toHaveBeenCalledWith('/materials/export', { ids: [1, 5] },
      expect.objectContaining({ responseType: 'blob' }))
    expect(out).toBe(zip)
  })

  it('导出失败时后端回 JSON 而不是 zip：blob 通道要识别并抛出业务消息', async () => {
    httpPost.mockResolvedValue(new Blob([JSON.stringify({ code: 400, msg: '请至少选择一个物料' })],
      { type: 'application/json' }))

    await expect(exportMaterials([])).rejects.toThrow('请至少选择一个物料')
  })

  it('downloadScaffoldTemplate 用 GET blob 拉工程模板', async () => {
    const zip = new Blob(['x'], { type: 'application/zip' })
    httpGet.mockResolvedValue(zip)

    expect(await downloadScaffoldTemplate()).toBe(zip)
    expect(httpGet).toHaveBeenCalledWith('/materials/scaffold-template',
      expect.objectContaining({ responseType: 'blob' }))
  })

  it('inspectMaterialPackage 上传 zip 做预检', async () => {
    httpPost.mockResolvedValue({ code: 200, data: { exportedAt: 'x', hostSdkVersion: '1', items: [] } })
    const file = new File(['zip'], 'materials.zip', { type: 'application/zip' })

    await inspectMaterialPackage(file)

    const [url, body] = httpPost.mock.calls[0]
    expect(url).toBe('/materials/inspect')
    expect((body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('importMaterialPackage 把逐条策略作为 actions JSON 串提交', async () => {
    httpPost.mockResolvedValue({ code: 200, data: { results: [], messages: [] } })
    const file = new File(['zip'], 'materials.zip', { type: 'application/zip' })

    await importMaterialPackage(file, [{ key: 'demo-board', strategy: 'OVERWRITE' }])

    const body = httpPost.mock.calls[0][1] as FormData
    expect(body.get('actions')).toBe(JSON.stringify([{ key: 'demo-board', strategy: 'OVERWRITE' }]))
  })
})
