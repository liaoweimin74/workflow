import type { Rule } from '@form-create/element-ui'

/**
 * 物料 manifest.meta → 属性面板控件映射（change: remote-materials 二期 5.3）。
 *
 * meta 协议（数组，顺序即面板顺序；`field` 即写入节点 rule.props 的字段名）：
 * ```json
 * [
 *   { "field": "title",           "label": "标题",   "type": "text",    "default": "库存趋势" },
 *   { "field": "refreshInterval", "label": "刷新秒数", "type": "number", "default": 30 },
 *   { "field": "autoRefresh",     "label": "自动刷新", "type": "switch",  "default": false },
 *   { "field": "theme",           "label": "主题",   "type": "select",  "options": [{ "label": "浅色", "value": "light" }] },
 *   { "field": "remark",          "label": "备注",   "type": "textarea" }
 * ]
 * ```
 * 用数组而不是对象：manifest_json 落 MySQL 的 JSON 列后对象键会按（长度,字节序）重排，声明顺序留不住。
 * 控件类型覆盖 text / number / switch / select（静态选项）/ textarea，
 * 未识别类型降级为文本输入；对象形态（协议定稿前的旧物料）也兼容解析，但顺序不保证。
 */

export type MaterialMetaControl = 'text' | 'number' | 'switch' | 'select' | 'textarea'

export interface MaterialMetaOption {
  label: string
  value: string | number | boolean
}

export interface MaterialMetaField {
  /** 写入 rule.props 的字段名（= meta 的键） */
  field: string
  label: string
  /** 声明的控件类型；未识别类型由 metaToRules 降级为 text */
  type: string
  default?: unknown
  /** 是否声明了默认值（区分「默认值为 undefined」与「没有默认值」） */
  hasDefault: boolean
  options?: MaterialMetaOption[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseOptions(raw: unknown): MaterialMetaOption[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const options = raw
    .filter((o) => isRecord(o) && o.value !== undefined && o.value !== null)
    .map((o) => {
      const value = o.value as string | number | boolean
      const label = typeof o.label === 'string' && o.label ? o.label : String(value)
      return { label, value }
    })
  return options.length ? options : undefined
}

/** 单条声明 → 配置项；缺字段名或缺控件类型返回 null（逐项忽略而非整体报错）。 */
function toField(field: string, decl: Record<string, unknown>): MaterialMetaField | null {
  if (!field) return null
  const type = typeof decl.type === 'string' ? decl.type.trim() : ''
  if (!type) return null
  return {
    field,
    label: typeof decl.label === 'string' && decl.label ? decl.label : field,
    type,
    default: decl.default,
    hasDefault: 'default' in decl,
    options: parseOptions(decl.options),
  }
}

/**
 * meta → 有序配置项列表，两种形态都支持：
 * - 对象（协议定稿前上传的旧物料，键即字段名；顺序由后端/数据库决定，不保证）
 * - 数组 `[{ field, label, type, ... }]`（`GET /materials/widgets` 下发形态——
 *   响应体由 Jackson 3 序列化，会把 Map 的键按字母序重排，声明顺序只能靠数组保住）
 */
export function parseMaterialMeta(meta: unknown): MaterialMetaField[] {
  const fields: MaterialMetaField[] = []
  if (Array.isArray(meta)) {
    for (const entry of meta) {
      if (!isRecord(entry)) continue
      const field = typeof entry.field === 'string' ? entry.field.trim() : ''
      const parsed = toField(field, entry)
      if (parsed) fields.push(parsed)
    }
    return fields
  }
  if (!isRecord(meta)) return []
  for (const [field, decl] of Object.entries(meta)) {
    if (!isRecord(decl)) continue
    const parsed = toField(field, decl)
    if (parsed) fields.push(parsed)
  }
  return fields
}

/**
 * meta → form-create 属性面板规则。
 * field 名即 rule.props 的键：设计器 props 表单的 change 直接写 activeRule.props[field]
 * （@form-create/designer propChange → handleChange('props', field, value)）。
 */
export function metaToRules(meta: unknown): Rule[] {
  return parseMaterialMeta(meta).map((f) => {
    const rule: Record<string, any> = { field: f.field, title: f.label }
    switch (f.type) {
      case 'number':
        rule.type = 'inputNumber'
        break
      case 'switch':
        rule.type = 'switch'
        break
      case 'select':
        rule.type = 'select'
        rule.options = f.options ?? []
        rule.props = { clearable: true }
        break
      case 'textarea':
        rule.type = 'input'
        rule.props = { type: 'textarea', rows: 3 }
        break
      default:
        // text 与平台未实现的控件类型（如 color-palette）一律降级文本输入
        rule.type = 'input'
        rule.props = { clearable: true }
    }
    if (f.hasDefault) rule.value = f.default
    return rule as Rule
  })
}

/** meta 声明的默认值 → 新拖入节点的 props 初值（未声明默认值的项不写入）。 */
export function metaDefaults(meta: unknown): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const f of parseMaterialMeta(meta)) {
    if (f.hasDefault) props[f.field] = f.default
  }
  return props
}
