// 页面/组件级数据源 schema 类型（原由 ViewDesigner.vue 宿主导出，ViewDesigner 废弃后迁出至此，
// 供 ActionsConfig / EventsConfig / ColumnAdvancedConfig / QueryColumnsConfig / SearchFieldsConfig 等共享组件引用）。

import type { ButtonEventConfig, CellClickConfig, PageEventConfig } from '@/types/pageActionCatalog'

export type { ButtonEventConfig, CellClickConfig, PageEventConfig }

/** 搜索字段配置 */
export interface SearchFieldConfig {
  key: string
  label: string
  matchType: string
}

/** 列展示配置 */
export interface ColumnViewConfig {
  key: string
  label: string
  width?: number
  align?: string
  /** @deprecated 排序能力由数据源 metadata 声明（方案 A），本字段不再配置；历史残留被忽略 */
  sortable?: boolean
  /** 列内容类型：expression（JS 表达式）/ template（${字段} 插值） */
  contentType?: 'expression' | 'template'
  /** 列内容值（与 contentType 配对：expression → JS 表达式，template → 插值模板） */
  contentValue?: string
  /** @deprecated 已迁移至 contentType='expression' + contentValue */
  formatter?: string
  /** 固定列（left/right） */
  fixed?: string
  /** @deprecated 已迁移至 contentType='template' + contentValue */
  template?: string
  /** @deprecated 已迁移至 contentType='expression' + contentValue */
  expression?: string
  /** 单元格 class（透传 <td> 静态样式） */
  className?: string
  /** 单元格样式表达式（返回样式字符串/CSSProperties 对象，如 $row.status==='PENDING' ? 'color:red' : ''） */
  styleExpr?: string
  /** 统一字段样式（结构化，替代 className/styleExpr） */
  style?: import('@/utils/fieldStyle').FieldStyle
  /** 列头点击事件链（点击本列单元格触发；配置后短路整表级 cell-click） */
  onCellClick?: CellClickConfig
  /** 汇总行聚合（Task ⑤）：sum/avg/count/max/min；数值列开放 sum/avg/max/min；全类型可 count；按当前页数据统计 */
  aggregate?: 'sum' | 'avg' | 'count' | 'max' | 'min'
  /** 自定义计算列标记（key 非数据源字段；由"添加自定义列"写入，后端编译时跳过引用列校验） */
  custom?: boolean
  /** 自定义列隐藏标记（取消勾选展示时置 true：保留列定义与高级配置，仅不在表格渲染） */
  hidden?: boolean
}

/** 操作按钮配置 */
export interface ViewActionButton {
  key: string
  label: string
  /** 位置：toolbar（操作栏）/ column（操作列） */
  placement: 'toolbar' | 'column'
  /** 形态：icon（仅图标）/ text（文字链接）/ button（带图标按钮） */
  style: 'icon' | 'text' | 'button'
  /** 图标名（Element Plus 图标，如 Plus/Edit/Delete/View；留空按内置 key 兜底） */
  icon?: string
  /** 自定义按钮事件链（点击触发）；内置按钮无需 */
  events?: ButtonEventConfig[]
  /** 条件显示表达式（如 $row.status === 'PENDING'） */
  visible?: string
}

/** 操作配置 */
export interface ViewActionsConfig {
  buttons: ViewActionButton[]
  permissions: string
  /** 操作列宽度（px，可选；缺省按按钮数量自动计算） */
  actionColumnWidth?: number
}

/** 详情配置 */
export interface ViewDetailConfig {
  /** 详情弹窗宽度（由"查看"按钮启用，无需独立开关） */
  width: string
  /** 表单容器高度（弹窗/抽屉/内嵌内容区高度，超出滚动） */
  height?: string
  type: string
  /** 表单展示方式：popup（弹窗）/ drawer（抽屉）/ inline（内嵌） */
  formMode?: 'popup' | 'drawer' | 'inline'
}
