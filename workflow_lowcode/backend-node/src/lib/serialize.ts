/**
 * serialize.ts — Jackson 输出对齐（以 **MVC 实测行为** 为准，2026-09-16 对 8080 实测）：
 *
 *  1. Long → **数字**（JacksonConfig 的 ToStringSerializer 并未被 Spring MVC
 *     converter 采用 —— 实测 /api/users 与 /api/auth/userinfo 均输出数字 id）
 *  2. LocalDateTime → **ISO-8601**（实测 "2026-09-10T05:24:33.585796"：T 分隔，
 *     时间部分变长精度；SQLite 秒精度存储 → 输出无小数部分，格式一致）
 *  3. null 字段照常输出（Java 默认包含 null）
 *
 * COLUMN_KINDS 由 schema.generated.ts 提供：表名 → 列名 → 语义类型。
 */
import { COLUMN_KINDS } from '../db/schema.generated';

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/;

/** Date → "yyyy-MM-ddTHH:mm:ss"（ISO，秒精度；Java LocalDateTime.toString() 同族格式） */
export function fmtIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 尽力把任意值转成 Java LocalDateTime 风格 ISO 文本（空格分隔 → T 分隔） */
export function toIsoText(v: unknown): unknown {
  if (typeof v === 'string') {
    if (DATETIME_RE.test(v)) return v.replace(' ', 'T').slice(0, 19);
    return v;
  }
  if (v instanceof Date) return fmtIso(v);
  return v;
}

/**
 * javaHashMapOrdered — 复刻 Java HashMap 的 JSON 迭代序（13-6a）。
 *
 * Java 侧 ProcessDefinitionController#toMap / resolveFormDefIds、
 * ProcessDesignService#loadEditor 的 nodeConfigMap 等都是 HashMap，
 * Jackson 按桶序（hash & (cap-1)）输出 key；Node 端对齐规则：
 *  - String.hashCode：h = 31*h + char（int32 溢出回绕）
 *  - spread：h ^= h >>> 16；桶 = h & (cap-1)；同桶按插入序
 *  - 容量：cap=16 起，size 超过 0.75*cap 时翻倍（HashMap 扩容语义，
 *    扩容后同桶内相对顺序不变）
 * 8080 实测验证：11 键 toMap（cap16）、15 键 get（cap32）、
 * {__PROCESS__,managerApproval} nodeConfigs 均逐字节一致。
 */
export function javaHashMapOrdered(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj);
  let cap = 16;
  while (keys.length > cap * 0.75) cap *= 2;
  const bucket = (k: string): number => {
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (Math.imul(31, h) + k.charCodeAt(i)) | 0;
    h = (h ^ (h >>> 16)) | 0;
    return h & (cap - 1);
  };
  const out: Record<string, unknown> = {};
  for (const k of keys.map((k, i) => ({ k, i, b: bucket(k) })).sort((a, b) => a.b - b.b || a.i - b.i).map((x) => x.k)) {
    out[k] = obj[k];
  }
  return out;
}

/**
 * 把 SQLite 行按 COLUMN_KINDS 转成「Jackson 实测风格」对象。
 *  - long → Number（实测数字）
 *  - bool → boolean
 *  - datetime → ISO 文本（T 分隔）
 *  - 其它原样
 */
export function jacksonify(
  table: string,
  row: Record<string, unknown>,
  opts: { fieldMap?: Record<string, string> } = {},
): Record<string, unknown> {
  const kinds = COLUMN_KINDS[table] ?? {};
  const out: Record<string, unknown> = {};
  for (const [col, val] of Object.entries(row)) {
    const field = opts.fieldMap?.[col] ?? col;
    const kind = kinds[col];
    if (val === null || val === undefined) {
      out[field] = null;
      continue;
    }
    switch (kind) {
      case 'long':
      case 'int':
        out[field] = Number(val);
        break;
      case 'bool':
        out[field] = val === 1 || val === '1' || val === true;
        break;
      case 'datetime':
        out[field] = toIsoText(val);
        break;
      default:
        out[field] = val;
    }
  }
  return out;
}
