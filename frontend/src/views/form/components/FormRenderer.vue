<template>
  <div class="form-renderer" v-loading="loading">
    <form-create
      v-if="renderSchema && renderSchema.length > 0"
      :rule="renderSchema"
      :option="renderOption"
      v-model="formData"
    />
    <el-empty v-else-if="!loading" description="暂无表单" />

    <!-- 表格-容器联动：dialog 模式容器弹窗（open-container 动作打开） -->
    <el-dialog
      v-for="c in dialogPopContainers"
      :key="c.key"
      v-model="c.visible"
      :title="c.title"
      :width="c.width"
      :close-on-click-modal="false"
      class="fc-container-dialog"
    >
      <div class="fc-dialog-body" :style="{ height: c.height }">
          <form-create v-if="c.visible" :rule="containerRenderRule(c)" :option="containerOption(c)" v-model="c.formData" />
      </div>
      <!-- 只读（查看）：仅显示关闭按钮；非只读：容器按钮（互斥独立 v-if，避免 v-else-if 编译问题） -->
      <template #footer v-if="c.readonly">
        <el-button type="primary" @click="c.visible = false">关闭</el-button>
      </template>
      <template #footer v-if="!c.readonly && hasContainerButtons(c)">
        <ContainerButtons :container="c" @action="containerAction(c, $event)" @custom="containerCustomAction(c, $event)" />
      </template>
    </el-dialog>
    <!-- 表格-容器联动：drawer 模式容器抽屉（open-container 动作打开） -->
    <el-drawer
      v-for="c in drawerOnlyContainers"
      :key="c.key"
      v-model="c.visible"
      :title="c.title"
      :size="c.width"
      destroy-on-close
    >
      <div class="fc-dialog-body" :style="{ height: c.height }">
          <form-create v-if="c.visible" :rule="containerRenderRule(c)" :option="containerOption(c)" v-model="c.formData" />
      </div>
      <template #footer v-if="c.readonly">
        <el-button type="primary" @click="c.visible = false">关闭</el-button>
      </template>
      <template #footer v-if="!c.readonly && hasContainerButtons(c)">
        <ContainerButtons :container="c" @action="containerAction(c, $event)" @custom="containerCustomAction(c, $event)" />
      </template>
    </el-drawer>

    <!-- 表格-容器联动：inline 模式容器页内区域（点击显示、可关闭、有按钮；与弹窗同机制，仅渲染位置不同） -->
    <div
      v-for="c in inlineContainers"
      :key="c.key"
      v-show="c.visible"
      class="fc-inline-container"
      :class="{ 'fc-inline-open': c.visible }"
    >
      <div class="fc-inline-header">
        <span class="fc-inline-title">{{ c.title }}</span>
        <!-- 页内关闭入口：始终显示（不受 showCancelButton 控制），满足“关闭时隐藏内嵌页面” -->
        <el-button class="btn-cancel" text @click="containerAction(c, 'cancel')">关闭</el-button>
      </div>
      <div class="fc-inline-body" :style="{ height: c.height }">
          <form-create v-if="c.visible" :rule="containerRenderRule(c)" :option="containerOption(c)" v-model="c.formData" />
      </div>
      <div v-if="c.readonly" class="container-buttons fc-inline-footer">
        <el-button type="primary" @click="containerAction(c, 'cancel')">关闭</el-button>
      </div>
      <div v-if="!c.readonly && hasContainerButtons(c)" class="container-buttons fc-inline-footer">
        <ContainerButtons :container="c" @action="containerAction(c, $event)" @custom="containerCustomAction(c, $event)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed, provide, nextTick } from 'vue'
