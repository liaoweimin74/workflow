<template>
  <ExpressionEditor
    v-if="kind === 'script'"
    class="chain-param--script"
    :model-value="modelValue ?? ''"
    mode="bare"
    lang="groovy"
    multiline
    :rows="2"
    :max-rows="6"
    placeholder="JS 脚本；上下文 row / ds / actions / params，$row.字段 会先替换成字面值"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <el-select
    v-else-if="options.length > 0"
    :model-value="modelValue ?? ''"
    :placeholder="placeholder"
    clearable
    :style="{ width }"
    @update:model-value="(v: string) => emit('update:modelValue', v ?? '')"
  >
    <el-option v-for="opt in options" :key="opt" :label="opt" :value="opt" />
  </el-select>
  <el-input
    v-else
    :model-value="modelValue"
    :placeholder="placeholder"
    :style="{ width }"
    @input="(v: string) => emit('update:modelValue', v)"
  />
</template>

<script setup lang="ts">
import ExpressionEditor from '@/components/expression/ExpressionEditor.vue'
import type { ChainParamKind } from '@/types/pageActionCatalog'

// 动作链参数值输入：控件形态由 pageActionCatalog 的 paramKinds/paramOptions 决定，避免三个面板各写一套分支
withDefaults(
  defineProps<{
    modelValue: string
    kind?: ChainParamKind
    /** 枚举候选（非空时渲染下拉） */
    options?: string[]
    placeholder?: string
    /** free 形态的输入框宽度（沿用各面板原有内联尺寸） */
    width?: string
  }>(),
  {
    kind: 'free',
    options: () => [],
    placeholder: '',
    width: '200px',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()
</script>

<style scoped>
/* 参数行为 flex 行：脚本形态占满剩余宽度，让代码区有可读的横向空间 */
.chain-param--script {
  flex: 1 1 100%;
  min-width: 260px;
}
</style>
