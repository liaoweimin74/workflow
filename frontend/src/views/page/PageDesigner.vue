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

    <!-- 卡片样式脚本配置（结构化 CardStyle，覆盖主题） -->
    <CardStyleConfigDialog
      v-model="cardStyleDialogVisible"
      :card-style="currentCardStyle"
      @confirm="handleCardStyleConfirm"
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
import { ArrowLeft, Check, Promotion, View, Document, Menu } from '@element-plus/icons-vue'
import FcDesigner from '@form-create/designer'
import PageDataTable from './components/PageDataTable.vue'
import PageDataCards from './components/PageDataCards.vue'
import { tableFilterStore } from './components/tableFilterStore'
import PageDataTree from './components/PageDataTree.vue'
import { pageApi, type PageDefinitionDetailDTO, type PageMenuItem } from '@/api/page'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import { useAuthStore } from '@/stores/auth'
import DataSourceConfigPanel from '@/components/business/DataSourceConfigPanel.vue'
import DsBindingConfigDialog from '@/views/form/components/DsBindingConfigDialog.vue'
import DataPickerConfigDialog from '@/views/form/components/DataPickerConfigDialog.vue'
import LookupPickerConfigDialog from '@/views/form/components/LookupPickerConfigDialog.vue'
import CardStyleConfigDialog from './components/CardStyleConfigDialog.vue'
import type { CardStyle } from '@/components/business/ListCards.types'
import { collectFieldsOfType, collectFieldKeys, patchFieldProps, resolveActiveField } from '@/views/form/formRuleWalk'
import { setActiveDsBindings } from '@/utils/formDsBindingsStore'

// 注册页面数据组件到 FcDesigner（表单组件已全局注册，页面可复用）
FcDesigner.component('page-table', PageDataTable)
FcDesigner.component('page-tree', PageDataTree)
FcDesigner.component('page-list-cards', PageDataCards)

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
  designerRef.value?.setRule(rules)
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
  designerRef.value?.setRule(rules)
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
    // 设计态标记：卡片/表格据此固定取首页且最多 10 条（与运行态分页语义区分）
    if (next.type === 'page-list-cards' || next.type === 'page-table') {
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
    icon: 'icon-grid',
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
    icon: 'icon-grid',
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
          designerRef.value.setRule(enableCardDesignMode(parsed.rule || []))
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