import { measureFormLabelWidth } from './formLabelWidth'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import formCreate, { type Rule } from '@form-create/element-ui'
import { formApi, type FormDataDTO } from '@/api/form'
import { createDsBindingEngine } from './DsBindingEngine'
import { createActionBus } from './DsActionBus'
import type { DsLink } from './DsActionBus'
import { dataSourceApi } from '@/api/data-source'
import { normalizeForRender, deepDisableRules, deepDisableField } from '../schemaRules'
import type { DataSourceBindingContext } from '@/components/business/types'
import { setActiveDsBindings } from '@/utils/formDsBindingsStore'
import PageDataTable from '@/views/page/components/PageDataTable.vue'
import PageDataCards from '@/views/page/components/PageDataCards.vue'
import { resolveOptionRules, hasOptionDatasource } from '@/vendor/option-datasource'
import { normalizeEchoData, withArrayLabels } from '@/views/form/arrayValueLabel'
import { useLinkageContainer, type LinkageContainer } from '../composables/useLinkageContainer'
import ContainerButtons from './ContainerButtons.vue'

// 注册数据表格组件到 form-create（表单内嵌 page-table 支持）
formCreate.component('page-table', PageDataTable)
formCreate.component('page-list-cards', PageDataCards)

/** 表单级动作链类型（对齐 DataSourceConfigPanel Action：trigger/source/steps） */
interface FormActionStep {
  op: string
  target: string
  field?: string
  value?: string
  displayMode?: string
  recordId?: string
}
interface FormAction {
  trigger: string
  source?: string
  steps: FormActionStep[]
}

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
  /** 表格-容器联动动作链（schema.actions，trigger/source/steps 结构） */
  actions?: FormAction[]
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
  (e: 'open-new-tab', containerKey: string, recordId: string): void
}>()

const loading = ref(false)
const resolvedSchema = ref<Rule[]>([])
const formData = ref<Record<string, unknown>>({})
const existingFormDataId = ref<string | null>(null)
const formVersion = ref<number | null>(null)

/** 路由 query（newTab 落地页用；测试环境无 router 时为 undefined） */
const routeQuery = (() => {
  try {
    return useRoute()?.query as Record<string, any> | undefined
  } catch {
    return undefined
  }
})()

/** router 实例（query 落地处理后清理参数用；测试环境无 router 时为 undefined） */
const routerRef = (() => {
  try {
    return useRouter()
  } catch {
    return undefined
  }
})()

/** newTab 落地处理标记（仅首次 schema 加载时处理 query.container） */
let queryHandled = false

/** 从 schema 加载的表单级数据源绑定（formDefId 场景） */
const schemaDataSources = ref<DataSourceBindingContext[]>([])

/** 表单级动作链（schema.actions，表格-容器联动用） */
const schemaActions = ref<FormAction[]>([])

/** 生效动作链：props.actions 优先，其次 schema.actions */
const effectiveActions = computed<FormAction[]>(() => props.actions ?? schemaActions.value)

/** 数据表格组件配置注册表：dataSourceId → page-table 节点 props（联动容器"以数据表格配置为准"） */
const tableViewConfigs = reactive<Record<string, any>>({})

/** 递归收集 rule 树中 page-table 组件配置（供 resolveContainerStyle 取 viewDetail） */
function collectTableConfigs(rules: any[]) {
  for (const n of rules || []) {
    const node = n as Record<string, any>
    if (node.type === 'page-table' && node.props?.dataSourceId) {
      tableViewConfigs[node.props.dataSourceId] = node.props
    }
    if (Array.isArray(node.children)) collectTableConfigs(node.children as any[])
    if (node.props && Array.isArray(node.props.rule)) collectTableConfigs(node.props.rule as any[])
  }
}

