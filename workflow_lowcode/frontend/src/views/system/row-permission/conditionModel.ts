import type { DataScopeCondition } from '@/api/dataScope'

/**
 * 条件行的前端模型：把「表单里的一行」与后端条件协议互相转换。
 *
 * 纯函数集中在这里，编辑器只负责交互；校验口径对齐后端 DataScopeService.validateConditions——
 * 尤其是这几条不显然的约束：
 *   - 取值只认一种动态形态：{@code {变量名}}，可以与字面量拼接（LIKE 配 {orgId}/%）；
 *   - 集合变量 {orgIdSubtree} 展开成一批 id，必须独占整个取值项且只能配合 in
 *     （拼接没有对应 SQL 形状，塞进 eq/range 会静默变成另一条条件）；
 *   - in 是非空列表（逗号分隔），range 是两个非空端点。
 * 取值函数语法（fn:xxx()）随协议收缩一并撤下，现在只有变量一种写法。
 */

export type ConditionOp = 'eq' | 'ne' | 'like' | 'in' | 'range' | 'isempty' | 'isnotempty'

export interface ConditionEditorRow {
  column: string
  op: ConditionOp
  /** in 为逗号分隔的表达式列表；range 为起点；其余为单个表达式 */
  value: string
  /** range 的终点；其余运算符不用 */
  rangeEnd: string
}

export const OP_OPTIONS: { value: ConditionOp; label: string }[] = [
  { value: 'eq', label: '等于（=）' },
  { value: 'ne', label: '不等于（≠）' },
  { value: 'like', label: '包含（LIKE）' },
  { value: 'in', label: '属于列表（IN）' },
  { value: 'range', label: '区间（BETWEEN）' },
  { value: 'isempty', label: '为空' },
  { value: 'isnotempty', label: '非空' },
]

/** 取值变量（与后端 DataScopeVariables.KNOWN 同一份白名单）：{ } 弹层候选与文案说明的唯一来源。 */
export const VARIABLE_OPTIONS: { name: string; detail: string; list: boolean }[] = [
  { name: 'userId', detail: '当前用户 id', list: false },
  { name: 'username', detail: '当前用户名', list: false },
  { name: 'orgId', detail: '当前部门 id', list: false },
  { name: 'orgIdSubtree', detail: '当前部门及全部下级 id（只能配 IN）', list: true },
]

export const VARIABLE_NAMES: string[] = VARIABLE_OPTIONS.map((item) => item.name)

const LIST_VARIABLES = new Set(VARIABLE_OPTIONS.filter((item) => item.list).map((item) => item.name))

const COLUMN_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
const VARIABLE_TOKEN = '\\{([A-Za-z][A-Za-z0-9_]*)\\}'
const TEMPLATE_PATTERN = new RegExp(VARIABLE_TOKEN, 'g')
const WHOLE_VARIABLE_PATTERN = new RegExp(`^${VARIABLE_TOKEN}$`)

const OP_LABEL: Record<string, string> = {
  eq: '=',
  ne: '≠',
  like: '包含',
  in: '属于',
  range: '区间',
  isempty: '为空',
  isnotempty: '非空',
}

export function emptyConditionRow(): ConditionEditorRow {
  return { column: '', op: 'eq', value: '', rangeEnd: '' }
}

