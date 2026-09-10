/**
 * 内置单元格格式化器：PageRenderer 按列 formatter 配置格式化取值。
 *
 * 支持的 formatter：
 * - currency：人民币金额（¥1,234.56，zh-CN locale）
 * - date：YYYY-MM-DD
 * - datetime：YYYY-MM-DD HH:mm:ss
 * - boolean：是/否
 * - enum：原样返回（枚举映射由列配置另行处理）
 *
 * null/undefined/NaN 等无效值统一返回空字符串。
 */

export interface FormatterOption {
  label: string
  value: string
}

/** UI 下拉选项（列配置面板） */
export const FORMATTER_OPTIONS: FormatterOption[] = [
  { label: '货币', value: 'currency' },
  { label: '日期', value: 'date' },
  { label: '日期时间', value: 'datetime' },
  { label: '布尔', value: 'boolean' },
  { label: '枚举', value: 'enum' },
]

/** 空值判断：null/undefined/空字符串/NaN 均视为无效 */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (typeof value === 'number' && Number.isNaN(value)) return true
  return false
}

/** 两/三位数补零 */
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 解析为 Date：接受 Date 对象、ISO 字符串、常见日期字符串；无效返回 null */
function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // 时间戳（毫秒或秒）
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function formatDateTime(date: Date, withTime: boolean): string {
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (!withTime) return datePart
  return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * 按 formatter 格式化单元格取值。
 * @param value 原始值
 * @param formatter formatter 名称（见 FORMATTER_OPTIONS），空或未识别时返回原始值的字符串表示
 */
export function formatCellValue(value: unknown, formatter: string): string {
  if (isEmptyValue(value)) return ''

  switch (formatter) {
    case 'currency': {
      const num = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(num)) return String(value)
      return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    case 'date': {
      const d = parseDate(value)
      return d ? formatDateTime(d, false) : String(value)
    }
    case 'datetime': {
      const d = parseDate(value)
      return d ? formatDateTime(d, true) : String(value)
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value ? '是' : '否'
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase()
        if (v === 'true' || v === '1') return '是'
        if (v === 'false' || v === '0') return '否'
      }
      if (typeof value === 'number') return value === 1 ? '是' : '否'
      return String(value)
    }
    case 'enum':
      // 枚举映射由列配置另行处理，此处原样返回
      return String(value)
    default:
      // 未指定/未识别 formatter：原始值字符串表示
      return String(value)
  }
}
