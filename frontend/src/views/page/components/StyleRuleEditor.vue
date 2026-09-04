<template>
  <div class="style-rule-editor">
    <div v-if="rules.length === 0" class="empty-rule">暂无条件样式</div>
    <div v-for="(rule, index) in rules" :key="index" class="rule-card">
      <div class="rule-toolbar">
        <el-switch :model-value="rule.enabled" inline-prompt active-text="启用" inactive-text="停用" @change="(value: boolean) => patch(index, { enabled: value })" />
        <el-button link type="danger" @click="remove(index)">删除</el-button>
      </div>
      <el-form label-position="top" size="small">
        <el-form-item>
          <template #label>
            <span>条件表达式</span>
            <el-tooltip :content="helpText" placement="top">
              <el-icon class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </template>
          <el-input :model-value="rule.when" placeholder="$row.status === '异常'" @input="(value: string) => patch(index, { when: value })" />
        </el-form-item>
        <el-form-item label="命中样式">
          <button type="button" class="script-summary" @click="openScript(index)">{{ summarize(rule.css) }}</button>
        </el-form-item>
        <el-form-item label="CSS 类名">
          <el-input :model-value="rule.className" placeholder="可填写多个 class，以空格分隔" @input="(value: string) => patch(index, { className: value })" />
        </el-form-item>
      </el-form>
    </div>
    <el-button type="primary" plain size="small" @click="add">+ 添加条件样式</el-button>
    <StyleScriptDialog v-model="scriptVisible" title="编辑条件命中样式脚本" :scope="scopeLabel" :script="editingScript" @confirm="saveScript" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { StyleRule } from '@/utils/fieldStyle'
import StyleScriptDialog from './StyleScriptDialog.vue'

const props = defineProps<{ modelValue: StyleRule[]; scope: 'card' | 'field' }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: StyleRule[]): void }>()
const rules = computed(() => props.modelValue)
const scriptVisible = ref(false)
const editingIndex = ref(-1)
const editingScript = ref('')
const scopeLabel = computed(() => props.scope === 'card' ? '整张卡片' : '当前字段')
const helpText = computed(() => props.scope === 'card'
  ? '请输入 JavaScript 条件表达式。可用变量：$row、row。示例：$row.status === \'异常\''
  : '请输入 JavaScript 条件表达式。可用变量：$value、$row、row。示例：$value === \'异常\'')

function patch(index: number, value: Partial<StyleRule>) {
  emit('update:modelValue', rules.value.map((rule, i) => i === index ? { ...rule, ...value } : rule))
}
function add() { emit('update:modelValue', [...rules.value, { enabled: true, when: '', css: '', className: '' }]) }
function remove(index: number) { emit('update:modelValue', rules.value.filter((_, i) => i !== index)) }
function summarize(css: string) {
  if (!css?.trim()) return '未设置样式脚本（点击编辑）'
  const lines = css.trim().split('\n').slice(0, 3)
  return `${lines.join(' ')}${css.trim().split('\n').length > 3 ? ' …' : ''}`
}
function openScript(index: number) { editingIndex.value = index; editingScript.value = rules.value[index]?.css || ''; scriptVisible.value = true }
function saveScript(script: string) { if (editingIndex.value >= 0) patch(editingIndex.value, { css: script }) }
</script>

<style scoped>
.rule-card { margin-bottom: 12px; padding: 12px; border: 1px solid var(--el-border-color-light); border-radius: 6px; }
.rule-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.empty-rule { margin-bottom: 10px; color: #909399; font-size: 13px; }
.help-icon { margin-left: 4px; color: var(--el-color-info); cursor: help; vertical-align: middle; }
.script-summary { width: 100%; padding: 8px 10px; overflow: hidden; border: 1px dashed var(--el-border-color); border-radius: 4px; background: var(--el-fill-color-blank); color: var(--el-text-color-secondary); text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
</style>
