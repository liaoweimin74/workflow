import type { Component, VNode } from 'vue'
import type { Rule } from '@form-create/element-ui'

// ============================================================
// 公共业务组件类型定义
// ============================================================

// --- 查询字段 ---

export interface SearchField {
  type: 'input' | 'select' | 'tree-select' | 'date-picker' | 'date-range'
  label: string
  prop: string
  placeholder?: string
  defaultValue?: any
  options?: { label: string; value: any }[]
  treeProps?: {
    data: any[]
    props: { label: string; value: string; children?: string }
  }
  style?: string
}

// --- 表格列 ---

export interface TableColumn {
  prop?: string
  label: string
  width?: number | string
  minWidth?: number | string
  align?: 'left' | 'center' | 'right'
  fixed?: 'left' | 'right'
  formatter?: (
    row: any,
    column: TableColumn,
    cellValue: any,
    index: number,
  ) => string
  /** 富渲染函数（返回 VNode 或字符串），优先级高于 formatter */
  render?: (row: any, column: TableColumn, index: number) => VNode | string
  slotName?: string
}

// --- 操作按钮 ---

export interface ActionButton {
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'small' | 'default' | 'large'
  /** 文本按钮（Element Plus 3.0 link 模式）。配置后渲染为 link 按钮，type 字段仅控制颜色 */
  link?: boolean
  /** Element Plus 图标组件。配置后渲染为圆形图标按钮，hover 显示 label */
  icon?: Component
  permission?: string
  confirm?: string
  /** 返回 false 则隐藏此按钮 */
  show?: (row: any) => boolean
  onClick: (row: any) => void
}

// --- 查询参数 ---

export interface QueryParams {
  page: number
  size: number
  [key: string]: any
}

// --- 表单集成配置（SearchTable 用） ---

export interface FormConfig<T = any> {
  /** form-create Rule 数组，直接传给 FormRenderer 渲染 */
  rule: Rule[]
  /** form-create option（布局配置如 labelPosition/labelWidth，来自设计器 schema.option） */
  option?: Record<string, any>
  /** 新增表单的初始值，handleCreate 时与传入 initialValues 合并 */
  initialValues?: Partial<T>
  createApi?: (data: any) => Promise<any>
  updateApi?: (id: number | string, data: any, row?: T) => Promise<any>
  deleteApi?: (id: number | string, row?: T) => Promise<any>
  getApi?: (id: number | string) => Promise<T>
  labelWidth?: string
  dialogWidth?: string
  dialogTitle?: { create?: string; edit?: string }
  createPermission?: string
  editPermission?: string
  deletePermission?: string
  beforeCreate?: () => boolean | Promise<boolean>
  beforeEdit?: (row: T) => boolean | Promise<boolean>
  beforeDelete?: (row: T) => boolean | Promise<boolean>
  afterCreate?: (result: any) => void
  afterUpdate?: (result: any) => void
  afterDelete?: () => void
}

// --- SearchTable props ---

// --- 表格搜索配置 ---

/** 树形表格配置 */
export interface TreeTableProps {
  /** el-table 的 row-key */
  rowKey: string
  /** 子节点字段名 */
  children: string
  /** 是否默认展开所有节点 */
  defaultExpandAll?: boolean
}

export interface SearchTableProps<T = any> {
  searchFields: SearchField[]
  columns: TableColumn[]
  actionButtons?: ActionButton[]
  fetchApi: (
    params: QueryParams,
  ) => Promise<{ rows: T[]; total: number }>
  defaultPageSize?: number
  pageSizes?: number[]
  showExport?: boolean
  exportLoading?: boolean
  maxVisibleButtons?: number
  formConfig?: FormConfig<T>
  /** 是否显示搜索栏，默认 true */
  showSearch?: boolean
  /** el-table 尺寸，默认 'default' */
  tableSize?: 'small' | 'default' | 'large'
  /** 树形表格配置，存在时启用树形渲染并隐藏分页 */
  treeProps?: TreeTableProps
  /** 动态删除确认文案（接收行，返回确认提示）；缺省 '确定删除该记录吗？' */
  deleteConfirm?: (row: T) => string
}

