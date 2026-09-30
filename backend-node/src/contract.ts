// ---------------------------------------------------------------------
// 契约层：与 Java 侧 (R / PageResult / PageResponse / BizDataPageVO /
// GlobalExceptionHandler / JacksonConfig) 逐一对齐的响应语义。
// 移植铁律（来自源码盘点）：
//  1. 所有接口统一 {code, msg, data}；成功恒 code=200、msg="success"
//  2. 业务失败（BizError）HTTP 仍为 200，前端靠 body.code 判断
//  3. Long → 字符串（id/total 等一律 longStr）；int 保持数字
//  4. LocalDateTime → "yyyy-MM-dd HH:mm:ss"；Flowable 手转处 → ISO 带 T；
//     java.util.Date（部署时间）→ epoch 毫秒
//  5. 三种分页形状并存，按模块严格区分，不得统一
//  6. null 字段照常输出（无 NON_NULL），保持字段存在
// ---------------------------------------------------------------------
import type { Request, Response, NextFunction } from 'express'

/** R.ok(data) */
export function ok<T>(data: T) {
  return { code: 200, msg: 'success', data }
}

/** R.ok() — data 为 null 但字段保留 */
export function okVoid() {
  return { code: 200, msg: 'success', data: null }
}

/** 业务错误：HTTP 200 + body.code（复刻 BusinessException 无 @ResponseStatus 语义） */
export class BizError extends Error {
  code: number
  constructor(code: number, msg: string) {
    super(msg)
    this.code = code
  }
}

/** 快捷抛法 */
export const biz = (msg: string) => new BizError(500, msg)
export const biz400 = (msg: string) => new BizError(400, msg)
export const biz403 = (msg: string) => new BizError(403, msg)
export const biz404 = (msg: string) => new BizError(404, msg)

// --------------------------- 序列化 helpers ---------------------------

/** Long → 字符串（null 透传） */
export function longStr(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return String(v)
}

function asDate(d: Date | string | number | null | undefined): Date | null {
  if (d === null || d === undefined || d === '') return null
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? null : dt
}

/** LocalDateTime 全局格式：yyyy-MM-dd HH:mm:ss */
export function fmtDT(d: Date | string | number | null | undefined): string | null {
  const dt = asDate(d)
  if (!dt) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`
}

/** Flowable 手转风格 ISO（带 T，无时区后缀）：yyyy-MM-ddTHH:mm:ss */
export function fmtDTIso(d: Date | string | number | null | undefined): string | null {
  const dt = asDate(d)
  if (!dt) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`
}

/** java.util.Date 默认序列化：epoch 毫秒数（部署时间等） */
export function epochMs(d: Date | string | number | null | undefined): number | null {
  const dt = asDate(d)
  return dt ? dt.getTime() : null
}

// --------------------------- 三种分页形状 ---------------------------

/** A. PageResult<T> — system 模块 + notification（rows 形状；total 为字符串） */
export function pageResult<T>(rows: T[], total: number, page: number, size: number) {
  return { total: longStr(total), page, size, rows }
}

/** B. PageResponse<T> — api 模块（content 形状） */
export function pageResponse<T>(rows: T[], total: number, page: number, size: number) {
  const totalPages = size > 0 ? Math.ceil(total / size) : 0
  return {
    content: rows,
    pageNumber: page,
    pageSize: size,
    totalElements: longStr(total),
    totalPages,
  }
}

/** C. BizDataPageVO<T> — biz-data / data-sources 数据查询（records 形状） */
export function bizDataPage<T>(rows: T[], total: number, page: number, size: number) {
  return { records: rows, total: longStr(total), page, size }
}

/** 分页参数解析（page 从 1 开始，与 Java 侧 one-based 一致） */
export function pageParams(q: Record<string, any>, defSize = 20) {
  const page = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1)
  const size = Math.max(1, parseInt(String(q.size ?? String(defSize)), 10) || defSize)
  return { page, size, offset: (page - 1) * size }
}

// --------------------------- 路由包装与错误处理 ---------------------------

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>

/**
 * 异步路由包装：捕获 BizError → HTTP 200 + {code,msg,data:null}
 * 其余异常交给全局错误中间件
 */
export function h(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

/** 租户缺失（HTTP 400 特例，对齐 TenantNotSetException） */
export class TenantMissingError extends Error {
  constructor() {
    super('Tenant ID is not set')
  }
}

/**
 * 全局错误中间件（对齐 GlobalExceptionHandler）：
 *  - BizError                 → HTTP 200 + body.code
 *  - TenantMissingError       → HTTP 400 {code:400,...}
 *  - TypeError/RangeError 等  → HTTP 400
 *  - 其他                     → HTTP 500 {code:500, msg}
 */
export function globalErrorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return
  if (err instanceof BizError) {
    res.status(200).json({ code: err.code, msg: err.message, data: null })
    return
  }
  if (err instanceof TenantMissingError) {
    res.status(400).json({ code: 400, msg: 'Tenant ID is not set. 请在请求头携带 X-Tenant-Id', data: null })
    return
  }
  if (err instanceof TypeError || err instanceof RangeError || err?.name === 'SyntaxError') {
    res.status(400).json({ code: 400, msg: String(err.message || err), data: null })
    return
  }
  console.error('[unhandled]', err)
  res.status(500).json({ code: 500, msg: String(err?.message || err), data: null })
}