// ==================== 表格-容器联动：共享容器机制 ====================
// 复用 useLinkageContainer（与页面设计器同一套容器机制）：
// 容器提取（从主树移除）、独立引擎挂载、按钮行为、open/load/save/close 动作。
// 显示方式以数据表格配置为准（formMode 映射），仅渲染位置不同（dialog=弹窗 / drawer=抽屉 / inline=页内 / newTab=新页签）。
const {
  containers,
  dialogContainers: dialogOnlyContainers, // dialog+drawer+newTab 容器（模板 el-dialog/el-drawer 渲染；newTab 落地页以弹窗回显）
  inlineContainers,                       // inline 容器（模板页内区域渲染：点击显示、可关闭、有按钮）
  containerModes,
  findContainer,
  extractContainers,
  openContainer,
  loadRecord: loadContainerRecord,
  flushContainer,
  closeContainer,
  containerRefId,
  hasContainerButtons,
  containerAction,
  containerCustomAction,
} = useLinkageContainer({
  dsApi: dataSourceApi,
  dataSources: () => dsBindings.value as any,
  formDataApi: {
    getValue: (c, field) => c.formData[field],
    setValue: (c, field, value) => {
      c.formData = { ...c.formData, [field]: value }
    },
  },
  openNewTab: (c, rid) => emit('open-new-tab', c.key, rid),
  findComponent: (key) => componentRefs.get(key),
  onCustomAction: (c, btn) => ElMessage.info(`自定义按钮：${btn.label}`),
  // 联动容器展示方式/尺寸以数据表格配置为准（formMode 映射 + viewDetail.width/height）
  resolveContainerStyle: (target) => {
    const props = tableViewConfigs[target]
    const detail = props?.viewDetail
    if (!detail) return undefined
    const fm = detail.formMode || 'popup'
    return {
      displayMode: fm === 'popup' ? 'dialog' : fm === 'drawer' ? 'drawer' : 'inline',
      width: detail.width || '800px',
      height: detail.height || '600px',
    }
  },
})

/** dialog 容器拆分：弹窗（dialog/newTab）与抽屉（drawer）分别渲染，避免 template 多根 + 插槽 v-if 的编译限制 */
const dialogPopContainers = computed(() => dialogOnlyContainers.value.filter((c) => c.displayMode !== 'drawer'))
const drawerOnlyContainers = computed(() => dialogOnlyContainers.value.filter((c) => c.displayMode === 'drawer'))

/** 弹窗内 form-create 选项（隐藏提交按钮，表单级布局） */
const dialogOption = computed<Record<string, any>>(() => ({
  submitBtn: { show: false },
  resetBtn: { show: false },
  form: { ...(renderOption.value.form || {}) },
}))

/** 抽屉/嵌入式容器也使用按字段标题计算的标签宽度，避免回退到 form-create 默认 125px。 */
function containerOption(container: { renderRule?: any[] }) {
  return {
    ...dialogOption.value,
    form: {
      ...(dialogOption.value.form || {}),
      labelWidth: `${measureFormLabelWidth(container.renderRule || [])}px`,
    },
  }
}


/**
 * 从 rule 树提取联动容器（须在 normalizeForRender 之前调用，此时 type 仍为 formContainer）。
 * dialog / inline / newTab 统一从主树移除，注册为独立容器（独立引擎 + formData），仅渲染位置不同：
 * - dialog：el-dialog 弹窗
 * - inline：页内区域（点击显示、可关闭、有按钮）
 * - newTab：新页签（emit open-new-tab 由父组件打开页签；落地页 query.container 以弹窗回显）
 */
function extractDialogContainers(rules: Rule[]): Rule[] {
  const mainTree = extractContainers(rules)
  // newTab 落地页：query.container=容器标识 时自动打开弹窗（须通过 reactive proxy 写，绕开闭包原始对象陷阱）
  if (!queryHandled && routeQuery?.container) {
    queryHandled = true
    const qc = String(routeQuery.container)
    const qrid = routeQuery.recordId ? String(routeQuery.recordId) : ''
    nextTick(() => {
      const rc = containers.value.find((x) => x.key === qc)
      // 处理后清理 query（避免编辑弹窗重开时重复触发容器弹窗）
      routerRef?.replace({ query: { ...routeQuery, container: undefined, recordId: undefined } })
      if (!rc) return
      rc.visible = true
      if (qrid && rc.engine) {
        rc.currentRecordId = qrid
        void rc.engine.loadRecord(qrid)
      }
    })
  }
  return mainTree
}

/** 注入给数据组件的绑定上下文：prop 直传优先，其次 schema 加载结果 */
const dsBindings = computed<DataSourceBindingContext[]>(
  () => props.dataSources ?? schemaDataSources.value,
)

