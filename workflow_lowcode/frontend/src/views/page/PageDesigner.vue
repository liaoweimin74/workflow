<template>
  <div class="page-designer-page">
    <!-- 顶部工具栏 -->
    <div class="designer-toolbar">
      <el-button :icon="ArrowLeft" @click="handleBack">返回</el-button>
      <el-divider direction="vertical" />
      <el-input
        v-model="pageName"
        class="page-name-input"
        placeholder="页面名称"
        style="width: 200px"
      />
      <el-input
        :model-value="pageKey"
        class="page-key-input"
        placeholder="页面标识"
        style="width: 160px; margin-left: 8px"
        disabled
      />
      <el-tag type="success" style="margin-left: 8px">自定义页面</el-tag>
      <el-tag v-if="formStatus" :type="statusTagType(formStatus)" style="margin-left: 8px">
        {{ statusLabel(formStatus) }}
      </el-tag>
      <div class="toolbar-right">
        <el-button plain :icon="Grid" @click="insertLeftTreeRightTableTemplate">左树右表</el-button>
        <el-button plain @click="dsDialogVisible = true">
          数据源配置（{{ schema.dataSources.length }}）
        </el-button>
        <el-button type="primary" :icon="Check" @click="handleSave" :loading="saving">保存</el-button>
        <el-button type="success" :icon="Promotion" @click="handlePublish" :loading="publishing">
          {{ formStatus === 'PUBLISHED' ? '重新发布' : '发布' }}
        </el-button>
        <el-button v-if="formStatus === 'PUBLISHED'" :icon="Menu" @click="openMountDialog">
          {{ mountedMenus.length ? `已挂接 ${mountedMenus.length} 个菜单` : '挂接菜单' }}
        </el-button>
        <el-button :icon="View" @click="handlePreview">预览</el-button>
        <el-button :icon="Document" @click="handleShowJson">JSON 配置</el-button>
      </div>
    </div>

    <!-- 设计器主体：FcDesigner 画布 -->
    <div class="designer-body" v-loading="loading">
      <fc-designer
        ref="designerRef"
        :height="designerHeight"
        :config="designerConfig"
      />
    </div>

    <!-- 数据源/动作配置弹窗 -->
    <el-dialog v-model="dsDialogVisible" title="数据源绑定与动作总线" width="680px" destroy-on-close>
      <DataSourceConfigPanel
        ref="dsConfigPanelRef"
        :dataSources="schema.dataSources.map(ds => ({ id: ds.id, refId: ds.refId, searchFields: ds.searchFields }))"
        :enabledDataSources="enabledDataSources"
        :actions="schema.actions"
        @update:dataSources="updateDataSources"
        @update:actions="updateActions"
      />
      <template #footer>
        <el-button @click="dsDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmDsConfig">确定</el-button>
      </template>
    </el-dialog>

    <!-- 数据表格数据源配置 -->
    <DsBindingConfigDialog
      v-model="pageTableDialogVisible"
      :current-fields="currentFieldKeys"
      :binding-props="currentPageTableProps"
      :form-data-sources="schema.dataSources.map(ds => ({ id: ds.id, refId: ds.refId }))"
      :list-mode="currentPageListMode"
      @confirm="handlePageTableConfirm"
    />

    <!-- 仪表盘组件配置（Task 119）：KPI 指标卡 / 统计图 / 环比卡 -->
    <DashConfigDialog
      v-model="dashDialogVisible"
      :mode="dashDialogMode"
      :binding-props="currentDashProps"
      :form-data-sources="schema.dataSources.map(ds => ({ id: ds.id, refId: ds.refId, name: dsNameOf(ds) }))"
      :enabled-data-sources="enabledDataSources"
      @confirm="handleDashConfirm"
    />

    <!-- 图表配置（Task 3-e）：维度/指标/类型 -->
    <PageChartConfigDialog
      v-model="chartDialogVisible"
      :config="currentChartConfig"
      :candidates="chartCandidates"
      @confirm="handleChartConfirm"
    />

    <!-- 卡片样式脚本配置（结构化 CardStyle，覆盖主题） -->
    <CardStyleConfigDialog
      v-model="cardStyleDialogVisible"
      :card-style="currentCardStyle"
      @confirm="handleCardStyleConfirm"
    />

    <!-- 轻量数据源绑定（page-form/page-detail/page-chart/page-tree-table 专用：容器模式仅写 dataSourceId+filter，不产生列配置，保护各组件专属 props） -->
    <DsBindingConfigDialog
      v-model="lightDsDialogVisible"
      :current-fields="[]"
      :binding-props="currentLightDsProps"
      :form-data-sources="schema.dataSources.map(ds => ({ id: ds.id, refId: ds.refId }))"
      :enabled-data-sources="enabledDataSources"
      @confirm="handleLightDsConfirm"
    />

    <!-- 数据表单容器配置：与表单设计器复用同一套非表格模式绑定弹窗 -->
    <DsBindingConfigDialog
      v-model="formContainerDialogVisible"
      :current-fields="[]"
      :binding-props="currentFormContainerProps"
      :form-data-sources="schema.dataSources"
      :enabled-data-sources="enabledDataSources"
      @confirm="handleFormContainerConfirm"
    />

    <!-- 数据引用组件配置：与表单设计器复用同一套配置弹窗与字段回写逻辑 -->
    <DataPickerConfigDialog
      v-model="pickerDialogVisible"
      :current-fields="currentFieldKeys"
      :picker-props="currentPickerProps"
      :form-data-sources="schema.dataSources"
      @confirm="handlePickerConfirm"
    />

    <!-- 查找带回组件配置：与表单设计器复用同一套配置弹窗与字段回写逻辑 -->
    <LookupPickerConfigDialog
      v-model="lookupDialogVisible"
      :current-fields="currentFieldKeys"
      :lookup-props="currentLookupProps"
      :form-data-sources="schema.dataSources"
      @confirm="handleLookupConfirm"
    />

    <!-- JSON 弹窗 -->
    <el-dialog v-model="previewVisible" title="页面配置 JSON" width="760px">
      <pre class="preview-json">{{ previewJson }}</pre>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 挂接菜单弹窗：多挂接 + 已挂列表管理 -->
    <el-dialog v-model="mountDialogVisible" title="挂接到系统菜单" width="560px">
      <!-- 已挂列表（可解除） -->
      <div v-if="mountedMenus.length" class="mounted-menus">
        <div class="mounted-menus-title">该页面已在 {{ mountedMenus.length }} 个菜单中：</div>
        <el-tag
          v-for="m in mountedMenus"
          :key="m.menuId"
          closable
          class="mounted-menu-tag"
          @close="handleUnmount(m)"
        >
          {{ m.menuName }}
        </el-tag>
      </div>
      <el-alert
        v-if="mountedMenus.length"
        type="warning"
        :closable="false"
        show-icon
        title="继续挂接将为该页面新增一条菜单"
        class="mount-alert"
      />
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="菜单名称">
          <el-input v-model="mountForm.name" placeholder="默认使用页面名称" />
        </el-form-item>
        <el-form-item label="所属目录">
          <el-tree-select
            v-model="mountForm.parentId"
            :data="menuCategories"
            :props="{ label: 'menuName', children: 'children', value: 'id' }"
            check-strictly
            clearable
            placeholder="不选则挂到根目录"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="mountDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="mounting" @click="confirmMount">挂接</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Check, Promotion, View, Document, Menu, Grid } from '@element-plus/icons-vue'
