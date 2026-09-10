/**
 * 共享列表布局模块：从 BizDataListPage（业务表单数据管理）抽取的纯函数集合。
 *
 * 统一 业务表单数据管理（BizDataListPage）与 数据源数据管理（DataSourceDataPage）的
 * 列表推导逻辑：可筛选列、搜索栏字段、表格列渲染、结构化 filter 组装、单元格格式化。
 * 以纯数据（columnConfig + rules + params）驱动，可测试；不依赖组件状态。
 */
import { h, type VNode } from 'vue'
import type { ColumnConfigItem } from '@/api/bizData'
import type { SearchField, TableColumn } from '@/components/business/types'
import { leafDisplayText } from '@/views/form/arrayValueLabel'

/** 查询组件类型映射：数据引用 → LookupPicker（弹窗选择）；日期 → date-picker；其余（选项类/文本）→ input */
const QUERY_PICKER_TYPES = ['LookupPicker', 'DataPicker']

/** 按列 key 找 schema/form rule（数组组件列 key 为 <key>_text → 去后缀找 field） */
export function findRuleByFieldKey(
  rules: Array<Record<string, any>>,
  fieldKey: string,
): Record<string, any> | undefined {
  const baseKey = fieldKey.endsWith('_text') ? fieldKey.slice(0, -5) : fieldKey
  return rules.find((r) => r.field === baseKey)
}

/**
 * 可筛选列（非 JSON/TEXT、非 colorPicker，且 indexed 或短文本；数组组件用 <key>_text 冗余列）。
 * 入参为完整 columnConfig（含 hidden/unsupported 标记与 <key>_text 冗余列），内部先过滤展示列。
 */
export function filterableColumnsOf(columnConfig: ColumnConfigItem[]): ColumnConfigItem[] {
  const bizColumns = columnConfig.filter((c) => !c.unsupported && !c.hidden)
  return bizColumns.flatMap((c) => {
    // 数组值组件（columnConfig 含 <key>_text 冗余列）：主列 JSON 不可筛，改用 <key>_text（VARCHAR LIKE）
    const textCol = columnConfig.find((x) => x.key === c.key + '_text')
    if (textCol) return [{ ...textCol, label: c.label }]
    // 显式声明优先：filterable=false 明确不可筛；filterable=true 管理员声明允许筛（不校验列类型）
    if (c.filterable === false) return []
    if (c.filterable === true) return [c]
    if (c.columnType !== 'JSON' && c.columnType !== 'TEXT'
      && c.componentType !== 'colorPicker'
      && (c.indexed || (c.length != null && c.length <= 64) || c.columnType === 'VARCHAR')) {
      return [c]
    }
    return []
  })
}

/** 数据引用（lookupPicker/dataPicker）查询组件配置：透传 rule.props（fetch/columns/dataSourceId/displayField 等） */
function lookupSearchProps(rule: Record<string, any> | undefined): Record<string, any> {
  return { ...(rule?.props || {}) }
}

/**
 * 搜索栏（由可筛选列动态生成）：字段为 LIKE 模糊查询（fetchApi 对非数值/日期列一律 like），统一用文本输入框；
 * 数据引用→LookupPicker（透传 rule.props 回填显示文本）；日期→date-picker。
 */
