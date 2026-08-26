<template>
  <div class="form-renderer" v-loading="loading">
    <form-create
      v-if="renderSchema && renderSchema.length > 0"
      :rule="renderSchema"
      :option="renderOption"
      v-model="formData"
    />
    <el-empty v-else-if="!loading" description="暂无表单" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import formCreate, { type Rule } from '@form-create/element-ui'
import { formApi, type FormDataDTO } from '@/api/form'
import { createDsBindingEngine } from './DsBindingEngine'
import { createActionBus } from './DsActionBus'
import type { DsLink } from './DsActionBus'
import { dataSourceApi } from '@/api/data-source'
import { normalizeForRender } from '../schemaRules'
import type { DataSourceBindingContext } from '@/components/business/types'
import { activeDsBindings } from '@/utils/formDsBindingsStore'

const props = defineProps<{
  /** 表单定义 ID，传入后通过 API 加载 schema。与 rule 互斥，formDefId 优先。 */
  formDefId?: string
  /** 直接传入 form-create rule 数组，无需 API 调用。用于 CRUD 页面。 */
  rule?: Rule[]
  /** form-create option（布局配置如 labelPosition/labelWidth，来自设计器 schema.option）。与 rule 搭配使用。 */
  option?: Record<string, any>
  /** 预填表单数据，变化时自动同步到 formData。 */
  initialValues?: Record<string, unknown>
  /** 上游映射数据（跨表单只读预填）：先铺底，本表单数据（initialValues/loadData）优先覆盖。 */
  mappedData?: Record<string, unknown>
  processInstanceId?: string
  taskId?: string
  fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
  /** 是否只读模式。true 时所有字段 disabled，用于已办详情等查看场景。 */
  readonly?: boolean
  /** data-linkage action chain config (optional) */
  links?: DsLink[]
  /** record locator: return current record id */
  recordId?: () => string | undefined
  /** notify record context change (tree click / route param) */
  notifyRecordChange?: () => void
  /**
   * 表单级数据源绑定（可选）。rule 直传场景由调用方提供；
   * formDefId 场景自动从 schema.dataSources 加载，无需传入。
   */
  dataSources?: DataSourceBindingContext[]
}>()

const emit = defineEmits<{
  (e: 'loaded', formData: Record<string, any>): void
  (e: 'submitted', formDataId: string): void
}>()

const loading = ref(false)
const resolvedSchema = ref<Rule[]>([])
const formData = ref<Record<string, unknown>>({})
const existingFormDataId = ref<string | null>(null)
const formVersion = ref<number | null>(null)

/** 从 schema 加载的表单级数据源绑定（formDefId 场景） */
const schemaDataSources = ref<DataSourceBindingContext[]>([])

/** 注入给数据组件的绑定上下文：prop 直传优先，其次 schema 加载结果 */
const dsBindings = computed<DataSourceBindingContext[]>(
  () => props.dataSources ?? schemaDataSources.value,
)

/** 写入模块级存储，供 form-create 内部渲染的 LookupPicker / DataPicker 读取 */
watch(dsBindings, (val) => { activeDsBindings.value = val }, { immediate: true })

/** 渲染用 schema：将 formContainer 规范化为 fcRow 供 form-create 运行时渲染 */
const renderSchema = computed(() => normalizeForRender(resolvedSchema.value))

/** 渲染选项：始终隐藏提交/重置按钮（提交由调用方控制），form 级配置来自设计器 option（labelPosition 等） */
const renderOption = ref<Record<string, any>>({
  submitBtn: false,
  resetBtn: false,
  form: {},
})

/** 应用设计器 option.form 的布局配置（剔除设计器内部字段） */
function applyOption(option: Record<string, any> | undefined | null) {
  if (!option) return
  const form = { ...(option.form || {}) }
  delete form.formCreateFormName
  renderOption.value = {
    submitBtn: false,
    resetBtn: false,
    form,
  }
}

onMounted(async () => {
  if (props.option) {
    applyOption(props.option)
  }
  if (props.formDefId) {
    await loadSchema()
  } else if (props.rule) {
    resolvedSchema.value = props.rule
  }
  if (props.initialValues) {
    formData.value = { ...props.initialValues }
  }
  if (props.processInstanceId) {
    await loadData()
  }
  if (props.mappedData) {
    // mappedData 先铺底、本表单数据（initialValues/loadData）后覆盖
    formData.value = { ...props.mappedData, ...formData.value }
  }
  if (props.readonly) {
    // form-create 的 rule 用 props.disabled 控制字段禁用。
    // 注意：schema 可能为 fcRow 栅格布局嵌套结构（fcRow → col → input/select），
    // 必须递归到子字段，否则只有容器被禁用、真实字段仍可编辑。
    resolvedSchema.value = resolvedSchema.value.map(deepDisable)
  }
  if (props.fieldPermissions) {
    applyPermissions(props.fieldPermissions)
  }
  mountDsBinding()
})

