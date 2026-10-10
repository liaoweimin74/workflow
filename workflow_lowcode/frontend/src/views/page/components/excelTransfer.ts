/**
 * 页面数据视图 Excel 导入导出（Task 5-b）—— 纯逻辑层。
 *
 * 职责：导出请求体组装（与 PageDataTable.fetchApi 同构的查询条件语义）/ 文件名生成 /
 * fetch → blob → a[download] 下载 / 导入 FormData 上传 / R 包装与导入结果归一化。
 * 不依赖组件与全局拦截器（fetch 不走 http.ts 拦截器，错误归一化在此收敛）。
 *
 * 后端契约（PageDataExcelController，前缀与 PageQueryController 同为 /api/v1/pages）：
 * - 导出 POST /api/v1/pages/{pageKey}/data/export —— JSON 入参 PageDataExportRequest
 *   {filter?, keyword?, keywordColumn?, sort?, order?, params?, columns?, filename?}（全部可选，
 *   filter/sort 受页面 schema 白名单约束），成功返回 xlsx 二进制
 *   （Content-Disposition: attachment; filename*=UTF-8''<页面名>.xlsx；
 *   超 10000 行截断并回响应头 X-Export-Truncated: true）。
 *   业务失败走全局异常 → HTTP 200 + Content-Type: application/json + R{code≠200, msg}。
 * - 导入 POST /api/v1/pages/{pageKey}/data/import —— multipart/form-data：
 *   file（必填 .xlsx）+ mapping（可选 JSON 字符串 {表头文本: 字段key}），
 *   返回 R<PageDataImportResultVO>{total, success, failed, skipped, errors:[{row, message}]}
 *   （row = Excel 实际行号，1-based，表头为第 1 行）。
 */
import { buildHeaderFilterCondition, type HeaderFilterValue } from './tableEnhance'

/** 页面级 Excel 端点 URL（与后端 PageDataExcelController 路由一致） */
export function pageExcelUrl(pageKey: string, action: 'export' | 'import'): string {
  return `/api/v1/pages/${encodeURIComponent(pageKey || '')}/data/${action}`
}

/** 导出请求体（对齐后端 PageDataExportRequest，全部字段可选） */
export interface ExcelExportRequest {
  /** 结构化筛选 JSON 字符串（{logic, conditions:[{column,op,value}]}） */
  filter?: string
  keyword?: string
  keywordColumn?: string
  sort?: string
  order?: string
  params?: string
  /** 导出列 key 子集（缺省 = 后端按页面声明的全部可见列） */
  columns?: string[]
  /** 下载文件名（缺省 = 后端取页面名称；前端本地命名统一追加时间戳） */
  filename?: string
}

/** 静态筛选条件（tableFilterStore 条目；DsBindingConfigDialog 输出 fixedValue，兼容 value） */
export interface ExportStaticFilterCondition {
  column?: string
  op?: string
  fixedValue?: unknown
  value?: unknown
}

/** 搜索字段声明（导出仅消费 prop） */
export interface ExportSearchField {
  prop: string
}

/** 导出查询上下文（PageDataTable 当前查询快照；条件合并顺序与 fetchApi 一致） */
export interface ExportFilterContext {
  /** SearchTable 最近一次取数参数（含搜索字段值 / sort / order；undefined = 尚未取数） */
  queryParams?: Record<string, any> | null
  /** 搜索栏字段声明（prop 列表） */
  searchFields?: ExportSearchField[]
  /** 组件级静态筛选（tableFilterStore[dataSourceId]） */
  staticFilter?: { conditions?: ExportStaticFilterCondition[] } | null
  /** 动作总线 set-filter 注入 {column: value} */
  busFilter?: Record<string, unknown> | null
  /** 表头筛选状态（漏斗：多选 in / 区间 range） */
  headerFilters?: Record<string, HeaderFilterValue> | null
  /** 搜索列解析（数组值组件主列 → <key>_text 显示列）；缺省原列 */
  resolveColumn?: (key: string) => string
}