import FcDesigner from '@form-create/designer'
import PageDataTable from './components/PageDataTable.vue'
import PageDataCards from './components/PageDataCards.vue'
import { tableFilterStore } from './components/tableFilterStore'
import PageDataTree from './components/PageDataTree.vue'
// PAGE 轨新组件（Task 3-b/3-e/3-f/3-h）：录入/详情/图表/树表格/五件套
import PageDataForm from './components/PageDataForm.vue'
import PageDataDetail from './components/PageDataDetail.vue'
import PageDataChartPage from './components/PageDataChartPage.vue'
import PageTreeTable from './components/PageTreeTable.vue'
import PageIframe from './components/PageIframe.vue'
import PageNoticeCarousel from './components/PageNoticeCarousel.vue'
import PageCalendar from './components/PageCalendar.vue'
import PageTimeline from './components/PageTimeline.vue'
import PageSteps from './components/PageSteps.vue'
import PageChartConfigDialog from './components/PageChartConfigDialog.vue'
import DashKpiTrend from '@/views/dashboard/components/DashKpiTrend.vue'
import { pageApi, type PageDefinitionDetailDTO, type PageMenuItem } from '@/api/page'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import { useAuthStore } from '@/stores/auth'
import DataSourceConfigPanel from '@/components/business/DataSourceConfigPanel.vue'
import DsBindingConfigDialog from '@/views/form/components/DsBindingConfigDialog.vue'
import DataPickerConfigDialog from '@/views/form/components/DataPickerConfigDialog.vue'
import LookupPickerConfigDialog from '@/views/form/components/LookupPickerConfigDialog.vue'
import CardStyleConfigDialog from './components/CardStyleConfigDialog.vue'
import DashConfigDialog, { type DashConfigMode } from '@/views/dashboard/components/DashConfigDialog.vue'
import {
  DASH_KPI_NAME,
  DASH_CHART_NAME,
  DASH_FILTER_NAME,
  DASH_GOAL_NAME,
  DASH_LEADERBOARD_NAME,
  DASH_ALERT_NAME,
  dashKpiRule,
  dashChartRule,
  dashFilterRule,
  dashGoalRule,
  dashLeaderboardRule,
  dashAlertRule,
  dashConfigButton,
} from '@/views/dashboard/register'
import type { CardStyle } from '@/components/business/ListCards.types'
import { collectFieldsOfType, collectFieldKeys, collectFormulaRefFields, patchFieldProps, resolveActiveField, ensureRuleProps } from '@/views/form/formRuleWalk'
import { attachmentHintText, imageHintText } from '@/components/business/componentHints'
import { setFormulaFieldProvider } from '@/components/business/formulaFieldRegistry'
import { setActiveDsBindings, activeDsBindings } from '@/utils/formDsBindingsStore'

// 注册页面数据组件到 FcDesigner（表单组件已全局注册，页面可复用）
FcDesigner.component('page-table', PageDataTable)
FcDesigner.component('page-tree', PageDataTree)
FcDesigner.component('page-list-cards', PageDataCards)
// PAGE 轨新组件：设计器画布 + 预览（运行时注册在 PageRendererPage）
FcDesigner.component('page-form', PageDataForm)
FcDesigner.component('page-detail', PageDataDetail)
FcDesigner.component('page-chart', PageDataChartPage)
FcDesigner.component('page-tree-table', PageTreeTable)
// 纯展示五件套（Task 3-b）：无数据绑定
FcDesigner.component('page-iframe', PageIframe)
FcDesigner.component('page-notice-carousel', PageNoticeCarousel)
FcDesigner.component('page-calendar', PageCalendar)
FcDesigner.component('page-timeline', PageTimeline)
FcDesigner.component('page-steps', PageSteps)
FcDesigner.component('dash-kpi-trend', DashKpiTrend)
/** 环比指标卡注册名（DashKpi 同族，组件内未导出常量，本地声明） */
const DASH_KPI_TREND_NAME = 'dash-kpi-trend'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const designerRef = ref<any>(null)
const pageId = computed(() => route.query.id as string)
const pageName = ref('')
const pageKey = ref('')
const formStatus = ref('')

// ========== 挂接菜单（多挂接 + 列表管理） ==========
const mountDialogVisible = ref(false)
const mounting = ref(false)
const mountedMenus = ref<PageMenuItem[]>([])
const mountForm = reactive<{ name: string; parentId: number | null }>({ name: '', parentId: null })

/** 所属目录候选：authStore.menus 中 menuType===0 的目录节点（递归） */
const menuCategories = computed(() => filterMenuDirs(authStore.menus as any[]))

function filterMenuDirs(menus: any[]): any[] {
  return (menus || [])
    .filter((m: any) => m.menuType === 0)
    .map((m: any) => ({
      ...m,
      children: m.children ? filterMenuDirs(m.children) : [],
    }))
}

/** 打开挂接弹窗：加载已挂列表 */
async function openMountDialog() {
  mountDialogVisible.value = true
  if (pageKey.value) {
    await loadMountedMenus()
  }
}

async function loadMountedMenus() {
  try {
    const res = await pageApi.getMenusByKey(pageKey.value)
    mountedMenus.value = res.data?.items || []
  } catch {
    mountedMenus.value = []
  }
}

async function confirmMount() {
  if (!pageId.value) return
  mounting.value = true
  try {
    await pageApi.mountMenu(pageId.value, {
      name: mountForm.name || undefined,
      parentId: mountForm.parentId ?? null,
    })
    ElMessage.success('挂接成功')
    mountForm.name = ''
    mountForm.parentId = null
    await loadMountedMenus()
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    mounting.value = false
  }
}

