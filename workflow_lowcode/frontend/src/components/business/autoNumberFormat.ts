/**
 * 自动编号 AutoNumber —— 纯函数辅助（Task 3-c）。
 *
 * 【编号生成契约（前端 props 契约，供后端生成器消费）】
 * - 编号 = prefix + 日期串（formatAutoNumberDate(now, dateFormat)） + 流水号
 * - 流水号：十进制自增，左侧补零至 seqDigits 位（超出位数不截断，如 10000 保持 5 位）
 * - resetPolicy 决定流水号归零的 period 粒度：
 *     day   → 按「天」归零（跨天从 1 重新开始；推荐配合 dateFormat=yyyyMMdd）
 *     month → 按「月」归零（推荐 yyyyMM / yyyyMMdd）
 *     year  → 按「年」归零（推荐 yyyy / yyyyMM）
 *     never → 永不归零（全局递增；推荐 dateFormat=yyyy 或纯前缀场景）
 * - 值永远由后端在提交时生成并回写字段；前端（组件/渲染器/提交链路）绝不在提交时自行生成编号。
 * - buildPreviewText 仅为「格式示意」（流水号位以 x 占位），供设计器 props 面板/画布展示，不是可提交值。
 */

/** 支持的日期段格式白名单（与 vendor rule 下拉一致） */
export const SUPPORTED_DATE_FORMATS = ['yyyy', 'yyyyMM', 'yyyyMMdd', 'yyyyMMddHH'] as const
export type AutoNumberDateFormat = (typeof SUPPORTED_DATE_FORMATS)[number]

/** 流水号归零粒度 */
export const RESET_POLICIES = ['day', 'month', 'year', 'never'] as const
export type AutoNumberResetPolicy = (typeof RESET_POLICIES)[number]

/** resetPolicy → 粒度提示文案（运行页/设计器画布共用） */
export const RESET_POLICY_LABELS: Record<AutoNumberResetPolicy, string> = {
  day: '按天重置',
  month: '按月重置',
  year: '按年重置',
  never: '永不重置',
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 日期 → 编号日期段。
 * 仅支持 SUPPORTED_DATE_FORMATS 白名单内的 token（yyyy/MM/dd/HH），未知格式回退 yyyyMMdd，
 * 避免设计器历史草稿里的脏值把编号格式打乱。
 */
export function formatAutoNumberDate(d: Date, fmt: string): string {
  const format = (SUPPORTED_DATE_FORMATS as readonly string[]).includes(fmt) ? fmt : 'yyyyMMdd'
  return format
    .replace('yyyy', String(d.getFullYear()))
    .replace('MM', pad2(d.getMonth() + 1))
    .replace('dd', pad2(d.getDate()))
    .replace('HH', pad2(d.getHours()))
}

export interface AutoNumberPreviewOptions {
  /** 编号前缀（如 'BN'） */
  prefix?: string
  /** 日期段格式（白名单见 SUPPORTED_DATE_FORMATS） */
  dateFormat?: string
  /** 流水号位数（补零目标长度；负数/非数按 0 处理） */
  seqDigits?: number
}

/** 编号格式预览：prefix + 日期段 + 'x'.repeat(seqDigits)（流水号位以 x 占位，非真实值） */
export function buildPreviewText(opts: AutoNumberPreviewOptions = {}, now: Date = new Date()): string {
  // prefix 缺省 'BN'（与组件 props/rule 默认一致）；显式空串 = 用户清空前缀，保持无前缀
  const prefix = opts.prefix ?? 'BN'
  const datePart = formatAutoNumberDate(now, opts.dateFormat || 'yyyyMMdd')
  const digits = Math.max(0, Math.trunc(Number(opts.seqDigits ?? 4)) || 0)
  return prefix + datePart + 'x'.repeat(digits)
}
