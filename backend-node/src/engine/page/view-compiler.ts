import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../common/exception/business-exception'
import type { ColumnConfig } from '../../common/domain/column-config'
import type { PageDefinitionRow } from './repository/page-definition.repository'

/**
 * 视图编译器（对齐 Java `ViewCompiler`，424 行）。
 *
 * 把 VIEW 页面的**声明式**配置编译成可渲染产物 `{rule, option, …}`。
 *
 * ## ⚠️ 这个类里「键的书写顺序」就是契约
 * `compile` 的产物是 **JSON 字符串**，最终由 `mergeCompiled` 塞进页面 `schema` 字段 ——
 * 而 `schema` 在响应里是**字符串**，比对器逐字比较、**不会**忽略字符串内部的键顺序
 * （"忽略键顺序"只作用于被解析出来的 JSON 对象）。所以：
 *   - 每个对象的键必须按 Java 的写入顺序构造；
 *   - `put` 一个**已存在**的键是"原地替换、位置不变"（JS 对象与 Jackson `ObjectNode` 在这点上语义一致）；
 *   - 数组顺序（searchFields → columns → actions → detail → events）必须一致。
 *
 * ## 各段的编译规则
 * - `display` → 顶层（`card` / 否则 `table`，**总是**写出）
 * - `searchFields` → 查询条件组件（`eq`/`like` → input；`range` → datePicker + 双占位符；
 *   其余 → 400）；`label` 缺省用 `key`
 * - `columns` → 一个 `table` 组件（`props.columns[]`）；页面列标了 `hidden` 的**整列跳过**；
 *   `custom=true` 的列跳过"引用列存在"校验；列宽以 `minWidth` 输出（不是 `width`）
 * - `sortableFields` → 顶层数组（空数组**不写**）
 * - `pagination` → 顶层对象（`pageSize`/`pageSizes` 非正整数 → 400；`pageSizes` 空则补 `[10,20,50]`）
 * - `filter` → 顶层对象（只保留 `conditions`；全空则**移除**整个 filter）
 * - `actions` → `__page_actions` 组件（按钮数组格式优先，否则旧布尔格式）
 * - `detail` → `__page_detail` 组件（仅当 view 按钮启用或旧格式 `enabled=true`）
 * - `events` → `__page_events` 组件（原样嵌入）
 */
@Injectable()
export class ViewCompiler {
  /**
   * 编译视图配置为 `{rule, option, …}` JSON 字符串。
   *
   * `bindColumns` 为绑定表单/数据源的列（用于"引用列合法性"校验）；
   * 传空数组表示**不做**引用校验（Java 用 `validKeys.isEmpty()` 判定）。
   */
  compile(page: PageDefinitionRow, bindColumns: ColumnConfig[] | null): string {
    const root = parseJson(page.schema)
    const validKeys = new Set<string>()
    for (const column of bindColumns ?? []) {
      if (column === null || column === undefined) continue
      validKeys.add(String(column.key))
    }

    const result: Record<string, unknown> = {}
    const rule: unknown[] = []
    result.rule = rule
    result.option = {}

    // 顺序 = Java 的调用顺序，不能换（rule 数组的成员顺序是契约的一部分）
    compileDisplay(root, result)
    compileSearchFields(root, rule, validKeys)
    compileColumns(root, rule, validKeys)
    compileSortableFields(root, result, validKeys)
    compilePagination(root, result)
    compileFilter(root, result, validKeys)
    compileActions(root, rule)
    compileDetail(root, rule)
    compileEvents(root, rule)

    return JSON.stringify(result)
  }
}

/** `display` → 顶层（`card` 之外一律 `table`）。 */
function compileDisplay(root: Record<string, unknown>, result: Record<string, unknown>): void {
  result.display = textAt(root, 'display') === 'card' ? 'card' : 'table'
}

/**
 * `searchFields` → 查询条件组件。
 *
 * ⚠️ `range` 分支：`type` 与 `value` 是**原地替换**（键位置不变），随后往 `props` 追加
 *    4 个键。顺序错一个字符，schema 字符串就不同。
 */