/** 导出条件合并：静态筛选 → 动作总线 filter → 表头筛选 → 搜索栏字段（与 fetchApi 同序，AND 语义） */
export function buildExportFilterConditions(ctx: ExportFilterContext): { column: string; op: string; value: unknown }[] {
  const conditions: { column: string; op: string; value: unknown }[] = []
  // 1. 静态筛选（组件级配置，始终生效）
  for (const c of ctx.staticFilter?.conditions || []) {
    if (c.column) {
      conditions.push({ column: c.column, op: c.op || 'eq', value: c.fixedValue ?? c.value ?? '' })
    }
  }
  // 2. 动作总线 set-filter 注入的条件
  for (const [column, value] of Object.entries(ctx.busFilter || {})) {
    if (value === '' || value === null || value === undefined) continue
    conditions.push({ column, op: 'eq', value })
  }
  // 3. 表头筛选（多选 in / 区间 range；空值/缺边由 buildHeaderFilterCondition 收敛为 null）
  for (const [key, value] of Object.entries(ctx.headerFilters || {})) {
    const cond = buildHeaderFilterCondition(key, value)
    if (cond) conditions.push(cond)
  }
  // 4. 搜索栏条件（数组值组件主列 → 显示列；级联路径 label 数组 join('/') 匹配全路径）
  const resolve = ctx.resolveColumn || ((key: string) => key)
  for (const field of ctx.searchFields || []) {
    const raw = ctx.queryParams?.[field.prop]
    if (raw === '' || raw === null || raw === undefined) continue
    const value = Array.isArray(raw) ? raw.join('/') : raw
    conditions.push({ column: resolve(field.prop), op: 'like', value })
  }
  return conditions
}

/** 导出请求体组装：查询条件（AND 合并）+ 排序 + 导出列子集 */
export function buildExcelExportRequest(ctx: ExportFilterContext & { columns?: string[]; filename?: string }): ExcelExportRequest {
  const conditions = buildExportFilterConditions(ctx)
  const body: ExcelExportRequest = {}
  if (conditions.length > 0) {
    body.filter = JSON.stringify({ logic: 'AND', conditions })
  }
  const sort = ctx.queryParams?.sort
  const order = ctx.queryParams?.order
  if (typeof sort === 'string' && sort) body.sort = sort
  if (typeof order === 'string' && order) body.order = order
  if (Array.isArray(ctx.columns) && ctx.columns.length > 0) {
    body.columns = ctx.columns
  }
  if (ctx.filename) body.filename = ctx.filename
  return body
}

/** 时间戳（yyyyMMdd-HHmmss，本地时区） */
export function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/**
 * 下载文件名：{页面名/键}-{yyyyMMdd-HHmmss}.xlsx。
 * 清洗非法路径字符（与后端 sanitizeFilename 同集合）；缺省 base = export；强制 .xlsx 后缀。
 */
export function buildExcelExportFilename(base: string | undefined | null, now: Date = new Date()): string {
  const cleaned = String(base ?? '')
    // 与后端 sanitizeFilename 同集合（Java \p{Cntrl} 在 JS 正则中对应 Unicode 类别 Cc）
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, '_')
    .trim()
    .replace(/\.xlsx$/i, '')
    .trim()
  return `${cleaned || 'export'}-${formatTimestamp(now)}.xlsx`
}

/** 解析 Content-Disposition 文件名：优先 RFC 5987 filename*=UTF-8''（百分号编码），回退 filename=；无 → null */
export function parseContentDispositionFilename(header: string | null | undefined): string | null {
  if (!header) return null
  const star = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (star) {
    try {
      const name = decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
      return name || null
    } catch {
      // 编码非法 → 回退 filename=
    }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i)
  return plain ? plain[1].trim() || null : null
}

/** R 包装（对齐后端 com.workflow.common.domain.R） */
export interface RPayload<T = any> {
  code: number
  msg?: string
  data?: T
}

async function responseToJson(resp: Response): Promise<any> {
  try {
    return JSON.parse(await resp.text())
  } catch {
    return null
  }
}

/**
 * 解析导出响应：成功 = xlsx 二进制（附 Content-Disposition 文件名与截断标记）；
 * 失败 = JSON（R 包装 code≠200，或安全层非 2xx 文本）→ 抛出业务错误消息。
 */
