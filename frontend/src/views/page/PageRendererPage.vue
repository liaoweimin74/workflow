<template>
  <div class="page-renderer-page" :class="{ 'has-stretch': hasStretchTable }">
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
      v-for="c in dialogPopContainers"
      :key="c.key"
      v-model="c.visible"
      :title="c.title"
      :width="c.width"
      :close-on-click-modal="false"
      class="linkage-container-dialog"
    >
      <div class="lc-dialog-body" :style="{ height: c.height }">
        <form-create v-if="c.visible" v-model="c.formData" :rule="containerRenderRule(c)" :option="containerOption" />
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
      v-for="c in drawerContainers"
      :key="c.key"
      v-model="c.visible"
      :title="c.title"
      :size="c.width"
      destroy-on-close
    >
      <div class="lc-dialog-body" :style="{ height: c.height }">
        <form-create v-if="c.visible" v-model="c.formData" :rule="containerRenderRule(c)" :option="containerOption" />
      </div>
      <template #footer v-if="c.readonly">
        <el-button type="primary" @click="c.visible = false">关闭</el-button>
      </template>
      <template #footer v-if="!c.readonly && hasContainerButtons(c)">
        <ContainerButtons :container="c" @action="containerAction(c, $event)" @custom="containerCustomAction(c, $event)" />
      </template>
    </el-drawer>
    <!-- 表格-容器联动：inline 模式容器覆盖层（open-container 动作打开；覆盖页面内容区，关闭后恢复） -->
    <div
      v-for="c in inlineContainers"
      :key="c.key"
      v-show="c.visible"
      class="lc-inline-overlay"
    >
      <div class="lc-inline-container">
        <div class="lc-inline-header">
          <span class="lc-inline-title">{{ c.title }}</span>
          <el-button text @click="containerAction(c, 'cancel')">关闭</el-button>
        </div>
        <div class="lc-dialog-body" :style="{ height: c.height }">
          <form-create v-if="c.visible" v-model="c.formData" :rule="containerRenderRule(c)" :option="containerOption" />
        </div>
        <div v-if="c.readonly" class="lc-inline-footer">
          <el-button type="primary" @click="containerAction(c, 'cancel')">关闭</el-button>
        </div>
        <div v-if="!c.readonly && hasContainerButtons(c)" class="lc-inline-footer">
          <ContainerButtons :container="c" @action="containerAction(c, $event)" @custom="containerCustomAction(c, $event)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ContainerButtons from '@/views/form/components/ContainerButtons.vue'
