// ----- TDD: Excel 导入导出纯逻辑层（Task 5-b excelTransfer） -----
// 覆盖：导出请求体组装（条件合并顺序与 fetchApi 同构）/ 文件名生成（时间戳+清洗）/
// Content-Disposition 解析 / 导出响应归一化（R 错误 + xlsx 成功）/ blob 下载 /
// 导出全流程（注入 fetch）/ 导入 FormData 组装与上传（R code≠200 抛业务消息）/ 结果归一化。
// npx vitest run src/views/page/__tests__/excelTransfer.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  pageExcelUrl,
  buildExportFilterConditions,
  buildExcelExportRequest,
  buildExcelExportFilename,
  formatTimestamp,
  parseContentDispositionFilename,
  readExportResponse,
  downloadBlob,
  exportPageDataToExcel,
  buildImportFormData,
  importPageDataFromExcel,
  normalizeImportResult,
} from '../components/excelTransfer'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

beforeEach(() => {
  localStorage.removeItem('access_token')
})

describe('pageExcelUrl', () => {
  it('拼出页面级导出/导入端点（与 PageDataExcelController 路由一致，pageKey 编码）', () => {
    expect(pageExcelUrl('emp_view', 'export')).toBe('/api/v1/pages/emp_view/data/export')
    expect(pageExcelUrl('emp_view', 'import')).toBe('/api/v1/pages/emp_view/data/import')
    expect(pageExcelUrl('a b/c', 'export')).toBe('/api/v1/pages/a%20b%2Fc/data/export')
  })
})

describe('buildExportFilterConditions — 条件合并与 fetchApi 同构', () => {
  it('静态筛选：fixedValue 优先、op 缺省 eq、空 column 跳过', () => {
    const conds = buildExportFilterConditions({
      staticFilter: {
        conditions: [
          { column: 'dept', op: 'eq', fixedValue: 'IT' },
          { column: 'status', value: 'A' },
          { column: '', value: 'x' },
          { op: 'eq', fixedValue: 'y' },
        ],
      },
    })
    expect(conds).toEqual([
      { column: 'dept', op: 'eq', value: 'IT' },
      { column: 'status', op: 'eq', value: 'A' },
    ])
  })

  it('动作总线 filter：空值跳过、eq 语义', () => {
    const conds = buildExportFilterConditions({
      busFilter: { dept: 'IT', empty: '', nil: null, undef: undefined },
    })
    expect(conds).toEqual([{ column: 'dept', op: 'eq', value: 'IT' }])
  })

  it('表头筛选：in/range 经 buildHeaderFilterCondition，空值收敛跳过', () => {
    const conds = buildExportFilterConditions({
      headerFilters: {
        dept: { mode: 'in', values: ['IT', 'HR'] },
        age: { mode: 'range', min: '18', max: '60' },
        broken: { mode: 'in', values: [] },
        half: { mode: 'range', min: '1', max: '' },
      } as any,
    })
    expect(conds).toEqual([
      { column: 'dept', op: 'in', value: ['IT', 'HR'] },
      { column: 'age', op: 'range', value: ['18', '60'] },
    ])
  })

  it('搜索字段：空值跳过、数组 join("/")、resolveColumn 映射 <key>_text', () => {
    const conds = buildExportFilterConditions({
      queryParams: { name: '张三', dept_path: ['公司', '研发部'], empty: '', page: 1, size: 20 },
      searchFields: [{ prop: 'name' }, { prop: 'dept_path' }, { prop: 'empty' }],
      resolveColumn: (key) => (key === 'dept_path' ? 'dept_path_text' : key),
    })
    expect(conds).toEqual([
      { column: 'name', op: 'like', value: '张三' },
      { column: 'dept_path_text', op: 'like', value: '公司/研发部' },
    ])
  })

  it('四源合并顺序：静态 → 总线 → 表头 → 搜索（AND 语义下的稳定次序）', () => {
    const conds = buildExportFilterConditions({
      staticFilter: { conditions: [{ column: 's', fixedValue: 1 }] },
      busFilter: { b: 2 },
      headerFilters: { h: { mode: 'in', values: ['x'] } } as any,
      queryParams: { q: 3 },
      searchFields: [{ prop: 'q' }],
    })
    expect(conds.map((c) => c.column)).toEqual(['s', 'b', 'h', 'q'])
  })
})