async function handleUnmount(menu: PageMenuItem) {
  try {
    await ElMessageBox.confirm(`确定解除菜单「${menu.menuName}」吗？`, '解除挂接', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await pageApi.unmountMenu(menu.menuId)
    ElMessage.success('已解除')
    await loadMountedMenus()
  } catch {
    // http 拦截器已弹出错误消息
  }
}
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const previewVisible = ref(false)
const previewJson = ref('')
/** 数据源/动作配置弹窗 */
const dsDialogVisible = ref(false)
const dsConfigPanelRef = ref<InstanceType<typeof DataSourceConfigPanel> | null>(null)

function confirmDsConfig() {
  dsConfigPanelRef.value?.confirm()
  dsDialogVisible.value = false
  setActiveDsBindings(schema.dataSources as any)
}
const dsTab = ref('ds')

/** FcDesigner 配置：隐藏表单专用面板，保留组件/属性 */
const designerConfig = {
  fieldReadonly: false,
  disabledFormConfig: ['formCreateFormName'],
}

const designerHeight = '100%'

/** 页面 schema：dataSources 与 actions（rule 由 FcDesigner 管理） */
const schema = reactive<{
  dataSources: { id: string; refId: string; searchFields?: string[] }[]
  actions: any[]
}>({
  dataSources: [],
  actions: [],
})

/** 当前设计器 rule（供数据引用/查找带回配置与字段回写） */
const designerRule = computed<any[]>(() => {
  try {
    return designerRef.value?.getRule() || []
  } catch {
    return []
  }
})

/** 计算公式可视化编辑器字段来源（Task 145）：实时收集同层可引用字段（懒调用，registry 已兜底） */
setFormulaFieldProvider(() => collectFormulaRefFields(designerRef.value?.getRule() || []))

/** 页面画布中的全部字段，供筛选条件选择表单字段 */
const currentFieldKeys = computed<string[]>(() => collectFieldKeys(designerRule.value))

/** 当前选中的 dataPicker 字段与配置 */
const pickerDialogVisible = ref(false)
const selectedPickerField = ref('')
const pickerFields = computed(() => collectFieldsOfType(designerRule.value, 'dataPicker'))
const currentPickerProps = computed<Record<string, any>>(() =>
  pickerFields.value.find((field) => field.field === selectedPickerField.value)?.props || {},
)

/** 当前选中的 LookupPicker 字段与配置 */
const lookupDialogVisible = ref(false)
const selectedLookupField = ref('')
const lookupFields = computed(() => collectFieldsOfType(designerRule.value, 'LookupPicker'))
const currentLookupProps = computed<Record<string, any>>(() =>
  lookupFields.value.find((field) => field.field === selectedLookupField.value)?.props || {},
)

function openPickerConfig() {
  if (pickerFields.value.length === 0) {
    ElMessage.warning('画布中没有数据引用字段，请先拖入“数据引用”组件')
    return
  }
  selectedPickerField.value = resolveActiveField(
    pickerFields.value,
    'dataPicker',
    designerRef.value?.activeRule,
  )
  pickerDialogVisible.value = true
}

function handlePickerConfirm(newProps: Record<string, any>) {
  const rules = designerRef.value?.getRule() || []
  patchFieldProps(rules, 'dataPicker', selectedPickerField.value, newProps)
  designerRef.value?.setRule(ensureRuleProps(rules))
  ElMessage.success('数据引用配置已保存')
}

function openLookupConfig() {
  if (lookupFields.value.length === 0) {
    ElMessage.warning('画布中没有查找带回字段，请先拖入“查找带回”组件')
    return
  }
  selectedLookupField.value = resolveActiveField(
    lookupFields.value,
    'LookupPicker',
    designerRef.value?.activeRule,
  )
  lookupDialogVisible.value = true
}

function handleLookupConfirm(newProps: Record<string, any>) {
  const rules = designerRef.value?.getRule() || []
  patchFieldProps(rules, 'LookupPicker', selectedLookupField.value, newProps)
  designerRef.value?.setRule(ensureRuleProps(rules))
  ElMessage.success('查找带回配置已保存')
}

/** 已启用全局数据源 */
const enabledDataSources = ref<DataSourceDTO[]>([])

// ===== 页面数据表格数据源配置 =====
const pageTableDialogVisible = ref(false)
const currentPageTableProps = computed(() => {
  const active = designerRef.value?.activeRule as any
  return active?.props || {}
})
const currentPageListMode = computed<'table' | 'card'>(() =>
  designerRef.value?.activeRule?.type === 'page-list-cards' ? 'card' : 'table',
)
function openPageTableDsConfig() {
  pageTableDialogVisible.value = true
}
function handlePageTableConfirm(newProps: Record<string, any>) {
  const active = designerRef.value?.activeRule as any
  if (active?.props) Object.assign(active.props, newProps)
  // 将静态筛选写入 tableFilterStore（PageDataTable fetchApi 从 store 读取）
  const dsId = newProps.dataSourceId as string
  if (dsId) {
    if (newProps.filter) {
      tableFilterStore[dsId] = newProps.filter
    } else {
      delete tableFilterStore[dsId]
    }
  }
  ElMessage.success('数据表格数据源配置已保存')
}

// ===== 卡片样式脚本配置 =====
const cardStyleDialogVisible = ref(false)
const currentCardStyle = computed<CardStyle | undefined>(() => {
  const active = designerRef.value?.activeRule as any
  return active?.props?.cardStyle || undefined
})
function openCardStyleConfig() {
  cardStyleDialogVisible.value = true
}
function handleCardStyleConfirm(style: CardStyle) {
  const active = designerRef.value?.activeRule as any
  if (active?.props) {
    if (style && Object.keys(style).length > 0) {
      active.props.cardStyle = style
    } else {
      delete active.props.cardStyle
    }
  }
  ElMessage.success('卡片样式已保存')
}

function enableCardDesignMode(rules: any[]): any[] {
  return rules.map((rule) => {
    const next = { ...rule, props: rule.props ? { ...rule.props } : rule.props }
    // 设计态标记：卡片/表格/图表/树表格据此固定取首页且最多 10 条，page-form 画布禁写（与运行态分页/提交语义区分）
    if (
      next.type === 'page-list-cards' || next.type === 'page-table' ||
      next.type === 'page-chart' || next.type === 'page-tree-table' || next.type === 'page-form'
    ) {
      next.props = { ...(next.props || {}), designMode: true }
    }
    if (Array.isArray(next.children)) next.children = enableCardDesignMode(next.children)
    if (Array.isArray(next.props?.rule)) next.props.rule = enableCardDesignMode(next.props.rule)
    return next
  })
}

// ===== 页面数据表单容器配置（复用 DsBindingConfigDialog 非表格模式） =====
const formContainerDialogVisible = ref(false)
/** 数据容器 rule：画布中 loadRule 后 type 为 FcRow，序列化前为 formContainer，两者兼容判断 */
// ==================== 仪表盘组件配置（Task 119 → Task 120 组件族） ====================
const dashDialogVisible = ref(false)
const dashDialogMode = ref<DashConfigMode>('chart')
const DASH_CONFIG_TYPES: Record<DashConfigMode, string> = {
  kpi: DASH_KPI_NAME,
  chart: DASH_CHART_NAME,
  goal: DASH_GOAL_NAME,
  alert: DASH_ALERT_NAME,
  leaderboard: DASH_LEADERBOARD_NAME,
  filter: DASH_FILTER_NAME,
  kpiTrend: DASH_KPI_TREND_NAME,
}
const currentDashType = computed(() => DASH_CONFIG_TYPES[dashDialogMode.value] || '')
const currentDashProps = computed(() => {
  const active = designerRef.value?.activeRule as any
  if (active && active.type === currentDashType.value) {
    return active.props || {}
  }
  return {}
})
function openDashConfig(mode: DashConfigMode) {
  dashDialogMode.value = mode
  dashDialogVisible.value = true
}
function handleDashConfirm(patch: Record<string, any>) {
  const active = designerRef.value?.activeRule as any
  if (active && active.type === currentDashType.value && active.props) {
    const { mode: _mode, span, ...propsPatch } = patch
    Object.assign(active.props, propsPatch)
    // Task 123 宽度栅格：props 镜像（组件并排留白感知）+ rule.col（form-create 布局真身），
    // 运行态 transformComponent 浅拷贝透传 col，双端一致
    const spanNum = Math.min(24, Math.max(1, Number(span || 24)))
    active.props.span = spanNum
    active.col = { ...(active.col || {}), span: spanNum }
  }
}
/** 页级数据源显示名（绑定列表无 name 时回退全局源名） */
function dsNameOf(ds: { id: string; refId: string }): string {
  const global = enabledDataSources.value.find((d) => d.id === ds.refId)
  return global ? global.name : ''
}

// ==================== 数据图表配置（Task 3-e：page-chart 维度/指标） ====================
const chartDialogVisible = ref(false)
const chartCandidates = ref<Array<{ key: string; label?: string; columnType?: string | null }>>([])
const currentChartConfig = computed(() => {
  const active = designerRef.value?.activeRule as any
  return active?.type === 'page-chart' ? active?.props?.config || null : null
})
/** 打开图表配置：从页面绑定层解析 refId 拉取列元数据作候选 */
async function openChartConfig() {
  chartDialogVisible.value = true
  chartCandidates.value = []
  const active = designerRef.value?.activeRule as any
  const dsId = active?.props?.dataSourceId as string | undefined
  if (!dsId) return
  const binding = (activeDsBindings.value || []).find((d: any) => d.id === dsId)
  if (!binding?.refId) return
  try {
    const res = await dataSourceApi.getMetadata(binding.refId)
    chartCandidates.value = ((res.data as any)?.columns || []).filter((c: any) => !c.hidden)
  } catch {
    chartCandidates.value = []
  }
}
function handleChartConfirm(config: any) {
  const active = designerRef.value?.activeRule as any
  if (active?.type === 'page-chart' && active.props) {
    active.props.config = config
    ElMessage.success('图表配置已保存')
  }
}

// ===== 轻量数据源绑定（page-detail/page-tree-table：容器模式仅写 dataSourceId+filter，
// 避免表格模式弹窗把确认输出 columns/headerFilter 等覆写到这两个组件的专属 props 上） =====
const lightDsDialogVisible = ref(false)
const currentLightDsProps = computed(() => (designerRef.value?.activeRule as any)?.props || {})
function openLightDsConfig() {
  lightDsDialogVisible.value = true
}
function handleLightDsConfirm(newProps: Record<string, any>) {
  const active = designerRef.value?.activeRule as any
  if (active?.props) Object.assign(active.props, newProps)
  ElMessage.success('数据源配置已保存')
}

// ==================== 左树右表一键模板（Task 3-h） ====================
/** 向画布追加 page-tree（左 8 栅格）+ page-table（右 16 栅格），联动由用户在事件链中配置 node-click → set-filter */
function insertLeftTreeRightTableTemplate() {
  const designer = designerRef.value as any
  if (!designer || typeof designer.setRule !== 'function') return
  const ts = Date.now()
  const treeRule = {
    type: 'page-tree',
    field: 'tree' + ts,
    title: '左树',
    col: { span: 8 },
    props: {
      dataSourceId: '',
      'node-key': 'id',
      props: { label: 'name', children: 'children' },
      highlightCurrent: true,
      defaultExpandAll: true,
    },
  }
  const tableRule = {
    type: 'page-table',
    field: 'table' + ts,
    title: '右表',
    col: { span: 16 },
    props: {
      dataSourceId: '',
      border: true,
      stripe: true,
      columns: [],
      sortable: false,
      filterable: false,
      pagination: true,
      selectionMode: 'none',
      actionColumnWidth: 0,
    },
  }
  const rules = (typeof designer.getRule === 'function' ? designer.getRule() : []) || []
  designer.setRule([...rules, treeRule, tableRule])
  ElMessage.success('已插入左树右表模板：请分别配置两个组件的数据源，并为左树配置 node-click → set-filter 联动到右表')
}

function isContainerRule(active: any): boolean {
  return !!active && (active.type === 'formContainer' || active.type === 'FcRow')
}
const currentFormContainerProps = computed(() => {
  const active = designerRef.value?.activeRule as any
  return isContainerRule(active) ? (active.props || {}) : {}
})
function openFormContainerDsConfig() {
  formContainerDialogVisible.value = true
}
function handleFormContainerConfirm(newProps: Record<string, any>) {
  const active = designerRef.value?.activeRule as any
  if (isContainerRule(active) && active.props) {
    Object.assign(active.props, newProps)
  }
  ElMessage.success('数据表单容器配置已保存')
}

/** 注册页面组件到 FcDesigner 面板，并通过 setComponentRuleConfig 在属性面板注入"数据源"按钮（动态读取页面绑定层） */
function registerPageComponents() {
  // 属性面板注入：数据源按钮 + 表格配置（选项来自页面绑定层 schema.dataSources）
  const dataSourceProps = () => [
    {
      type: 'button',
      field: 'dsConfigTrigger',
      title: '数据源',
      children: ['配置数据源'],
      native: true,
      style: { width: '100%', borderColor: '#2E73FF', color: '#2E73FF' },
      props: { size: 'small' },
      on: { click: () => openPageTableDsConfig() },
    },
  ]

  /** 轻量数据源按钮：容器模式弹窗，仅写 dataSourceId/filter（保护 page-detail.columns / page-tree-table.columns 等专属 props 不被表格模式确认输出覆写） */
  const lightDsButton = () => [
    {
      type: 'button',
      field: 'dsConfigTrigger',
      title: '数据源',
      children: ['配置数据源'],
      native: true,
      style: { width: '100%', borderColor: '#2E73FF', color: '#2E73FF' },
      props: { size: 'small' },
      on: { click: () => openLightDsConfig() },
    },
  ]

  const pickerConfigProps = (label: string, onClick: () => void) => [
    {
      type: 'button',
      field: 'pickerConfigTrigger',
      title: '',
      children: [label],
      native: true,
      style: { width: '100%', borderColor: '#2E73FF', color: '#2E73FF' },
      props: { size: 'small' },
      on: { click: onClick },
    },
  ]

  /** 卡片列表专属配置：配置数据源 + 卡片样式脚本（样式脚本位于数据源下方） */
  const cardListProps = () => [
    ...dataSourceProps(),
    {
      type: 'button',
      field: 'cardStyleTrigger',
      title: '卡片样式脚本',
      children: ['卡片样式脚本'],
      native: true,
      style: { width: '100%', marginLeft: '0', borderColor: '#2E73FF', color: '#2E73FF' },
      props: { size: 'small' },
      on: { click: () => openCardStyleConfig() },
    },
  ]

  // 数据引用与查找带回复用表单设计器的组件注册和配置入口
  designerRef.value?.addComponent({
    label: '数据引用',
    name: 'dataPicker',
    icon: 'icon-link',
    menu: 'main',
    rule: () => ({
      type: 'dataPicker',
      field: 'dataPicker' + Date.now(),
      title: '数据引用',
      props: { dataSourceId: '', displayField: '', columns: [], searchColumns: [] },
    }),
  })
  designerRef.value?.setComponentRuleConfig(
    'dataPicker',
    () => pickerConfigProps('配置数据引用', openPickerConfig),
    true,
  )

  designerRef.value?.addComponent({
    label: '查找带回',
    name: 'LookupPicker',
    icon: 'icon-search',
    menu: 'main',
    rule: () => ({
      type: 'LookupPicker',
      field: 'lookup' + Date.now(),
      title: '选择',
      props: { columns: [], displayField: '', returnFields: {}, idField: '' },
    }),
  })
  designerRef.value?.setComponentRuleConfig(
    'LookupPicker',
    () => pickerConfigProps('配置查找带回', openLookupConfig),
    true,
  )

  designerRef.value?.addComponent({
    label: '数据表格',
    name: 'page-table',
    icon: 'icon-table',
    menu: 'main',
    rule: () => ({
      type: 'page-table',
      field: 'table' + Date.now(),
      title: '数据表格',
      props: {
        dataSourceId: '',
        border: true,
        stripe: true,
        columns: [],
        sortable: false,
        filterable: false,
        pagination: true,
        selectionMode: 'none',
        actionColumnWidth: 0,
      },
    }),
  })
  // 属性面板"属性配置"区注入数据源下拉 + 表格配置（选中画布中该组件时动态求值）
  designerRef.value?.setComponentRuleConfig('page-table', dataSourceProps, true)

  designerRef.value?.addComponent({
    label: '卡片列表',
    name: 'page-list-cards',
    icon: 'icon-card',
    menu: 'main',
    rule: () => ({
      type: 'page-list-cards',
      field: 'cards' + Date.now(),
      title: '卡片列表',
      props: {
        dataSourceId: '',
        columns: [],
        pagination: true,
        pageSize: 20,
        cardMinWidth: 280,
        groupBy: '',
        collapsibleGroups: false,
        designMode: true,
      },
    }),
  })
  designerRef.value?.setComponentRuleConfig('page-list-cards', cardListProps, true)

  designerRef.value?.addComponent({
    label: '树形数据',
    name: 'page-tree',
    icon: 'icon-tree',
    menu: 'main',
    rule: () => ({
      type: 'page-tree',
      field: 'tree' + Date.now(),
      title: '树形数据',
      props: {
        dataSourceId: '',
        'node-key': 'id',
        props: { label: 'name', children: 'children' },
        highlightCurrent: true,
        defaultExpandAll: true,
      },
    }),
  })
  designerRef.value?.setComponentRuleConfig('page-tree', dataSourceProps, true)

  // 仪表盘组件（Task 119）：KPI 指标卡 / 统计图（数据源配置按钮注入属性面板）
  // 注意：icon 必须取 FcDesigner 内置 iconfont 类名（@form-create/designer 的 fc-icon 字体），
  // 自造类名（icon-count/icon-filter 等）不在字体里会渲染成空白——即「组件没有图标」的根因。
  designerRef.value?.addComponent({
    label: 'KPI 指标卡',
    name: DASH_KPI_NAME,
    icon: 'icon-statistic',
    menu: 'chart',
    rule: () => dashKpiRule() as any,
  })
  designerRef.value?.setComponentRuleConfig(
    DASH_KPI_NAME,
    () => [dashConfigButton('配置指标卡', () => openDashConfig('kpi'))],
    true,
  )

  designerRef.value?.addComponent({
    label: '统计图',
    name: DASH_CHART_NAME,
    icon: 'icon-stack',
    menu: 'chart',
    rule: () => dashChartRule() as any,
  })
  designerRef.value?.setComponentRuleConfig(
    DASH_CHART_NAME,
    () => [dashConfigButton('配置图表', () => openDashConfig('chart'))],
    true,
  )

  // 仪表盘组件族（Task 120）：筛选器 / 目标进度 / 排行榜 / 告警标记
  designerRef.value?.addComponent({
    label: '筛选器',
    name: DASH_FILTER_NAME,
    icon: 'icon-data-select',
    menu: 'chart',
    rule: () => dashFilterRule() as any,
  })
  designerRef.value?.setComponentRuleConfig(
    DASH_FILTER_NAME,
    () => [dashConfigButton('配置筛选器', () => openDashConfig('filter'))],
    true,
  )

  designerRef.value?.addComponent({
    label: '目标进度',
    name: DASH_GOAL_NAME,
    icon: 'icon-yes',
    menu: 'chart',
    rule: () => dashGoalRule() as any,
  })
  designerRef.value?.setComponentRuleConfig(
    DASH_GOAL_NAME,
    () => [dashConfigButton('配置目标', () => openDashConfig('goal'))],
    true,
  )

  designerRef.value?.addComponent({
    label: '排行榜',
    name: DASH_LEADERBOARD_NAME,
    icon: 'icon-statistics',
    menu: 'chart',
    rule: () => dashLeaderboardRule() as any,
  })
  designerRef.value?.setComponentRuleConfig(
    DASH_LEADERBOARD_NAME,
    () => [dashConfigButton('配置排行榜', () => openDashConfig('leaderboard'))],
    true,
  )

  designerRef.value?.addComponent({
    label: '告警标记',
    name: DASH_ALERT_NAME,
    icon: 'icon-warning',
    menu: 'chart',
    rule: () => dashAlertRule() as any,
  })
  designerRef.value?.setComponentRuleConfig(
    DASH_ALERT_NAME,
    () => [dashConfigButton('配置告警', () => openDashConfig('alert'))],
    true,
  )

  // ===== PAGE 轨新组件（Task 3-e/3-f/3-h） =====
  // 数据录入页（page-form）：绑定数据源 + 表单定义，create/edit 双模式
  designerRef.value?.addComponent({
    label: '数据录入',
    name: 'page-form',
    icon: 'icon-input',
    menu: 'main',
    rule: () => ({
      type: 'page-form',
      field: 'form' + Date.now(),
      title: '数据录入',
      props: { dataSourceId: '', mode: 'create', submitText: '提交' },
    }),
  })
  designerRef.value?.setComponentRuleConfig('page-form', lightDsButton, true)

  // KV 详情（page-detail）：行点击联动展示选中记录
  designerRef.value?.addComponent({
    label: '数据详情',
    name: 'page-detail',
    icon: 'icon-cell',
    menu: 'main',
    rule: () => ({
      type: 'page-detail',
      field: 'detail' + Date.now(),
      title: '数据详情',
      props: { dataSourceId: '', columns: [] },
    }),
  })
  designerRef.value?.setComponentRuleConfig('page-detail', lightDsButton, true)

  // 树形表格（page-tree-table）：平铺数据客户端组树只读展示
  designerRef.value?.addComponent({
    label: '树形表格',
    name: 'page-tree-table',
    icon: 'icon-tree',
    menu: 'main',
    rule: () => ({
      type: 'page-tree-table',
      field: 'treeTable' + Date.now(),
      title: '树形表格',
      props: { dataSourceId: '', columns: [], idKey: 'id', parentKey: 'parentId', border: true },
    }),
  })
  designerRef.value?.setComponentRuleConfig('page-tree-table', lightDsButton, true)

  // 数据图表（page-chart）：自取数 + 前端聚合，配置弹窗选维度/指标
  designerRef.value?.addComponent({
    label: '数据图表',
    name: 'page-chart',
    icon: 'icon-stack',
    menu: 'chart',
    rule: () => ({
      type: 'page-chart',
      field: 'chart' + Date.now(),
      title: '数据图表',
      props: { dataSourceId: '', config: null, height: '320px' },
    }),
  })
  designerRef.value?.setComponentRuleConfig('page-chart', () => [
    ...dataSourceProps(),
    {
      type: 'button',
      field: 'chartConfigTrigger',
      title: '',
      children: ['配置图表'],
      native: true,
      style: { width: '100%', marginLeft: '0', borderColor: '#2E73FF', color: '#2E73FF' },
      props: { size: 'small' },
      on: { click: () => openChartConfig() },
    },
  ], true)

  // 环比指标卡（dash-kpi-trend）：DashKpi 同族，配置走 DashConfigDialog kpiTrend 模式
  designerRef.value?.addComponent({
    label: '环比指标卡',
    name: DASH_KPI_TREND_NAME,
    icon: 'icon-statistic',
    menu: 'chart',
    rule: () => ({
      type: DASH_KPI_TREND_NAME,
      field: 'kpiTrend' + Date.now(),
      title: '环比指标卡',
      props: { dataSourceId: '', compareOffset: 'month', compareLabel: '环比' },
    }),
  })
  designerRef.value?.setComponentRuleConfig(
    DASH_KPI_TREND_NAME,
    () => [dashConfigButton('配置环比卡', () => openDashConfig('kpiTrend'))],
    true,
  )

  // ===== 纯展示五件套（Task 3-b）：无数据绑定，items 用 JsonItemsEditor 直编 JSON 数组 =====
  designerRef.value?.addComponent({
    label: '内嵌网页',
    name: 'page-iframe',
    icon: 'icon-application',
    menu: 'aide',
    rule: () => ({ type: 'page-iframe', field: 'pageIframe' + Date.now(), title: '', props: { url: '', height: '360px', scrolling: true } }),
  })
  designerRef.value?.setComponentRuleConfig('page-iframe', () => [
    { type: 'input', field: 'url', title: '内嵌地址', props: { placeholder: 'https://...' } },
    { type: 'input', field: 'height', title: '高度' },
    { type: 'switch', field: 'scrolling', title: '允许滚动' },
  ], true)

  designerRef.value?.addComponent({
    label: '公告轮播',
    name: 'page-notice-carousel',
    icon: 'icon-bulletin',
    menu: 'aide',
    rule: () => ({ type: 'page-notice-carousel', field: 'notice' + Date.now(), title: '', props: { items: [], height: '180px', interval: 4000 } }),
  })
  designerRef.value?.setComponentRuleConfig('page-notice-carousel', () => [
    { type: 'JsonItemsEditor', field: 'items', title: '公告项', info: '数组：[{title,content,color?}]' },
    { type: 'input', field: 'height', title: '高度' },
    { type: 'inputNumber', field: 'interval', title: '轮播间隔(ms)', props: { min: 1000, step: 500 } },
  ], true)

  designerRef.value?.addComponent({
    label: '日历',
    name: 'page-calendar',
    icon: 'icon-calendar',
    menu: 'aide',
    rule: () => ({ type: 'page-calendar', field: 'calendar' + Date.now(), title: '', props: { highlightedDates: [] } }),
  })
  designerRef.value?.setComponentRuleConfig('page-calendar', () => [
    { type: 'JsonItemsEditor', field: 'highlightedDates', title: '高亮日期', info: '字符串数组：["2026-10-01", ...]' },
  ], true)

  designerRef.value?.addComponent({
    label: '时间线',
    name: 'page-timeline',
    icon: 'icon-date',
    menu: 'aide',
    rule: () => ({ type: 'page-timeline', field: 'timeline' + Date.now(), title: '', props: { items: [], reverse: false } }),
  })
  designerRef.value?.setComponentRuleConfig('page-timeline', () => [
    { type: 'JsonItemsEditor', field: 'items', title: '节点', info: '数组：[{timestamp,title?,content?,color?}]' },
    { type: 'switch', field: 'reverse', title: '倒序' },
  ], true)

  designerRef.value?.addComponent({
    label: '步骤条',
    name: 'page-steps',
    icon: 'icon-step-form',
    menu: 'aide',
    rule: () => ({ type: 'page-steps', field: 'steps' + Date.now(), title: '', props: { items: [], active: 0, direction: 'horizontal' } }),
  })
  designerRef.value?.setComponentRuleConfig('page-steps', () => [
    { type: 'JsonItemsEditor', field: 'items', title: '步骤', info: '数组：[{title,description?}]' },
    { type: 'inputNumber', field: 'active', title: '当前步骤', props: { min: 0 } },
    { type: 'select', field: 'direction', title: '方向', options: [{ label: '横向', value: 'horizontal' }, { label: '纵向', value: 'vertical' }] },
  ], true)

  // 基础组件：计算公式（Task 144，组件已在 main.ts 全局注册）
  designerRef.value?.addComponent({
    label: '计算公式',
    name: 'FormulaField',
    icon: 'icon-statistic',
    menu: 'main',
    rule: () => ({
      type: 'FormulaField',
      field: 'formulaField' + Date.now(),
      title: '计算公式',
      props: { expression: '', precision: 2, prefix: '', suffix: '', placeholder: '—', disabled: false },
    }),
    props: () => [
      {
        type: 'FormulaExpressionEditor',
        field: 'expression',
        title: '计算表达式',
        info: '用 ${字段名} 引用同表单字段，支持 + - * / % 与 MIN/MAX/SUM/AVG/ABS/ROUND/FLOOR/CEIL；点击「可视化配置」弹窗点选拼接',
      },
      { type: 'inputNumber', field: 'precision', title: '小数位数', props: { min: 0, max: 10, precision: 0 } },
      { type: 'input', field: 'prefix', title: '前缀' },
      { type: 'input', field: 'suffix', title: '后缀' },
      { type: 'input', field: 'placeholder', title: '占位提示' },
      { type: 'switch', field: 'disabled', title: '禁用' },
    ],
  })

  // 系统组件分组（Task 143）：用户 / 部门选择器（组件已在 main.ts 全局注册，
  // 分组 'system' 由 vendor/config/menu.js 声明，此处仅挂载面板项）
  designerRef.value?.addComponent({
    label: '用户',
    name: 'SystemUserPicker',
    icon: 'icon-avatar',
    menu: 'system',
    rule: () => ({
      type: 'SystemUserPicker',
      field: 'sysUser' + Date.now(),
      title: '用户',
      props: { multiple: false, disabled: false, clearable: true, placeholder: '请选择用户' },
    }),
    props: () => [
      { type: 'switch', field: 'multiple', title: '多选' },
      { type: 'switch', field: 'disabled', title: '禁用' },
      { type: 'input', field: 'placeholder', title: '占位提示' },
    ],
    watch: {
      multiple({ rule }: { rule: any }) {
        rule.key = 'k' + Date.now()
      },
    },
  })

  designerRef.value?.addComponent({
    label: '部门',
    name: 'SystemDeptPicker',
    icon: 'icon-branch',
    menu: 'system',
    rule: () => ({
      type: 'SystemDeptPicker',
      field: 'sysDept' + Date.now(),
      title: '部门',
      props: { multiple: false, disabled: false, clearable: true, placeholder: '请选择部门' },
    }),
    props: () => [
      { type: 'switch', field: 'multiple', title: '多选' },
      { type: 'switch', field: 'disabled', title: '禁用' },
      { type: 'input', field: 'placeholder', title: '占位提示' },
    ],
    watch: {
      multiple({ rule }: { rule: any }) {
        rule.key = 'k' + Date.now()
      },
    },
  })

  // Task 148 反馈 2：说明性文字同步到规则 info（form-create 在 label 后以 ？ 图标悬浮显示，
  // 画布与运行时通用；属性面板变更时重算，文案事实源见 componentHints.ts）
  const syncAttachmentInfo = ({ rule }: { rule: any }) => {
    rule.info = attachmentHintText(rule.props || {})
  }
  const syncImageInfo = ({ rule }: { rule: any }) => {
    rule.info = imageHintText(rule.props || {})
  }

  designerRef.value?.addComponent({
    label: '附件',
    name: 'SystemAttachment',
    icon: 'icon-upload',
    menu: 'system',
    rule: () => ({
      type: 'SystemAttachment',
      field: 'sysAttachment' + Date.now(),
      title: '附件',
      // 说明性文字走 label 后 ？ 图标悬浮（Task 148 反馈 2），由 info 派生并随属性变更同步
      info: attachmentHintText({ limit: 5, multiSelect: true, maxSizeMB: 10, accept: [] }),
      props: {
        limit: 5,
        multiSelect: true,
        draggable: false,
        previewable: true,
        showFileName: true,
        maxSizeMB: 10,
        accept: [] as string[],
        disabled: false,
        placeholder: '暂无附件',
      },
    }),
    props: () => [
      { type: 'inputNumber', field: 'limit', title: '文件数量', props: { min: 0, max: 50, precision: 0 }, info: '1 = 单文件（值为单个附件 id）；≥2 = 多文件且为数量上限；0 = 多文件不限' },
      { type: 'switch', field: 'multiSelect', title: '一次多选上传', info: '文件选择框允许一次选中多个文件（仅多文件模式生效）' },
      { type: 'switch', field: 'draggable', title: '拖拽上传' },
      { type: 'switch', field: 'previewable', title: '支持预览' },
      { type: 'switch', field: 'showFileName', title: '显示文件名' },
      { type: 'inputNumber', field: 'maxSizeMB', title: '单文件上限(MB)', props: { min: 1, max: 100, precision: 0 }, info: '服务端全局上限 100MB' },
      {
        type: 'select',
        field: 'accept',
        title: '类型限制',
        props: { multiple: true, filterable: true, allowCreate: true, defaultFirstOption: true, clearable: true, placeholder: '下拉多选或输入后回车，留空不限' },
        options: [
          { value: 'image/*', label: '图片 image/*' },
          { value: '.pdf', label: 'PDF .pdf' },
          { value: '.doc,.docx', label: 'Word .doc/.docx' },
          { value: '.xls,.xlsx', label: 'Excel .xls/.xlsx' },
          { value: '.ppt,.pptx', label: 'PPT .ppt/.pptx' },
          { value: '.txt,.md,.csv', label: '文本 .txt/.md/.csv' },
          { value: '.zip,.rar,.7z', label: '压缩包 .zip/.rar/.7z' },
          { value: 'video/*', label: '视频 video/*' },
          { value: 'audio/*', label: '音频 audio/*' },
        ],
        info: '预设类型下拉多选，也可手动输入 accept 语法（输入后回车创建）',
      },
      { type: 'switch', field: 'disabled', title: '禁用' },
      { type: 'input', field: 'placeholder', title: '空态提示' },
    ],
    watch: {
      limit({ rule }: { rule: any }) {
        rule.key = 'k' + Date.now() // 单/多文件值语义切换时重建画布节点
        rule.info = attachmentHintText(rule.props || {})
      },
      multiSelect: syncAttachmentInfo,
      maxSizeMB: syncAttachmentInfo,
      accept: syncAttachmentInfo,
    },
  })

  // 系统组件分组（Task 147）：图片上传（组件已在 main.ts 全局注册）
  designerRef.value?.addComponent({
    label: '图片',
    name: 'SystemImage',
    icon: 'icon-image',
    menu: 'system',
    rule: () => ({
      type: 'SystemImage',
      field: 'sysImage' + Date.now(),
      title: '图片',
      info: imageHintText({ limit: 5, multiSelect: true, maxSizeMB: 10, minWidth: 0, maxWidth: 0, minHeight: 0, maxHeight: 0 }),
      props: {
        limit: 5,
        multiSelect: true,
        maxSizeMB: 10,
        minWidth: 0,
        maxWidth: 0,
        minHeight: 0,
        maxHeight: 0,
        thumbnailSize: 110,
        previewable: true,
        downloadable: true,
        disabled: false,
        placeholder: '暂无图片',
      },
    }),
    props: () => [
      { type: 'inputNumber', field: 'limit', title: '图片数量', props: { min: 0, max: 50, precision: 0 }, info: '1 = 单图（值为单个图片 id）；≥2 = 多图且为数量上限；0 = 多图不限' },
      { type: 'switch', field: 'multiSelect', title: '一次多选上传', info: '文件选择框允许一次选中多个图片（仅多图模式生效）' },
      { type: 'inputNumber', field: 'maxSizeMB', title: '单图上限(MB)', props: { min: 1, max: 100, precision: 0 }, info: '服务端全局上限 100MB' },
      { type: 'inputNumber', field: 'minWidth', title: '最小宽度(px)', props: { min: 0, max: 20000, precision: 0 }, info: '0 = 不限' },
      { type: 'inputNumber', field: 'maxWidth', title: '最大宽度(px)', props: { min: 0, max: 20000, precision: 0 }, info: '0 = 不限' },
      { type: 'inputNumber', field: 'minHeight', title: '最小高度(px)', props: { min: 0, max: 20000, precision: 0 }, info: '0 = 不限' },
      { type: 'inputNumber', field: 'maxHeight', title: '最大高度(px)', props: { min: 0, max: 20000, precision: 0 }, info: '0 = 不限' },
      { type: 'inputNumber', field: 'thumbnailSize', title: '缩略图边长(px)', props: { min: 64, max: 640, precision: 0 }, info: '缩略图卡片边长（64~640），服务端按最大边等比生成' },
      { type: 'switch', field: 'previewable', title: '支持预览' },
      { type: 'switch', field: 'downloadable', title: '支持下载' },
      { type: 'switch', field: 'disabled', title: '禁用' },
      { type: 'input', field: 'placeholder', title: '空态提示' },
    ],
    watch: {
      limit({ rule }: { rule: any }) {
        rule.key = 'k' + Date.now() // 单/多图值语义切换时重建画布节点
        rule.info = imageHintText(rule.props || {})
      },
      multiSelect: syncImageInfo,
      maxSizeMB: syncImageInfo,
      minWidth: syncImageInfo,
      maxWidth: syncImageInfo,
      minHeight: syncImageInfo,
      maxHeight: syncImageInfo,
    },
  })

  // formContainer（数据表单容器）：配置入口复用 DsBindingConfigDialog，避免维护第二套字段
  designerRef.value?.setComponentRuleConfig(
    'formContainer',
    () => [
      {
        type: 'button',
        field: 'dsConfigTrigger',
        title: '数据源',
        children: ['配置数据源'],
        native: true,
        style: { width: '100%', borderColor: '#2E73FF', color: '#2E73FF' },
        props: { size: 'small' },
        on: { click: () => openFormContainerDsConfig() },
      },
      {
        type: 'json',
        field: 'recordLocator',
        title: '记录定位',
        value: { type: 'current-record' },
      },
    ],
    false,
  )
}

onMounted(async () => {
  // 注册页面数据组件到 FcDesigner 拖拽面板（数据源配置入口在表单配置页签底部）
  registerPageComponents()

  if (!pageId.value) {
    ElMessage.error('缺少页面 ID')
    router.push('/page')
    return
  }
  loading.value = true
  try {
    const [dsRes, pageRes] = await Promise.all([
      dataSourceApi.getEnabledDataSources(),
      pageApi.getPage(pageId.value),
    ])
    enabledDataSources.value = (dsRes.data || []).filter((d) => d.type === 'FORM' || d.type === 'API' || d.type === 'SYSTEM')

    const def = pageRes.data as PageDefinitionDetailDTO
    pageName.value = def.name
    pageKey.value = def.key
    formStatus.value = def.status || 'DRAFT'
    if (def.schema) {
      try {
        const parsed = JSON.parse(def.schema)
        schema.dataSources = parsed.dataSources || []
        // 写入模块级绑定存储：设计态卡片/数据组件据此解析 dataSourceId → refId，
        // 否则依赖运行态残留才显示（先开运行页再开设计页才有数据）
        setActiveDsBindings(schema.dataSources as any)
        schema.actions = parsed.actions || []
        // 设置 FcDesigner rule（等待设计器就绪后 setRule）
        if (designerRef.value) {
          designerRef.value.setRule(ensureRuleProps(enableCardDesignMode(parsed.rule || [])))
          designerRef.value.setOption(parsed.option || {})
          // 从已保存的 rule 中恢复静态筛选到 tableFilterStore
          const rules = parsed.rule || []
          for (const r of rules) {
            if (r.props?.filter && r.props?.dataSourceId) {
              tableFilterStore[r.props.dataSourceId] = r.props.filter
            }
          }
        }
      } catch {
        // 解析失败用默认
      }
    }
    // 已发布页面加载已挂菜单（按钮显示"已挂接 N 个菜单"）
    if (formStatus.value === 'PUBLISHED') {
      await loadMountedMenus()
    }
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
  }
})

function addDataSource() {
  schema.dataSources.push({ id: `ds_${Date.now().toString(36)}`, refId: '' })
}

function updateDataSources(newDataSources: { id: string; refId: string; searchFields?: string[] }[]) {
  schema.dataSources.splice(0, schema.dataSources.length, ...newDataSources)
  // 数据源配置变更同步模块级绑定存储，卡片组件 reactive 立即按新绑定重取
  setActiveDsBindings(newDataSources as any)
}

function updateActions(newActions: any[]) {
  schema.actions.splice(0, schema.actions.length, ...newActions)
}

async function handleSave() {
  if (!pageName.value) {
    ElMessage.warning('请填写页面名称')
    return
  }
  saving.value = true
  try {
    await pageApi.updatePage(pageId.value, {
      name: pageName.value,
      key: pageKey.value,
      type: 'PAGE',
      formKey: null,
      schema: JSON.stringify({
        rule: designerRef.value?.getRule() || [],
        option: designerRef.value?.getOption() || {},
        dataSources: schema.dataSources,
        actions: schema.actions,
      }),
    })
    ElMessage.success('保存成功')
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    saving.value = false
  }
}

async function handlePublish() {
  const isRepublish = formStatus.value === 'PUBLISHED'
  try {
    await ElMessageBox.confirm(
      isRepublish ? '确定要重新发布此页面吗？' : '确定要发布此页面吗？',
      isRepublish ? '确认重新发布' : '确认发布',
      { type: 'warning' },
    )
  } catch {
    return
  }
  publishing.value = true
  try {
    const res = await pageApi.publishPage(pageId.value)
    ElMessage.success('发布成功')
    formStatus.value = ((res.data as any)?.status as string) || 'PUBLISHED'
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    publishing.value = false
  }
}

function handlePreview() {
  if (!pageKey.value) {
    ElMessage.warning('页面标识为空，无法预览')
    return
  }
  window.open(`/page/${pageKey.value}?preview=true`, '_blank')
}

function handleShowJson() {
  previewJson.value = JSON.stringify(
    {
      rule: designerRef.value?.getRule() || [],
      option: designerRef.value?.getOption() || {},
      dataSources: schema.dataSources,
      actions: schema.actions,
    },
    null,
    2,
  )
  previewVisible.value = true
}

function handleBack() {
  const returnTo = route.query.returnTo as string
  if (returnTo) {
    router.push(returnTo)
  } else {
    router.push('/page')
  }
}

function statusTagType(status: string): '' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'info'> = {
    DRAFT: 'warning',
    PUBLISHED: 'success',
    ARCHIVED: 'info',
  }
  return map[status] || ''
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    ARCHIVED: '已归档',
  }
  return map[status] || status
}

