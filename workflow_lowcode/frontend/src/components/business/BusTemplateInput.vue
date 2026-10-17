<template>
  <ExpressionEditor
    mode="bare"
    :model-value="modelValue"
    :placeholder="placeholder"
    :custom-source="templateSource"
    @update:model-value="emit('update:modelValue', String($event))"
  />
</template>

<script setup lang="ts">
import ExpressionEditor from '@/components/expression/ExpressionEditor.vue'
import { makeBusTemplateSource } from './busTemplateCompletion'

/**
 * 动作总线步骤值输入：单行表达式框，键入 { 即补当前触发器可用的模板变量。
 * 值语义是 PageRendererPage.resolveStepValue 的点路径模板（非 JS），根名写错只会静默取空。
 */
const props = defineProps<{
  modelValue?: string
  /** 候选模板（busTemplateVars 按触发器算出），变化即时生效 */
  vars: string[]
  placeholder?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const templateSource = makeBusTemplateSource(() => props.vars)
</script>
