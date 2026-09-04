<template>
  <div class="style-rule-table">
    <el-table v-if="rules.length" :data="rules" border size="small">
      <el-table-column label="条件表达式" width="calc((100% - 56px) / 3)">
        <template #header><span>条件表达式</span><el-tooltip :content="helpText"><el-icon class="help-icon"><QuestionFilled /></el-icon></el-tooltip></template>
        <template #default="{ row, $index }"><el-input :model-value="row.when" placeholder="$row.status === '异常'" @input="(value: string) => patch($index, { when: value })" /></template>
      </el-table-column>
      <el-table-column label="样式脚本" width="calc((100% - 56px) / 3)">
        <template #default="{ row, $index }"><StyleScriptInput :model-value="row.css" title="编辑条件命中样式脚本" :scope="scopeLabel" :rows="1" :multiline="false" @update:model-value="(value: string) => patch($index, { css: value })" /></template>
      </el-table-column>
      <el-table-column label="CSS Class" width="calc((100% - 56px) / 3)">
        <template #default="{ row, $index }"><el-input :model-value="row.className" placeholder="多个 class 用空格分隔" @input="(value: string) => patch($index, { className: value })" /></template>
      </el-table-column>
      <el-table-column label="操作" width="56" align="center"><template #default="{ $index }"><el-button link type="danger" :icon="Delete" aria-label="删除条件样式" title="删除" @click="remove($index)" /></template></el-table-column>
    </el-table>
    <div v-else class="empty-rule">暂无条件样式</div>
    <el-button type="primary" plain size="small" @click="add">+ 添加条件样式</el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Delete, QuestionFilled } from '@element-plus/icons-vue'
import type { StyleRule } from '@/utils/fieldStyle'
import StyleScriptInput from './StyleScriptInput.vue'

const props = defineProps<{ modelValue: StyleRule[]; scope: 'card' | 'field' }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: StyleRule[]): void }>()
const rules = computed(() => props.modelValue)
const scopeLabel = computed(() => props.scope === 'card' ? '整张卡片' : '当前字段')
const helpText = computed(() => props.scope === 'card'
  ? '请输入 JavaScript 条件表达式。可用变量：$row、row。示例：$row.status === \'异常\''
  : '请输入 JavaScript 条件表达式。可用变量：$value、$row、row。示例：$value === \'异常\'')
function add() { emit('update:modelValue', [...rules.value, { enabled: true, when: '', css: '', className: '' }]) }
function remove(index: number) { emit('update:modelValue', rules.value.filter((_, i) => i !== index)) }
function patch(index: number, value: Partial<StyleRule>) {
  emit('update:modelValue', rules.value.map((rule, i) => i === index ? { ...rule, ...value } : rule))
}
</script>

<style scoped>
.help-icon { margin-left: 4px; color: var(--el-color-info); cursor: help; vertical-align: middle; }
.empty-rule { margin-bottom: 10px; color: #909399; font-size: 13px; }
.style-rule-table :deep(.el-table__cell) { vertical-align: top; }
.style-rule-table { position: static !important; display: block; width: 100%; min-width: 0; flex: 0 0 auto; align-self: stretch; transform: none; }
.style-rule-table :deep(.el-table) { position: static !important; display: block; width: 100%; max-width: 100%; flex: none; transform: none; }
.style-rule-table :deep(.el-table .cell) { overflow: visible; }
</style>
