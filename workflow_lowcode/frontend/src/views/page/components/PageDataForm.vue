<template>
  <!-- PAGE 轨「写闭环」数据录入/编辑页（Task 3-f）：按 formKey 表单定义渲染 FormRenderer，提交走数据源 CRUD API（与 PageDataTable 行内编辑同款 API 层）。
       数据来源：dsRefId（PageRendererPage.transformComponent 注入）优先，其次按 dataSourceId 从 activeDsBindings 解析全局 refId。
       行为：create=提交调 createData；edit=按 recordId 取单条回填、提交调 updateData（version 乐观锁透传）；
       expose load(recordId) 供外部联动（动作链/关联容器把行 id 投给表单）；
       API 错误由 http 拦截器统一 toast，组件内不重复弹。 -->
  <div class="page-data-form">
    <div v-if="title" class="page-data-form-title">{{ title }}</div>

    <el-empty v-if="!resolvedRefId" description="请在属性面板配置数据源" />

    <template v-else>
      <div v-loading="loading" class="page-data-form-body">
        <FormRenderer
          v-if="formRules.length > 0"
          :key="renderKey"
          ref="formRef"
          :rule="formRules"
          :option="rendererOption"
          :initial-values="initialValues"
          :data-sources="formDataSources"
        />
        <el-empty v-else-if="!loading" description="暂无表单定义" />
      </div>

      <div class="page-data-form-footer">
        <el-button
          type="primary"
          class="page-data-form-submit"
          :loading="saving"
          :disabled="designMode"
          @click="handleSubmit"
        >{{ submitText }}</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { dataSourceApi } from '@/api/data-source'
import { formApi } from '@/api/form'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { resolveOptionRules, hasOptionDatasource } from '@/vendor/option-datasource'
import { withArrayLabels } from '@/views/form/arrayValueLabel'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import type { DataSourceBindingContext } from '@/components/business/types'

const props = withDefaults(defineProps<{
  /** 页面 key（上下文一致性；预留动作脚本 api 透传用） */
  pageKey: string
  /** 页面内数据源绑定 id（schema.dataSources[].id；dsRefId 缺省时经 activeDsBindings 解析全局 refId） */
  dataSourceId?: string
  /** 全局数据源 refId（由 PageRendererPage.transformComponent 注入，优先级最高） */
  dsRefId?: string
  /** 表单定义 key（缺省时回退数据源 metadata.formKey，与 PageDataTable 编辑弹窗同源） */
  formKey?: string
  /** 表单模式：create=新增（提交调创建 API）；edit=编辑（recordId 必填，提交调更新 API） */
  mode?: 'create' | 'edit'
  /** 编辑模式记录 id（mode=edit 必填；运行时也可经 expose load(recordId) 动态指定） */
  recordId?: string
  /** 设计态标记：画布内渲染预览但禁用提交（不产生写操作） */
  designMode?: boolean
  /** 提交按钮文案（默认「提交」） */
  submitText?: string
  /** 标题（缺省不渲染标题行） */
  title?: string
  /** 附加属性（容器透传兼容） */
  [key: string]: any
}>(), {
  mode: 'create',
  designMode: false,
  submitText: '提交',
})

const emit = defineEmits<{
  (e: 'saved', record: Record<string, any>): void
}>()

// ==================== 数据源 refId 解析（对齐 PageDataTable/PageDataCards） ====================
/** 优先 props.dsRefId（运行态注入），其次按页面内 dataSourceId 查全局绑定 store，均无则未绑定 */
const resolvedRefId = computed(() => {
  if (props.dsRefId) return props.dsRefId
  if (props.dataSourceId) {
    const binding = activeDsBindings.value.find((b: DataSourceBindingContext) => b.id === props.dataSourceId)
    if (binding?.refId) return binding.refId
  }
  return ''
})

// ==================== 表单定义加载 ====================
const loading = ref(false)
const saving = ref(false)
/** 业务表单 schema rule（props.formKey 或 metadata.formKey 加载 + 选项数据源解析） */
const schemaRule = ref<Record<string, any>[]>([])
/** 表单级数据源绑定（schema.dataSources：表单内 id → 全局 refId） */
const formDataSources = ref<DataSourceBindingContext[]>([])
/** 数据源列定义（metadata 回退：无 formKey 的 SYSTEM/API 数据源按列映射构建基础表单） */
const metaColumns = ref<any[]>([])
const metaFormKey = ref('')
/** 已加载标记（key 前缀区分来源：p:=props.formKey，m:=metadata.formKey；refId 变化时重置） */
let schemaLoadedKey = ''

/** 加载表单定义（对齐 PageDataCards.loadFormSchema：schema.rule / 数组两种形态 + 选项数据源解析） */
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

