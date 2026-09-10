import type { Rule } from '@form-create/element-ui'
import type { ColumnConfigItem } from '@/api/bizData'

export interface FieldValidationResult {
  /** 容器内所有叶子字段名 */
  validFields: string[]
  /** 不在 metadata columns 中的字段名 */
  invalidFields: string[]
}

/**
 * 递归收集 rule 树中所有叶子字段名（不含 group/subForm 容器自身 field）
 * 与 DsBindingEngine.collectFieldNames 的区别：此处只收集最终映射到数据列的叶子字段
 */
function collectLeafFields(rules: Rule[], out: string[] = []): string[] {
  for (const r of rules) {
    const props = ((r as Record<string, unknown>).props || {}) as Record<string, unknown>
    const field = (r as Record<string, unknown>).field as string | undefined
    const type = (r as Record<string, unknown>).type as string | undefined
    // group/subForm 容器自身 field 是整体赋值，不作为叶子字段校验
    if (field && type !== 'group' && type !== 'subForm') {
      out.push(field)
    }
    if (Array.isArray(props.rule)) collectLeafFields(props.rule as Rule[], out)
    if (Array.isArray(r.children)) collectLeafFields(r.children as Rule[], out)
  }
  return out
}

/**
 * 校验容器子字段是否都存在于数据源 metadata columns 中
 *
 * @param children - formContainer 的子 rule 数组
 * @param columns - 数据源 metadata.columns
 * @returns 校验结果：validFields（命中的字段）、invalidFields（未命中的字段）
 */
export function containerFieldValidator(
  children: Rule[],
  columns: ColumnConfigItem[],
): FieldValidationResult {
  const fieldNames = collectLeafFields(children)
  const validKeys = new Set(columns.map((c) => c.key))
  const validFields: string[] = []
  const invalidFields: string[] = []

  for (const name of fieldNames) {
    if (validKeys.has(name)) {
      validFields.push(name)
    } else {
      invalidFields.push(name)
    }
  }

  return { validFields, invalidFields }
}