// 监听 initialValues 变化，同步到 formData
watch(() => props.initialValues, (newVal) => {
  if (newVal) {
    formData.value = { ...newVal }
  }
})

// 监听 rule 变化：父组件可能先挂载（rule 为空）再异步加载 schema（如页面渲染器详情/新增/编辑弹窗），
// 必须响应式同步，否则 resolvedSchema 停留在空数组导致"暂无表单"
watch(() => props.rule, (newVal) => {
  if (!Array.isArray(newVal) || newVal.length === 0) return
  resolvedSchema.value = newVal
  if (props.readonly) {
    resolvedSchema.value = resolvedSchema.value.map(deepDisable)
  }
  if (props.fieldPermissions) {
    applyPermissions(props.fieldPermissions)
  }
  mountDsBinding()
})

async function loadSchema() {
  if (!props.formDefId) return
  loading.value = true
  try {
    const res = await formApi.getFormDefinition(props.formDefId)
    const formDef = res.data
    if (!formDef.schema || formDef.schema === '[]') {
      ElMessage.warning('表单 schema 为空')
      return
    }
    const schema = JSON.parse(formDef.schema)
    const rules = Array.isArray(schema) ? schema : (schema.rule || [])
    resolvedSchema.value = rules
    // 恢复表单级数据源绑定（供 LookupPicker/dataPicker 按 dataSourceId 解析）
    if (!Array.isArray(schema) && Array.isArray(schema.dataSources)) {
      schemaDataSources.value = schema.dataSources
    }
    // 合并设计器 option（labelPosition 等布局配置）
    if (!Array.isArray(schema) && schema.option) {
      applyOption(schema.option)
    }
    formVersion.value = formDef.version
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
  }
}

async function loadData() {
  if (!props.processInstanceId || !props.formDefId) return
  try {
    // 1. 优先按 taskId 查审批快照（已办详情场景）
    if (props.taskId) {
      const snapRes = await formApi.getFormDataByTask(props.taskId)
      if (snapRes.data) {
        existingFormDataId.value = snapRes.data.id
        try {
          formData.value = JSON.parse(snapRes.data.dataJson || '{}')
        } catch {
          formData.value = {}
        }
        emit('loaded', formData.value)
        return
      }
    }
    // 2. 查当前数据（节点间传递场景）
    const res = await formApi.getFormData(props.processInstanceId, props.formDefId)
    if (res.data) {
      const formDataDto = res.data as FormDataDTO
      existingFormDataId.value = formDataDto.id
      try {
        formData.value = JSON.parse(formDataDto.dataJson || '{}')
      } catch {
        formData.value = {}
      }
      emit('loaded', formData.value)
    }
  } catch {
    // http 拦截器已弹出错误消息
  }
}

/**
 * 递归设置 rule 树中所有字段的 disabled（含 fcRow/col 布局 children、group/subForm 的 props.rule、
 * tableForm 的 props.columns[].rule 子表内部字段），保证 readonly 下子表内部字段也不可编辑。
 */
function deepDisable(field: Rule): Rule {
  // 字符串子节点（text/button 文字内容）原样透传，避免 {...'文字'} 展开为字符索引对象
  if (typeof field !== 'object' || field === null) return field
  const f = field as Record<string, unknown>
  const fieldProps = (f.props as Record<string, any>) || {}
  const next: Record<string, unknown> = { ...f, props: { ...fieldProps, disabled: true } as Record<string, unknown> }
  if (Array.isArray(f.children)) {
    next.children = (f.children as Rule[]).map(deepDisable)
  }
  // group/subForm 子表单：内部字段在 props.rule
  if (Array.isArray(fieldProps.rule)) {
    const p = next.props as Record<string, unknown>
    next.props = { ...p, rule: (fieldProps.rule as Rule[]).map(deepDisable) }
  }
  // tableForm 子表：内部字段在 props.columns[].rule（每列一个 rule 数组）
  if (Array.isArray(fieldProps.columns)) {
    const p = next.props as Record<string, unknown>
    next.props = {
      ...p,
      columns: (fieldProps.columns as Record<string, any>[]).map((col) => {
        if (col && Array.isArray(col.rule)) {
          return { ...col, rule: (col.rule as Rule[]).map(deepDisable) }
        }
        return col
      }),
    }
  }
  return next as Rule
}

function applyPermissions(permissions: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>) {
  // HIDDEN 字段直接移除（不渲染、不提交）；VIEW 字段设置 props.disabled 只读（递归到子字段）
  resolvedSchema.value = resolvedSchema.value
    .filter(field => {
      const fieldName = (field as Record<string, unknown>).field as string | undefined
      if (!fieldName) return true
      return permissions[fieldName] !== 'HIDDEN'
    })
    .map(field => {
      const fieldName = (field as Record<string, unknown>).field as string | undefined
      if (!fieldName) return field
      if (permissions[fieldName] !== 'VIEW') return field

      return deepDisable(field)
    })
}