function compileSearchFields(
  root: Record<string, unknown>,
  rule: unknown[],
  validKeys: Set<string>,
): void {
  const searchFields = root.searchFields
  if (!Array.isArray(searchFields)) return
  for (const field of searchFields) {
    const node = asRecord(field)
    const key = textAt(node, 'key')
    const label = textAt(node, 'label') === '' ? key : textAt(node, 'label')
    const matchType = textAt(node, 'matchType') === '' ? 'eq' : textAt(node, 'matchType')
    if (validKeys.size > 0 && !validKeys.has(key)) {
      throw new BusinessException(400, `查询字段引用列不存在: ${key}`)
    }
    const item: Record<string, unknown> = {
      type: 'input',
      field: key,
      title: label,
      value: '',
    }
    const props: Record<string, unknown> = {
      placeholder: label,
      style: 'width: 180px',
    }
    item.props = props

    if (matchType === 'range') {
      // `put` 对已存在的键是原地替换 —— 键顺序因此保持为 type/field/title/value/props
      item.type = 'datePicker'
      item.value = []
      props.type = 'datetimerange'
      props.valueFormat = 'yyyy-MM-dd HH:mm:ss'
      props.startPlaceholder = `开始${label}`
      props.endPlaceholder = `结束${label}`
    } else if (matchType !== 'eq' && matchType !== 'like') {
      throw new BusinessException(400, `未知查询匹配类型: ${matchType}`)
    }
    item.matchType = matchType
    rule.push(item)
  }
}

/** `sortableFields` → 顶层数组（空数组不写；引用列不存在 → 400）。 */
function compileSortableFields(
  root: Record<string, unknown>,
  result: Record<string, unknown>,
  validKeys: Set<string>,
): void {
  const fields = root.sortableFields
  if (!Array.isArray(fields) || fields.length === 0) return
  const out: unknown[] = []
  for (const field of fields) {
    const key = field === null || field === undefined ? '' : String(field)
    if (key.trim() === '') continue
    if (validKeys.size > 0 && !validKeys.has(key)) {
      throw new BusinessException(400, `排序字段引用列不存在: ${key}`)
    }
    out.push(key)
  }
  result.sortableFields = out
}

/** `pagination` → 顶层对象（缺省 show=true / pageSize=20 / pageSizes=[10,20,50]）。 */
function compilePagination(root: Record<string, unknown>, result: Record<string, unknown>): void {
  const pagination = root.pagination
  if (pagination === null || typeof pagination !== 'object' || Array.isArray(pagination)) return
  const node = pagination as Record<string, unknown>
  const out: Record<string, unknown> = {
    show: node.show === undefined || node.show === null ? true : node.show === true,
  }
  const pageSize = toIntOr(node.pageSize, 20)
  if (pageSize <= 0) {
    throw new BusinessException(400, `每页条数必须为正整数: ${String(node.pageSize)}`)
  }
  out.pageSize = pageSize

  const sizes: number[] = []
  if (Array.isArray(node.pageSizes)) {
    for (const n of node.pageSizes) {
      // Java 的 `n.isInt()` 只认"整数节点"：字符串 "10" 不是 int ⇒ 400
      if (!Number.isInteger(n) || Number(n) <= 0) {
        throw new BusinessException(400, `可选页大小必须为正整数: ${textOfScalar(n)}`)
      }
      sizes.push(Number(n))
    }
  }
  out.pageSizes = sizes.length === 0 ? [10, 20, 50] : sizes
  result.pagination = out
}

/** `filter` → 顶层对象（只保留 conditions；全空则整段移除）。 */
function compileFilter(
  root: Record<string, unknown>,
  result: Record<string, unknown>,
  validKeys: Set<string>,
): void {
  const filter = root.filter
  if (filter === null || typeof filter !== 'object' || Array.isArray(filter)) return
  const node = filter as Record<string, unknown>
  const conditions = node.conditions
  if (!Array.isArray(conditions) || conditions.length === 0) return

  const out: Record<string, unknown> = { logic: textAt(node, 'logic') === '' ? 'AND' : textAt(node, 'logic') }
  const outConditions: unknown[] = []
  for (const condition of conditions) {
    const c = asRecord(condition)
    const column = textAt(c, 'column')
    if (column.trim() === '') continue
    if (validKeys.size > 0 && !validKeys.has(column)) {
      throw new BusinessException(400, `筛选条件引用列不存在: ${column}`)
    }
    outConditions.push({
      column,
      op: textAt(c, 'op') === '' ? 'eq' : textAt(c, 'op'),
      value: textAt(c, 'value'),
    })
  }
  if (outConditions.length === 0) return
  out.conditions = outConditions
  result.filter = out
}