// --- ReferencePicker props ---

// --- LookupPicker props ---

/** LookupPicker 可序列化的数据源配置（替代函数 fetchApi，供设计器 schema 存取） */
export interface LookupFetchConfig {
  /** API 路径（相对 /api，如 /v1/biz-data/{formKey}） */
  action: string
  /** 请求方法，默认 GET */
  method?: 'GET' | 'POST'
  /** 响应解析表达式：从 R.data 提取数组，如 records / content / list */
  parse?: string
  /** 响应解析表达式：从 R.data 提取 total，缺省取 data.total 或数组长度 */
  totalParse?: string
  /** 搜索关键字映射的 API 参数名，默认 'keyword' */
  searchParam?: string
  /** 搜索字段列名（底表 API 用；如 keywordColumn=name 表示按 name 列模糊搜索） */
  keywordColumn?: string
  /**
   * 页码基准：1（默认，页码按原样透传，el-pagination 1 起）；
   * 0（后端 0 起，如 biz-data 分页接口，发送 page=页码-1）
   */
  pageBase?: 0 | 1
  /** 请求头（可选） */
  headers?: Record<string, string>
  /** 固定请求参数（可选，与分页/关键字合并） */
  data?: Record<string, unknown>
  /** 数据源预筛选（静态 + 动态 + AND/OR）；底表数据源组装为 filter JSON，外部 API 降级为等值参数 */
  filter?: LookupFilterConfig
}

/** 筛选运算符（底表结构化 filter 支持；外部 API 仅透传等值 eq） */
export type FilterOperator = 'eq' | 'ne' | 'like' | 'in' | 'isEmpty' | 'isNotEmpty'

/** 单条筛选条件：column 必填；field 存在时取当前表单字段值（动态），否则用 value（静态） */
export interface FilterCondition {
  column: string
  op?: FilterOperator
  /** 静态值（field 未配置时使用） */
  value?: unknown
  /** 动态源：当前表单字段名（存在时条件值 = 该字段当前值，经 form-create api.getValue 读取） */
  field?: string
}

/** 数据源预筛选：静态 + 动态 + AND/OR 组合 */
export interface LookupFilterConfig {
  /** AND（所有条件满足，默认）| OR（任一条件满足） */
  logic?: 'AND' | 'OR'
  conditions: FilterCondition[]
}

export interface LookupPickerProps {
  /**
   * v-model 绑定值：
   * - 新语义：显示文本字符串（field 绑定显示文本字段）
   * - 旧兼容：整行对象
   */
  modelValue: string | null | Record<string, any>

  /** 选中记录 id 的独立存储字段（设计者显式配置，hidden）。选中时经 formCreateInject.api.setValue(idField, row.id) 写入 */
  idField?: string

  /** 弹窗表格列定义 */
  columns: TableColumn[]

  /** 数据获取函数（代码级注入；设计器 schema 用 fetch 配置替代） */
  fetchApi: (
    params: QueryParams & { keyword?: string },
  ) => Promise<{ rows: any[]; total: number }>

  /** 可序列化的数据源配置（设计器场景，优先级低于 fetchApi：fetchApi 为函数时优先） */
  fetch?: LookupFetchConfig

  /** 字段映射：选中行的 sourceField → 表单的 targetField */
  returnFields?: Record<string, string>

  /** 输入框显示字段，默认取 columns 第一个非 selection 列的 prop */
  displayField?: string

  /** 输入框占位符 */
  placeholder?: string
  searchPlaceholder?: string

  /** 是否显示弹窗搜索框，默认 true */
  showSearch?: boolean

  disabled?: boolean
  clearable?: boolean

  /** 弹窗标题 */
  dialogTitle?: string
}

export interface ReferencePickerProps<T = any> {
  modelValue: any | any[]
  valueField: string
  displayField: string
  fetchApi: (
    params: QueryParams & { keyword?: string },
  ) => Promise<{ rows: T[]; total: number }>
  columns: TableColumn[]
  mode?: 'single' | 'multiple'
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  clearable?: boolean
}
