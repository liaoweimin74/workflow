<template>
  <div class="style-script-input">
    <div class="script-editor-shell" :class="{ 'is-multiline': multiline }">
      <el-input v-model="value" :type="multiline ? 'textarea' : 'text'" :rows="multiline ? rows : undefined" :placeholder="placeholder" />
      <el-button class="script-edit-button" :icon="Edit" aria-label="打开样式脚本编辑器" @click="dialogVisible = true" />
    </div>
    <StyleScriptDialog v-model="dialogVisible" :title="title" :scope="scope" :script="value" @confirm="value = $event" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Edit } from '@element-plus/icons-vue'
import StyleScriptDialog from './StyleScriptDialog.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  title: string
  scope: string
  rows?: number
  multiline?: boolean
  placeholder?: string
}>(), { rows: 3, multiline: true, placeholder: '请输入 CSS 属性声明' })
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()
const value = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) })
const dialogVisible = ref(false)
</script>

<style scoped>
.style-script-input { width: 100%; min-width: 0; }
.script-editor-shell { display: flex; align-items: flex-start; width: 100%; gap: 4px; }
.script-editor-shell :deep(.el-input) { flex: 1 1 auto; width: 100%; min-width: 0; }
.script-edit-button { flex: 0 0 32px; width: 32px; height: 32px; margin-top: 1px; }
.script-editor-shell.is-multiline .script-edit-button { margin-top: 1px; }
</style>
