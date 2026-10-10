// ----- Task 5-b: Excel 导入导出 api 函数单测（exportPageData / importPageData / filenameFromDisposition） -----
// 策略：注入 mock axios adapter（记录请求配置、按用例返回响应/错误），走「真实」http.ts 拦截器链——
// 覆盖 blob 放行 + __headers 附带（http.ts 改动）、R code 校验与 toast、导出错误归一（单点 X-Skip-Error-Toast）。
// npx vitest run src/api/__tests__/page.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import http from '@/utils/http'
import {
  exportPageData,
  importPageData,
  filenameFromDisposition,
  type PageDataExportRequest,
} from '@/api/page'
import type { R } from '@/types/common'

// http.ts 的 ElMessage（拦截器 toast）替换为可观测 mock（api 函数自身不 toast）
const ElMessageMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
)

vi.mock('element-plus', async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, ElMessage: ElMessageMock }
})

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** 伪造响应描述：status + headers + body（字符串 → JSON 语义；Blob → 二进制语义） */
interface FakeResponse {
  status: number
  headers?: Record<string, string>
  body?: string | Blob
}

/**
 * mock axios adapter（与 xhr adapter 的 settle 语义一致）：
 * 记录请求配置；status 越界（validateStatus 不过）抛出携带 response/config 的 AxiosError 形态错误，
 * 让 axios 错误链与真实行为一致（dispatchRequest 会转换 reason.response.data 后交给拦截器）。
 */
function makeAdapter(resp: FakeResponse, calls: InternalAxiosRequestConfig[]): AxiosAdapter {
  return (async (config: InternalAxiosRequestConfig) => {
    calls.push(config)
    const response: AxiosResponse = {
      data: resp.body,
      status: resp.status,
      statusText: String(resp.status),
      headers: resp.headers || {},
      config,
    }
    const ok = !config.validateStatus || config.validateStatus(response.status)
    if (ok) return response
    const err: any = new Error(`Request failed with status code ${resp.status}`)
    err.isAxiosError = true
    err.response = response
    err.config = config
    throw err
  }) as AxiosAdapter
}

const originalAdapter = http.defaults.adapter
let calls: InternalAxiosRequestConfig[] = []

function serveWith(resp: FakeResponse): void {
  ;(http.defaults as any).adapter = makeAdapter(resp, calls)
}

function xlsxBody(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: XLSX_TYPE })
}

function dispositionOf(name: string): string {
  return `attachment; filename*=UTF-8''${encodeURIComponent(name)}`
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.removeItem('access_token')
  calls = []
})

afterEach(() => {
  http.defaults.adapter = originalAdapter
})

describe('exportPageData — 导出 blob / 文件名解析 / 截断标记', () => {
  it('POST 页面级端点：responseType=blob + 120s 超时 + X-Skip-Error-Toast（单点错误归一）；文件名取 Content-Disposition', async () => {
    serveWith({
      status: 200,
      headers: { 'Content-Type': XLSX_TYPE, 'Content-Disposition': dispositionOf('员工视图.xlsx') },
      body: xlsxBody(),
    })
    const out = await exportPageData('emp_view', { filename: '员工名单', sort: 'name' })

    expect(calls).toHaveLength(1)
    const cfg = calls[0]
    expect(cfg.url).toBe('/v1/pages/emp_view/data/export')
    expect(cfg.method).toBe('post')
    expect(cfg.responseType).toBe('blob')
    expect(cfg.timeout).toBe(120000)
    expect((cfg.headers as any).get('X-Skip-Error-Toast')).toBe('1')
    expect(JSON.parse(cfg.data as string)).toEqual({ filename: '员工名单', sort: 'name' })

    expect(out.filename).toBe('员工视图.xlsx')
    expect(out.truncated).toBe(false)
    expect(out.blob.size).toBe(3)
    expect(ElMessageMock.error).not.toHaveBeenCalled()
  })

  it('文件名回退链：无 Content-Disposition → body.filename + .xlsx → pageKey + .xlsx', async () => {
    serveWith({ status: 200, headers: { 'Content-Type': XLSX_TYPE }, body: xlsxBody() })
    const withBody = await exportPageData('emp_view', { filename: '员工名单' })
    expect(withBody.filename).toBe('员工名单.xlsx')

    const withoutBody = await exportPageData('emp_view', {})
    expect(withoutBody.filename).toBe('emp_view.xlsx')
  })

  it('X-Export-Truncated:true → truncated（响应头键大小写不敏感）', async () => {
    serveWith({
      status: 200,
      headers: { 'Content-Type': XLSX_TYPE, 'X-Export-Truncated': 'TRUE' },
      body: xlsxBody(),
    })
    const out = await exportPageData('emp_view', {})
    expect(out.truncated).toBe(true)
  })

  it('HTTP 200 + application/json R{code≠200}（BusinessException 走全局异常处理器）：抛业务 msg，不把 JSON 当 xlsx 下载', async () => {
    serveWith({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      // responseType:'blob' 下浏览器 xhr 把响应体交成 Blob（对齐真实运行时形态）
      body: new Blob([JSON.stringify({ code: 400, msg: '排序字段不在页面声明的可排序字段中: x' })], {
        type: 'application/json',
      }),
    })
    await expect(exportPageData('emp_view', {})).rejects.toThrow('排序字段不在页面声明的可排序字段中: x')
    expect(ElMessageMock.error).not.toHaveBeenCalled()
  })

  it('HTTP 403 + Blob R 错误体：解出 R.msg 抛出；拦截器不重复 toast（X-Skip-Error-Toast 生效）', async () => {
    serveWith({
      status: 403,
      headers: { 'Content-Type': 'application/json' },
      body: new Blob([JSON.stringify({ code: 403, msg: '无权访问该页面' })], { type: 'application/json' }),
    })
    await expect(exportPageData('emp_view', {})).rejects.toThrow('无权访问该页面')
    expect(ElMessageMock.error).not.toHaveBeenCalled()
  })

  it('HTTP 500 + 非 JSON 错误体：兜底「导出失败（HTTP 500）」', async () => {
    serveWith({ status: 500, body: new Blob(['Internal Server Error'], { type: 'text/plain' }) })
    await expect(exportPageData('emp_view', {})).rejects.toThrow('导出失败（HTTP 500）')
    expect(ElMessageMock.error).not.toHaveBeenCalled()
  })
})