export async function readExportResponse(resp: Response): Promise<{ blob: Blob; filename: string | null; truncated: boolean }> {
  const contentType = resp.headers.get('Content-Type') || ''
  if (!resp.ok || contentType.includes('json')) {
    const parsed = await responseToJson(resp)
    throw new Error((parsed && (parsed.msg || parsed.message)) || `导出失败（HTTP ${resp.status}）`)
  }
  const blob = await resp.blob()
  return {
    blob,
    filename: parseContentDispositionFilename(resp.headers.get('Content-Disposition')),
    truncated: resp.headers.get('X-Export-Truncated') === 'true',
  }
}

/** blob → a[download] 触发浏览器下载（与 PageDataTable 既有 exportData 同款手法） */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** fetch 请求头：鉴权 + 租户（对齐 http.ts 拦截器；fetch 不经过该拦截器故在此补齐） */
function excelRequestHeaders(json?: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = localStorage.getItem('access_token')
  if (token) headers.Authorization = `Bearer ${token}`
  headers['X-Tenant-Id'] = 'default'
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

export interface ExcelExportOutcome {
  filename: string
  truncated: boolean
}

/** 导出全流程：POST JSON → 校验响应 → blob 下载（文件名 = 服务端页面名/回退键 + 时间戳） */
export async function exportPageDataToExcel(
  url: string,
  body: ExcelExportRequest | null,
  opts: { fetchImpl?: typeof fetch; filenameBase?: string } = {},
): Promise<ExcelExportOutcome> {
  const doFetch = opts.fetchImpl || fetch
  const resp = await doFetch(url, {
    method: 'POST',
    headers: excelRequestHeaders(true),
    body: JSON.stringify(body ?? {}),
  })
  const { blob, filename: serverName, truncated } = await readExportResponse(resp)
  const base = serverName ? serverName.replace(/\.xlsx$/i, '') : opts.filenameBase
  const filename = buildExcelExportFilename(base)
  downloadBlob(blob, filename)
  return { filename, truncated }
}

// ==================== 导入 ====================

/** 导入行级失败明细（row = Excel 实际行号，1-based，表头为第 1 行） */
export interface PageDataImportRowError {
  row: number
  message: string
}

/** 导入结果统计（对齐后端 PageDataImportResultVO，字段缺省归一） */
export interface PageDataImportResult {
  total: number
  success: number
  failed: number
  skipped: number
  errors: PageDataImportRowError[]
}

/** 导入结果归一化：后端字段缺省/类型漂移收敛为稳定数值与数组 */
export function normalizeImportResult(data: unknown): PageDataImportResult {
  const d = (data || {}) as Record<string, any>
  const errors = Array.isArray(d.errors)
    ? d.errors.map((e: any) => ({ row: Number(e?.row) || 0, message: String(e?.message ?? '') }))
    : []
  return {
    total: Number(d.total) || 0,
    success: Number(d.success) || 0,
    failed: Number(d.failed) || 0,
    skipped: Number(d.skipped) || 0,
    errors,
  }
}

/** 导入 multipart 表单：file（必填）+ mapping（可选 JSON 字符串 {表头: 字段key}） */
export function buildImportFormData(file: File, mapping?: Record<string, string> | null): FormData {
  const fd = new FormData()
  fd.append('file', file)
  if (mapping && Object.keys(mapping).length > 0) {
    fd.append('mapping', JSON.stringify(mapping))
  }
  return fd
}

/** 导入上传：POST FormData → R 包装校验（code≠200 抛业务消息）→ 结果归一化 */
export async function importPageDataFromExcel(
  url: string,
  file: File,
  mapping?: Record<string, string> | null,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<PageDataImportResult> {
  const doFetch = opts.fetchImpl || fetch
  const resp = await doFetch(url, {
    method: 'POST',
    headers: excelRequestHeaders(false),
    body: buildImportFormData(file, mapping),
  })
  const parsed = await responseToJson(resp)
  if (!parsed || typeof parsed.code !== 'number') {
    throw new Error(resp.ok ? '导入失败' : `导入失败（HTTP ${resp.status}）`)
  }
  if (parsed.code !== 200) {
    throw new Error(parsed.msg || '导入失败')
  }
  return normalizeImportResult(parsed.data)
}
