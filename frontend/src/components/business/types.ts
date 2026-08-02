import type { Component } from 'vue'

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
  slotName?: string
}

// --- 操作按钮 ---

export interface ActionButton {
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'text'
  size?: 'small' | 'default' | 'large'
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

// --- 表单布局 ---

export type FormLayout = 'single' | 'double' | { cols: number; gap?: number }

// --- 表单字段 ---

export interface FormField {
  type:
    | 'input'
    | 'select'
    | 'tree-select'
    | 'switch'
    | 'date-picker'
    | 'radio'
    | 'checkbox'
    | 'textarea'
    | 'slot'
    | 'lookup'
  label: string
  prop: string
  placeholder?: string
  rules?: any[]
  options?: { label: string; value: any }[]
  treeProps?: {
    data: any[]
    props: { label: string; value: string; children?: string }
  }
  disabled?: boolean
  span?: number
  slotName?: string
  props?: Record<string, any>
  visible?: (formData: Record<string, any>) => boolean
  onChange?: (
    newVal: any,
    oldVal: any,
    formData: Record<string, any>,
  ) => boolean | Promise<boolean>
}

// --- 表单 props ---

export interface FormBuilderProps {
  fields: FormField[]
  modelValue: Record<string, any>
  layout?: FormLayout
  labelWidth?: string
  labelPosition?: 'left' | 'right' | 'top'
}

// --- 表单集成配置（SearchTable 用） ---

export interface FormConfig<T = any> {
  fields: FormField[]
  /** 新增表单的初始值，handleCreate 时与传入 initialValues 合并 */
  initialValues?: Record<string, any>
  createApi?: (data: any) => Promise<any>
  updateApi?: (id: number | string, data: any) => Promise<any>
  deleteApi?: (id: number | string) => Promise<any>
  getApi?: (id: number | string) => Promise<T>
  layout?: FormLayout
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
}

// --- ReferencePicker props ---

// --- LookupPicker props ---

export interface LookupPickerProps {
  /** v-model 绑定选中行数据 */
  modelValue: Record<string, any> | null | Record<string, any>[]

  /** 弹窗表格列定义 */
  columns: TableColumn[]

  /** 数据获取函数 */
  fetchApi: (
    params: QueryParams & { keyword?: string },
  ) => Promise<{ rows: any[]; total: number }>

  /** 字段映射：选中行的 sourceField → 表单的 targetField */
  returnFields?: Record<string, string>

  /** 输入框显示字段，默认取 columns 第一个非 selection 列的 prop */
  displayField?: string

  /** 输入框占位符 */
  placeholder?: string
  searchPlaceholder?: string

  /** 是否显示弹窗搜索框，默认 true */
  showSearch?: boolean

  /** 选择模式：single（默认）| multiple */
  mode?: 'single' | 'multiple'

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
