<template>
  <div class="page-renderer-page">
    <!-- 错误态 -->
    <el-result v-if="error" icon="error" :title="error" style="padding: 80px 0" />

    <!-- PAGE 渲染：form-create rule（数据组件已注入数据加载 + 事件） -->
    <div v-else v-loading="loading" class="page-canvas">
      <form-create
        v-if="rule.length > 0"
        v-model="formData"
        :rule="rule"
        :option="option"
      />
      <el-empty v-else description="页面内容为空" :image-size="80" />
    </div>

    <!-- 表格-容器联动：dialog 模式容器弹窗（open-container 动作打开） -->
    <el-dialog
      v-for="c in dialogContainers"
      :key="c.key"
      v-model="c.visible"
      :title="c.title"
      :width="c.width"
      :close-on-click-modal="false"
      class="linkage-container-dialog"
    >
      <form-create v-if="c.visible" v-model="c.formData" :rule="c.renderRule" :option="{}" />
      <template #footer>
        <div class="container-buttons">
          <el-button v-if="c.buttons.showNew" class="btn-new" @click="containerAction(c, 'new')">新增</el-button>
          <el-button v-if="c.buttons.showCopy" class="btn-copy" @click="containerAction(c, 'copy')">复制</el-button>
          <el-button v-if="c.buttons.showDelete" class="btn-delete" type="danger" @click="containerAction(c, 'delete')">删除</el-button>
          <el-button
            v-for="btn in c.buttons.custom"
            :key="btn.key"
            :type="btn.type || ''"
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
import { ref, reactive, computed, markRaw, onMounted, provide, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import formCreate from '@form-create/element-ui'
import PageDataTable from './components/PageDataTable.vue'
import PageDataTree from './components/PageDataTree.vue'
import { pageApi, type PageDefinitionDetailDTO } from '@/api/page'
import { dataSourceApi } from '@/api/data-source'
import { createDsBindingEngine } from '@/views/form/components/DsBindingEngine'
import { normalizeForRender } from '@/views/form/schemaRules'
import { setActiveDsBindings } from '@/utils/formDsBindingsStore'

// 注册页面数据组件到 form-create（type: page-table / page-tree）
formCreate.component('page-table', PageDataTable)
formCreate.component('page-tree', PageDataTree)

/** 数据组件通过 inject 获取动作总线 */
const ACTION_BUS_KEY = 'pageActionBus'
provide(ACTION_BUS_KEY, {
  dispatch: (trigger: string, eventData: any) => dispatchActions(trigger, eventData),
  register: (dataSourceId: string, instance: any) => {
    componentRefs[dataSourceId] = instance
  },
})
const route = useRoute()
const router = useRouter()
const pageKey = ref(route.params.pageKey as string)

const error = ref('')
const loading = ref(false)
const rule = ref<any[]>([])
const option = ref<Record<string, any>>({})
const formData = ref<Record<string, any>>({})

/** 页面绑定引擎（挂载于表单 rule 中的 formContainer） */
const pageEngine = ref<ReturnType<typeof createDsBindingEngine> | null>(null)

/** 当前数据记录 ID（从 route 获取，record-change 触发 reload-record 用） */
const currentRecordId = ref<string | undefined>(undefined)

/** 最近加载的记录数据（供 record-change 触发的上下文） */
const lastRecord = ref<Record<string, unknown> | undefined>(undefined)

/** 字段变更回调（field-change 触发器） */
let fieldChangeCb: ((field: string) => void) | null = null

/** 页面 schema：dataSources 与 actions */
const pageSchema = reactive<{
  dataSources: { id: string; refId: string; searchFields?: string[] }[]
  actions: any[]
}>({
  dataSources: [],
  actions: [],
})

/** 组件引用注册表：dataSourceId → 组件实例（供 refresh/set-filter） */
const componentRefs = reactive<Record<string, any>>({})

/** 写入模块级存储，供 form-create 内部渲染的 LookupPicker / DataPicker 读取 */
watch(() => pageSchema.dataSources, (val) => { setActiveDsBindings(val as any) }, { immediate: true })

// ==================== 表格-容器联动 ====================
/** 自定义按钮配置（key/label/type/actions 事件链） */
interface ContainerCustomButton {
  key: string
  label: string
  type?: string
  actions?: any[]
}

/** 容器按钮区配置 */
interface ContainerButtons {
  showNew: boolean
  showCancel: boolean
  showConfirm: boolean
  showDelete: boolean
  showCopy: boolean
  custom: ContainerCustomButton[]
}

/** 联动容器运行时状态（formContainer 以 dataSourceId 为联动 target） */
interface LinkageContainer {
  /** 页面内数据源标识（动作 target） */
  key: string
  /** 原始 formContainer 节点（保存格式，引擎 mount 用） */
  node: any
  /** 渲染子规则（props.rule，dialog 内 form-create 渲染用） */
  renderRule: any[]
  /** 默认显示模式（open-container 动作可覆盖） */
  displayMode: 'dialog' | 'newTab' | 'inline'
  /** 弹窗标题（tabTitle 配置） */
  title: string
  /** 弹窗宽度（dialogWidth 配置） */
  width: string
  /** dialog 可见性 */
  visible: boolean
  /** dialog/newTab 容器独立表单数据（inline 容器用主 formData） */
  formData: Record<string, any>
  /** 当前记录 ID（load-record 写入，引擎 recordId 定位用） */
  currentRecordId: string | undefined
  /** 容器数据引擎（读写数据源） */
  engine: ReturnType<typeof createDsBindingEngine> | null
  /** 按钮区配置 */
  buttons: ContainerButtons
}

/** 联动容器注册表（dialog/newTab 从主树移除；inline 保留主树） */
const linkageContainers = reactive<LinkageContainer[]>([])

/** dialog 模式容器（弹窗渲染列表） */
const dialogContainers = computed(() => linkageContainers.filter((c) => c.displayMode === 'dialog'))

/** 按 target（dataSourceId）查找联动容器 */
function findContainer(target: string): LinkageContainer | undefined {
  return linkageContainers.find((c) => c.key === target)
}

/** 从原始 rule 树提取联动容器（须在 normalizeForRender 之前调用，此时 type 仍为 formContainer） */
function extractLinkageContainers(nodes: any[]): any[] {
  const containers: LinkageContainer[] = []
  const walk = (list: any[]): any[] =>
    list
      .filter((n) => {
        if (n && typeof n === 'object' && n.type === 'formContainer' && n.props?.dataSourceId) {
          const mode = (n.props.displayMode as LinkageContainer['displayMode']) || 'dialog'
          containers.push(makeContainer(n, mode))
          // dialog/newTab 从主树移除；inline 保留主树渲染
          return mode === 'inline'
        }
        return true
      })
      .map((n) => {
        if (n && typeof n === 'object' && Array.isArray(n.children)) {
          n.children = walk(n.children)
        }
        return n
      })
  const mainTree = walk(nodes)
  linkageContainers.splice(0, linkageContainers.length)
  for (const c of containers) {
    mountContainerEngine(c)
    linkageContainers.push(c)
  }
  // newTab 落地页：query.container 自动打开对应容器
  openFromQuery()
  return mainTree
}

/** 构造联动容器运行时状态 */
function makeContainer(node: any, displayMode: LinkageContainer['displayMode']): LinkageContainer {
  const props = node.props || {}
  return {
    key: props.dataSourceId,
    node,
    renderRule: Array.isArray(props.rule) ? props.rule : [],
    displayMode,
    title: props.tabTitle || node.title || '编辑记录',
    width: props.dialogWidth || '800px',
    visible: false,
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
}

/** 为联动容器挂载独立数据引擎（inline 容器绑定主 formData，其余绑定容器自身 formData） */
function mountContainerEngine(c: LinkageContainer) {
  const isInline = c.displayMode === 'inline'
  const engine = createDsBindingEngine(
    { dsApi: dataSourceApi } as any,
    {
      api: {
        getValue: (field: string) => (isInline ? formData.value[field] : c.formData[field]),
        setValue: (field: string, value: unknown) => {
          if (isInline) formData.value = { ...formData.value, [field]: value }
          else c.formData = { ...c.formData, [field]: value }
        },
      },
      recordId: () => c.currentRecordId,
      onRecordChange: () => { /* load-record 动作显式驱动 */ },
      onFieldChange: () => { /* dialog 内字段变化由容器 formData 驱动（Task 5 完善） */ },
      onConflict: (msg: string) => ElMessage.warning(msg),
    },
  )
  // mount 用保存格式节点（collectContainers 递归 props.rule 收集子字段）
  engine.mount([c.node])
  c.engine = markRaw(engine)
}

/** newTab 落地页：query.container=容器标识 时自动打开（dialog 模式弹窗回显） */
function openFromQuery() {
  const key = route.query.container as string
  if (!key) return
  const c = findContainer(key)
  if (!c) return
  c.visible = true
  const rid = route.query.recordId as string
  if (rid) {
    c.currentRecordId = rid
    void c.engine?.loadRecord(rid)
  }
}

// ==================== 容器按钮区行为 ====================
/** 容器内数据源对应的全局 refId */
function containerRefId(c: LinkageContainer): string | undefined {
  return pageSchema.dataSources.find((d) => d.id === c.key)?.refId
}

/** 默认按钮行为：new=清空建新 / cancel=关闭 / confirm=保存关闭 / delete=删除记录 / copy=复制新记录 */
async function containerAction(c: LinkageContainer, action: 'new' | 'cancel' | 'confirm' | 'delete' | 'copy') {
  if (action === 'new') {
    c.formData = {}
    c.currentRecordId = undefined
  } else if (action === 'cancel') {
    c.visible = false
} else if (action === 'confirm') {
    // 强制完成引擎未竟的字段写入，然后关闭弹窗
    await c.engine?.flush()
    // ===== 智能同步：刷新容器关联的表格 =====
    // 假设容器与表格是同一数据源（dataSourceId），用 key 找组件
    const tbl = componentRefs[c.key]
    if (tbl && typeof (tbl as any).refresh === 'function') {
      ;(tbl as any).refresh()
    }
    c.visible = false
  } else if (action === 'delete') {
    const refId = containerRefId(c)
    if (!refId || !c.currentRecordId) return
    try {
      await ElMessageBox.confirm('确定要删除该记录吗？', '删除确认', { type: 'warning' })
    } catch {
      return
    }
    try {
      await dataSourceApi.deleteData(refId, c.currentRecordId)
      ElMessage.success('删除成功')
      // ===== 智能同步：刷新容器关联的表格 =====
      const tbl = componentRefs[c.key]
      if (tbl && typeof (tbl as any).refresh === 'function') {
        ;(tbl as any).refresh()
      }
      c.visible = false
    } catch {
      // http 拦截器已提示
    }
  } else if (action === 'copy') {
    const refId = containerRefId(c)
    if (!refId) return
    // 以当前表单数据为模板创建新记录（去除主键与版本）
    const data = { ...c.formData }
    delete data.id
    delete data.version
    try {
      await dataSourceApi.createData(refId, data)
      ElMessage.success('复制成功')
      // ===== 智能同步：刷新容器关联的表格 =====
      const tbl = componentRefs[c.key]
      if (tbl && typeof (tbl as any).refresh === 'function') {
        ;(tbl as any).refresh()
      }
      c.visible = false
    } catch {
      // http 拦截器已提示
    }
  }
}

/** 自定义按钮：执行其事件链动作（以容器当前表单数据为上下文） */
function containerCustomAction(c: LinkageContainer, btn: ContainerCustomButton) {
  const eventData = { row: c.formData, record: c.formData, node: c.formData }
  for (const step of btn.actions || []) {
    executeStep(step, eventData)
  }
}

onMounted(load)

async function load() {
  const preview = route.query.preview === 'true'
  loading.value = true
  try {
    const res = await pageApi.getPageByKey(pageKey.value, preview)
    const def = res.data as PageDefinitionDetailDTO
    if (def.type !== 'PAGE') {
      error.value = '页面类型不是自定义页面'
      return
    }
    const parsed = JSON.parse(def.schema || '{}')
    pageSchema.dataSources = parsed.dataSources || []
    pageSchema.actions = parsed.actions || []
    // 提取联动容器（dialog/newTab 从主树移除，须在 normalizeForRender 之前——此后 type 变为 FcRow）
    parsed.rule = extractLinkageContainers(parsed.rule || [])
    // 数据组件类型替换：el-table/el-tree → page-table/page-tree，注入 pageKey
    rule.value = normalizeForRender(parsed.rule || []).map((r: any) => transformComponent(r))
    option.value = parsed.option || {}
  } catch (e: any) {
    error.value = e?.message || '页面加载失败'
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

// 检查 rule 中是否含 formContainer，若有则挂载绑定引擎
watch(rule, async (newRule) => {
  if (newRule.length > 0 && !pageEngine.value) {
    await mountPageEngine(newRule)
  }
})

// 感知表单字段值变化 → 引擎写路径（fieldChangeCb）+ field-change 动作链
watch(formData, (val, oldVal) => {
  if (!val) return
  const old = (oldVal || {}) as Record<string, unknown>
  for (const key of Object.keys(val)) {
    if (val[key] !== old[key]) {
      if (fieldChangeCb) fieldChangeCb(key)
      dispatchActions('field-change', {
        field: key,
        value: val[key],
        record: lastRecord.value,
        param: { ...route.query },
      })
      return
    }
  }
}, { deep: true })

async function mountPageEngine(ruleTree: any[]) {
  // 检查是否包含 formContainer
  const hasContainer = ruleTree.some((r: any) => r?.type === 'formContainer')
  if (!hasContainer) return

  pageEngine.value = createDsBindingEngine(
    { dsApi: dataSourceApi } as any,
    {
      api: {
        getValue: (field: string) => formData.value[field],
        setValue: (field: string, value: unknown) => { formData.value = { ...formData.value, [field]: value } },
      },
      recordId: () => currentRecordId.value,
      onRecordChange: () => { /* 由节点点击显式触发 record-change */ },
      onFieldChange: (cb: (field: string) => void) => { fieldChangeCb = cb },
      onConflict: (msg: string) => ElMessage.warning(msg),
    }
  )
  pageEngine.value.mount(ruleTree)
  // 从路由获取初始记录 ID
  const initialId = route.query.recordId as string
  if (initialId) {
    currentRecordId.value = initialId
    await pageEngine.value?.loadRecord(initialId)
  }
}

/** 递归转换 rule：数据组件注入 pageKey 与事件（registry 已用 page-table/page-tree 类型） */
function transformComponent(node: any): any {
  // 字符串子节点（text/button 文字内容）原样透传，避免 {...'文字'} 展开为字符索引对象
  if (typeof node !== 'object' || node === null) return node
  const next = { ...node, props: { ...(node.props || {}) }, on: { ...(node.on || {}) } }
  if (next.type === 'page-table' || next.type === 'page-tree') {
    next.props.pageKey = pageKey.value
    // 注入 dsRefId（页面内 dataSourceId → 全局数据源 refId，供写操作用）
    if (next.props.dataSourceId) {
      const ds = pageSchema.dataSources.find((d) => d.id === next.props.dataSourceId)
      if (ds && ds.refId) {
        next.props.dsRefId = ds.refId
      }
    }
    // 组件实例上报 → 注册到 componentRefs（供动作总线 refresh/set-filter）
    next.on['ready'] = (instance: any) => {
      if (next.props.dataSourceId && instance) {
        componentRefs[next.props.dataSourceId] = instance
      }
    }
    // 数据组件事件 → 动作总线（node-click 等）
    // el-tree/el-table 事件第一参数是业务数据（含 id），包装为 { node, row }
    const source = next.props.dataSourceId as string | undefined
    next.on['node-click'] = (data: any) => {
      // 更新当前记录 ID 并触发 record-change
      currentRecordId.value = data?.id
      lastRecord.value = data
      dispatchActions('node-click', { node: data, row: data, record: data, source })
      dispatchActions('record-change', { node: data, row: data, record: data, source })
    }
    next.on['row-click'] = (data: any) => {
      dispatchActions('row-click', { node: data, row: data, source })
    }
  }
  if (Array.isArray(next.children)) {
    next.children = next.children.map(transformComponent)
  }
  return next
}

/** 执行页面 actions（触发 → steps 动作链）；返回是否存在匹配的动作链（供数据组件判断是否消费） */
function dispatchActions(trigger: string, eventData: any): boolean {
  let consumed = false
  const source = eventData?.source
  for (const action of pageSchema.actions || []) {
    if (action.trigger !== trigger) continue
    // source 匹配：动作配置了来源（action.source）时，仅来源一致的触发才执行；未配置 = 全局通配
    if (action.source && action.source !== source) continue
    for (const step of action.steps || []) {
      executeStep(step, eventData)
      consumed = true
    }
  }
  return consumed
}

/** 执行单个动作 step（set-filter / refresh / set-value / open-detail） */
function executeStep(step: any, eventData: any) {
  const op = step.op
  const target = step.target
  if (!target) return
  if (op === 'set-filter') {
    const comp = componentRefs[target]
    if (comp && typeof comp.setFilter === 'function') {
      const value = resolveStepValue(step.value, eventData)
      comp.setFilter({ [step.field]: value })
    }
  } else if (op === 'refresh') {
    const comp = componentRefs[target]
    if (comp && typeof comp.refresh === 'function') {
      comp.refresh()
    }
  } else if (op === 'set-value') {
    const comp = componentRefs[target]
    if (comp && typeof comp.setValue === 'function') {
      comp.setValue(step.field, resolveStepValue(step.value, eventData))
    }
  } else if (op === 'reload-record') {
    // 重新加载当前记录回显容器：value 模板解析记录 ID，缺省用当前上下文
    const rid = step.value ? String(resolveStepValue(step.value, eventData) || '') : ''
    const recordId = rid || currentRecordId.value
    if (recordId && pageEngine.value) {
      currentRecordId.value = recordId
      void pageEngine.value.loadRecord(recordId).then(() => {
        const last = pageEngine.value?.getLastRecord()
        if (last) lastRecord.value = last
      })
    }
  } else if (op === 'save-record') {
    // 写回数据源：强制完成未竟防抖写入
    void pageEngine.value?.flush()
  } else if (op === 'open-container') {
    // 打开联动容器：displayMode 参数优先，容器默认配置兜底
    const c = findContainer(target)
    if (!c) return
    const mode = (step.displayMode as string) || c.displayMode
    if (mode === 'dialog') {
      c.visible = true
    } else if (mode === 'newTab') {
      const rid = String(eventData?.row?.id ?? eventData?.node?.id ?? '')
      const resolved = router.resolve({
        query: { ...route.query, container: c.key, ...(rid ? { recordId: rid } : {}) },
      })
      window.open(resolved.href, '_blank')
    }
    // inline：容器常驻主树，无需操作
  } else if (op === 'load-record') {
    // 加载记录到容器：recordId 模板解析，缺省取事件行 ID
    const rid = step.recordId
      ? String(resolveStepValue(step.recordId, eventData) || '')
      : String(eventData?.row?.id ?? eventData?.node?.id ?? '')
    if (!rid) return
    const c = findContainer(target)
    if (c) {
      c.currentRecordId = rid
      void c.engine?.loadRecord(rid)
    } else if (pageEngine.value) {
      // 非联动容器回退：页面级引擎（兼容既有 reload-record 语义）
      currentRecordId.value = rid
      void pageEngine.value.loadRecord(rid)
    }
  } else if (op === 'save-container') {
    // 保存容器数据：强制完成容器引擎未竟防抖写入（表格同步由 Task 5 完善）
    const c = findContainer(target)
    if (c) void c.engine?.flush()
    else void pageEngine.value?.flush()
  } else if (op === 'close-container') {
    // 关闭联动容器弹窗
    const c = findContainer(target)
    if (c) c.visible = false
  }
}

/** 解析 step value 模板（{node.id} / {row.id} / 字面量） */
function resolveStepValue(tpl: string | undefined, eventData: any): unknown {
  if (!tpl) return undefined
  return tpl.replace(/\{([^}]+)\}/g, (_, path: string) => {
    const parts = path.split('.')
    let v: any = eventData
    for (const p of parts) {
      v = v?.[p]
    }
    return v === undefined || v === null ? '' : String(v)
  })
}
</script>

<style scoped>
.page-renderer-page {
  padding: 4px;
}
.page-canvas {
  min-height: 300px;
}
</style>
