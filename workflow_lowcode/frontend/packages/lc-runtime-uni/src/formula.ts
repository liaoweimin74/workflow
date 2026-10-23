/**
 * @lc/runtime-uni/formula：FormulaField 的 uniapp 对位组件（Task 4.3）。
 *
 * web 侧 FormulaField 是 form-create 全局组件（formCreateInject.api.getValue 逐依赖
 * 建立响应式依赖 + watchEffect 回写自身字段）；uniapp 产物没有 form-create 实例，
 * 后端换成 props.form（同层字段对象，页级是页面 model、嵌套时是行/子对象——出码
 * emit 按 vmodel 去末段接线），回写经 update:modelValue（v-model 语义不变）。
 * 求值/舍入/展示语义与 web FormulaField.vue 逐条对位：空表达式 → 请配置表达式、
 * 解析错误 → 表达式错误、依赖缺失/NaN → placeholder 并回写 null（不提交脏值）、
 * 展示 = 千分位 + 固定小数位。
 * 用 defineComponent + h 渲染（包内无 SFC，uni 宿主与 node 测试两态都可加载）；
 * 'view'/'text' 是 uni 内置标签，由宿主工程的 uni 插件编译，包只产出 vnode。
 */
import { computed, defineComponent, h, watchEffect, type PropType, type VNode } from 'vue'

import { parseFormula, FormulaParseError, type Formula } from './formula-eval'

function round(v: number, p: number): number {
  const f = Math.pow(10, Math.max(0, Math.trunc(p)))
  return Math.round(v * f) / f
}

/** 千分位 + 固定小数位 */
function format(v: number, p: number): string {
  const s = v.toFixed(Math.max(0, Math.trunc(p)))
  const [int, dec] = s.split('.')
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? `${intFmt}.${dec}` : intFmt
}

export const LcFormula = defineComponent({
  name: 'LcFormula',
  props: {
    /** 同层字段后端（响应式对象）：依赖从这里读，语义对位 web 的 formCreateInject */
    form: { type: Object as PropType<Record<string, unknown>>, required: true },
    /** 计算表达式，如 `${price} * ${count}` */
    expression: { type: String, default: '' },
    /** 小数位数（展示与回写均按此精度舍入） */
    precision: { type: Number, default: 2 },
    prefix: { type: String, default: '' },
    suffix: { type: String, default: '' },
    /** 依赖缺失时的占位符 */
    placeholder: { type: String, default: '—' },
    /** 禁用（视觉态；公式本身恒只读） */
    disabled: { type: Boolean, default: false },
    /** 自身字段值（计算结果经 emit 回写，组件只读不消费） */
    modelValue: { type: Number as PropType<number | null>, default: null },
  },
  emits: {
    'update:modelValue': (_value: number | null) => true,
    change: (_value: number | null) => true,
  },
  setup(props, { emit }) {
    /** 表达式解析（props.expression 响应式，改动即重解析） */
    const parsed = computed<{ formula: Formula | null; error: string }>(() => {
      // 空表达式 → 空态（中性提示），不算解析错误；新插入组件不应直接红字报警
      const src = (props.expression || '').trim()
      if (!src) return { formula: null, error: '' }
      try {
        return { formula: parseFormula(src), error: '' }
      } catch (e) {
        return { formula: null, error: e instanceof FormulaParseError ? e.message : String(e) }
      }
    })

    /** 计算结果：逐依赖读 form 精准建立响应式依赖 */
    const result = computed<number>(() => {
      const formula = parsed.value.formula
      if (!formula) return NaN
      const values: Record<string, unknown> = {}
      for (const dep of formula.deps) {
        values[dep] = props.form[dep]
      }
      return formula.evaluate(values)
    })

    /** 结果回写自身字段（v-model 落表单）；NaN → null 不提交脏值 */
    watchEffect(() => {
      const v = result.value
      const out = Number.isFinite(v) ? round(v, props.precision) : null
      if (out !== props.modelValue) {
        emit('update:modelValue', out)
        emit('change', out)
      }
    })

    const display = computed(() => {
      if (parsed.value.error) return '表达式错误'
      if (!parsed.value.formula) return '请配置表达式'
      const v = result.value
      if (!Number.isFinite(v)) return props.placeholder
      return format(v, props.precision)
    })

    return (): VNode[] => [
      h('view', {
        class: ['lc-formula', { 'is-disabled': props.disabled, 'is-error': !!parsed.value.error, 'is-empty': !display.value }],
      }, [
        props.prefix ? h('text', { class: 'lc-formula__affix' }, props.prefix) : null,
        h('text', { class: 'lc-formula__value' }, display.value),
        props.suffix ? h('text', { class: 'lc-formula__affix' }, props.suffix) : null,
      ]),
    ]
  },
})