/** 引擎是否已挂载（防重复挂载） */
let engineMounted = false

/** 数据源绑定是否已就绪（解决首次加载'数据源不存在'双重警告） */
const bindingsReady = ref(false)

/** 写入模块级存储，供 form-create 内部渲染的 LookupPicker / DataPicker 读取 */
watch(dsBindings, (val) => {
  setActiveDsBindings(val)
  // 首次加载：bindings 就绪后挂载引擎（onMounted 已 defer nextTick）
  if (!bindingsReady.value && val.length > 0) {
    bindingsReady.value = true
    nextTick(() => { tryMountEngine() })
  }
}, { immediate: true })

/** 弹窗容器提取后的主渲染树（displayMode=dialog 的 formContainer 已移除） */
const mainSchema = ref<Rule[]>([])

/** 渲染用 schema：将 formContainer 规范化为 fcRow 供 form-create 运行时渲染 */
const renderSchema = computed(() => normalizeForRender(mainSchema.value))

// resolvedSchema 变化 → 同步 mainSchema（提取 dialog 容器到弹窗）+ 收集表格组件配置
watch(resolvedSchema, (val) => {
  collectTableConfigs(val)
  mainSchema.value = extractDialogContainers(val)
}, { immediate: true })

/** 渲染选项：始终隐藏提交/重置按钮（提交由调用方控制），form 级配置来自设计器 option（labelPosition 等） */
const renderOption = ref<Record<string, any>>({
  submitBtn: { show: false },
  resetBtn: { show: false },
  form: {},
})

/** 将当前表单规则的最长标题宽度应用到主表单；主表单 option 也供 drawer/inline 容器继承。 */
function applyDynamicLabelWidth() {
  renderOption.value.form = {
    ...(renderOption.value.form || {}),
    labelWidth: `${measureFormLabelWidth(resolvedSchema.value)}px`,
  }
}

/** 应用设计器 option.form 的布局配置（剔除设计器内部字段） */
function applyOption(option: Record<string, any> | undefined | null) {
  if (!option) return
  const form = { ...(option.form || {}) }
  delete form.formCreateFormName
  renderOption.value = {
    submitBtn: { show: false },
    resetBtn: { show: false },
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
    const resolved = hasOptionDatasource(props.rule)
      ? await resolveOptionRules(props.rule, dsBindings.value)
      : props.rule
    resolvedSchema.value = resolved
  }
  applyDynamicLabelWidth()
  if (props.initialValues) {
    formData.value = { ...props.initialValues }
    // 回显规范化：树形/级联单选数组解包为单值 + 注入叶子兜底（需 formData 就绪）
    normalizeEchoData(resolvedSchema.value, formData.value)
  }
  if (props.processInstanceId) {
    await loadData()
  }
  if (props.mappedData) {
    // mappedData 先铺底、本表单数据（initialValues/loadData）后覆盖
    formData.value = { ...props.mappedData, ...formData.value }
    normalizeEchoData(resolvedSchema.value, formData.value)
  }
  if (props.readonly) {
    // form-create 的 rule 用 props.disabled 控制字段禁用。
    // 注意：schema 可能为 fcRow 栅格布局嵌套结构（fcRow → col → input/select），
    // 必须递归到子字段，否则只有容器被禁用、真实字段仍可编辑。
    resolvedSchema.value = deepDisableRules(resolvedSchema.value)
  }
  if (props.fieldPermissions) {
    applyPermissions(props.fieldPermissions)
  }
  // 引擎挂载延迟到 nextTick，等待 dsBindings watcher 更新 activeDsBindings
  // 首次加载：dsBindings 就绪后由 watcher 调用 tryMountEngine
  // 跳过首次加载：如 rule 直传场景（无 formDefId），bindings 可能已就绪
  nextTick(() => {
    if (dsBindings.value.length > 0) {
      bindingsReady.value = true
      tryMountEngine()
    }
  })
})

