<template>
  <div class="json-items-editor">
    <el-input
      v-model="text"
      type="textarea"
      :rows="rows"
      :placeholder="placeholder"
      @blur="emitValue"
    />
    <div v-if="errorText" class="json-items-error">{{ errorText }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * JsonItemsEditor — 属性面板通用 JSON 数组编辑器（form-create 控件）。
 *
 * 用途：无 vendor rule 的页面组件（page-notice-carousel/page-timeline/page-steps/
 * page-calendar/page-detail 等）在 setComponentRuleConfig 注入的 props 表单里，
 * 以 textarea 编辑数组型 props（items/columns/highlightedDates…）。
 * modelValue 为数组（或 undefined）；文本合法 JSON 数组时失焦回写，非法则提示并保留旧值。
 * 全局注册名 'JsonItemsEditor'（main.ts FcDesigner.component，面板 form-create 实例可解析）。
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = withDefaults(
  defineProps<{
    modelValue?: any
    rows?: number
    placeholder?: string
  }>(),
  {
    modelValue: undefined,
    rows: 6,
    placeholder: '[{"title":"标题","description":"说明"}]',
  },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: any): void }>()

const text = ref('')
const errorText = ref('')

watch(
  () => props.modelValue,
  (v) => {
    text.value = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2)
    errorText.value = ''
  },
  { immediate: true },
)

function emitValue() {
  const raw = text.value.trim()
  errorText.value = ''
  if (!raw) {
    emit('update:modelValue', undefined)
    return
  }
  try {
    const parsed = JSON.parse(raw)
    emit('update:modelValue', parsed)
  } catch {
    errorText.value = 'JSON 格式有误，未保存本次修改'
    ElMessage.warning('JSON 格式有误，未保存本次修改')
  }
}
</script>

<style scoped>
.json-items-editor {
  width: 100%;
}
.json-items-error {
  color: var(--el-color-danger, #f56c6c);
  font-size: 12px;
  line-height: 1.4;
  margin-top: 2px;
}
</style>
