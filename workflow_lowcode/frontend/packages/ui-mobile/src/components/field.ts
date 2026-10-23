import { defineComponent, h } from 'vue'
import {
  ElCheckboxGroup,
  ElInput,
  ElInputNumber,
  ElRadioGroup,
  ElRate,
  ElSelect,
  ElSlider,
  ElSwitch,
} from 'element-plus'
import { thin } from './_thin'

/**
 * @lc/ui-mobile 字段族薄组件（uni-ui 契约对齐的 web 封装）。
 *
 * 契约口径：组件名/props/事件/插槽与 component-map 中 uni-ui 目标标签一一对应——
 * 画布渲染与出码共用同一份映射（design D5 单一事实源）。内核用 element-plus 基础件，
 * 视觉由 theme.ts 克隆的 uni-ui token 经 DeviceFrame --ds-* 令牌统一上色。
 */

/** uni-easyinput 契约：v-model + placeholder/disabled/maxlength/type + input 事件 */
export const LcInput = defineComponent({
  name: 'LcInput',
  props: {
    modelValue: { type: [String, Number], default: '' },
    type: { type: String, default: 'text' },
    placeholder: { type: String, default: '请输入' },
    disabled: Boolean,
    maxlength: { type: [String, Number], default: 140 },
  },
  emits: ['update:modelValue', 'input'],
  setup(p, { emit, attrs, slots }) {
    return () =>
      h(
        ElInput,
        {
          ...attrs,
          modelValue: p.modelValue,
          type: p.type,
          placeholder: p.placeholder,
          disabled: p.disabled,
          maxlength: p.maxlength === undefined ? undefined : Number(p.maxlength),
          clearable: true,
          'onUpdate:modelValue': (v: string | number) => {
            emit('update:modelValue', v)
            emit('input', v)
          },
        },
        slots,
      )
  },
})

/** uni-number-box 契约：v-model + min/max/step */
export const LcInputNumber = thin('LcInputNumber', ElInputNumber, {
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
})

/** uni-radio-group 契约：v-model（选项子项由 form-create 按 rule options 生成） */
export const LcRadio = thin('LcRadio', ElRadioGroup)

/** uni-checkbox-group 契约：v-model 数组 */
export const LcCheckbox = thin('LcCheckbox', ElCheckboxGroup)

/** uni-data-select 契约：v-model + placeholder + clearable（options 由 form-create 生成子项） */
export const LcSelect = thin('LcSelect', ElSelect, {
  placeholder: { type: String, default: '请选择' },
  clearable: Boolean,
})

/** uni-switch 契约：v-model 布尔 */
export const LcSwitch = thin('LcSwitch', ElSwitch)

/** uni-rate 契约：v-model 数值 + max */
export const LcRate = thin('LcRate', ElRate, { max: { type: Number, default: 5 } })

/** uni-slider 契约：v-model 数值 + min/max */
export const LcSlider = thin('LcSlider', ElSlider, {
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
})
