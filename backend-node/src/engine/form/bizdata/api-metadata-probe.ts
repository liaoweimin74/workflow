import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../../common/exception/business-exception'
import type { ColumnMeta } from '../../../common/domain/column-config'
import { HttpLogicExecutor, parseFailure } from '../../logic/http-logic-executor'

/** 与 Java `MetadataProbeController.TIMEOUT_MS` 一致。 */
const TIMEOUT_MS = 10000

/** 探测请求固定的分页变量（对齐 Java：`vars.put("page", 1); vars.put("size", 1)`）。 */
const PROBE_PAGE = 1
const PROBE_SIZE = 1

/**
 * API 列元数据探测（对齐 Java `MetadataProbeController.exploreApi` + `inferColumns`）。
 *
 * 调一次 list 操作拉样例，从返回 JSON 里**推断列**：定位**第一个数组节点**，
 * 取首元素的字段，按值类型推 `columnType`。
 *
 * ⚠️ 出站请求**不带认证头**（Java 传的是 `Map.of()`）：目标必须是公开可达的接口，
 *    否则拿到的是 401 响应体（没有数组）→ 报「未找到数组数据」。这是环境事实，
 *    不是实现缺陷（契约场景「API 元数据探测」的注释里写了完整推理）。
 *
 * ⚠️ `data` 里的键会作为**变量**注入（不是请求体）：`explore-api` 用的是
 *    `vars` + 空的 body 映射，所以这些值只能通过 `{{ var }}` 出现在 URL/query/header 里。
 */
@Injectable()
export class ApiMetadataProbe {
  constructor(private readonly httpExecutor: HttpLogicExecutor) {}

  async probe(body: Record<string, unknown> | null): Promise<ColumnMeta[]> {
    if (body === null || body.action === null || body.action === undefined) {
      throw new BusinessException(400, '缺少 action（list 操作地址）')
    }
    const action = String(body.action)
    const method = body.method === null || body.method === undefined ? 'GET' : String(body.method)

    const vars: Record<string, unknown> = {}
    if (body.data !== null && typeof body.data === 'object' && !Array.isArray(body.data)) {
      for (const [key, value] of Object.entries(body.data as Record<string, unknown>)) {
        vars[key] = value
      }
    }
    vars.page = PROBE_PAGE
    vars.size = PROBE_SIZE

    const raw = await this.httpExecutor.execute(
      action,
      method,
      {},
      [],
      [],
      vars,
      TIMEOUT_MS,
      TIMEOUT_MS,
      0,
    )
    return inferColumns(raw)
  }
}

/**
 * 从响应里推断列（对齐 Java `inferColumns`）。
 *
 * 顺序：解析 JSON → 找第一个数组 → 取首元素 → 是对象才逐字段推断（否则返回**空列表**，
 * 不是报错）。非 JSON 文本 → 400「接口返回解析失败」。
 *
 * ⚠️ **已知偏差**：Java 用 Jackson 的节点类型判定整数，`1.0` 会被判成 `DECIMAL`（DoubleNode），
 *    而 `JSON.parse` 把 `1.0` 变成 JS 数字 `1`，这里会判成 `INT`。要精确复刻得自己写
 *    保留字面量的 JSON 扫描器，收益不抵成本 ⇒ 记为已知偏差（与 `schemaEquals` 的
 *    「`1` vs `1.0`」同源）。契约网覆盖不到这条路径（没有公开的数组端点）。
 */
export function inferColumns(raw: unknown): ColumnMeta[] {
  let root: unknown
  try {
    root = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (error) {
    throw parseFailure(error instanceof Error ? error.message : String(error))
  }
  const array = findFirstArray(root)
  if (array === null || array.length === 0) {
    throw new BusinessException(400, '接口返回中未找到数组数据，无法推断字段')
  }
  const sample = array[0]
  const out: ColumnMeta[] = []
  if (sample !== null && typeof sample === 'object' && !Array.isArray(sample)) {
    for (const [key, value] of Object.entries(sample as Record<string, unknown>)) {
      out.push({
        key,
        label: key,
        columnType: inferType(value),
        length: null,
        scale: null,
        nullable: true,
      })
    }
  }
  return out
}

/** 深度优先找第一个数组节点（对齐 Java `findFirstArray`：只递归对象，不递归数组元素）。 */
function findFirstArray(node: unknown): unknown[] | null {
  if (Array.isArray(node)) return node
  if (node !== null && typeof node === 'object') {
    for (const child of Object.values(node as Record<string, unknown>)) {
      const hit = findFirstArray(child)
      if (hit !== null) return hit
    }
  }
  return null
}

/** JSON 值 → 业务列类型（对齐 Java `inferType`）。 */
function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'VARCHAR'
  if (typeof value === 'string') return 'VARCHAR'
  if (typeof value === 'boolean') return 'TINYINT'
  if (typeof value === 'number') return Number.isInteger(value) ? 'INT' : 'DECIMAL'
  // 数组 / 对象 → JSON
  return 'JSON'
}