export function buildSearchFields(
  filterable: ColumnConfigItem[],
  rules: Array<Record<string, any>>,
): SearchField[] {
  return filterable.map((c) => {
    const rule = findRuleByFieldKey(rules, c.key)
    const compType = rule?.type || c.componentType
    // 模糊查询声明：一律文本输入框（用户输入关键字，后端 LIKE 匹配）
    if (c.matchType === 'like') {
      return { type: 'input', label: c.label, prop: c.key, placeholder: c.label, style: 'width: 180px' }
    }
    // 范围查询声明：日期 → date-range（[start,end]）；数值 → number-range（[min,max]）；其他列退化文本输入
    if (c.matchType === 'range') {
      if (c.columnType === 'DATE' || c.columnType === 'DATETIME') {
        return { type: 'date-range', label: c.label, prop: c.key, placeholder: c.label }
      }
      if (c.columnType === 'INT' || c.columnType === 'BIGINT' || c.columnType === 'TINYINT' || c.columnType === 'DECIMAL') {
        return { type: 'number-range', label: c.label, prop: c.key, placeholder: c.label, style: 'width: 200px' }
      }
      return { type: 'input', label: c.label, prop: c.key, placeholder: c.label, style: 'width: 180px' }
    }
    if (QUERY_PICKER_TYPES.includes(compType)) {
      return { type: 'lookupPicker', label: c.label, prop: c.key, lookupProps: lookupSearchProps(rule), placeholder: c.label, style: 'width: 200px' }
    }
    // 日期：schema rule 未标明时按列类型兜底（数据源元数据无 rule，仅 columnType）
    if (compType === 'DatePicker' || compType === 'datePicker' || compType === 'date'
      || c.columnType === 'DATE' || c.columnType === 'DATETIME') {
      return { type: 'date-picker', label: c.label, prop: c.key, placeholder: c.label }
    }
    return { type: 'input', label: c.label, prop: c.key, placeholder: c.label, style: 'width: 180px' }
  })
}

/** 按列类型推导排序能力（与 filterableColumnsOf 同源规则：JSON/TEXT/colorPicker/子表不可排） */
export function isColumnSortable(c: ColumnConfigItem): boolean {
  if (c.subColumns && c.subColumns.length > 0) return false
  if (c.columnType === 'JSON' || c.columnType === 'TEXT') return false
  if (c.componentType === 'colorPicker') return false
  return true
}

/** 精确匹配列（数值/日期）：等值；其余（文本/选项类/数据引用）LIKE 模糊（选项类查询值=显示 label，_text LIKE 命中路径/多值） */
export function isExactMatchCol(c: ColumnConfigItem): boolean {
  const t = c.columnType
  if (t === 'DATE' || t === 'DATETIME' || t === 'INT' || t === 'BIGINT' || t === 'TINYINT' || t === 'DECIMAL') return true
  return false
}

/** JSON 数组 → 逗号拼接；非数组（旧逗号串/字符串）原样 */
export function formatArray(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) return parsed.join(', ')
    } catch {
      // 旧逗号串或普通字符串，原样
    }
    return v
  }
  return formatCell(v)
}

/** 单元格基础格式化：null/undefined 占位，对象 JSON 序列化 */
export function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 时间格式化：YYYY-MM-DD HH:mm */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 按组件类型定制单元格渲染（无 componentType 时按列类型兜底） */
export function renderByComponentType(
  componentType: string | undefined,
  _columnType: string | undefined,
  v: unknown,
): VNode | string {
  if (v === null || v === undefined) return '—'
  switch (componentType) {
    case 'colorPicker': {
      const hex = String(v)
      return h('div', {
        style: 'display:inline-flex;align-items:center;gap:6px;',
      }, [
        h('span', {
          style: `display:inline-block;width:14px;height:14px;border-radius:3px;border:1px solid #dcdfe6;background:${hex};vertical-align:middle;`,
        }),
        hex,
      ])
    }
    case 'checkbox':
    case 'multiSelect':
    case 'multiSelectPro':
    case 'select':
    case 'elTransfer':
    case 'tree':
    case 'elTreeSelect':
    case 'cascader':
      // 数组值组件（含 select 多选）→ 逗号拼接可读展示；select 单选字符串原样
      return formatArray(v)
    case 'slider':
      return Array.isArray(v) ? v.join(' ~ ') : formatCell(v)
    default:
      return formatCell(v)
  }
}