// 监听 initialValues 变化，同步到 formData
watch(() => props.initialValues, (newVal) => {
  if (newVal) {
    formData.value = { ...newVal }
    normalizeEchoData(resolvedSchema.value, formData.value)
  }
})

// 监听 rule 变化：父组件可能先挂载（rule 为空）再异步加载 schema（如页面渲染器详情/新增/编辑弹窗），
// 必须响应式同步，否则 resolvedSchema 停留在空数组导致"暂无表单"
watch(() => props.rule, async (newVal) => {
  if (!Array.isArray(newVal) || newVal.length === 0) return
  resolvedSchema.value = hasOptionDatasource(newVal)
    ? await resolveOptionRules(newVal, dsBindings.value)
    : newVal
  if (props.readonly) {
    resolvedSchema.value = deepDisableRules(resolvedSchema.value)
  }
  if (props.fieldPermissions) {
    applyPermissions(props.fieldPermissions)
  }
  tryMountEngine()
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
    // 恢复表单级数据源绑定（供 LookupPicker/dataPicker 及选项数据源按 dataSourceId 解析）
    // 必须在 resolveOptionRules 之前写入 activeDsBindings，否则选项数据源解析时绑定位仍为空，
    // 会把页面内绑定 ID 误当全局 refId 请求导致下拉无数据。
    if (!Array.isArray(schema) && Array.isArray(schema.dataSources)) {
      schemaDataSources.value = schema.dataSources
      setActiveDsBindings(schema.dataSources)
    }
    resolvedSchema.value = hasOptionDatasource(rules)
      ? await resolveOptionRules(rules, dsBindings.value)
      : rules
    // 恢复表单级动作链（表格-容器联动）
    if (!Array.isArray(schema) && Array.isArray(schema.actions)) {
      schemaActions.value = schema.actions
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
          normalizeEchoData(resolvedSchema.value, formData.value)
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
        normalizeEchoData(resolvedSchema.value, formData.value)
      } catch {
        formData.value = {}
      }
      emit('loaded', formData.value)
    }
  } catch {
    // http 拦截器已弹出错误消息
  }
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

      return deepDisableField(field)
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
  // 用解析后选项（resolvedSchema，含异步数据源）为数组组件附加 <key>_text 显示文本，
  // 保证提交时冗余字段取到真实 label/全路径（原始 schema 的选项可能为空）
  return withArrayLabels(formData.value, resolvedSchema.value)
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

/**
 * 尝试挂载容器数据源绑定引擎（幂等：已挂载或未就绪则跳过）。
 * 首次加载须等 activeDsBindings 就绪后由 dsBindings watcher 调用。
 */
function tryMountEngine() {
  if (engineMounted || !resolvedSchema.value.length || !bindingsReady.value) return
  engineMounted = true
  mountDsBinding()
}