/** 元数据加载（仅 props.formKey 缺省时：取 metadata.formKey / 列定义做表单回退） */
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

/** 确保表单定义就绪（幂等；refId/formKey 变化经 schemaLoadedKey 重置/区分） */
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

/** 数值/日期列型 → 基础组件映射（对齐 useDataSourceCrud.buildFormRule） */
function inputTypeOf(columnType?: string): string {
  if (columnType === 'INT' || columnType === 'INTEGER' || columnType === 'BIGINT' || columnType === 'TINYINT' || columnType === 'DECIMAL') return 'inputNumber'
  if (columnType === 'DATETIME' || columnType === 'DATE') return 'datePicker'
  return 'input'
}

/** 表单规则：业务表单 schema 优先；无 schema 时回退列映射（SYSTEM/API 数据源） */
const formRules = computed<Record<string, any>[]>(() => {
  if (schemaRule.value.length > 0) return schemaRule.value
  return metaColumns.value.map((c: any) => ({
    type: inputTypeOf(c.columnType),
    field: c.key,
    title: c.label || c.key,
    props: c.columnType === 'DECIMAL' ? { precision: c.scale || 2 } : {},
    validate: c.required ? [{ required: true, message: `${c.label || c.key}不能为空` }] : [],
  }))
})

// ==================== 记录加载（edit 模式回填） ====================
const formRef = ref<InstanceType<typeof FormRenderer>>()
/** 回填值（单条记录 data + id/version，与 PageDataTable 行结构一致） */
const initialValues = ref<Record<string, any>>({})
/** 当前生效记录 id：mode=edit 取 props.recordId；create 模式经 load(id) 外部指定后同样生效（edit 化） */
const internalRecordId = ref('')
/** 当前记录 version（乐观锁，提交时透传 updateData） */
const currentVersion = ref<number | undefined>(undefined)
/** 每次换记录递增，强制重建 FormRenderer（对齐 PageDataTable detailFormKey 模式） */
const renderKey = ref(0)

const activeRecordId = computed(() => {
  if (props.mode === 'edit' && props.recordId) return String(props.recordId)
  return internalRecordId.value
})

/** 取单条记录并回填（失败静默：http 拦截器已提示） */
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

/**
 * 外部联动入口：load(recordId) 加载指定记录并切换为编辑态；
 * load() 无参 = 按当前上下文重载（create 重载表单定义 / edit 重新回填当前记录）。
 */
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

// 数据源换绑：重置表单定义/回填并重载（设计态配置数据源后立即生效；运行态绑定晚到时补发恰一次）
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

// edit 模式 recordId 变化（路由参数/容器联动）：重新取单条回填
watch(() => props.recordId, (val) => {
  if (props.mode === 'edit' && val) void load()
})

// ==================== 提交 ====================
const rendererOption = { labelWidth: '100px', submitBtn: { show: false }, resetBtn: { show: false } }

async function handleSubmit() {
  if (props.designMode || saving.value) return
  if (!formRef.value || !resolvedRefId.value) return
  let ok = true
  try {
    ok = (await formRef.value.validate()) !== false
  } catch {
    ok = false
  }
  if (!ok) return
  // getFormData 内部已按解析后 schema 附 <key>_text；此处按本组件 rules 再补一层（对齐 PageDataCards.saveLocalForm 双保险）
  const raw = formRef.value.getFormData() || {}
  const payload = withArrayLabels(raw as Record<string, unknown>, formRules.value)
  saving.value = true
  try {
    if (activeRecordId.value) {
      // 编辑：数据源更新 API（version 乐观锁，与 PageDataTable 行内编辑 cfg.updateApi 同款）
      await dataSourceApi.updateData(resolvedRefId.value, String(activeRecordId.value), payload, currentVersion.value)
      ElMessage.success('更新成功')
      emit('saved', { ...payload, id: activeRecordId.value })
    } else {
      // 新增：数据源创建 API（cfg.createApi 同款），新 id 回填到 saved 事件载荷
      const res: any = await dataSourceApi.createData(resolvedRefId.value, payload)
      ElMessage.success('提交成功')
      const newId = res?.data
      emit('saved', { ...payload, ...(newId !== undefined && newId !== null ? { id: newId } : {}) })
    }
  } catch {
    // API 错误由 http 拦截器统一 toast，此处不重复弹
  } finally {
    saving.value = false
  }
}

defineExpose({
  /** 外部联动：load(recordId) 加载记录并切换编辑态；load() 无参按当前上下文重载 */
  load,
  /** 同 load()（语义别名，供动作链 refresh 场景） */
  reload: () => load(),
})
</script>

<style scoped>
.page-data-form {
  width: 100%;
  min-width: 0;
}
.page-data-form-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}
.page-data-form-body {
  min-height: 120px;
}
.page-data-form-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  margin-top: 16px;
}
</style>
