/**
 * params.ts — system 模块（users/roles/menus/orgs/dicts）参数绑定对齐层
 *
 * Spring MVC 类型转换失败语义逐字对齐（以下消息全部为 8080 实测捕获，Task 13-4）：
 *  - @PathVariable Long 转换失败 → HTTP 500 + "Method parameter 'id': Failed to convert ..."
 *    （MethodArgumentTypeMismatchException 落入 generic handler）
 *  - query 标量转换失败         → HTTP 200 + code 400 + "Failed to convert value of type ..."
 *    （Boot 4 中 @ModelAttribute 绑定错误以 MethodArgumentNotValidException 呈现 → handleValidationException）
 *  - @RequestBody 缺失          → HTTP 500 + "Required request body is missing: <Java 方法签名>"
 *  - ?size<1                    → HTTP 400 + "Page size must not be less than one"
 *    （PageRequest.of 的 IllegalArgumentException → handleIllegalArgument）
 *
 * 另：H2 的 LIKE 默认大小写敏感（8080 实测 ?username=Admin 查无 admin），SQLite 默认不敏感
 * → 连接级 PRAGMA case_sensitive_like=ON 对齐（幂等；对不用 LIKE 的模块无影响）。
 */
import type { Request } from 'express';
import { getDb } from './db';
import { IllegalArgumentError } from './errors';
import { ValidationError } from './http';
import { fmtIso } from './serialize';

getDb().exec('PRAGMA case_sensitive_like = ON;');

const INT_RE = /^[+-]?\d+$/;
const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
const LONG_MIN = -(2n ** 63n);
const LONG_MAX = 2n ** 63n - 1n;

/** "yyyy-MM-dd HH:mm:ss"（@PrePersist/@PreUpdate 的 LocalDateTime.now()；库内文本统一秒精度） */
export function nowText(): string {
  return fmtIso(new Date()).replace('T', ' ');
}

function convFail(type: string, raw: string): never {
  throw new ValidationError(
    `Failed to convert value of type 'java.lang.String' to required type '${type}'; For input string: "${raw}"`,
  );
}

function inLongRange(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return n >= Number(LONG_MIN) && n <= Number(LONG_MAX);
}

/** Integer query 绑定：缺失/空串 → null；非整数或越界 → HTTP 200 + code 400 */
export function intQuery(q: Record<string, unknown>, key: string): number | null {
  return scalarQuery(q, key, 'java.lang.Integer', INT_MIN, INT_MAX);
}

/** Long query 绑定：同上，消息类型为 java.lang.Long */
export function longQuery(q: Record<string, unknown>, key: string): number | null {
  return scalarQuery(q, key, 'java.lang.Long', Number(LONG_MIN), Number(LONG_MAX));
}

function scalarQuery(q: Record<string, unknown>, key: string, type: string, min: number, max: number): number | null {
  const v = q[key];
  if (v == null) return null;
  const s = Array.isArray(v) ? String(v[0]) : String(v);
  if (s === '') return null; // ?page= → Spring 空串转 null
  if (!INT_RE.test(s)) convFail(type, s);
  const n = Number(s);
  if (n < min || n > max) convFail(type, s);
  return n;
}

/**
 * List<Long> query 绑定（?ids=1,2 / ?orgIds=1&orgIds=2 双形态；缺失 → null；空串 → []，8080 实测）。
 * 元素非法 → HTTP 200 + code 400（消息类型 java.util.List，实测捕获）。
 */
export function longListQuery(q: Record<string, unknown>, key: string): number[] | null {
  const v = q[key];
  if (v == null) return null;
  const pieces = (Array.isArray(v) ? v : [v]).map((x) => String(x));
  const out: number[] = [];
  for (const piece of pieces) {
    if (piece === '') continue; // ?ids= → 空列表
    for (const tok of piece.split(',')) {
      if (tok === '') continue;
      if (!INT_RE.test(tok) || !inLongRange(Number(tok))) {
        throw new ValidationError(
          `Failed to convert value of type 'java.lang.String' to required type 'java.util.List'; For input string: "${tok}"`,
        );
      }
      out.push(Number(tok));
    }
  }
  return out;
}

