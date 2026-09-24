import { Injectable } from '@nestjs/common'
import { AiError } from './ai-error'

/**
 * 表单 schema 输出校验与清洗（对齐 Java `FormSchemaValidator`）。
 *
 * 对模型输出做防御性校验：组件类型白名单、字段命名规范、重复去重、标题回填；
 * 所有修正项汇总到 warnings。
 */

interface RuleItem {
  type?: string
  field?: string
  title?: string
  value?: unknown
  options?: unknown
  validate?: unknown
  [key: string]: unknown
}

export interface FieldInfo {
  field: string
  title: string
  componentType: string
}

export interface AiFormGenerateResult {
  /** 清洗后的 form-create schema JSON（{"rule":[...]}）字符串。 */
  schema: string
  /** 识别出的字段清单。 */
  fields: FieldInfo[]
  /** 校验修正项说明。 */
  warnings: string[]
}

const COL_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/

/**
 * AI 词汇表 = 设计器标准组件（与 form-schema-prompt-builder.ts 一致）。
 *
 * ⚠️ 历史教训：旧词汇表用了不存在的设计器类型（date/inputTextarea/editor 等），
 * 生成物在设计器里渲染为「不支持」占位却能发布建表。现词汇表与前端
 * vendor/config/rule 的真实 type 逐一对齐，另设别名归一兼容旧输出。
 */
const ALLOWED_TYPES = new Set([
  'input', 'inputNumber', 'select', 'checkbox', 'radio',
  'datePicker', 'timePicker', 'switch', 'rate', 'slider', 'cascader',
  'fcEditor',
])

/**
 * 旧词汇表别名 → 设计器标准 type（归一时同步补 props.type）。
 * divider/groupContainer 等布局组件不在映射内 → 归一后不在白名单 → 丢弃。
 */
function normalizeComponentType(
  item: Record<string, unknown>,
): { original: string; type: string; propsType: string | null } {
  const original = String(item.type ?? '').trim()
  let type = original
  let propsType: string | null = null
  switch (original) {
    case 'date':
      type = 'datePicker'
      break
    case 'datetime':
      type = 'datePicker'
      propsType = 'datetime'
      break
    case 'dateRange':
      type = 'datePicker'
      propsType = 'daterange'
      break
    case 'time':
      type = 'timePicker'
      break
    case 'inputTextarea':
      type = 'input'
      propsType = 'textarea'
      break
    case 'editor':
      type = 'fcEditor'
      break
    default:
      break
  }
  if (propsType !== null) {
    if (item.props === null || typeof item.props !== 'object' || Array.isArray(item.props)) {
      item.props = {}
    }
    ;(item.props as Record<string, unknown>).type = propsType
  }
  return { original, type, propsType }
}

@Injectable()
export class FormSchemaValidator {
  /**
   * 校验并清洗模型输出。
   * @throws AiError(EMPTY_RESPONSE) 无法解析为表单结构时
   */
  validate(rawJson: string): AiFormGenerateResult {
    const root = parseRoot(rawJson)
    const rules: unknown[] = Array.isArray(root)
      ? (root as unknown[])
      : (((root as { rule?: unknown })?.['rule'] as unknown[]) ?? [])
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new AiError('EMPTY_RESPONSE', '模型输出缺少 rule 数组')
    }

    const cleaned: RuleItem[] = []
    const fields: FieldInfo[] = []
    const warnings: string[] = []
    const usedFields = new Set<string>()

    rules.forEach((entry, index) => {
      const idx = index + 1
      if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
        warnings.push('已忽略非法条目（非对象）')
        return
      }
      const item = entry as RuleItem

      const { original, type: normalizedType } = normalizeComponentType(item)
      const type = normalizedType
      if (type !== original) {
        warnings.push(`组件类型 "${original}" 不被设计器支持，已修正为 "${type}"`)
      }
      if (!type || !ALLOWED_TYPES.has(type)) {
        warnings.push(`组件类型 "${original || '(空)'}" 不在白名单，已丢弃该条目`)
        return
      }
      item.type = type

      const rawField = String(item.field ?? '').trim()
      let field = normalizeField(rawField)
      if (!field) {
        field = `field_${idx}`
      }
      if (field !== rawField) {
        warnings.push(`字段名 "${rawField}" 已修正为 "${field}"`)
      }
      if (usedFields.has(field)) {
        let n = 2
        let candidate = `${field}_${n}`
        while (usedFields.has(candidate)) {
          n++
          candidate = `${field}_${n}`
        }
        warnings.push(`字段名重复 "${field}"，已重命名为 "${candidate}"`)
        field = candidate
      }
      usedFields.add(field)
      item.field = field

      let title = String(item.title ?? '').trim()
      if (!title) {
        title = field
        warnings.push(`字段 "${field}" 缺少标题，已回填为字段名`)
      }
      item.title = title

      if (!('value' in item)) {
        item.value = null
      }

      fields.push({ field, title, componentType: type })
      cleaned.push(item)
    })

    return { schema: JSON.stringify({ rule: cleaned }), fields, warnings }
  }
}

/** 解析根节点：容忍 markdown 代码围栏与前后包裹文本。 */
function parseRoot(rawJson: string): unknown {
  let text = (rawJson ?? '').trim()
  text = text.replace(/```json/g, '').replace(/```/g, '').trim()
  if (!text) {
    throw new AiError('EMPTY_RESPONSE', '模型输出为空')
  }
  try {
    return JSON.parse(text)
  } catch {
    // 尝试截取首个 { 到末个 } 的片段
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.substring(start, end + 1))
    } catch {
      // 落到下方统一报错
    }
  }
  throw new AiError('EMPTY_RESPONSE', '模型输出无法解析为表单结构')
}

/** 归一化字段名为 snake_case 合法标识符（对齐 Java `normalizeField`）。 */
export function normalizeField(raw: string | null | undefined): string {
  if (raw == null) {
    return ''
  }
  let s = raw.trim()
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  s = s.replace(/[^A-Za-z0-9_]/g, '_')
  s = s.toLowerCase()
  s = s.replace(/_+/g, '_')
  s = s.replace(/^_+|_+$/g, '')
  if (!s) {
    return ''
  }
  if (!/^[a-zA-Z]/.test(s)) {
    s = `f_${s}`
  }
  if (s.length > 64) {
    s = s.substring(0, 64)
  }
  return COL_PATTERN.test(s) ? s : ''
}
