import type { ColumnConfig } from '../../../common/domain/column-config'
import { newColumnConfig } from '../../../common/domain/column-config'

/** 列名模式（对齐 Java `COL_PATTERN`）。 */
const COL_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/

/**
 * 不提取列的组件类型（对齐 Java `UNSUPPORTED_COMPONENTS`）。
 *
 * ⚠️ 比 `form-definition-write.service.ts` 里那份「业务表单 DDL 不支持组件」的集合**更大**：
 *    这份多了 `dataTable` / `group` / `tableForm` / `subForm` / `formContainer`。
 *    两处语义不同，别合并 —— 那个集合决定「能不能建表并报错」，这个决定「要不要当列抽出来」。
 */
const UNSUPPORTED_COMPONENTS = new Set([
  'userPicker',
  'deptPicker',
  'divider',
  'groupContainer',
  'dataTable',
  'group',
  'tableForm',
  'subForm',
  'formContainer',
])

/** 整体跳过的组件（绑定外部数据源，子字段也不递归）——对齐 Java 里的三个 continue。 */
const SKIPPED_COMPONENTS = new Set(['formContainer', 'page-table', 'page-list-cards'])

/**
 * 表单列定义解析器（对齐 Java `FormSchemaColumnExtractor`，154 行）。
 *
 * 两个入口：
 * - `extract(columnConfigJson)`：解析设计器持久化的列映射（`FormDefinition.columnConfig`）；
 * - `extractFromSchema(schemaJson)`：解析 form-create 的 schema `{rule:[...]}` 或裸数组 ——
 *   **WORKFLOW 表单走这条**（它的 columnConfig 为空，列定义只存在于 schema 里）。
 *
 * 递归覆盖三种嵌套：布局容器 `children`、子表单 `props.rule`、子表 `props.columns[].rule`。
 *
 * ⚠️ 三处容易写错的地方（都照抄 Java）：
 *   1. `label` 取 `title` → `label` → `field` 三级回落（form-create 的中文标签在 `title`）；
 *   2. `type` 为空**也算有效列**（只是不写 `componentType`）；`type` 在跳过集合里则整列不抽；
 *   3. `extract` 解析失败 → **空列表**（不抛错），与 `parseBusinessColumnConfig` 的严格校验相反。
 */
export function extract(columnConfigJson: string | null): ColumnConfig[] {
  if (columnConfigJson === null || columnConfigJson.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(columnConfigJson)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((entry): entry is Record<string, unknown> => isObject(entry))
    .map((entry) => ({ ...newColumnConfig(), ...(entry as Partial<ColumnConfig>) }))
}

/** 从 form-create schema 解析列定义（`{rule:[...]}` 或裸数组）。 */
export function extractFromSchema(schemaJson: string | null): ColumnConfig[] {
  if (schemaJson === null || schemaJson.trim() === '') return []
  let root: unknown
  try {
    root = JSON.parse(schemaJson)
  } catch {
    return []
  }
  const rules = Array.isArray(root) ? root : pathOf(root, 'rule')
  if (!Array.isArray(rules) || rules.length === 0) return []
  const out: ColumnConfig[] = []
  collectColumnsFromRules(rules, out)
  return out
}

/** 递归遍历 rule 数组提取列（对齐 Java `collectColumnsFromRules`）。 */
function collectColumnsFromRules(rules: unknown[], out: ColumnConfig[]): void {
  for (const rule of rules) {
    if (!isObject(rule)) continue
    const field = textOrNull(rule, 'field')
    const type = textOrNull(rule, 'type')

    // 绑定外部数据源的组件：整棵子树跳过（不抽列、不递归）
    if (type !== null && SKIPPED_COMPONENTS.has(type)) continue

    if (field !== null && field.trim() !== '' && COL_PATTERN.test(field)) {
      if (type === null || !UNSUPPORTED_COMPONENTS.has(type)) {
        const title = textOrNull(rule, 'title')
        const labelNode = textOrNull(rule, 'label')
        const label =
          title !== null && title.trim() !== ''
            ? title
            : labelNode !== null && labelNode.trim() !== ''
              ? labelNode
              : field
        const column: ColumnConfig = {
          ...newColumnConfig(),
          key: field,
          label,
          columnType: inferColumnType(type),
        }
        if (type !== null && type.trim() !== '') column.componentType = type
        out.push(column)
      }
    }

    // 三种嵌套结构
    const children = pathOf(rule, 'children')
    if (Array.isArray(children)) collectColumnsFromRules(children, out)

    const propsRule = pathOf(pathOf(rule, 'props'), 'rule')
    if (Array.isArray(propsRule)) collectColumnsFromRules(propsRule, out)

    const propsColumns = pathOf(pathOf(rule, 'props'), 'columns')
    if (Array.isArray(propsColumns)) {
      for (const column of propsColumns) {
        const columnRule = pathOf(column, 'rule')
        if (Array.isArray(columnRule)) collectColumnsFromRules(columnRule, out)
      }
    }
  }
}

/** form-create 组件类型 → 列类型（对齐 Java `inferColumnType`）。 */
export function inferColumnType(componentType: string | null): string {
  if (componentType === null || componentType.trim() === '') return 'VARCHAR'
  switch (componentType) {
    case 'inputNumber':
    case 'rate':
      return 'INT'
    // 多行文本：设计器「多行输入框」产物为 input + props.type=textarea；
    // form-create 亦注册 input 别名 textarea；AI formgen 曾输出 inputTextarea。
    case 'inputTextarea':
    case 'textarea':
    case 'fcEditor':
    case 'editor':
      return 'TEXT'
    // 日期族：设计器标准类型 datePicker/timePicker（AI formgen 曾输出 date/datetime/time/dateRange）。
    case 'datePicker':
    case 'timePicker':
    case 'date':
    case 'datetime':
    case 'time':
    case 'dateRange':
    case 'dateTimeRange':
      return 'DATETIME'
    case 'switch':
    case 'checkbox':
      return 'TINYINT'
    default:
      return 'VARCHAR'
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 对齐 Jackson 的 `path(x).asText(null)`：缺失/非字符串 → null。 */
function textOrNull(node: Record<string, unknown>, field: string): string | null {
  const value = node[field]
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return null
  return String(value)
}

function pathOf(node: unknown, field: string): unknown {
  if (!isObject(node)) return undefined
  return node[field]
}
