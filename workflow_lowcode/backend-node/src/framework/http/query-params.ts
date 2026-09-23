/**
 * 查询参数解析助手。
 *
 * 这些函数存在的唯一理由是「把 Java 的 `@RequestParam` 语义搬过来」，
 * 而不是「让代码更短」—— 每个都写明了对齐的是哪一条 Java 行为。
 *
 * ## 类型转换失败的三条形态（2026-09-18 由契约场景「非法查询参数与分页边界」定案）
 *
 * 场景实测（不是读代码推测）下，Java 的失败形态有**三种**，各有独立的消息模板与状态码：
 *
 * | 形态 | 触发 | HTTP | body code | 消息模板 |
 * |---|---|---|---|---|
 * | A 显式 `@RequestParam int\|Integer\|Long` | `?page=abc` | **500** | 500 | `Method parameter 'page': Failed to convert value of type 'java.lang.String' to required type 'int'; For input string: "abc"` |
 * | B 绑定对象字段（`int`，如 `BizDataQueryRequest`） | `?page=abc` | **200** | **400** | `Failed to convert property value of type 'java.lang.String' to required type 'int' for property 'page'; For input string: "abc"` |
 * | B' 绑定对象字段（`Integer`，如系统管理的查询对象） | `?page=abc` | **200** | **400** | `Failed to convert value of type 'java.lang.String' to required type 'java.lang.Integer'; For input string: "abc"`（**没有** property 段） |
 *
 * 另有分页边界：`size < 1` → **HTTP 400** + `Page size must not be less than one`
 * （Spring Data `PageRequest.of` 抛的 `IllegalArgumentException`）。
 *
 * ⚠️ 三种模板不能互相套用：A 的消息里带**声明类型名**（`int` / `java.lang.Integer` /
 *    `java.lang.Long`），B 与 B' 的差别是**有没有 `for property 'x'` 段** ——
 *    这些细节都是从 golden 里逐字抄下来的。
 */

import { BusinessException } from '../../common/exception/business-exception'

/** Java 侧的数字声明类型名（出现在转换失败消息里）。 */
export type JavaNumberType = 'int' | 'java.lang.Integer' | 'java.lang.Long'
/** 32 位整数范围（Java 的 `int` / `Integer` 都是这个范围，超出即转换失败）。 */
const INT_MIN = -2147483648
const INT_MAX = 2147483647

/**
 * 严格按 Java 的数字转换语义解析：只接受 `[+-]?digits`（拒绝 `12.5` / `1e3` / ` 5 ` / 空串以外的空白）。
 *
 * ⚠️ 不能用 `Number()`：它会接受 `" 5 "`、`"0x10"`、`"1e3"`、`"Infinity"`，
 *    而 Java 的 `Integer.parseInt` 全部拒绝。空串/`undefined` 在 Java 里走 defaultValue，
 *    由调用方先判掉。
 */
function parseJavaInteger(value: string, type: JavaNumberType): number | null {
  if (!/^[+-]?\d+$/.test(value)) return null
  const asNumber = Number(value)
  if (!Number.isFinite(asNumber)) return null
  if (type === 'java.lang.Long') {
    // Long 的精确范围判断用 BigInt，避免双精度带来的边界误判
    const big = BigInt(value)
    if (big > 9223372036854775807n || big < -9223372036854775808n) return null
    return asNumber
  }
  if (asNumber < INT_MIN || asNumber > INT_MAX) return null
  return asNumber
}

/** 形态 A 的消息（显式 `@RequestParam`）。 */
function methodParameterMessage(name: string, type: JavaNumberType, raw: string): string {
  return (
    `Method parameter '${name}': Failed to convert value of type 'java.lang.String'` +
    ` to required type '${type}'; For input string: "${raw}"`
  )
}

