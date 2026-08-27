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
      v-for="c in dialogContainers"
      :key="c.key"
      v-model="c.visible"
      :title="c.title"
      :width="c.width"
      :close-on-click-modal="false"
      class="fc-container-dialog"
      :style="{ '--dialog-max-h': c.height } as any"
    >
      <div class="fc-dialog-body">
        <form-create v-if="c.visible" :rule="c.renderRule" :option="dialogOption" v-model="c.formData" />
      </div>
      <template #footer>
        <div class="container-buttons">
          <el-button v-if="c.buttons.showNew" class="btn-new" @click="containerAction(c, 'new')">新增</el-button>
          <el-button v-if="c.buttons.showCopy" class="btn-copy" @click="containerAction(c, 'copy')">复制</el-button>
          <el-button v-if="c.buttons.showDelete" class="btn-delete" type="danger" @click="containerAction(c, 'delete')">删除</el-button>
          <el-button
            v-for="btn in c.buttons.custom"
            :key="btn.key"
            :type="(btn.type as any) || ''"
            :class="`btn-custom-${btn.key}`"
            @click="containerCustomAction(c, btn)"
          >{{ btn.label }}</el-button>
          <el-button class="btn-cancel" @click="containerAction(c, 'cancel')">取消</el-button>
          <el-button v-if="c.buttons.showConfirm" class="btn-confirm" type="primary" @click="containerAction(c, 'confirm')">确定</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed, provide, markRaw, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import formCreate, { type Rule } from '@form-create/element-ui'
import { formApi, type FormDataDTO } from '@/api/form'
import { createDsBindingEngine } from './DsBindingEngine'
import { createActionBus } from './DsActionBus'
import type { DsLink } from './DsActionBus'
import { dataSourceApi } from '@/api/data-source'
import { normalizeForRender } from '../schemaRules'
import type { DataSourceBindingContext } from '@/components/business/types'
import { setActiveDsBindings } from '@/utils/formDsBindingsStore'
import PageDataTable from '@/views/page/components/PageDataTable.vue'

// 注册数据表格组件到 form-create（表单内嵌 page-table 支持）
formCreate.component('page-table', PageDataTable)

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

/** newTab 落地处理标记（仅首次 schema 加载时处理 query.container） */
let queryHandled = false

/** 从 schema 加载的表单级数据源绑定（formDefId 场景） */
const schemaDataSources = ref<DataSourceBindingContext[]>([])

/** 表单级动作链（schema.actions，表格-容器联动用） */
const schemaActions = ref<FormAction[]>([])

/** 生效动作链：props.actions 优先，其次 schema.actions */
const effectiveActions = computed<FormAction[]>(() => props.actions ?? schemaActions.value)

/** 弹窗模式容器运行时状态（对齐 PageRendererPage LinkageContainer） */
interface DialogContainer {
  /** dataSourceId（联动 target） */
  key: string
  /** 原始 schema 节点（引擎 mount 用） */
  node: Record<string, any>
  /** 标题（tabTitle 或节点 title） */
  title: string
  /** 宽度（dialogWidth） */
  width: string
  /** 高度（dialogHeight，用于 dialog body max-height） */
  height: string
  /** 弹窗可见性 */
  visible: boolean
  /** 容器子 rule（props.rule，弹窗内 form-create 渲染） */
  renderRule: Rule[]
  /** 弹窗独立表单数据（与主 formData 隔离） */
  formData: Record<string, any>
  /** 当前记录 ID（load-record 写入） */
  currentRecordId: string | undefined
  /** 容器数据引擎（独立读写数据源） */
  engine: ReturnType<typeof createDsBindingEngine> | null
  /** 按钮区配置 */
  buttons: {
    showNew: boolean
    showCancel: boolean
    showConfirm: boolean
    showDelete: boolean
    showCopy: boolean
    custom: Array<{ key: string; label: string; type?: string }>
  }
}

/** dialog 模式容器列表 */
const dialogContainers = ref<DialogContainer[]>([])

/** 弹窗内 form-create 选项（隐藏提交按钮，表单级布局） */
const dialogOption = computed<Record<string, any>>(() => ({
  submitBtn: false,
  resetBtn: false,
  form: { ...(renderOption.value.form || {}) },
}))

/**
 * 从 rule 树提取联动容器（须在 normalizeForRender 之前调用，此时 type 仍为 formContainer）。
 * - dialog：从主树移除，创建独立引擎 + formData，弹窗渲染
 * - newTab：从主树移除，open-container 时路由跳转
 * - inline：保留在主树，load-record 时加载数据到主 formData
 */