describe('buildExcelExportRequest', () => {
  it('条件非空 → filter JSON 字符串（logic AND）；sort/order 透传', () => {
    const body = buildExcelExportRequest({
      queryParams: { name: '张三', sort: 'name', order: 'asc' },
      searchFields: [{ prop: 'name' }],
    })
    expect(body.filter).toBe(
      JSON.stringify({ logic: 'AND', conditions: [{ column: 'name', op: 'like', value: '张三' }] }),
    )
    expect(body.sort).toBe('name')
    expect(body.order).toBe('asc')
  })

  it('无条件不产 filter 键；columns 空数组/非数组不产 columns 键；filename 仅在有值时携带', () => {
    expect(buildExcelExportRequest({})).toEqual({})
    expect(buildExcelExportRequest({ columns: [] })).not.toHaveProperty('columns')
    const body = buildExcelExportRequest({ columns: ['name', 'age'], filename: '员工名单' })
    expect(body.columns).toEqual(['name', 'age'])
    expect(body.filename).toBe('员工名单')
  })
})

describe('文件名生成', () => {
  it('formatTimestamp：yyyyMMdd-HHmmss 本地时区', () => {
    expect(formatTimestamp(new Date(2026, 1, 4, 9, 5, 3))).toBe('20260204-090503')
  })

  it('buildExcelExportFilename：{页面名}-{时间戳}.xlsx，非法字符清洗，xlsx 基名不重复后缀', () => {
    const now = new Date(2026, 11, 31, 23, 59, 59)
    expect(buildExcelExportFilename('员工视图', now)).toBe('员工视图-20261231-235959.xlsx')
    expect(buildExcelExportFilename('a/b:c*?"<>|', now)).toBe('a_b_c______-20261231-235959.xlsx')
    expect(buildExcelExportFilename('名单.xlsx', now)).toBe('名单-20261231-235959.xlsx')
    expect(buildExcelExportFilename('', now)).toBe(`export-20261231-235959.xlsx`)
    expect(buildExcelExportFilename(null, now)).toBe('export-20261231-235959.xlsx')
  })
})

describe('parseContentDispositionFilename', () => {
  it("RFC 5987 filename*=UTF-8'' 百分号解码", () => {
    const header = `attachment; filename*=UTF-8''${encodeURIComponent('员工视图.xlsx')}`
    expect(parseContentDispositionFilename(header)).toBe('员工视图.xlsx')
  })

  it('回退 filename=（含引号）；无头/空名 → null', () => {
    expect(parseContentDispositionFilename('attachment; filename="plain.xlsx"')).toBe('plain.xlsx')
    expect(parseContentDispositionFilename('attachment; filename=plain.xlsx')).toBe('plain.xlsx')
    expect(parseContentDispositionFilename(null)).toBeNull()
    expect(parseContentDispositionFilename('attachment; size=1')).toBeNull()
  })
})

describe('readExportResponse — 响应归一化', () => {
  it('xlsx 成功：blob + Content-Disposition 文件名 + X-Export-Truncated 标记', async () => {
    const resp = new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'Content-Type': XLSX_TYPE,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('员工视图.xlsx')}`,
        'X-Export-Truncated': 'true',
      },
    })
    const out = await readExportResponse(resp)
    expect(out.blob.size).toBe(3)
    expect(out.filename).toBe('员工视图.xlsx')
    expect(out.truncated).toBe(true)
  })

  it('R 业务错误（HTTP 200 + application/json + code≠200）→ 抛出 msg', async () => {
    const resp = new Response(JSON.stringify({ code: 400, msg: '排序字段不在页面声明的可排序字段中: x' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    await expect(readExportResponse(resp)).rejects.toThrow('排序字段不在页面声明的可排序字段中: x')
  })

  it('非 2xx 非 JSON（安全层）→ 抛出含 HTTP 状态的兜底消息', async () => {
    const resp = new Response('denied', { status: 403 })
    await expect(readExportResponse(resp)).rejects.toThrow('HTTP 403')
  })
})

describe('downloadBlob / exportPageDataToExcel', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    // jsdom 未实现 createObjectURL/revokeObjectURL → 以可配置属性覆写（下载手法仅依赖 a[download]+click）
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true })
    clickSpy = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('downloadBlob：createObjectURL → a[download] → click → revoke', () => {
    downloadBlob(new Blob(['x']), '名单-20260214-090000.xlsx')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    const anchor = (HTMLAnchorElement.prototype.click as any).mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('名单-20260214-090000.xlsx')
    expect(anchor.href).toContain('blob:mock-url')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('exportPageDataToExcel：POST JSON + 鉴权/租户头；文件名 = 服务端页面名 + 时间戳；返回截断标记', async () => {
    localStorage.setItem('access_token', 'tok-123')
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([9]), {
        status: 200,
        headers: {
          'Content-Type': XLSX_TYPE,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('员工视图.xlsx')}`,
        },
      }),
    )
    const out = await exportPageDataToExcel(
      '/api/v1/pages/emp_view/data/export',
      { sort: 'name' },
      { fetchImpl, filenameBase: 'emp_view' },
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/v1/pages/emp_view/data/export')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Authorization).toBe('Bearer tok-123')
    expect(init.headers['X-Tenant-Id']).toBe('default')
    expect(JSON.parse(init.body)).toEqual({ sort: 'name' })
    expect(out.filename).toMatch(/^员工视图-\d{8}-\d{6}\.xlsx$/)
    expect(out.truncated).toBe(false)
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('无服务端文件名 → 回退 filenameBase；无 token 不带 Authorization', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1]), { status: 200, headers: { 'Content-Type': XLSX_TYPE } }),
    )
    const out = await exportPageDataToExcel('/api/v1/pages/p/export', null, {
      fetchImpl,
      filenameBase: 'page_key',
    })
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined()
    expect(out.filename).toMatch(/^page_key-\d{8}-\d{6}\.xlsx$/)
  })

  it('R 业务错误 → 抛出 msg（由调用方 toast）', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ code: 400, msg: '页面未绑定数据源' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(
      exportPageDataToExcel('/api/v1/pages/p/export', {}, { fetchImpl, filenameBase: 'p' }),
    ).rejects.toThrow('页面未绑定数据源')
  })
})

