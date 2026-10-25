import { ElButton, ElCascader, ElColorPicker, ElDatePicker, ElDialog, ElInput, ElScrollbar, ElTag } from 'element-plus'
import { computed, defineComponent, h, ref } from 'vue'
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

/**
 * 查找选择器契约控件（Task 11.2，画布侧）：对位 web src/components/business/LookupPicker.vue
 * 的呈现面 —— 只读触发框显示选中文本（v-model = 显示文本，LookupPicker.vue:268-270）+
 * 弹层内搜索框与结果列表。
 *
 * 画布没有数据源身份（产物侧靠 globalDataSourceId 换成 refId 取数，@lc/runtime-uni/picker），
 * 所以结果列表只出结构占位：设计器能看见控件形态与绑定的字段（display/id/returnFields），
 * 真取数与回写由出码产物承担。契约 props 逐项声明，多余的键不上 DOM（避免属性噪声）。
 */
export const LcLookupPicker = defineComponent({
  name: 'LcLookupPicker',
  props: {
    modelValue: { type: null, default: undefined },
    displayField: { type: String, default: '' },
    idField: { type: String, default: '' },
    returnFields: { type: Object, default: () => ({}) },
    searchColumns: { type: Array, default: () => [] },
    columns: { type: Array, default: () => [] },
    globalDataSourceId: { type: String, default: '' },
    placeholder: { type: String, default: '请选择' },
  },
  emits: ['update:modelValue', 'select', 'clear'],
  setup(props, { emit }) {
    const visible = ref(false)
    const keyword = ref('')
    /** 触发框文本：v-model 即显示文本（读取兜 null/undefined） */
    const text = computed(() =>
      props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue),
    )
    /** 字段绑定提示：displayField / idField / returnFields（设计器核对配置用） */
    const bindings = computed(() => {
      const out: string[] = []
      if (props.displayField) out.push(`显示 ${props.displayField}`)
      if (props.idField) out.push(`id ${props.idField}`)
      for (const [source, target] of Object.entries(props.returnFields as Record<string, string>)) {
        out.push(`${source} → ${target}`)
      }
      return out
    })
    const searchColumns = computed(() => props.searchColumns as string[])

    const clear = () => {
      emit('update:modelValue', null)
      emit('clear')
    }

    return () =>
      h('div', { class: 'lc-lookup' }, [
        h('div', { class: 'lc-lookup__field' }, [
          h(ElInput, {
            modelValue: text.value,
            readonly: true,
            placeholder: props.placeholder,
            clearable: text.value !== '',
            onClear: clear,
          }),
          h(ElButton, { onClick: () => (visible.value = true) }, () => '选择'),
        ]),
        bindings.value.length
          ? h(
              'div',
              { class: 'lc-lookup__meta' },
              bindings.value.map((b) => h(ElTag, { size: 'small' }, () => b)),
            )
          : null,
        h(
          ElDialog,
          {
            modelValue: visible.value,
            'onUpdate:modelValue': (v: boolean) => (visible.value = v),
            title: '选择记录',
            width: '520px',
            appendToBody: true,
          },
          {
            default: () => [
              h(ElInput, {
                modelValue: keyword.value,
                'onUpdate:modelValue': (v: string) => (keyword.value = v),
                placeholder: searchColumns.value.length
                  ? `搜索 ${searchColumns.value.join('、')}`
                  : '搜索',
                clearable: true,
              }),
              h(ElScrollbar, { class: 'lc-lookup__body', maxHeight: '320px' }, () => [
                h('div', { class: 'lc-lookup__empty' }, '预览态：结果由数据源返回（出码产物按 refId 取数）'),
              ]),
            ],
            footer: () => [
              h(ElButton, { onClick: () => (visible.value = false) }, () => '取消'),
            ],
          },
        ),
      ])
  },
})
