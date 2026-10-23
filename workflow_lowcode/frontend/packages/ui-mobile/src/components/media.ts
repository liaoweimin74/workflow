import { defineComponent, h } from 'vue'
import { ElInput, ElUpload } from 'element-plus'
import { thin } from './_thin'

/**
 * @lc/ui-mobile 媒体/富文本族薄组件。
 */

/** uni-file-picker 契约：v-model 文件列表 + limit；画布态不真传（autoUpload 关闭） */
export const LcUpload = defineComponent({
  name: 'LcUpload',
  props: {
    modelValue: { type: Array, default: () => [] },
    limit: { type: Number, default: 9 },
  },
  emits: ['update:modelValue'],
  setup(p, { emit, attrs, slots }) {
    return () =>
      h(
        ElUpload,
        {
          ...attrs,
          fileList: p.modelValue,
          limit: p.limit,
          autoUpload: false,
          'onUpdate:fileList': (v: unknown[]) => emit('update:modelValue', v),
        },
        slots,
      )
  },
})

/**
 * uni-app editor 契约：v-model(html)。
 * web 画布以 textarea 承载结构（皮肤层近似；产物保真以产物级预览核对）。
 */
export const LcRichText = defineComponent({
  name: 'LcRichText',
  props: {
    modelValue: { type: String, default: '' },
    placeholder: { type: String, default: '请输入' },
    readOnly: Boolean,
  },
  emits: ['update:modelValue'],
  setup(p, { emit, attrs }) {
    return () =>
      h(ElInput, {
        ...attrs,
        type: 'textarea',
        rows: 4,
        modelValue: p.modelValue,
        placeholder: p.placeholder,
        disabled: p.readOnly,
        'onUpdate:modelValue': (v: string) => emit('update:modelValue', v),
      })
  },
})
