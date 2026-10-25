/**
 * component-map：设计器契约渲染画布与出码共用的组件映射（单一事实源，design D5）。
 *
 * uniapp 侧：form-create 字段类型 → uni-ui 目标标签 + @lc/ui-mobile 契约渲染组件。
 * 出码 emit 按 tag 产出 uni-ui 标签；画布按 render 名解析 @lc/ui-mobile 组件。
 * schema 的 rule.type 跨设计类型共享（design_type MUST NOT 改变 schema 格式），
 * 因此映射键就是共享的字段类型名。
 */
export interface UniAppComponentMapping {
  /** uni-ui 目标标签（emit 产物中的标签；uni-app 内置组件（view/editor）原样） */
  tag: string
  /** @lc/ui-mobile 契约渲染组件导出名（画布侧 resolve 用） */
  render: string
  /**
   * 出码属性白名单（Task 4.1）：schema prop 名（与契约 props 面同名）→ uni 标签属性名
   * （同名传 true，改名传目标名）。未登记的 IR prop 不上模板——白名单即 uni 侧的
   * 丢弃登记，golden 快照锁定落法（textarea 的 rows、datePicker 的 valueFormat 是例证）。
   */
  props?: Record<string, string | true>
  /** 固定属性（对位 web 契约 constAttrs）：恒以字面量出的产物侧接线（textarea 的 type=textarea） */
  staticProps?: Record<string, string | number | boolean>
}

/** uniapp 侧组件映射（@lc/ui-mobile 组件清单的单一事实源） */
export const UNIAPP_COMPONENT_MAP: Record<string, UniAppComponentMapping> = {
  input: { tag: 'uni-easyinput', render: 'LcInput', props: { placeholder: true } },
  textarea: {
    tag: 'uni-easyinput',
    render: 'LcTextarea',
    props: { placeholder: true },
    staticProps: { type: 'textarea' },
  },
  inputNumber: { tag: 'uni-number-box', render: 'LcInputNumber', props: { min: true, max: true } },
  radio: { tag: 'uni-radio-group', render: 'LcRadio' },
  checkbox: { tag: 'uni-checkbox-group', render: 'LcCheckbox' },
  select: {
    tag: 'uni-data-select',
    render: 'LcSelect',
    // multiple/filterable 是形态分支条件（Task 4.2），不透传；clearable→clear 改名
    props: { placeholder: true, clearable: 'clear', disabled: true },
  },
  switch: { tag: 'uni-switch', render: 'LcSwitch' },
  rate: { tag: 'uni-rate', render: 'LcRate' },
  slider: { tag: 'uni-slider', render: 'LcSlider' },
  timePicker: { tag: 'uni-datetime-picker', render: 'LcTimePicker' },
  datePicker: { tag: 'uni-datetime-picker', render: 'LcDatePicker', props: { type: true, placeholder: true } },
  dateRange: { tag: 'uni-datetime-picker', render: 'LcDateRange' },
  cascader: { tag: 'uni-data-picker', render: 'LcCascader' },
  colorPicker: { tag: 'uni-easyinput', render: 'LcColorPicker' },
  /**
   * 查找选择器（Task 11.2）：产物形态是自绘弹层（只读触发框 uni-easyinput + uni-popup），
   * 故 emit 侧走特判分支（emitLookupPickerField），这里的 tag 指触发框、props 白名单
   * 不参与出码；画布按 render 解析 @lc/ui-mobile 的 LcLookupPicker（契约控件）。
   */
  LookupPicker: { tag: 'uni-easyinput', render: 'LcLookupPicker' },
  upload: { tag: 'uni-file-picker', render: 'LcUpload' },
  richText: { tag: 'editor', render: 'LcRichText' },
  row: { tag: 'view', render: 'LcRow' },
  col: { tag: 'view', render: 'LcCol' },
  form: { tag: 'uni-forms', render: 'LcForm' },
}

export type CanvasDesignType = 'web' | 'uniapp'

/**
 * 渲染机组件解析（Task 2.2）：web → null（宿主 el-* 包按 form-create 全局别名解析，
 * 现状不动）；uniapp → @lc/ui-mobile 契约组件名。无映射返回 null——web-only 组件
 * 走三区能力矩阵置灰拦截（Task 2.3），画布不强行渲染。
 */
export function resolveComponent(type: string, designType: CanvasDesignType): string | null {
  if (designType !== 'uniapp') return null
  return UNIAPP_COMPONENT_MAP[type]?.render ?? null
}