/** 形态 B 的消息（绑定对象的字段，带 `for property` 段）。 */
function propertyBindingMessage(property: string, type: JavaNumberType, raw: string): string {
  return (
    `Failed to convert property value of type 'java.lang.String'` +
    ` to required type '${type}' for property '${property}'; For input string: "${raw}"`
  )
}

/** 形态 B' 的消息（绑定对象的字段，**不带** `for property` 段）。 */
function bindingMessage(type: JavaNumberType, raw: string): string {
  return (
    `Failed to convert value of type 'java.lang.String' to required type '${type}';` +
    ` For input string: "${raw}"`
  )
}

function invalidArgument(message: string): Error {
  const error = new Error(message)
  error.name = 'IllegalArgumentException'
  return error
}

/**
 * 形态 A：显式 `@RequestParam(defaultValue = "1") int page`。
 *
 * 失败时抛**普通 `Error`** ⇒ 全局过滤器映射成 HTTP 500 + body code 500（与 Java 一致）；
 * 缺失或空串走 `fallback`（Spring 的 defaultValue 对空串同样生效，已由 golden 钉住）。
 */
export function intQueryParam(
  value: string | undefined,
  name: string,
  fallback: number,
): number {
  if (value === undefined || value === '') return fallback
  const parsed = parseJavaInteger(value, 'int')
  if (parsed === null) {
    throw new Error(methodParameterMessage(name, 'int', value))
  }
  return parsed
}

/** 形态 A（`Integer` 声明）：`SystemInternalController` 的 page/size、数据源行更新的 version。 */
export function integerQueryParam(
  value: string | undefined,
  name: string,
  fallback: number,
): number {
  if (value === undefined || value === '') return fallback
  const parsed = parseJavaInteger(value, 'java.lang.Integer')
  if (parsed === null) {
    throw new Error(methodParameterMessage(name, 'java.lang.Integer', value))
  }
  return parsed
}

/**
 * 形态 A 的**可空**版本：`@RequestParam(required = false) Integer version`。
 *
 * 未传/空串 → null（保持「未提供」的语义）；非法值 → 与 Java 同样的 500。
 */
export function integerQueryParamOrNull(
  value: string | undefined,
  name: string,
): number | null {
  if (value === undefined || value === '') return null
  const parsed = parseJavaInteger(value, 'java.lang.Integer')
  if (parsed === null) {
    throw new Error(methodParameterMessage(name, 'java.lang.Integer', value))
  }
  return parsed
}

/** 形态 A 的路径变量版本：`@PathVariable Long id`（消息与查询参数同形，只是类型名是 Long）。 */
export function longPathParam(value: string, name: string): number {
  const parsed = parseJavaInteger(value, 'java.lang.Long')
  if (parsed === null) {
    throw new Error(methodParameterMessage(name, 'java.lang.Long', value))
  }
  return parsed
}

/**
 * 形态 B：绑定对象的 `int` 字段失败 → **HTTP 200 + body code 400**。
 *
 * 用于 `BizDataQueryRequest`（`/data-sources/{id}/data`、`/biz-data/{formKey}` 等）。
 */
export function bindIntProperty(
  value: string | undefined,
  property: string,
  fallback: number,
): number {
  if (value === undefined || value === '') return fallback
  const parsed = parseJavaInteger(value, 'int')
  if (parsed === null) {
    throw new BusinessException(400, propertyBindingMessage(property, 'int', value))
  }
  return parsed
}

/** 形态 B'：绑定对象的 `Integer` 字段失败（系统管理的查询对象）→ HTTP 200 + body code 400。 */
export function bindIntegerProperty(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value === '') return fallback
  const parsed = parseJavaInteger(value, 'java.lang.Integer')
  if (parsed === null) {
    throw new BusinessException(400, bindingMessage('java.lang.Integer', value))
  }
  return parsed
}

/**
 * 分页边界：`size < 1` → `PageRequest.of` 抛 `IllegalArgumentException` ⇒ HTTP 400
 * + `Page size must not be less than one`（Spring Data 的原话）。
 *
 * ⚠️ 判据是 `< 1`，不是「非法值」：`size=0` 与 `size=-1` 都走这一条（golden 各有一步）。
 */