describe('导入', () => {
  const file = new File(['xlsx-bytes'], '名单.xlsx', { type: XLSX_TYPE })

  it('buildImportFormData：file + mapping JSON 字符串（空 mapping 不追加）', () => {
    const fd = buildImportFormData(file, { 姓名: 'name', 年龄: 'age' })
    expect(fd.get('file')).toBe(file)
    expect(JSON.parse(fd.get('mapping') as string)).toEqual({ 姓名: 'name', 年龄: 'age' })
    const empty = buildImportFormData(file, {})
    expect(empty.get('mapping')).toBeNull()
  })

  it('importPageDataFromExcel：R code=200 → 结果归一化；FormData 请求体 + 无手动 Content-Type', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 200,
          msg: 'ok',
          data: { total: 3, success: 2, failed: 1, skipped: 1, errors: [{ row: 4, message: '字段 年龄 须为整数: 3.5' }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const result = await importPageDataFromExcel('/api/v1/pages/emp_view/data/import', file, { 姓名: 'name' }, { fetchImpl })
    expect(result).toEqual({
      total: 3,
      success: 2,
      failed: 1,
      skipped: 1,
      errors: [{ row: 4, message: '字段 年龄 须为整数: 3.5' }],
    })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/v1/pages/emp_view/data/import')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.headers['X-Tenant-Id']).toBe('default')
    const fd = init.body as FormData
    expect(fd.get('file')).toBe(file)
    expect(JSON.parse(fd.get('mapping') as string)).toEqual({ 姓名: 'name' })
  })

  it('R code≠200（HTTP 200）→ 抛出业务 msg', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ code: 400, msg: '数据行超过单次导入上限 5000 行' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(
      importPageDataFromExcel('/api/v1/pages/p/data/import', file, null, { fetchImpl }),
    ).rejects.toThrow('数据行超过单次导入上限 5000 行')
  })

  it('非 JSON 响应 → 兜底错误消息（区分 HTTP 状态）', async () => {
    const okButHtml = vi.fn(async () => new Response('<html>401</html>', { status: 200 }))
    await expect(
      importPageDataFromExcel('/api/v1/pages/p/data/import', file, null, { fetchImpl: okButHtml as any }),
    ).rejects.toThrow('导入失败')
    const denied = vi.fn(async () => new Response('forbidden', { status: 403 }))
    await expect(
      importPageDataFromExcel('/api/v1/pages/p/data/import', file, null, { fetchImpl: denied as any }),
    ).rejects.toThrow('HTTP 403')
  })
})

describe('normalizeImportResult — 缺省归一化', () => {
  it('字段缺失/类型漂移收敛为数值与数组', () => {
    expect(normalizeImportResult(null)).toEqual({ total: 0, success: 0, failed: 0, skipped: 0, errors: [] })
    expect(normalizeImportResult({ total: '3', success: 2, errors: [{ row: '4', message: 123 }, null] })).toEqual({
      total: 3,
      success: 2,
      failed: 0,
      skipped: 0,
      errors: [
        { row: 4, message: '123' },
        { row: 0, message: '' },
      ],
    })
  })
})