import { ref, reactive, computed, onMounted, provide, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import formCreate from '@form-create/element-ui'
import PageDataTable from './components/PageDataTable.vue'
import PageDataTree from './components/PageDataTree.vue'
import { pageApi, type PageDefinitionDetailDTO } from '@/api/page'
import { dataSourceApi } from '@/api/data-source'
import { createDsBindingEngine } from '@/views/form/components/DsBindingEngine'
import { normalizeForRender, deepDisableRules } from '@/views/form/schemaRules'
import { setActiveDsBindings } from '@/utils/formDsBindingsStore'
import { useLinkageContainer } from '@/views/form/composables/useLinkageContainer'

// 注册页面数据组件到 form-create（type: page-table / page-tree）
formCreate.component('page-table', PageDataTable)
formCreate.component('page-tree', PageDataTree)

/** 宿主（PageRenderer）已加载的页面定义；传入时直接使用不自行请求，缺省回退按 pageKey 加载 */
const props = defineProps<{ definition?: PageDefinitionDetailDTO }>()

/** 数据组件通过 inject 获取动作总线 */
const ACTION_BUS_KEY = 'pageActionBus'
provide(ACTION_BUS_KEY, {
  dispatch: (trigger: string, eventData: any) => dispatchActions(trigger, eventData),
  register: (dataSourceId: string, instance: any) => {
    componentRefs[dataSourceId] = instance
  },
  /** 表格按钮默认行为：是否存在同数据源的数据容器（自动关联，无需动作链即可打开容器表单） */
  hasLinkedContainer: (dataSourceId?: string) => !!dataSourceId && !!findContainer(dataSourceId),
  /** 打开同数据源的数据容器：按容器展示方式（表格 formMode 解析）显示；view=只读 */
  openLinkedContainer: (dataSourceId: string, mode: 'create' | 'edit' | 'view', row: any) => {
    const c = findContainer(dataSourceId)
    if (!c) return
    const rid = mode === 'create' ? '' : String(row?.id ?? '')
    openContainer(dataSourceId, rid, undefined, mode === 'view')
  },
})
const route = useRoute()
const router = useRouter()
const pageKey = ref(route.params.pageKey as string)
// 同一组件不同 pageKey 切换（vue-router 复用实例）时更新
watch(() => route.params.pageKey, (val) => {
  pageKey.value = val as string
  error.value = ''
  loading.value = false
  rule.value = []
  load()
})

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

/** 数据表格组件配置注册表：dataSourceId → page-table 节点 props（含 viewDetail；联动容器"以数据表格配置为准"） */
const tableViewConfigs = reactive<Record<string, any>>({})

/** 页面是否存在撑满（stretch）表格：开启后让 form-create 布局链传递 100% 高度，表格撑满页面内容区 */
const hasStretchTable = ref(false)

/** 递归收集 rule 树中 page-table 组件配置（供 resolveContainerStyle 取 viewDetail；须在 extractContainers 前调用） */
function collectTableConfigs(rules: any[]) {
  for (const n of rules || []) {
    const node = n as Record<string, any>
    if (node.type === 'page-table' && node.props?.dataSourceId) {
      tableViewConfigs[node.props.dataSourceId] = node.props
      if (node.props.stretch === true) hasStretchTable.value = true
    }
    if (Array.isArray(node.children)) collectTableConfigs(node.children as any[])
    if (node.props && Array.isArray(node.props.rule)) collectTableConfigs(node.props.rule as any[])
  }
}

/** 写入模块级存储，供 form-create 内部渲染的 LookupPicker / DataPicker 读取 */
watch(() => pageSchema.dataSources, (val) => { setActiveDsBindings(val as any) }, { immediate: true })

// ==================== 表格-容器联动：共享容器机制 ====================
/**
 * 表格-容器联动（PageRendererPage 版）。
 * 复用 useLinkageContainer：容器提取、独立引擎、按钮行为。
 * 注意：Page 用 inline 容器时，formData 绑定**主 formData**（与容器渲染区隔离）。
 */
const {
  containers,
  dialogContainers,
  inlineContainers,
  containerModes,
  findContainer,
  extractContainers,
  openContainer,
  loadRecord: loadContainerRecord,
  flushContainer,
  closeContainer,
  containerRefId,
  containerAction,
  containerCustomAction,
  hasContainerButtons,
} = useLinkageContainer({
  dsApi: dataSourceApi,
  dataSources: () => pageSchema.dataSources.map((d) => ({ id: d.id, refId: d.refId })),
  // inline 容器的 formData 绑定到主 formData；dialog 容器独立 formData
  // inline 容器：独立覆盖层（从主树移除，open-container 控制显示，覆盖页面内容区）
  keepInlineOnTree: false,
  openInline: true,
  formDataApi: {
    getValue: (c, field) => c.formData[field],
    setValue: (c, field, value) => {
      c.formData = { ...c.formData, [field]: value }
    },
  },
  // 自定义按钮：执行步骤链（containerCustomAction 内部调用此回调）
  onCustomAction: (c, btn) => {
    const eventData = { row: c.formData, record: c.formData, node: c.formData }
    for (const step of (btn as any).actions || []) {
      executeStep(step, eventData)
    }
  },
  findComponent: (key) => componentRefs[key] as any,
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
const dialogPopContainers = computed(() => dialogContainers.value.filter((c) => c.displayMode !== 'drawer'))
const drawerContainers = computed(() => dialogContainers.value.filter((c) => c.displayMode === 'drawer'))

onMounted(load)

// ========== 强制刷新（keep-alive 场景） ==========
// AdminLayout 菜单重击当前页签时携带 query._t 强制导航。缓存的所有实例都会收到
// 全局 route 变化，仅当前激活实例（path 匹配自身）响应：遍历已注册数据组件实例刷新。
const ownPath = route.path
watch(
  () => route.query._t,
  () => {
    if (route.path !== ownPath) return
    for (const inst of Object.values(componentRefs)) {
      inst?.refresh?.()
    }
  },
)

async function load() {
  const preview = route.query.preview === 'true'
  loading.value = true
  try {
    // 宿主下传定义时直接使用（definition 单次加载）；无 props 回退按 pageKey 自行加载（直接挂载/测试场景）
    const def = (props.definition ?? (await pageApi.getPageByKey(pageKey.value, preview)).data) as PageDefinitionDetailDTO
    if (def.type !== 'PAGE') {
      error.value = '页面类型不是自定义页面'
      return
    }
    const parsed = JSON.parse(def.schema || '{}')
    pageSchema.dataSources = parsed.dataSources || []
    // 同步写入模块存储（不依赖 watch pre-flush 时序）：extractContainers 会同步挂载容器引擎
    // 并解析数据源 refId，若此处延迟到渲染前，引擎拿到的是旧绑定导致"数据源不存在"误报
    setActiveDsBindings(pageSchema.dataSources as any)
    pageSchema.actions = parsed.actions || []
    // 先收集表格组件配置（在 extractContainers 之前）：makeContainer 的 resolveContainerStyle
    // 依赖 tableViewConfigs 解析展示方式/尺寸，若延迟到 transformComponent 才收集，
    // 容器拿到的是默认 dialog（始终弹窗）
    collectTableConfigs(parsed.rule || [])
    // 提取容器（dialog/inline/newTab 从主树移除），注册独立容器引擎
    const mainRule = extractContainers(parsed.rule || [])
    // 数据组件类型替换：el-table/el-tree → page-table/page-tree，注入 pageKey
    rule.value = normalizeForRender(mainRule).map((r: any) => transformComponent(r))
    // 渲染选项：保留设计器布局配置，但强制隐藏 form-create 默认提交/重置按钮（页面非表单提交场景）。
    // 注意 submitBtn/resetBtn 必须是对象结构 { show: false }（form-create 约定），布尔值无效。
    option.value = { ...(parsed.option || {}), submitBtn: { show: false }, resetBtn: { show: false } }
  } catch (e: any) {
    error.value = e?.message || '页面加载失败'
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

  // 路有 query 自动打开容器（newTab 落地页场景或深链）
  watch(
    () => [route.query.container as string | undefined, route.query.recordId as string | undefined, containers.value.length] as const,
    ([container, recordId, count]) => {
      if (!container || count === 0) return
      openContainer(container, recordId || '')
    },
    { immediate: true },
  )

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
      // 记录表格组件配置（联动容器"以数据表格配置为准"取 viewDetail 用）
      if (next.type === 'page-table') {
        tableViewConfigs[next.props.dataSourceId] = next.props
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
      executeStep(step, eventData, trigger)
      consumed = true
    }
  }
  return consumed
}

/** 执行单个动作 step（set-filter / refresh / set-value / open-container / ...）；trigger 供 open-container 判断只读（row-view → 只读） */
function executeStep(step: any, eventData: any, trigger?: string) {
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
    // 打开联动容器：newTab 用本地 router.open；dialog/drawer/inline 用共享 openContainer
    // 展示方式以数据表格配置（formMode）为准（resolveContainerStyle 已解析），step.displayMode 不再覆盖
    const c = findContainer(target)
    if (!c) return
    if (c.displayMode === 'newTab') {
      // newTab：浏览器新标签页打开，query 传递容器 key 记录 ID
      const rid = String(eventData?.row?.id ?? eventData?.node?.id ?? '')
      const resolved = router.resolve({
        query: { ...route.query, container: c.key, ...(rid ? { recordId: rid } : {}) },
      })
      window.open(resolved.href, '_blank')
    } else {
      // dialog/drawer/inline：共享 openContainer（用容器解析后的 displayMode）；row-view 触发 → 只读查看
      const rid = String(eventData?.row?.id ?? eventData?.node?.id ?? '')
      openContainer(target, rid, undefined, trigger === 'row-view')
    }
  } else if (op === 'load-record') {
    // 加载记录到容器：用共享 loadContainerRecord；回退给页面引擎
    const rid = step.recordId
      ? String(resolveStepValue(step.recordId, eventData) || '')
      : String(eventData?.row?.id ?? eventData?.node?.id ?? '')
    if (!rid) return
    loadContainerRecord(target, rid, () => {
      if (pageEngine.value) {
        currentRecordId.value = rid
        void pageEngine.value.loadRecord(rid)
      }
    })
  } else if (op === 'save-container') {
    // 保存容器数据：用共享 flushContainer；回退给页面引擎
    flushContainer(target, () => void pageEngine.value?.flush())
  } else if (op === 'close-container') {
    // 关闭容器弹窗
    closeContainer(target)
  }
}

/** 容器渲染规则：只读容器 → 所有字段禁用（deepDisableRules），否则用原始 rule */
function containerRenderRule(c: any): any[] {
  return c.readonly ? deepDisableRules(c.renderRule) : c.renderRule
}

/** 容器内 form-create 选项：隐藏默认提交/重置按钮（按钮由 ContainerButtons 控制）。submitBtn/resetBtn 须为对象结构 { show: false } */
const containerOption = { submitBtn: { show: false }, resetBtn: { show: false } }

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
  /* 定位上下文：inline 覆盖层 absolute 定位锚（覆盖页面内容区） */
  position: relative;
  min-height: 100%;
}
.page-canvas {
  min-height: 300px;
}

/* ===== 页面含撑满（stretch）表格：form-create 布局链传递 100% 高度，使表格撑满页面内容区 =====
   :has() 精准匹配"包含 page-data-table 的 form-item"，避免影响 SearchTable 查询栏内部的 form-item（否则查询栏被撑高出现滚动条） */
.page-renderer-page.has-stretch {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.page-renderer-page.has-stretch .page-canvas {
  flex: 1;
  min-height: 0;
}
.page-renderer-page.has-stretch .page-canvas :deep(.el-form),
.page-renderer-page.has-stretch .page-canvas :deep(.el-row),
.page-renderer-page.has-stretch .page-canvas :deep(.el-col),
.page-renderer-page.has-stretch .page-canvas :deep(.el-form-item:has(> .el-form-item__content > .page-data-table)),
.page-renderer-page.has-stretch .page-canvas :deep(.el-form-item__content:has(> .page-data-table)) {
  height: 100%;
}

/* 容器弹窗/抽屉内容区：配置高度时固定高度、超出滚动 */
.lc-dialog-body {
  overflow-y: auto;
}
/* inline 容器覆盖层：覆盖页面内容区（.page-renderer-page），关闭后恢复 */
.lc-inline-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.lc-inline-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 24px;
  overflow: hidden;
}
.lc-inline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.lc-inline-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.lc-inline-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  margin-top: 16px;
  flex-shrink: 0;
}
</style>