</script>

<style scoped>
.page-designer-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.designer-toolbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  gap: 8px;
  height: 50px;
  flex-shrink: 0;
}
.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.designer-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.designer-body :deep(.el-container._fc-designer) {
  flex: 1 !important;
  min-width: 0;
}
.ds-row {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
  align-items: center;
}
.action-card {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 6px;
  margin-bottom: 8px;
}
.step-row {
  margin-left: 8px;
}
.form-tip {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}
/* 表单配置页签底部：数据源与动作配置入口 */
.form-extra-section {
  border-top: 1px dashed #e8e8e8;
  margin-top: 8px;
  padding-top: 8px;
}
.form-extra-header {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
  margin-bottom: 4px;
}
/* 对齐 LookupPicker"点击配置数据源"按钮样式：全宽 + 蓝色描边 */
.ds-config-btn {
  width: 100%;
  border-color: #2E73FF;
  color: #2E73FF;
  font-weight: 400;
  margin-top: 4px;
}
.ds-config-btn:hover {
  border-color: #2E73FF;
  color: #fff;
  background-color: #2E73FF;
}
.preview-json {
  max-height: 60vh;
  overflow: auto;
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.mounted-menus {
  margin-bottom: 12px;
}
.mounted-menus-title {
  font-size: 13px;
  color: #909399;
  margin-bottom: 6px;
}
.mounted-menu-tag {
  margin-right: 6px;
  margin-bottom: 6px;
}
.mount-alert {
  margin-bottom: 12px;
}
</style>
