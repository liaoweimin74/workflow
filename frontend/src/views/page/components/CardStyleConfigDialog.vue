<template>
  <el-dialog v-model="visible" title="卡片样式配置" width="720px" :close-on-click-modal="false" destroy-on-close>
    <el-form label-position="top">
      <el-form-item label="预制样式">
        <el-select v-model="theme" style="width: 100%" @change="applyTheme">
          <el-option v-for="option in themeOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="始终生效样式">
        <button type="button" class="script-summary" @click="baseScriptVisible = true">{{ summarize(base.css) }}</button>
        <el-input v-model="base.className" class="base-class-input" placeholder="CSS 类名，可填写多个并以空格分隔" />
      </el-form-item>
      <el-form-item>
        <template #label>条件样式</template>
        <StyleRuleEditor v-model="rules" scope="card" />
      </el-form-item>
    </el-form>
    <StyleScriptDialog v-model="baseScriptVisible" title="编辑始终生效样式脚本" scope="整张卡片" :script="base.css" @confirm="base.css = $event" />
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { CardStyle, CardTheme } from '@/components/business/ListCards.types'
import type { StyleRule } from '@/utils/fieldStyle'
import { CARD_THEMES } from '@/components/business/ListCards.themes'
import { themeToCssScript } from '@/components/business/ListCards.styles'
import StyleRuleEditor from './StyleRuleEditor.vue'
import StyleScriptDialog from './StyleScriptDialog.vue'

const props = defineProps<{ modelValue: boolean; cardStyle?: CardStyle }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'confirm', value: CardStyle): void }>()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const themeOptions: Array<{ value: CardTheme; label: string }> = [
  { value: 'default', label: '默认 · 标准网格卡片' },
  { value: 'compact', label: '紧凑 · 小号间距精简' },
  { value: 'loose', label: '宽松 · 大间距舒适留白' },
  { value: 'dark', label: '深色 · 暗色主题' },
  { value: 'borderless', label: '无边框 · 极简透明' },
  { value: 'techBlue', label: '蓝色科技 · 霓虹科技风格' },
  { value: 'techBlue', label: '蓝色科技 · 霓虹科技风格' },
]
const theme = ref<CardTheme>('default')
const base = reactive<StyleRule>({ enabled: true, when: '', css: '' })
const rules = ref<StyleRule[]>([])
const baseScriptVisible = ref(false)

function initForm() {
  const source = props.cardStyle || {}
  theme.value = source.theme || source.baseTheme || 'default'
  base.enabled = source.base?.enabled ?? true
  base.when = ''
  base.css = source.base?.css || source.css || themeToCssScript(CARD_THEMES[theme.value])
  rules.value = (source.rules || []).map(rule => ({ ...rule }))
}
watch(() => props.modelValue, open => { if (open) initForm() })
initForm()

function applyTheme(value: CardTheme) {
  theme.value = value
  base.css = themeToCssScript(CARD_THEMES[value])
}
function summarize(css: string) {
  if (!css?.trim()) return '未设置样式脚本（点击编辑）'
  const lines = css.trim().split('\n')
  return `${lines.slice(0, 3).join(' ')}${lines.length > 3 ? ' …' : ''}`
}
function handleConfirm() {
  if (rules.value.some(rule => !rule.when?.trim())) return
  if (rules.value.some(rule => !rule.css?.trim())) return
  emit('confirm', { theme: theme.value, base: { ...base }, rules: rules.value.map(rule => ({ ...rule })) })
  visible.value = false
}
</script>

<style scoped>
.script-summary { width: 100%; min-height: 44px; padding: 8px 10px; overflow: hidden; border: 1px dashed var(--el-border-color); border-radius: 4px; background: var(--el-fill-color-blank); color: var(--el-text-color-secondary); text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
</style>