export interface BuildTableColumnsOptions {
  /** 子表列渲染开关：默认渲染为 slotName（调用方提供 slot 模板）；false 时子表列按普通 JSON 展示 */
  useSubtableSlot?: boolean
  /** 末尾追加 updatedAt（更新时间）列：默认 true（业务表单数据管理兼容审计字段展示）；
   *  数据源数据管理等按用户配置字段展示的场景传 false，列严格等于传入列 */
  appendUpdatedAt?: boolean
}

/**
 * 表格列（render 读 row.data[key]；data-picker 引用列优先显示冗余文本；数组值列显示 <key>_text；
 * 子表字段用 slotName 渲染链接；末尾追加 updatedAt 列）。
 * bizColumns 为已过滤 hidden/unsupported 的展示列；冗余列文本（<key>_text）由 render 从行数据直接取值。
 */
export function buildTableColumns(
  bizColumns: ColumnConfigItem[],
  options: BuildTableColumnsOptions = {},
): TableColumn[] {
  const columns = bizColumns.map((c): TableColumn => {
    // 子表字段：不显示存储 JSON 文本，使用 [子表名称] 链接（slotName 渲染）
    if (c.subColumns && c.subColumns.length > 0) {
      if (options.useSubtableSlot !== false) {
        return {
          prop: c.key,
          label: c.label,
          minWidth: 130,
          slotName: `subtable-${c.key}`,
        }
      }
      // 不使用子表 slot：按普通列渲染（JSON 文本展示）
    }
    return {
      prop: c.key,
      label: c.label,
      minWidth: c.columnType === 'TEXT' || c.columnType === 'JSON' ? 200 : 130,
      // 显式声明优先（数据源 metadata sortable），缺省按列类型推导
      sortable: c.sortable ?? isColumnSortable(c),
      render: (row: any): VNode | string => {
        const v = row.data?.[c.key]
        // data-picker：显示冗余文本列（<key>_text，JSON 文本数组），缺省回退原值
        if (c.pickerConfig && v) {
          const text = row.data[c.key + '_text']
          if (text !== undefined && text !== null && text !== '') {
            try {
              const parsed = JSON.parse(String(text))
              if (Array.isArray(parsed)) return parsed.join(',')
            } catch {
              // 非 JSON 旧数据，按原值展示
            }
            return String(text)
          }
        }
        // 数组值组件：优先显示冗余显示列 <key>_text（取叶子 label；树形/级联全路径取最后一段），缺失回退 value
        const text = row.data?.[c.key + '_text']
        if (text !== undefined && text !== null && text !== '') return leafDisplayText(text)
        return renderByComponentType(c.componentType || undefined, c.columnType, v)
      },
    }
  })
  return [
    ...columns,
    // 尾列追加 updatedAt（BizDataVO 审计字段）；appendUpdatedAt=false 时列严格等于传入列
    ...(options.appendUpdatedAt === false
      ? []
      : [{
          prop: 'updatedAt',
          label: '更新时间',
          width: 160,
          align: 'center' as const,
          formatter: (row: any) => formatDate(row.updatedAt),
        }]),
  ]
}

/** 结构化筛选条件组装：matchType 声明优先（eq/like/range），缺省文本列 LIKE、数值/日期列 eq（级联选中路径 label 数组 join('/') 匹配 _text 全路径） */
export function collectFilterConditions(
  filterable: ColumnConfigItem[],
  params: Record<string, any>,
): { column: string; op: 'eq' | 'like' | 'range'; value: any }[] {
  const conditions: { column: string; op: 'eq' | 'like' | 'range'; value: any }[] = []
  for (const col of filterable) {
    const raw = params[col.key]
    if (raw === undefined || raw === null || raw === '') continue
    const match = col.matchType
    const op: 'eq' | 'like' | 'range' = match === 'like' || match === 'range' || match === 'eq'
      ? match
      : (isExactMatchCol(col) ? 'eq' : 'like')
    // range：数组值（[min,max]）原样保留；其余数组（级联路径 label）join(/)
    const v = Array.isArray(raw) && op !== 'range' ? raw.join('/') : raw
    conditions.push({ column: col.key, op, value: v })
  }
  return conditions
}