describe('importPageData — FormData 上传（拦截器统一 R 校验 + toast）', () => {
  const RESULT = {
    total: 3,
    success: 2,
    failed: 1,
    skipped: 1,
    errors: [{ row: 4, message: '字段 年龄 须为整数: 3.5' }],
  }

  function importFormData(): FormData {
    const fd = new FormData()
    fd.append('file', new File(['xlsx-bytes'], '名单.xlsx', { type: XLSX_TYPE }))
    fd.append('mapping', JSON.stringify({ 姓名: 'name' }))
    return fd
  }

  it('code=200（含部分失败 errors）：resolves R 原样；请求 = FormData 原体 + 120s 超时（无手动 Content-Type）', async () => {
    serveWith({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 200, msg: 'ok', data: RESULT }),
    })
    const fd = importFormData()
    const r: R<typeof RESULT> = await importPageData('emp_view', fd)

    expect(r.code).toBe(200)
    expect(r.data).toEqual(RESULT)
    expect(calls).toHaveLength(1)
    const cfg = calls[0]
    expect(cfg.url).toBe('/v1/pages/emp_view/data/import')
    expect(cfg.method).toBe('post')
    expect(cfg.timeout).toBe(120000)
    expect(cfg.data).toBe(fd)
    // 无手动 Content-Type：multipart boundary 由浏览器依 FormData 自动设置（api 层不介入）
    expect(ElMessageMock.error).not.toHaveBeenCalled()
  })

  it('code≠200（HTTP 200）：拦截器 toast R.msg 并 reject（「code≠200 直接 toast msg」契约）', async () => {
    serveWith({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 400, msg: '页面未绑定业务表单' }),
    })
    await expect(importPageData('emp_view', importFormData())).rejects.toThrow('页面未绑定业务表单')
    expect(ElMessageMock.error).toHaveBeenCalledWith('页面未绑定业务表单')
  })
})

describe('filenameFromDisposition — Content-Disposition 文件名解析', () => {
  it("RFC 5987 filename*=UTF-8'' 优先且百分号解码", () => {
    expect(filenameFromDisposition(dispositionOf('员工视图.xlsx'))).toBe('员工视图.xlsx')
  })

  it('回退 filename=（含/不含引号）；双头并存 star 优先', () => {
    expect(filenameFromDisposition('attachment; filename="plain.xlsx"')).toBe('plain.xlsx')
    expect(filenameFromDisposition('attachment; filename=plain.xlsx')).toBe('plain.xlsx')
    const both = `attachment; filename="a.xlsx"; ${dispositionOf('中文.xlsx')}`
    expect(filenameFromDisposition(both)).toBe('中文.xlsx')
  })

  it('非法百分号编码 → 回退 filename=；空/非字符串输入 → 空串', () => {
    const broken = `attachment; filename*=UTF-8''%zz; filename="b.xlsx"`
    expect(filenameFromDisposition(broken)).toBe('b.xlsx')
    expect(filenameFromDisposition(undefined)).toBe('')
    expect(filenameFromDisposition(null)).toBe('')
    expect(filenameFromDisposition(42)).toBe('')
    expect(filenameFromDisposition('attachment; size=1')).toBe('')
  })
})

describe('PageDataExportRequest 类型冒烟（编译期契约）', () => {
  it('全部字段可选：空对象是合法导出请求体', () => {
    const body: PageDataExportRequest = {}
    expect(body).toEqual({})
  })
})
