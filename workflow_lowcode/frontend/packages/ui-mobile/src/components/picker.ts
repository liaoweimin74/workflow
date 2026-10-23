import { ElCascader, ElColorPicker, ElDatePicker } from 'element-plus'
import { thin } from './_thin'

/**
 * @lc/ui-mobile 选择器族薄组件。
 * 时间/日期统一对齐 uni-datetime-picker 契约（type 区分），级联对齐 uni-data-picker。
 */

/** uni-datetime-picker(type=time) 契约：v-model */
export const LcTimePicker = thin('LcTimePicker', ElDatePicker, {}, { type: 'time' })

/** uni-datetime-picker(type=date) 契约：v-model */
export const LcDatePicker = thin('LcDatePicker', ElDatePicker, {}, { type: 'date' })

/** uni-datetime-picker(range) 契约：v-model [start, end] */
export const LcDateRange = thin(
  'LcDateRange',
  ElDatePicker,
  {},
  { type: 'daterange', startPlaceholder: '开始日期', endPlaceholder: '结束日期' },
)

/** uni-data-picker 契约：v-model + placeholder（options 数据源由 form-create 注入） */
export const LcCascader = thin('LcCascader', ElCascader, {
  placeholder: { type: String, default: '请选择' },
})

/**
 * 颜色选择：uni-ui 无直接对位（V1 机制占位，tag 取 uni-easyinput）。
 * 画布以取色内核承载结构；出码侧按 component-map 落 uni-easyinput + 校验。
 */
export const LcColorPicker = thin('LcColorPicker', ElColorPicker)
