/**
 * system 模块内部共享工具（Task 13-4）—— 仅供本目录各模块使用，不挂载路由
 * 语义对齐 Java：
 *  - jakarta 校验默认英文消息（GlobalExceptionHandler.handleValidationException → R.fail(400, fieldError.getDefaultMessage())，
 *    未配置 i18n → Hibernate Validator 默认消息："must not be blank" / "size must be between X and Y"）
 *  - 校验失败 → HTTP 200 + R.code 400（MethodArgumentNotValidException 分支无 @ResponseStatus）
 *  - 业务失败 → BusinessException 默认 code 500（HTTP 200 + R.code 500）
 *  - 参数类型不匹配（如 ?page=abc）→ Java MethodArgumentTypeMismatchException → HTTP 500（抛普通 Error 走 errorMiddleware）
 *  - PageRequest.of 非法 size → IllegalArgumentException → HTTP 400（抛 RangeError 走 errorMiddleware 的 400 分支）
 */
import { BusinessException } from "../../lib/errors";

/** org.springframework.util.StringUtils.hasText 语义 */
export function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** LocalDateTime.now() → "yyyy-MM-dd HH:mm:ss"（Jackson 序列化格式；JPA @PrePersist/@PreUpdate 语义） */
export function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Jackson 标量宽化：JSON number/boolean → String（对齐 Jackson String 字段接收标量的默认 coercion） */
function asStr(v: unknown): unknown {
  return typeof v === "number" || typeof v === "boolean" ? String(v) : v;
}

/** @NotBlank → "must not be blank"（HTTP 200 + R.code 400） */
export function vNotBlank(value: unknown): void {
  if (!hasText(asStr(value))) throw new BusinessException("must not be blank", 400);
}

/** @Size → "size must be between min and max"（min 缺省 0）；null 跳过（jakarta：null 对 @Size 有效） */
export function vSize(value: unknown, max: number, min = 0): void {
  const s = asStr(value);
  if (s == null) return;
  if (typeof s !== "string" || s.length < min || s.length > max) {
    throw new BusinessException(
      min === 0 ? `size must be between 0 and ${max}` : `size must be between ${min} and ${max}`,
      400,
    );
  }
}

/**
 * @NotBlank Integer（MenuCreateRequest.menuType）—— jakarta NotBlankValidator 仅支持 CharSequence，
 * Java 实际运行时该字段触发 HV000030 UnexpectedTypeException → 500；移植按 @NotNull 语义实现
 *（消息取 jakarta @NotNull 默认 "must not be null"），不复刻该运行时缺陷。
 */
export function vNotNull(value: unknown): void {
  if (value == null) throw new BusinessException("must not be null", 400);
}

/** @PathVariable Long：非整数字符串 → 类型不匹配（Java: MethodArgumentTypeMismatchException → HTTP 500） */
export function parseId(v: string): string {
  if (!/^-?\d+$/.test(String(v))) throw new Error("Type mismatch for path variable: " + String(v));
  return String(v);
}

/** 查询参数 Integer/Long 绑定：空串→null，非整数→类型不匹配（HTTP 500） */
export function parseLongOpt(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  if (!/^-?\d+$/.test(s)) throw new Error("Type mismatch for query parameter: " + s);
  return Number(s);
}

/** Spring List<Long> 查询绑定：支持重复参数（?ids=1&ids=2）与逗号分隔（?ids=1,2） */
export function parseLongList(v: unknown): number[] {
  if (v == null) return [];
  const parts = Array.isArray(v) ? v : String(v).split(",");
  const out: number[] = [];
  for (const p of parts) {
    const s = String(p).trim();
    if (s === "") continue;
    if (!/^-?\d+$/.test(s)) throw new Error("Type mismatch for query parameter: " + s);
    out.push(Number(s));
  }
  return out;
}

/** JSON body Integer/Long 字段（Jackson 宽化：数字字符串可接受，空串→null，其他→类型错误 HTTP 500） */
export function bodyInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) throw new Error("JSON scalar type mismatch: " + String(v));
  return n;
}

export const bodyLong = bodyInt;

/** JSON body Long[] / List<Long> 字段：null→null（区分"未传"），否则逐元素强转 */
export function bodyLongList(v: unknown): number[] | null {
  if (v == null) return null;
  if (!Array.isArray(v)) throw new Error("JSON collection type mismatch: " + String(v));
  return v.map((e) => bodyLong(e) as number);
}

/**
 * PageRequest.of(page-1, size, Sort) 语义（UserQueryRequest/RoleQueryRequest/DictTypeQueryRequest）：
 * page 缺省 1 且 max(page,1)；size 缺省 10 且无上限；size < 1 → IllegalArgumentException → HTTP 400
 */
export function pageOf(q: Record<string, unknown>): { page: number; size: number; offset: number } {
  let page = 1;
  if (q.page != null && String(q.page).trim() !== "") {
    const p = parseLongOpt(q.page);
    if (p != null) page = Math.max(p, 1);
  }
  let size = 10;
  if (q.size != null && String(q.size).trim() !== "") {
    const s = parseLongOpt(q.size);
    if (s != null) {
      if (s < 1) throw new RangeError("Page size must not be less than one");
      size = s;
    }
  }
  return { page, size, offset: (page - 1) * size };
}