async function submit(): Promise<boolean> {
  try {
    // 提交前强制完成未决的数据源写入，保证数据一致
    await bindingEngine.value?.flush()
    const dataJson = JSON.stringify(formData.value)
    const formDefId = props.formDefId ?? ''
    // 保存当前数据（upsert，用于节点间传递）
    const res = await formApi.saveFormData({
      formDefId,
      processInstanceId: props.processInstanceId,
      taskId: props.taskId,
      dataJson,
    })
    existingFormDataId.value = res.data.id
    emit('submitted', res.data.id)
    return true
  } catch {
    return false
  }
}

function getFormData(): Record<string, unknown> {
  return formData.value
}

/** form-create 实例 API（校验等），通过全局注入获取 */
const formCreateApi = ref<{ validate: () => Promise<boolean> } | null>(null)
onMounted(() => {
  // 组件被 stub / install 未执行时 inject 不存在，跳过注入（validate 退化为跳过校验）
  const injectFn = (formCreate as any).inject
  if (typeof injectFn === 'function') {
    injectFn((api: any) => {
      formCreateApi.value = api
    })
  }
})

/** 数据源绑定引擎实例（含容器时挂载，无容器为 null） */
const bindingEngine = ref<ReturnType<typeof createDsBindingEngine> | null>(null)
/** 联动动作总线实例 */
const actionBus = ref<ReturnType<typeof createActionBus> | null>(null)
/** 字段值变化回调（引擎注入，由 formData watch 触发） */
let fieldChangeCb: ((field: string) => void) | null = null

// 感知表单字段值变化 → 引擎写路径（仅当引擎挂载时）
watch(formData, (val, oldVal) => {
  if (!fieldChangeCb) return
  const old = (oldVal || {}) as Record<string, unknown>
  for (const key of Object.keys(val)) {
    if (val[key] !== old[key]) {
      fieldChangeCb(key)
      return
    }
  }
}, { deep: true })

/** 挂载容器数据源绑定引擎与联动总线（无容器时 no-op） */
function mountDsBinding() {
  if (!resolvedSchema.value.length) return
  // 联动总线：执行 reload-record 动作（重载当前记录回显）
  const bus = createActionBus(async (op, _target) => {
    if (op === 'reload-record') {
      const id = props.recordId?.()
      if (id) await bindingEngine.value?.loadRecord(id)
    }
  })
  if (props.links) bus.register(props.links)
  actionBus.value = bus
  // 绑定引擎：读（recordId 定位）写（字段变化防抖）
  const engine = createDsBindingEngine(
    { dsApi: dataSourceApi },
    {
      api: {
        getValue: (field) => (formData.value as Record<string, unknown>)[field],
        setValue: (field, value) => { formData.value = { ...formData.value, [field]: value } },
      },
      recordId: () => props.recordId?.(),
      onRecordChange: () => {
        // 记录上下文变化：由调用方经 reloadRecord() 显式驱动（引擎不自动订阅）
      },
      onFieldChange: (cb) => {
        // 通过 formData 深度 watch 感知字段值变化（不依赖 form-create 实例事件，stub 环境也可靠）
        fieldChangeCb = cb
      },
      onConflict: (msg) => { ElMessage.warning(msg) },
    },
  )
  if (engine.mount(resolvedSchema.value)) {
    bindingEngine.value = engine
  } else {
    bindingEngine.value = null
    actionBus.value = null
  }
}

/** 重新加载当前记录回显容器（记录上下文变化时由调用方触发） */
async function reloadRecord(): Promise<void> {
  const id = props.recordId?.()
  if (!id) return
  await bindingEngine.value?.loadRecord(id)
  props.notifyRecordChange?.()
}

/** 校验表单：通过返回 true；未注入 api 时跳过校验返回 true */
async function validate(): Promise<boolean> {
  if (!formCreateApi.value) return true
  try {
    return (await formCreateApi.value.validate()) !== false
  } catch {
    return false
  }
}

/**
 * 保存审批快照（冻结当前表单数据，供历史查看）。
 * 与 submit 不同：submit 保存可变的当前数据，saveSnapshot 创建不可变的历史记录。
 */
async function saveSnapshot(): Promise<boolean> {
  try {
    const dataJson = JSON.stringify(formData.value)
    const formDefId = props.formDefId ?? ''
    await formApi.saveSnapshot({
      formDefId,
      processInstanceId: props.processInstanceId,
      taskId: props.taskId,
      dataJson,
    })
    return true
  } catch {
    return false
  }
}

defineExpose({ submit, saveSnapshot, getFormData, validate, loadSchema, loadData, reloadRecord })
</script>

<style scoped>
.form-renderer {
  min-height: 200px;
}
</style>
