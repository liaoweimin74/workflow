<template>
  <el-dialog
    :model-value="visible"
    :title="`新增${formName}`"
    width="640px"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <form-create
      v-if="rules.length > 0"
      :rule="rules"
      :option="renderOption"
      v-model="formData"
    />
    <el-empty v-else-if="loading" description="正在加载表单..." />
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="rules.length === 0" @click="handleSubmit">
        提交
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import formCreate, { type Rule } from '@form-create/element-ui'
import { formApi } from '@/api/form'
import { bizDataApi } from '@/api/bizData'

const props = defineProps<{
  visible: boolean
  /** 目标业务表单 key */
  sourceFormKey: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success', row: Record<string, unknown>): void
}>()

const loading = ref(false)
const submitting = ref(false)
const formName = ref('')
const rules = ref<Rule[]>([])
const formData = ref<Record<string, unknown>>({})

/** 渲染选项：隐藏 form-create 自带按钮（提交由弹窗 footer 控制），布局配置取设计器 option */
const renderOption = ref<Record<string, any>>({
  submitBtn: false,
  resetBtn: false,
  form: {},
})

/** 打开时加载目标表单 schema（解析为 form-create rule） */
async function loadSchema() {
  loading.value = true
  try {
    const res = await formApi.getFormDefinitionByKey(props.sourceFormKey)
    const def = res.data
    formName.value = def.name || ''
    const schema = def.schema
    if (!schema || schema === '[]') {
      rules.value = []
      return
    }
    const parsed = JSON.parse(schema)
    rules.value = Array.isArray(parsed) ? parsed : (parsed.rule || [])
    if (!Array.isArray(parsed) && parsed.option) {
      const form = { ...(parsed.option.form || {}) }
      delete form.formCreateFormName
      renderOption.value = { submitBtn: false, resetBtn: false, form }
    }
    formData.value = {}
  } catch {
    ElMessage.error('目标表单不存在或未发布')
    rules.value = []
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  if (submitting.value) return
  submitting.value = true
  try {
    const row = await bizDataApi.create(props.sourceFormKey, formData.value)
    emit('success', row.data)
    emit('update:visible', false)
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      formData.value = {}
      loadSchema()
    }
  },
  { immediate: true },
)
</script>
