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
    <!-- inline 容器渲染在表单主区域，dialog/newTab 在弹窗 -->
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
      <template #footer v-if="hasContainerButtons(c)">
        <ContainerButtons :container="c" @action="containerAction(c, $event)" @custom="containerCustomAction(c, $event)" />
      </template>
    </el-dialog>
    <!-- inline 容器：页内区域渲染（点击显示、可关闭、有按钮） -->
    <div
      v-for="c in inlineContainers"
      :key="c.key"
      v-show="c.visible"
      class="fc-inline-container"
      :class="{ 'fc-inline-open': c.visible }"
    >
      <div class="fc-inline-header">
        <span class="fc-inline-title">{{ c.title }}</span>
        <el-button class="btn-cancel" text @click="containerAction(c, 'cancel')">关闭</el-button>
      </div>
      <form-create v-if="c.visible" v-model="c.formData" :rule="c.renderRule" :option="{}" />
      <div v-if="hasContainerButtons(c)" class="container-buttons fc-inline-footer">
        <ContainerButtons :container="c" @action="containerAction(c, $event)" @custom="containerCustomAction(c, $event)" />
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
import { normalizeForRender } from '@/views/form/schemaRules'
import { setActiveDsBindings } from '@/utils/formDsBindingsStore'
import { useLinkageContainer } from '@/views/form/composables/useLinkageContainer'

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
  formDataApi: {
    getValue: (c, field) => (c.displayMode === 'inline' ? formData.value[field] : c.formData[field]),
    setValue: (c, field, value) => {
      if (c.displayMode === 'inline') formData.value = { ...formData.value, [field]: value }
      else c.formData = { ...c.formData, [field]: value }
    },
  },
  // newTab 在此不弹窗回显，外部通过 router.open 实现
  openNewTab: undefined,
  // 页面 inline 容器已渲染在主树，open-container 不应将其当作弹窗打开
  keepInlineOnTree: true,
  openInline: false,
  // 自定义按钮：执行步骤链（containerCustomAction 内部调用此回调）
  onCustomAction: (c, btn) => {
    const eventData = { row: c.formData, record: c.formData, node: c.formData }
    for (const step of (btn as any).actions || []) {
      executeStep(step, eventData)
    }
  },
  findComponent: (key) => componentRefs[key] as any,
})

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
    // 提取容器（dialog/inline/newTab 从主树移除），注册独立容器引擎
    const mainRule = extractContainers(parsed.rule || [])
    // 数据组件类型替换：el-table/el-tree → page-table/page-tree，注入 pageKey
    rule.value = normalizeForRender(mainRule).map((r: any) => transformComponent(r))
    option.value = parsed.option || {}
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
    // 打开联动容器：newTab 用本地 router.open；dialog/inline 用共享 openContainer
    const c = findContainer(target)
    if (!c) return
    const mode = (step.displayMode as string) || c.displayMode
    if (mode === 'newTab') {
      // newTab：浏览器新标签页打开，query 传递容器 key 记录 ID
      const rid = String(eventData?.row?.id ?? eventData?.node?.id ?? '')
      const resolved = router.resolve({
        query: { ...route.query, container: c.key, ...(rid ? { recordId: rid } : {}) },
      })
      window.open(resolved.href, '_blank')
    } else {
      // dialog/inline：共享 openContainer（dialog 显示弹窗，inline 常驻不操作）
      const rid = String(eventData?.row?.id ?? eventData?.node?.id ?? '')
      openContainer(target, rid, (step.displayMode as string) || undefined)
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
