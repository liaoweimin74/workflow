<template>
  <div
    class="formula-field"
    :class="{ 'is-disabled': disabled, 'is-error': !!error, 'is-empty': !display }"
    :title="error || undefined"
  >
    <span v-if="prefix" class="formula-field__affix">{{ prefix }}</span>
    <span class="formula-field__value">{{ display }}</span>
    <span v-if="suffix" class="formula-field__affix">{{ suffix }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * 计算公式组件（Task 144）——表单设计器 / 页面设计器「基础组件」分组。
 *
 * 机制：
 * - 跨字段取值：form-create 渲染自定义组件时自动注入 formCreateInject prop
 *   （含当前表单实例 api，见 @form-create/core injectProp），通过
 *   api.getValue(field) 响应式读取被引用字段值（依赖精准追踪，任一依赖变化自动重算）
 * - 表达式语法：${field} 引用 + 四则运算 + MIN/MAX/SUM/AVG/ROUND/ABS/FLOOR/CEIL，
 *   求值器见 formulaEval.ts（安全实现，非 eval）
 * - 值语义：计算结果（number）回写自身字段，随表单提交存储；依赖缺失/NaN → null 不提交脏值
 * - 列映射：DECIMAL(18, precision)（见 ColumnConfigDialog / ColumnTypeMapper）
 *
 * 限制（第一版）：仅支持引用同层（顶层）字段，子表单内部字段引用后续扩展。
 */
import { computed, watchEffect } from 'vue'
import { parseFormula, FormulaParseError } from './formulaEval'

const props = withDefaults(defineProps<{
  /** 自身字段值（计算结果经 emit 回写，组件只读不消费） */
  modelValue?: number | null
  /** 计算表达式，如 `${price} * ${count}` */
  expression?: string
  /** 小数位数（展示与回写均按此精度舍入） */
  precision?: number
  /** 前缀（如 ¥） */
  prefix?: string
  /** 后缀（如 元） */
  suffix?: string
  /** 依赖缺失时的占位符 */
  placeholder?: string
  /** 禁用（视觉态；公式本身恒只读） */
  disabled?: boolean
  /** form-create 注入：含当前表单 api（getValue/setValue/formData 等） */
  formCreateInject?: { api?: { getValue?: (field: string) => unknown } }
}>(), {
  modelValue: null,
  expression: '',
  precision: 2,
  prefix: '',
  suffix: '',
  placeholder: '—',
  disabled: false,
  formCreateInject: undefined,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void
  (e: 'change', value: number | null): void
}>()

/** 表达式解析（props.expression 响应式，改动即重解析） */
const parsed = computed<{ formula: ReturnType<typeof parseFormula> | null; error: string }>(() => {
  try {
    return { formula: parseFormula(props.expression || ''), error: '' }
  } catch (e) {
    return { formula: null, error: e instanceof FormulaParseError ? e.message : String(e) }
  }
})

const error = computed(() => parsed.value.error)

/** 计算结果：逐依赖 getValue 精准建立响应式依赖 */
const result = computed<number>(() => {
  const formula = parsed.value.formula
  const api = props.formCreateInject?.api
  if (!formula || !api?.getValue) return NaN
  const values: Record<string, unknown> = {}
  for (const dep of formula.deps) {
    values[dep] = api.getValue(dep)
  }
  return formula.evaluate(values)
})

/** 结果回写自身字段（提交时随表单存储）；NaN → null 不提交脏值 */
watchEffect(() => {
  const v = result.value
  const out = Number.isFinite(v) ? round(v, props.precision) : null
  if (out !== props.modelValue) {
    emit('update:modelValue', out)
    emit('change', out)
  }
})

const display = computed(() => {
  if (error.value) return '表达式错误'
  if (!parsed.value.formula) return '请配置表达式'
  const v = result.value
  if (!Number.isFinite(v)) return props.placeholder
  return format(v, props.precision)
})

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
</script>

<style scoped>
.formula-field {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  box-sizing: border-box;
  min-height: 32px;
  padding: 0 11px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
}
.formula-field.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.formula-field.is-error .formula-field__value {
  color: var(--el-color-danger);
}
.formula-field.is-empty .formula-field__value {
  color: var(--el-text-color-placeholder);
}
.formula-field__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  color: var(--el-text-color-primary);
}
.formula-field__affix {
  flex-shrink: 0;
  color: var(--el-text-color-regular);
}
</style>