/** @PathVariable Long：失败 → HTTP 500（generic handler），消息含参数名与原始串 */
export function pathId(raw: string | string[] | undefined, param = 'id'): number {
  const rawS = typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] ?? '') : '';
  raw = rawS;
  let ok = false;
  let n = 0;
  try {
    if (INT_RE.test(raw)) {
      const bn = BigInt(raw);
      if (bn >= LONG_MIN && bn <= LONG_MAX) {
        n = Number(bn);
        ok = true;
      }
    }
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      `Method parameter '${param}': Failed to convert value of type 'java.lang.String' to required type 'java.lang.Long'; For input string: "${raw}"`,
    );
  }
  return n;
}

/** 分页：1-based、page Math.max(1)、默认 size=10；size<1 → HTTP 400（PageRequest.of 语义） */
export function paging(q: Record<string, unknown>): { page: number; size: number; offset: number } {
  const page = intQuery(q, 'page');
  const size = intQuery(q, 'size');
  const p = page != null ? Math.max(page, 1) : 1;
  if (size != null && size < 1) throw new IllegalArgumentError('Page size must not be less than one');
  const s = size ?? 10;
  return { page: p, size: s, offset: (p - 1) * s };
}

// ---------------------------------------------------------------------------
// @RequestBody 反序列化（Jackson 宽松绑定语义：数字字符串可强转标量；不兼容 → generic 500）
// ---------------------------------------------------------------------------

/** @RequestBody JSON 对象；缺失（Content-Length 0/无）→ HTTP 500 "Required request body is missing: <签名>" */
export function jsonBody(req: Request, javaSignature: string): Record<string, unknown> {
  const b: unknown = req.body;
  const cl = req.headers['content-length'];
  const isEmptyObject =
    typeof b === 'object' && b !== null && !Array.isArray(b) && Object.keys(b).length === 0;
  if (b == null || (isEmptyObject && (cl === undefined || cl === '' || cl === '0'))) {
    throw new Error(`Required request body is missing: ${javaSignature}`);
  }
  if (typeof b !== 'object' || b === null || Array.isArray(b)) {
    throw new Error('JSON parse error: Cannot deserialize instance of object out of VALUE token');
  }
  return b as Record<string, unknown>;
}

/** String 字段：标量（数字/布尔）按 Jackson 强转；对象/数组 → 500 */
export function bodyStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new Error('Cannot deserialize value of type `java.lang.String` from Object value');
}

/** Integer 字段：数字/数字字符串皆可（Jackson 强转）；小数/越界/其他类型 → 500 */
export function bodyInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error(`Cannot coerce Floating-point value (${v}) to \`java.lang.Integer\``);
    if (v < INT_MIN || v > INT_MAX) throw new Error(`Numeric value (${v}) out of range of java.lang.Integer`);
    return v;
  }
  if (typeof v === 'string') {
    if (!INT_RE.test(v)) throw new Error(`Cannot deserialize value of type \`java.lang.Integer\` from String "${v}"`);
    return Number(v);
  }
  throw new Error(`Cannot deserialize value of type \`java.lang.Integer\` from ${typeof v} value`);
}

/** Long 字段：语义同 bodyInt */
export function bodyLong(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error(`Cannot coerce Floating-point value (${v}) to \`java.lang.Long\``);
    if (!inLongRange(v)) throw new Error(`Numeric value (${v}) out of range of java.lang.Long`);
    return v;
  }
  if (typeof v === 'string') {
    if (!INT_RE.test(v) || !inLongRange(Number(v))) {
      throw new Error(`Cannot deserialize value of type \`java.lang.Long\` from String "${v}"`);
    }
    return Number(v);
  }
  throw new Error(`Cannot deserialize value of type \`java.lang.Long\` from ${typeof v} value`);
}

/** Long[] 字段（roleIds/menuIds）：缺失/显式 null → null；元素允许 null（后续落库时由 NOT NULL 约束兜底，与 Java 一致） */
export function bodyLongArray(v: unknown): Array<number | null> | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) throw new Error('Cannot deserialize value of type `[Ljava.lang.Long;` from non-array value');
  return v.map((e) => (e === null || e === undefined ? null : bodyLong(e)));
}

/** StringUtils.hasText：非 null 且去除首尾空白后非空 */
export function hasText(v: string | null): boolean {
  return v != null && v.trim().length > 0;
}