/** `columns` → 一个 `table` 组件（页面列 `hidden` 的整列跳过）。 */
function compileColumns(
  root: Record<string, unknown>,
  rule: unknown[],
  validKeys: Set<string>,
): void {
  const columns = root.columns
  if (!Array.isArray(columns) || columns.length === 0) return

  const colNodes: unknown[] = []
  const table: Record<string, unknown> = {
    type: 'table',
    field: '__page_table',
    title: '数据列表',
  }
  table.props = { columns: colNodes }

  for (const column of columns) {
    const node = asRecord(column)
    const key = textAt(node, 'key')
    if (key.trim() === '') continue
    // 页面列标了 hidden → 编译期跳过（schema 声明仍保留）
    if (node.hidden === true) continue
    const isCustom = node.custom === true
    if (validKeys.size > 0 && !isCustom && !validKeys.has(key)) {
      throw new BusinessException(400, `展示列引用列不存在: ${key}`)
    }
    const label = textAt(node, 'label') === '' ? key : textAt(node, 'label')
    const col: Record<string, unknown> = {
      prop: key,
      label,
      // ⚠️ 列宽输出到 `minWidth` 而**不是** `width`：el-table 里 width 优先于 min-width，
      //    写成 width 会把列钉死、右侧留白。这是 Java 注释里写明的理由。
      //    非数字的 width 走 Jackson `asInt(130)` 的语义 → 回落 130。
      minWidth: toIntOr(node.width, 130),
    }
    if (node.align !== undefined && node.align !== null) {
      col.align = textAt(node, 'align') === '' ? 'left' : textAt(node, 'align')
    }
    for (const field of [
      'contentType',
      'contentValue',
      'expression',
      'template',
      'formatter',
      'className',
      'styleExpr',
      'style',
      'custom',
      'onCellClick',
    ]) {
      if (node[field] !== undefined && node[field] !== null) {
        col[field] = node[field]
      }
    }
    colNodes.push(col)
  }
  rule.push(table)
}

/** `actions` → `__page_actions` 组件（按钮数组优先，否则旧布尔格式）。 */
function compileActions(root: Record<string, unknown>, rule: unknown[]): void {
  const actions = root.actions
  if (actions === null || typeof actions !== 'object' || Array.isArray(actions)) return
  const node = actions as Record<string, unknown>

  const actionsNode: Record<string, unknown> = {
    type: '__page_actions',
    field: '__page_actions',
    title: '操作',
  }
  const props: Record<string, unknown> = {}
  actionsNode.props = props
  rule.push(actionsNode)

  if (typeof node.permissions === 'string') {
    props.permissions = node.permissions
  }
  if (Number.isInteger(node.actionColumnWidth) && Number(node.actionColumnWidth) > 0) {
    props.actionColumnWidth = Number(node.actionColumnWidth)
  }

  if (Array.isArray(node.buttons)) {
    const btnNodes: unknown[] = []
    props.buttons = btnNodes
    for (const button of node.buttons) {
      const btn = asRecord(button)
      const key = textAt(btn, 'key')
      if (key.trim() === '') {
        throw new BusinessException(400, '操作按钮 key 不能为空')
      }
      const b: Record<string, unknown> = {
        key,
        label: textAt(btn, 'label') === '' ? key : textAt(btn, 'label'),
      }
      const placement = textAt(btn, 'placement') === '' ? 'column' : textAt(btn, 'placement')
      if (placement !== 'toolbar' && placement !== 'column') {
        throw new BusinessException(400, `未知操作位置 placement: ${placement}`)
      }
      b.placement = placement
      const style = textAt(btn, 'style') === '' ? 'button' : textAt(btn, 'style')
      if (style !== 'icon' && style !== 'text' && style !== 'button') {
        throw new BusinessException(400, `未知按钮形态 style: ${style}`)
      }
      b.style = style
      if (typeof btn.icon === 'string' && btn.icon.trim() !== '') {
        b.icon = btn.icon
      }
      if (btn.events !== undefined) {
        b.events = btn.events
      }
      btnNodes.push(b)
    }
    return
  }

  // 兼容旧布尔格式：只写出为 true 的那几个
  for (const action of ['create', 'edit', 'delete', 'view']) {
    if (node[action] === true) props[action] = true
  }
  const placement = textAt(node, 'placement') === '' ? 'column' : textAt(node, 'placement')
  if (placement !== 'toolbar' && placement !== 'column') {
    throw new BusinessException(400, `未知操作位置 placement: ${placement}`)
  }
  props.placement = placement
  const style = textAt(node, 'style') === '' ? 'button' : textAt(node, 'style')
  if (style !== 'icon' && style !== 'text' && style !== 'button') {
    throw new BusinessException(400, `未知按钮形态 style: ${style}`)
  }
  props.style = style
}

