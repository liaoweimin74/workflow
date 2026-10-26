<script setup lang="ts">
/**
 * 移动端表单块（page-form → 模板 form）：@form-create/vant 渲染与桌面同一份业务表单 rule
 * （批 B 摸底结论=form-create 3.2+ 官方 Vant4 支持，内置字段类型直通 van-field/picker 等）。
 *
 * 协议对齐桌面 PageDataForm（行为单源，渲染器分端）：
 * - formKey 优先，缺省回退数据源 metadata.formKey；无 schema 时按列定义构建基础表单；
 * - 选项数据源解析复用 vendor 同一函数（resolveOptionRules）；
 * - create=提交调 createData；edit=getData 回填 + updateData（version 乐观锁）；
 * - expose load/reload/setValue/setValues/submit/getValues 供动作总线联动（桌面同款面）；
 * - EP-only 自定义字段组件经 rewriteFieldTypesForMobile 换占位（validate 剥离不锁死提交）。
 * API 错误由 http 拦截器统一 toast，组件内不重复弹。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { showToast } from 'vant'
import formCreateMobile from '@form-create/vant'

import { dataSourceApi } from '@/api/data-source'
import { formApi } from '@/api/form'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { hasOptionDatasource, resolveOptionRules } from '@/vendor/option-datasource'
import { withArrayLabels } from '@/views/form/arrayValueLabel'
import type { DataSourceBindingContext } from '@/components/business/types'
import { rewriteFieldTypesForMobile } from '../fieldTemplates'
import MobileFieldPlaceholder from './MobileFieldPlaceholder.vue'

// 模块级注册（幂等）：字段占位组件挂到 vant 实例的组件表
formCreateMobile.component('mobile-field-placeholder', MobileFieldPlaceholder)
const FormCreateMobile = formCreateMobile.$form()

const props = withDefaults(
  defineProps<{
    /** 页面 key（上下文一致性；预留动作脚本 api 透传用） */
    pageKey?: string
    /** 页面内数据源绑定 id（dsRefId 缺省时经 activeDsBindings 解析） */
    dataSourceId?: string
    /** 全局数据源 refId（宿主 prepare 注入，优先级最高） */
    dsRefId?: string
    /** 表单定义 key（缺省时回退数据源 metadata.formKey） */
    formKey?: string
    /** create=新增；edit=编辑（recordId 必填；运行时经 load(id) 动态指定同 edit 化） */
    mode?: 'create' | 'edit'
    recordId?: string
    /** 设计态标记：画布内渲染预览但不出提交按钮 */
    designMode?: boolean
    submitText?: string
    title?: string
    [key: string]: any
  }>(),
  { mode: 'create', designMode: false, submitText: '提交' },
)

const emit = defineEmits<{ (e: 'saved', record: Record<string, any>): void }>()

const resolvedRefId = computed(() => {
  if (props.dsRefId) return props.dsRefId
  if (props.dataSourceId) {
    const binding = activeDsBindings.value.find((b: DataSourceBindingContext) => b.id === props.dataSourceId)
    if (binding?.refId) return binding.refId
  }
  return ''
})

const loading = ref(false)
const saving = ref(false)
const schemaRule = ref<Record<string, any>[]>([])
const formDataSources = ref<DataSourceBindingContext[]>([])
const metaColumns = ref<any[]>([])
const metaFormKey = ref('')
let schemaLoadedKey = ''

async function loadFormSchema(key: string) {
  if (!key) {
    schemaRule.value = []
    formDataSources.value = []
    return
  }
  try {
    const res = await formApi.getFormDefinitionByKey(key)
    const raw = (res.data as any)?.schema
    const schema = JSON.parse(raw || '[]')
    const rules = Array.isArray(schema) ? schema : (schema.rule || [])
    formDataSources.value = !Array.isArray(schema) && Array.isArray(schema.dataSources) ? schema.dataSources : []
    schemaRule.value = hasOptionDatasource(rules)
      ? await resolveOptionRules(rules, formDataSources.value)
      : rules
  } catch {
    schemaRule.value = []
    formDataSources.value = []
  }
}

async function loadMetadata() {
  try {
    const res = await dataSourceApi.getMetadata(resolvedRefId.value)
    metaFormKey.value = (res.data as any)?.formKey || ''
    metaColumns.value = (res.data as any)?.columns || []
  } catch {
    metaFormKey.value = ''
    metaColumns.value = []
  }
}

async function ensureForm() {
  if (!resolvedRefId.value) return
  if (props.formKey) {
    const key = `p:${props.formKey}`
    if (schemaLoadedKey === key) return
    schemaLoadedKey = key
    loading.value = true
    try {
      await loadFormSchema(props.formKey)
    } finally {
      loading.value = false
    }
    return
  }
  if (schemaLoadedKey.startsWith('m:')) return
  loading.value = true
  try {
    await loadMetadata()
    schemaLoadedKey = `m:${metaFormKey.value}`
    if (metaFormKey.value) await loadFormSchema(metaFormKey.value)
  } finally {
    loading.value = false
  }
}

/** 数值/日期列型 → 基础组件映射（对齐 PageDataForm.inputTypeOf） */
function inputTypeOf(columnType?: string): string {
  if (['INT', 'INTEGER', 'BIGINT', 'TINYINT', 'DECIMAL'].includes(columnType || '')) return 'inputNumber'
  if (columnType === 'DATETIME' || columnType === 'DATE') return 'datePicker'
  return 'input'
}