export function splitList(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 单个取值项（字面量或含变量的表达式）的校验；返回错误文案或 null。 */
function expressionError(raw: string, op: ConditionOp): string | null {
  const text = raw.trim()
  const whole = text.match(WHOLE_VARIABLE_PATTERN)
  for (const match of text.matchAll(TEMPLATE_PATTERN)) {
    const name = match[1]
    if (!VARIABLE_NAMES.includes(name)) return `取值使用了未知变量：{${name}}`
    if (!LIST_VARIABLES.has(name)) continue
    if (!whole || whole[1] !== name) return `集合变量 {${name}} 展开为一批 id，只能独占整个取值，不能与其他文字拼接`
    if (op !== 'in') return `集合变量 {${name}} 展开为多个取值，只能配合 IN 使用`
  }
  return null
}

/** 返回第一条错误文案；全部合法返回 null。 */
export function validateConditionRows(rows: ConditionEditorRow[]): string | null {
  if (rows.length === 0) return '权限对象至少需要一条条件；全部可见请直接不关联权限对象'
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const prefix = `第 ${i + 1} 条条件`
    const column = row.column.trim()
    if (!column) return `${prefix}缺少列名`
    if (!COLUMN_PATTERN.test(column)) return `${prefix}列名非法：${column}`
    if (row.op === 'isempty' || row.op === 'isnotempty') continue
    if (row.op === 'in') {
      const values = splitList(row.value)
      if (values.length === 0) return `${prefix}的 IN 取值必须是非空列表`
      for (const item of values) {
        const error = expressionError(item, row.op)
        if (error) return `${prefix}${error}`
      }
      continue
    }
    if (row.op === 'range') {
      if (!row.value.trim() || !row.rangeEnd.trim()) return `${prefix}的区间需要两个非空端点`
      for (const item of [row.value, row.rangeEnd]) {
        const error = expressionError(item, row.op)
        if (error) return `${prefix}${error}`
      }
      continue
    }
    if (!row.value.trim()) return `${prefix}缺少取值`
    const error = expressionError(row.value, row.op)
    if (error) return `${prefix}${error}`
  }
  return null
}

export function toApiCondition(row: ConditionEditorRow): DataScopeCondition {
  const column = row.column.trim()
  if (row.op === 'isempty' || row.op === 'isnotempty') {
    return { column, op: row.op }
  }
  if (row.op === 'in') return { column, op: row.op, value: splitList(row.value) }
  if (row.op === 'range') return { column, op: row.op, value: [row.value.trim(), row.rangeEnd.trim()] }
  return { column, op: row.op, value: row.value.trim() }
}

export function toApiConditions(rows: ConditionEditorRow[]): DataScopeCondition[] {
  return rows.map(toApiCondition)
}

function normalizeOp(op: string | undefined): ConditionOp {
  const lower = (op || 'eq').toLowerCase()
  return (OP_OPTIONS.some((option) => option.value === lower) ? lower : 'eq') as ConditionOp
}

export function fromApiCondition(condition: DataScopeCondition): ConditionEditorRow {
  const base: ConditionEditorRow = {
    column: condition.column ?? '',
    op: normalizeOp(condition.op),
    value: '',
    rangeEnd: '',
  }
  if (base.op === 'isempty' || base.op === 'isnotempty') return base

  const raw = condition.value
  if (base.op === 'range') {
    const list = Array.isArray(raw) ? raw : []
    return { ...base, value: list[0] == null ? '' : String(list[0]), rangeEnd: list[1] == null ? '' : String(list[1]) }
  }
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  return { ...base, value: list.map((item) => String(item)).join(', ') }
}

export function fromApiConditions(conditions: DataScopeCondition[] | null | undefined): ConditionEditorRow[] {
  return (conditions ?? []).map(fromApiCondition)
}

export function conditionText(condition: DataScopeCondition): string {
  const op = normalizeOp(condition.op)
  const label = OP_LABEL[op] ?? op
  if (op === 'isempty' || op === 'isnotempty') return `${condition.column} ${label}`
  const value = condition.value
  if (Array.isArray(value)) {
    const separator = op === 'range' ? ' ~ ' : ', '
    return `${condition.column} ${label} [${value.map((item) => (item == null ? '' : String(item))).join(separator)}]`
  }
  return `${condition.column} ${label} ${value == null ? '' : String(value)}`
}

export function conditionSummary(conditions: DataScopeCondition[] | null | undefined): string {
  if (!conditions || conditions.length === 0) return '未设条件（放行全部）'
  return conditions.map(conditionText).join(' AND ')
}
