<template>
  <el-dialog
    v-model="visible"
    title="AI 生成表单"
    width="720px"
    :close-on-click-modal="false"
    :append-to-body="true"
  >
    <div class="ai-gen-tip">用自然语言描述表单内容，AI 将生成可继续拖拽编辑的表单字段。</div>
    <el-input
      v-model="description"
      type="textarea"
      :rows="3"
      :disabled="status === 'generating'"
      placeholder="例如：员工请假单：姓名、部门、请假类型、开始日期、结束日期、请假原因"
    />
    <div v-if="errorMsg" class="ai-gen-error">{{ errorMsg }}</div>

    <div v-if="previewJson" class="ai-gen-preview">
      <div class="ai-gen-section-title">生成预览</div>
      <pre class="ai-gen-json">{{ previewJson }}</pre>
    </div>

    <div v-if="fields.length" class="ai-gen-fields">
      <div class="ai-gen-section-title">字段清单（{{ fields.length }}）</div>
      <el-table :data="fields" size="small" border>
        <el-table-column prop="title" label="标题" />
        <el-table-column prop="field" label="字段名" />
        <el-table-column prop="componentType" label="组件类型" />
      </el-table>
    </div>

    <el-alert
      v-for="(warning, index) in warnings"
      :key="index"
      :title="warning"
      type="warning"
      :closable="false"
      show-icon
      class="ai-gen-warning"
    />

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button v-if="status === 'error'" type="warning" @click="handleGenerate">重试</el-button>
      <el-button
        type="primary"
        :loading="status === 'generating'"
        :disabled="status === 'generating'"
        @click="handleGenerate"
      >
        {{ status === 'generating' ? '生成中…' : status === 'done' ? '重新生成' : '生成' }}
      </el-button>
      <el-button type="success" :disabled="status !== 'done'" @click="handleApply">应用到设计器</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { generateForm, type AiFieldInfo } from '@/api/ai'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'apply', rule: unknown[]): void
}>()

const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) })

const description = ref('')
const status = ref<'idle' | 'generating' | 'done' | 'error'>('idle')
const previewText = ref('')
const fields = ref<AiFieldInfo[]>([])
const warnings = ref<string[]>([])
const errorMsg = ref('')
const resultSchema = ref('')

let controller: AbortController | null = null

watch(
  () => props.modelValue,
  (open) => {
    if (open) reset()
  },
)

function reset() {
  controller?.abort()
  controller = null
  description.value = ''
  status.value = 'idle'
  previewText.value = ''
  fields.value = []
  warnings.value = []
  errorMsg.value = ''
  resultSchema.value = ''
}

function handleGenerate() {
  if (!description.value.trim()) {
    ElMessage.warning('请输入表单描述')
    return
  }
  status.value = 'generating'
  previewText.value = ''
  fields.value = []
  warnings.value = []
  errorMsg.value = ''
  resultSchema.value = ''

  controller = generateForm(description.value.trim(), {
    onDelta: (delta) => {
      previewText.value += delta
    },
    onDone: (result) => {
      resultSchema.value = result?.schema ?? ''
      fields.value = result?.fields ?? []
      warnings.value = result?.warnings ?? []
      status.value = 'done'
    },
    onError: (error) => {
      errorMsg.value = error?.msg || '生成失败，请重试'
      status.value = 'error'
    },
  })
}

function handleApply() {
  if (status.value !== 'done') return
  let rule: unknown[] = []
  try {
    const parsed = JSON.parse(resultSchema.value || '{}')
    rule = Array.isArray(parsed) ? parsed : parsed.rule ?? []
  } catch {
    rule = []
  }
  if (!Array.isArray(rule) || rule.length === 0) {
    ElMessage.error('生成结果为空，无法应用')
    return
  }
  emit('apply', rule)
  visible.value = false
}

function close() {
  controller?.abort()
  visible.value = false
}

/** 预览：优先格式化 JSON，无法解析时展示原始文本 */
const previewJson = computed(() => {
  if (!previewText.value) return ''
  try {
    return JSON.stringify(JSON.parse(previewText.value), null, 2)
  } catch {
    return previewText.value
  }
})
</script>

<style scoped>
.ai-gen-tip {
  margin-bottom: 10px;
  color: #606266;
  font-size: 13px;
}
.ai-gen-error {
  margin-top: 10px;
  color: #f56c6c;
  font-size: 13px;
}
.ai-gen-section-title {
  margin: 14px 0 6px;
  font-weight: 600;
  font-size: 13px;
}
.ai-gen-json {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  border: 1px solid #e9edfa;
  border-radius: 6px;
  background: #fafbff;
  font-size: 12px;
  line-height: 1.5;
}
.ai-gen-warning {
  margin-top: 8px;
}
</style>