function extractDialogContainers(rules: Rule[]): Rule[] {
  const dialogs: DialogContainer[] = []
  const walk = (list: Rule[]): Rule[] =>
    list
      .filter((n) => {
        const node = n as Record<string, any>
        if (node.type === 'formContainer' && node.props?.dataSourceId) {
          const mode = (node.props.displayMode as string) || 'dialog'
          if (mode === 'dialog') {
            const props = node.props || {}
            const c: DialogContainer = {
              key: props.dataSourceId,
              node,
              title: props.tabTitle || node.title || '编辑记录',
              width: props.dialogWidth || '800px',
              height: props.dialogHeight || '600px',
              visible: false,
              renderRule: (Array.isArray(props.rule) ? props.rule : []) as Rule[],
              formData: {},
              currentRecordId: undefined,
              engine: null,
              buttons: {
                showNew: props.showNewButton !== false,
                showCancel: props.showCancelButton !== false,
                showConfirm: props.showConfirmButton !== false,
                showDelete: props.showDeleteButton === true,
                showCopy: props.showCopyButton === true,
                custom: Array.isArray(props.customButtons) ? props.customButtons : [],
              },
            }
            mountDialogEngine(c)
            dialogs.push(c)
            return false // 从主树移除
          }
          // newTab：从主树移除（open-container 时路由跳转）
          if (mode === 'newTab') return false
          // inline：保留在主树（load-record 加载到主 formData）
          return true
        }
        return true
      })
      .map((n) => {
        const node = n as Record<string, any>
        if (Array.isArray(node.children)) node.children = walk(node.children as Rule[])
        if (node.props && Array.isArray(node.props.rule)) node.props.rule = walk(node.props.rule as Rule[])
        return n
      })
  const mainTree = walk(rules)
  dialogContainers.value = dialogs
  // newTab 落地页：query.container=容器标识 时自动打开弹窗（须通过 reactive proxy 写，绕开闭包原始对象陷阱）
  if (!queryHandled && routeQuery?.container) {
    queryHandled = true
    const qc = String(routeQuery.container)
    const qrid = routeQuery.recordId ? String(routeQuery.recordId) : ''
    nextTick(() => {
      const rc = dialogContainers.value.find((x) => x.key === qc)
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

/** 为弹窗容器挂载独立数据引擎（与主 formData 隔离）。
 *  注意：c 在赋值 dialogContainers.value 之前传入，是原始对象。
 *  getValue/setValue 必须通过 dialogContainers.value.find() 获取 reactive proxy，
 *  否则写入绕过 Vue 响应式系统，form-create 感知不到数据变化。 */
function mountDialogEngine(c: DialogContainer) {
  const key = c.key
  const engine = createDsBindingEngine(
    { dsApi: dataSourceApi } as any,
    {
      api: {
        getValue: (field: string) => {
          const rc = dialogContainers.value.find((x) => x.key === key)
          return rc?.formData?.[field]
        },
        setValue: (field: string, value: unknown) => {
          const rc = dialogContainers.value.find((x) => x.key === key)
          if (rc) {
            // 新建对象赋值触发 Vue 响应式（非 mutate 原始引用）
            rc.formData = { ...rc.formData, [field]: value }
          }
        },
      },
      recordId: () => {
        const rc = dialogContainers.value.find((x) => x.key === key)
        return rc?.currentRecordId
      },
      onRecordChange: () => { /* load-record 动作显式驱动 */ },
      onFieldChange: () => { /* dialog 内字段变化由容器 formData 驱动 */ },
      onConflict: (msg: string) => ElMessage.warning(msg),
    },
  )
  engine.mount([c.node])
  c.engine = markRaw(engine) as any
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

// resolvedSchema 变化 → 同步 mainSchema（提取 dialog 容器到弹窗）
watch(resolvedSchema, (val) => {
  mainSchema.value = extractDialogContainers(val)
}, { immediate: true })

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
    resolvedSchema.value = rules
    // 恢复表单级数据源绑定（供 LookupPicker/dataPicker 按 dataSourceId 解析）
    if (!Array.isArray(schema) && Array.isArray(schema.dataSources)) {
      schemaDataSources.value = schema.dataSources
    }
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
        const mode = step.displayMode || 'dialog'
        if (mode === 'dialog') {
          const c = dialogContainers.value.find((x) => x.key === target)
          if (c) {
            // 清空旧数据（新对象赋值触发响应式）
            c.formData = {}
            c.currentRecordId = undefined
            c.visible = true
            // 自动加载触发行数据（row-edit/view 时 eventData.row.id 存在）
            const rid = String(eventData?.row?.id ?? eventData?.node?.id ?? '')
            if (rid && c.engine) {
              c.currentRecordId = rid
              void c.engine.loadRecord(rid)
            }
          }
        } else if (mode === 'newTab') {
          // 新开页签：通过事件通知父组件处理路由跳转
          const rid = String(eventData?.row?.id ?? eventData?.node?.id ?? '')
          emit('open-new-tab', target || '', rid)
        }
        // inline：容器常驻主树，open-container 时自动从数据源加载行数据
        if (mode === 'inline') {
          const rid = String(eventData?.row?.id ?? eventData?.node?.id ?? '')
          if (rid && target) {
            // 直接从数据源加载（inline 容器可能绑定不同于主表单的数据源）
            void dataSourceApi.getData(target, rid).then((res) => {
              const fields = (res.data?.data || {}) as Record<string, unknown>
              for (const [k, v] of Object.entries(fields)) {
                formData.value = { ...formData.value, [k]: v }
              }
            }).catch(() => { /* http 拦截器已提示 */ })
          }
        }
        consumed = true
      } else if (op === 'load-record') {
        const rid = step.recordId
          ? resolveTemplateValue(step.recordId, eventData)
          : String(eventData?.row?.id ?? eventData?.node?.id ?? '')
        if (rid) {
          // 优先加载到弹窗容器引擎（如有匹配），否则加载到主引擎
          const c = dialogContainers.value.find((x) => x.key === target)
          if (c?.engine) {
            c.currentRecordId = rid
            void c.engine.loadRecord(rid)
          } else {
            void bindingEngine.value?.loadRecord(rid)
          }
        }
        consumed = true
      } else if (op === 'save-container') {
        const c = dialogContainers.value.find((x) => x.key === target)
        if (c?.engine) void c.engine.flush()
        else void bindingEngine.value?.flush()
        consumed = true
      } else if (op === 'close-container') {
        const c = dialogContainers.value.find((x) => x.key === target)
        if (c) c.visible = false
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

// ==================== 容器按钮区行为 ====================

/** 容器内数据源对应的全局 refId */
function containerRefId(c: DialogContainer): string | undefined {
  return dsBindings.value.find((d) => d.id === c.key)?.refId
}

/** 默认按钮行为：new=清空建新 / cancel=关闭 / confirm=保存关闭 / delete=删除记录 / copy=复制新记录 */
async function containerAction(c: DialogContainer, action: 'new' | 'cancel' | 'confirm' | 'delete' | 'copy') {
  if (action === 'new') {
    // 新对象赋值触发 Vue 响应式
    c.formData = {}
    c.currentRecordId = undefined
  } else if (action === 'cancel') {
    c.visible = false
  } else if (action === 'confirm') {
    await c.engine?.flush()
    // 智能同步：刷新容器关联的表格
    const tbl = componentRefs.get(c.key)
    if (tbl && typeof tbl.refresh === 'function') tbl.refresh()
    c.visible = false
  } else if (action === 'delete') {
    const refId = containerRefId(c)
    if (!refId || !c.currentRecordId) return
    try {
      const { ElMessageBox } = await import('element-plus')
      await ElMessageBox.confirm('确定要删除该记录吗？', '删除确认', { type: 'warning' })
    } catch {
      return
    }
    try {
      await dataSourceApi.deleteData(refId, c.currentRecordId)
      ElMessage.success('删除成功')
      const tbl = componentRefs.get(c.key)
      if (tbl && typeof tbl.refresh === 'function') tbl.refresh()
      c.visible = false
    } catch {
      // http 拦截器已提示
    }
  } else if (action === 'copy') {
    const refId = containerRefId(c)
    if (!refId) return
    const data = { ...c.formData }
    delete data.id
    delete data.version
    try {
      await dataSourceApi.createData(refId, data)
      ElMessage.success('复制成功')
      const tbl = componentRefs.get(c.key)
      if (tbl && typeof tbl.refresh === 'function') tbl.refresh()
      c.visible = false
    } catch {
      // http 拦截器已提示
    }
  }
}

/** 自定义按钮行为（触发 container-action 事件，由调用方处理） */
function containerCustomAction(c: DialogContainer, btn: { key: string; label: string }) {
  ElMessage.info(`自定义按钮：${btn.label}`)
}

/** 组件引用注册表（对齐 PageRendererPage：PageDataTable ready 上报） */
const componentRefs = new Map<string, any>()

/** 供表单内 PageDataTable 注入的动作总线 */
provide('pageActionBus', {
  dispatch: dispatchAction,
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

/* 容器弹窗：使用 CSS 变量设定高度，内容超出滚动 */
.fc-container-dialog :deep(.el-dialog__body) {
  max-height: var(--dialog-max-h, 600px);
  overflow-y: auto;
  padding: 16px;
}
</style>