/** `detail` → `__page_detail` 组件（仅当 view 启用）。 */
function compileDetail(root: Record<string, unknown>, rule: unknown[]): void {
  const detail = root.detail
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return
  const node = detail as Record<string, unknown>
  const viewEnabled = isViewEnabled(root.actions)
  const legacyEnabled = node.enabled === true
  if (!viewEnabled && !legacyEnabled) return

  const detailNode: Record<string, unknown> = {
    type: '__page_detail',
    field: '__page_detail',
    title: '详情',
  }
  const props: Record<string, unknown> = { enabled: true }
  detailNode.props = props
  rule.push(detailNode)

  if (node.width !== undefined) {
    props.width = textAt(node, 'width') === '' ? '800px' : textAt(node, 'width')
  }
  if (node.height !== undefined && textAt(node, 'height') !== '') {
    props.height = textAt(node, 'height')
  }
  if (textAt(node, 'type') === 'form' || node.type === undefined) {
    // Java：`detail.path("type").asText("form").equals("form")` ⇒ 缺省即 form
    props.type = 'form'
  }
  const formMode = textAt(node, 'formMode') === '' ? 'popup' : textAt(node, 'formMode')
  if (formMode === 'drawer' || formMode === 'inline') {
    props.formMode = formMode
  }
}

/** view 按钮是否启用（按钮数组含 `key=view`，或旧格式 `view=true`）。 */
function isViewEnabled(actions: unknown): boolean {
  if (actions === null || typeof actions !== 'object' || Array.isArray(actions)) return false
  const node = actions as Record<string, unknown>
  if (Array.isArray(node.buttons)) {
    return node.buttons.some((button) => textAt(asRecord(button), 'key') === 'view')
  }
  return node.view === true
}

/** `events` → `__page_events` 组件（原样嵌入）。 */
function compileEvents(root: Record<string, unknown>, rule: unknown[]): void {
  const events = root.events
  if (!Array.isArray(events) || events.length === 0) return
  rule.push({
    type: '__page_events',
    field: '__page_events',
    title: '事件',
    events,
  })
}

/** 解析 schema（空 → `{}`；非法 JSON → 400「视图配置解析失败」）。 */
function parseJson(schema: string | null): Record<string, unknown> {
  if (schema === null || schema.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(schema)
  } catch {
    throw new BusinessException(400, '视图配置解析失败')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed as Record<string, unknown>
}

/**
 * 对齐 Jackson 的 `asInt(defaultValue)`：缺失 / null / 非整数 → 默认值。
 *
 * ⚠️ 与 `textAt` 同类但语义相反：Jackson 的 `asInt(def)` 在**类型不对**时**回落默认值**
 *    （不报错），所以 `pageSize: "abc"` 在 Java 里会静默变成 20 —— 照抄，别改成抛错。
 */
function toIntOr(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback
  return n
}

/** 对齐 Jackson 的 `path(x).asText()`：缺失/null → `""`，其余 `String(v)`。 */
function textAt(node: Record<string, unknown>, field: string): string {
  const value = node[field]
  if (value === null || value === undefined) return ''
  return String(value)
}

/** 对齐 Jackson 的 `asText()`（用于错误消息里的原值渲染）。 */
function textOfScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  return String(value)
}

function asRecord(node: unknown): Record<string, unknown> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return {}
  return node as Record<string, unknown>
}