/** 表单规则：业务表单 schema 优先，回退列映射；字段级移动改写（EP-only 组件换占位）后注入回填值 */
const formRules = computed<Record<string, any>[]>(() => {
  const base =
    schemaRule.value.length > 0
      ? schemaRule.value
      : metaColumns.value.map((c: any) => ({
          type: inputTypeOf(c.columnType),
          field: c.key,
          title: c.label || c.key,
          props: c.columnType === 'DECIMAL' ? { precision: c.scale || 2 } : {},
          validate: c.required ? [{ required: true, message: `${c.label || c.key}不能为空` }] : [],
        }))
  const rewritten = rewriteFieldTypesForMobile(base) as Record<string, any>[]
  const values = initialValues.value
  return rewritten.map((r) =>
    r.field && values[r.field] !== undefined ? { ...r, value: values[r.field] } : r,
  )
})

// ==================== 记录加载（edit 回填） ====================
const fcApi = ref<any>(null)
const initialValues = ref<Record<string, any>>({})
const internalRecordId = ref('')
const currentVersion = ref<number | undefined>(undefined)
/** 换记录递增重建实例（对齐桌面 renderKey：回填值走 rule.value，避免依赖外部 v-model 传播） */
const renderKey = ref(0)

const activeRecordId = computed(() => {
  if (props.mode === 'edit' && props.recordId) return String(props.recordId)
  return internalRecordId.value
})

async function fetchRecord(recordId: string) {
  if (!resolvedRefId.value) return
  const res: any = await dataSourceApi.getData(resolvedRefId.value, String(recordId))
  const vo: any = res?.data || {}
  const data = vo?.data || {}
  currentVersion.value = typeof vo?.version === 'number' ? vo.version : undefined
  const next: Record<string, any> = { ...data, id: vo?.id ?? recordId }
  if (currentVersion.value !== undefined) next.version = currentVersion.value
  initialValues.value = next
  internalRecordId.value = String(recordId)
  renderKey.value++
}

async function load(recordId?: string | number) {
  if (recordId !== undefined && recordId !== null && `${recordId}` !== '') {
    internalRecordId.value = String(recordId)
  }
  await ensureForm()
  if (!activeRecordId.value) return
  loading.value = true
  try {
    await fetchRecord(activeRecordId.value)
  } catch {
    // http 拦截器已提示
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

watch(resolvedRefId, () => {
  schemaRule.value = []
  formDataSources.value = []
  metaColumns.value = []
  metaFormKey.value = ''
  initialValues.value = {}
  currentVersion.value = undefined
  schemaLoadedKey = ''
  renderKey.value++
  void load()
})

watch(
  () => props.recordId,
  (val) => {
    if (props.mode === 'edit' && val) void load()
  },
)

// ==================== 提交 ====================
const rendererOption = {
  submitBtn: { show: false },
  resetBtn: { show: false },
}

async function handleSubmit() {
  if (props.designMode || saving.value) return
  if (!fcApi.value || !resolvedRefId.value) return
  try {
    await fcApi.value.validate()
  } catch {
    return
  }
  const raw: Record<string, any> = fcApi.value.formData() || {}
  const payload = withArrayLabels(raw, formRules.value)
  saving.value = true
  try {
    if (activeRecordId.value) {
      await dataSourceApi.updateData(resolvedRefId.value, String(activeRecordId.value), payload, currentVersion.value)
      showToast('更新成功')
      emit('saved', { ...payload, id: activeRecordId.value })
    } else {
      const res: any = await dataSourceApi.createData(resolvedRefId.value, payload)
      showToast('提交成功')
      const newId = res?.data
      emit('saved', { ...payload, ...(newId !== undefined && newId !== null ? { id: newId } : {}) })
    }
  } catch {
    // API 错误由 http 拦截器统一 toast
  } finally {
    saving.value = false
  }
}

defineExpose({
  load,
  reload: () => load(),
  setValue: (field: string, value: unknown) => fcApi.value?.setValue({ [field]: value }),
  setValues: (partial: Record<string, unknown>) => fcApi.value?.setValue(partial),
  submit: () => handleSubmit(),
  getValues: () => (fcApi.value ? { ...fcApi.value.formData() } : { ...initialValues.value }),
})
</script>

<template>
  <div class="mobile-data-form">
    <div v-if="title" class="m-form__title">{{ title }}</div>

    <div v-if="!resolvedRefId" class="m-form__empty">请在属性面板配置数据源</div>

    <template v-else>
      <component
        :is="FormCreateMobile"
        :key="renderKey"
        :rule="formRules"
        :option="rendererOption"
        @created="(api: any) => (fcApi = api)"
      />
      <div v-if="!designMode" class="m-form__footer">
        <van-button type="primary" block :loading="saving" @click="handleSubmit">{{ submitText }}</van-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mobile-data-form {
  min-height: 120px;
}
.m-form__title {
  padding: 12px 16px 4px;
  font-size: 15px;
  font-weight: 600;
  color: #323233;
}
.m-form__empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: #969799;
}
.m-form__footer {
  padding: 12px;
}
</style>