/** 挂载容器数据源绑定引擎与联动总线（无容器时 no-op） */
function mountDsBinding() {
  if (!resolvedSchema.value.length) return
  // 联动总线：支持 reload-record 与表格-容器联动动作（open-container/load-record/save-container/close-container）
  const bus = createActionBus(async (op, target, resolved, ctx) => {
    if (op === 'reload-record') {
      const id = props.recordId?.()
      if (id) await bindingEngine.value?.loadRecord(id)
    } else if (op === 'load-record') {
      // 表单场景容器内嵌：按 recordId 加载记录到容器字段（引擎已挂载表单容器）
      const rid = resolved.recordId || String(ctx?.row?.id ?? ctx?.record?.id ?? '')
      if (rid) await bindingEngine.value?.loadRecord(rid)
    } else if (op === 'save-container') {
      await bindingEngine.value?.flush()
    }
    // open-container / close-container：表单容器内嵌，无需弹窗/关闭动作（返回即可）
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

// ==================== 表格-容器联动（pageActionBus provide） ====================

/** 解析步骤 value 模板（{row.id} / {record.id} / 字面量） */
function resolveTemplateValue(tpl: string | undefined, eventData: any): string {
  if (!tpl) return ''
  return tpl.replace(/\{([^}]+)\}/g, (_: string, path: string) => {
    const parts = path.split('.')
    let v: any = eventData
    for (const p of parts) v = v?.[p]
    return v === undefined || v === null ? '' : String(v)
  })
}

/**
 * 派发表格-容器联动触发器（PageDataTable 注入 pageActionBus 后调用）。
 * 匹配表单级动作链（trigger + source），执行步骤；返回是否被消费（表格据此跳过默认行为）。
 */
function dispatchAction(trigger: string, eventData: any): boolean {
  const source = eventData?.source
  let consumed = false
  for (const action of effectiveActions.value) {
    if (action.trigger !== trigger) continue
    if (action.source && action.source !== source) continue
    for (const step of action.steps || []) {
      const op = step.op
      const target = step.target
      if (op === 'open-container') {
        // 容器 displayMode 优先（属性面板配置为准），step.displayMode 为兜底，默认 dialog
        const mode = containerModes.get(target) || step.displayMode || 'dialog'
        // 共享打开逻辑：dialog/inline 统一清空 formData + 显示 + 引擎 loadRecord；
        // newTab 经 openNewTab 回调 emit open-new-tab（仅渲染位置不同）；
        // row-view 触发 → 只读查看（字段禁用、仅关闭按钮）
        const rid = String(eventData?.row?.id ?? eventData?.node?.id ?? '')
        openContainer(target || '', rid, mode as any, trigger === 'row-view')
        consumed = true
      } else if (op === 'load-record') {
        const rid = step.recordId
          ? resolveTemplateValue(step.recordId, eventData)
          : String(eventData?.row?.id ?? eventData?.node?.id ?? '')
        if (rid) {
          // 优先加载到容器引擎（如有匹配），否则加载到主引擎
          loadContainerRecord(target, rid, () => void bindingEngine.value?.loadRecord(rid))
        }
        consumed = true
      } else if (op === 'save-container') {
        // 冲刷容器引擎；无容器时回退主引擎
        flushContainer(target, () => void bindingEngine.value?.flush())
        consumed = true
      } else if (op === 'close-container') {
        closeContainer(target)
        consumed = true
      } else if (op === 'reload-record') {
        const rid = props.recordId?.()
        if (rid) void bindingEngine.value?.loadRecord(rid)
        consumed = true
      }
    }
  }
  return consumed
}

/** 容器渲染规则：只读容器 → 所有字段禁用（deepDisableRules），否则用原始 rule */
function containerRenderRule(c: LinkageContainer): Rule[] {
  return c.readonly ? deepDisableRules(c.renderRule) : c.renderRule
}

/** 组件引用注册表（对齐 PageRendererPage：PageDataTable ready 上报） */
const componentRefs = new Map<string, any>()

/** 供表单内 PageDataTable 注入的动作总线 */
provide('pageActionBus', {
  dispatch: dispatchAction,
  hasLinkedContainer: (dataSourceId?: string) => !!dataSourceId && !!findContainer(dataSourceId),
  openLinkedContainer: (dataSourceId: string, mode: 'create' | 'edit' | 'view', row: any) => {
    const rid = mode === 'create' ? '' : String(row?.id ?? '')
    openContainer(dataSourceId, rid, containerModes.get(dataSourceId), mode === 'view')
  },
  register: (dataSourceId: string, instance: any) => {
    componentRefs.set(dataSourceId, instance)
  },
})

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

/* 容器弹窗内容区：设定高度（dialogHeight），超出滚动 */
.fc-dialog-body {
  overflow-y: auto;
}

/* inline 容器页内区域：默认隐藏，open-container 时显示；带边框与头部 */
.fc-inline-container {
  display: none;
  margin-top: 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  overflow: hidden;
}
.fc-inline-container.fc-inline-open {
  display: block;
}
.fc-inline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-weight: 600;
}
.fc-inline-body {
  overflow-y: auto;
  padding: 16px;
}
.fc-inline-footer {
  padding: 8px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  text-align: right;
}
</style>