export function assertPageSize(size: number): void {
  if (size < 1) {
    throw invalidArgument('Page size must not be less than one')
  }
}

/**
 * 查询参数 → 整数，缺省时用 `fallback`；**不做类型校验**。
 *
 * ⚠️ 只在「Java 侧本来就没有这个参数」或「Java 侧是宽松绑定」的地方使用。
 *    对应 Java 显式 `@RequestParam int` 的场景请用 `intQueryParam`（形态 A），
 *    绑定对象的字段请用 `bindIntProperty`（形态 B）—— 否则非法值会被静默吞掉，
 *    与 Java 的 500 / 400 分叉。
 */
export function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const parsed = parseJavaInteger(value, 'int')
  return parsed === null ? fallback : parsed
}

/**
 * 查询参数 → `boolean | null`，无法识别时返回 null。
 *
 * 对齐 Java `@RequestParam(required = false) Boolean enabled`：
 *   Spring 的 Boolean 转换器只认 `true`/`false`（忽略大小写），
 *   **空串会转成 null**而不是 false。返回值三态：true / false / null（未传）。
 */
export function toBoolOrNull(value: string | undefined): boolean | null {
  if (value === undefined || value.trim() === '') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return null
}

/** Java 侧 `x != null && !x.isBlank()` 的等价判定：null / 空串 / 纯空白 都按「未传」处理。 */
export function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null
  return value
}

/**
 * 查询参数 → `Date | null`，按 Java 的 `@DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")` 解析。
 *
 * 对齐 Java `@RequestParam(required = false) @DateTimeFormat(...) LocalDateTime start`：
 *   前端 `SearchTable` 的 datetimerange 输出的就是 `yyyy-MM-dd HH:mm:ss`。
 *
 * ⚠️ **已知分歧**（与 `toInt` 同类）：格式不匹配时 Java 抛
 *    `MethodArgumentTypeMismatchException` → HTTP 400；这里退化为 null（不过滤）。
 *    同样没有契约场景覆盖，属规格 §9 开放项，不要在没有 golden 的情况下擅自"修好"。
 *
 * ⚠️ 用**本地时区**构造：Java 侧 LocalDateTime 没有时区，落库/比较都在服务器本地时区，
 *    与 `new Date(y, m, d, ...)` 的语义一致。
 */
export function toTimestampOrNull(value: string | undefined): Date | null {
  const normalized = blankToNull(value)
  if (normalized === null) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(normalized.trim())
  if (m === null) return null
  const [, y, mo, d, h, mi, s] = m.map(Number)
  return new Date(y, mo - 1, d, h, mi, s)
}

/**
 * 查询参数 → 字符串数组。
 *
 * 对齐 Java 的 `@RequestParam List<String> xxx`：Spring 同时接受
 * **重复参数**（`?a=1&a=2`）与**逗号分隔**（`?a=1,2`）两种写法。
 * Nest 在重复参数时给到数组、单值时给到字符串，两种都要能接。
 * 空串会被丢掉（Java 的 `List<String>` 绑定空串会得到含空串的列表，
 * 但本项目里这些参数都是必填 ID/枚举，空值等同非法，交由调用方校验）。
 */
export function toStringList(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  const raw = Array.isArray(value) ? value : [value]
  return raw
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/**
 * 查询参数 → 数字数组。
 *
 * ⚠️ **已知分歧**：非数字项在 Java 侧是 `MethodArgumentTypeMismatchException` → HTTP 400，
 *    这里会静默丢掉该项。与 `toInt` 的退化属于同一类问题，
 *    目前没有契约场景覆盖，记入规格 §9 开放项。
 */
export function toIntList(value: string | string[] | undefined): number[] {
  return toStringList(value)
    .map((item) => Number(item))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n))
}
