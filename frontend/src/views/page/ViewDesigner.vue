<template>
  <div class="view-designer-page">
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
      <el-tag v-if="pageType" :type="pageType === 'VIEW' ? 'primary' : 'success'" style="margin-left: 8px">
        {{ pageType === 'VIEW' ? '视图' : '页面' }}
      </el-tag>
      <el-select
        v-model="dataSourceId"
        placeholder="选择数据源"
        style="width: 220px; margin-left: 8px"
        @change="handleDataSourceChange"
      >
        <el-option v-for="ds in enabledDataSources" :key="ds.id" :label="ds.name" :value="ds.id" />
      </el-select>
      <el-tag v-if="formStatus" :type="statusTagType(formStatus)" style="margin-left: 8px">
        {{ statusLabel(formStatus) }}
      </el-tag>
      <div class="toolbar-right">
        <el-button type="primary" :icon="Check" @click="handleSave" :loading="saving">保存</el-button>
        <el-button
          type="success"
          :icon="Promotion"
          @click="handlePublish"
          :loading="publishing"
          :disabled="!bindFormLoaded"
        >
          {{ formStatus === 'PUBLISHED' ? '重新发布' : '发布' }}
        </el-button>
        <el-button v-if="formStatus === 'PUBLISHED'" :icon="Menu" @click="openMountDialog">
          {{ mountedMenus.length ? `已挂接 ${mountedMenus.length} 个菜单` : '挂接菜单' }}
        </el-button>
        <el-button :icon="View" @click="handlePreview">预览</el-button>
        <el-button :icon="Document" @click="handleShowJson">JSON 配置</el-button>
      </div>
    </div>

    <!-- 设计器主体：清单勾选式配置区 -->
    <div class="designer-body" v-loading="loading">
      <el-tabs v-model="activeTab" class="config-tabs">
        <el-tab-pane label="显示&查询" name="query">
          <QueryColumnsConfig
            :candidates="viewColumns"
            :filterable-keys="filterableColumnKeys"
            v-model:search-fields="schema.searchFields"
            v-model:columns="schema.columns"
          />
        </el-tab-pane>
        <el-tab-pane label="操作" name="actions">
          <ActionsConfig v-model="schema.actions" :detail="schema.detail" />
        </el-tab-pane>
        <el-tab-pane label="事件" name="events">
          <EventsConfig v-model="schema.events" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 预览弹窗：展示当前 schema JSON -->
    <el-dialog v-model="previewVisible" title="视图配置 JSON" width="760px">
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
import { pageApi, type PageDefinitionDetailDTO, type PageMenuItem } from '@/api/page'
import { useAuthStore } from '@/stores/auth'
import { dataSourceApi, type DataSourceDTO, type DataSourceMetadataDTO } from '@/api/data-source'
import type { ColumnConfigItem } from '@/api/bizData'
import QueryColumnsConfig from './components/QueryColumnsConfig.vue'
import ActionsConfig from './components/ActionsConfig.vue'
import EventsConfig from './components/EventsConfig.vue'

const authStore = useAuthStore()

// ========== Schema 类型 ==========
export interface SearchFieldConfig {
  key: string
  label: string
  matchType: string
}
export interface ColumnViewConfig {
  key: string
  label: string
  width?: number
  align?: string
  sortable?: boolean
  /** 列值格式化器（currency/date/datetime/boolean/enum） */
  formatter?: string
  /** 固定列（left/right） */
  fixed?: string
}
export interface ViewActionButton {
  key: string
  label: string
  /** 位置：toolbar（操作栏）/ column（操作列） */
  placement: 'toolbar' | 'column'
  /** 形态：icon（仅图标）/ text（文字链接）/ button（带图标按钮） */
  style: 'icon' | 'text' | 'button'
  /** 图标名（Element Plus 图标，如 Plus/Edit/Delete/View；留空按内置 key 兜底） */
  icon?: string
  /** 自定义按钮事件链（点击触发）；内置按钮无需 */
  events?: any[]
  /** 条件显示表达式（如 $row.status === 'PENDING'） */
  visible?: string
}
export interface ViewActionsConfig {
  buttons: ViewActionButton[]
  permissions: string
  /** 操作列宽度（px，可选；缺省按按钮数量自动计算） */
  actionColumnWidth?: number
}
export interface ViewDetailConfig {
  /** 详情弹窗宽度（由"查看"按钮启用，无需独立开关） */
  width: string
  type: string
}
export interface ViewSchema {
  searchFields: SearchFieldConfig[]
  columns: ColumnViewConfig[]
  actions: ViewActionsConfig
  detail: ViewDetailConfig
  events: any[]
}

const route = useRoute()
const router = useRouter()

const pageId = computed(() => route.query.id as string)
const pageName = ref('')
const pageKey = ref('')
const pageType = ref('')
const dataSourceId = ref<string | null>(null)
const formStatus = ref('')

const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const activeTab = ref('query')
/** 预览弹窗：当前视图配置 JSON */
const previewVisible = ref(false)
const previewJson = ref('')

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

/** 已启用数据源（绑定下拉：FORM/WORKFLOW） */
const enabledDataSources = ref<DataSourceDTO[]>([])
/** 绑定数据源的列映射（候选字段来源，来自 metadata） */
const selectedColumns = ref<ColumnConfigItem[]>([])
/** 绑定数据源是否已加载候选（发布按钮依赖） */
const bindFormLoaded = ref(false)

const schema = reactive<ViewSchema>({
  searchFields: [],
  columns: [],
  actions: {
    buttons: [
      { key: 'create', label: '新增', placement: 'toolbar', style: 'button' },
      { key: 'edit', label: '编辑', placement: 'column', style: 'button' },
      { key: 'delete', label: '删除', placement: 'column', style: 'button' },
      { key: 'view', label: '查看', placement: 'column', style: 'button' },
    ],
    permissions: '',
  },
  detail: { width: '800px', type: 'form' },
  events: [],
})

/** 可展示列（非隐藏） */
const viewColumns = computed(() => selectedColumns.value.filter((c) => !c.hidden))

/** 可筛选列（非 JSON/TEXT、非 colorPicker、非隐藏，且 indexed 或短文本）——对齐 BizDataListPage.filterableColumns */
const filterableColumns = computed(() =>
  viewColumns.value.filter(
    (c) =>
      c.columnType !== 'JSON' &&
      c.columnType !== 'TEXT' &&
      c.componentType !== 'colorPicker' &&
      (c.indexed || (c.length != null && c.length <= 64) || c.columnType === 'VARCHAR'),
  ),
)

/** 可筛选列的 key 集合（查询条件勾选禁用依据） */
const filterableColumnKeys = computed(() => new Set(filterableColumns.value.map((c) => c.key)))

onMounted(async () => {
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
    const dsList = (dsRes.data || []) as DataSourceDTO[]
    // 绑定下拉仅展示 FORM/WORKFLOW（业务表单/工作流表单）数据源
    enabledDataSources.value = dsList.filter((d) => d.type === 'FORM' || d.type === 'WORKFLOW')

    const def = pageRes.data as PageDefinitionDetailDTO
    pageName.value = def.name
    pageKey.value = def.key
    pageType.value = def.type || 'VIEW'
    dataSourceId.value = def.dataSourceId || null
    formStatus.value = def.status || 'DRAFT'
    if (def.schema) {
      try {
        Object.assign(schema, JSON.parse(def.schema))
        normalizeActions()
      } catch {
        // schema 解析失败，使用默认空配置
      }
    }
    if (dataSourceId.value) {
      await loadBindColumns(dataSourceId.value)
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

/** 归一化 actions：旧布尔格式 → buttons 数组（保证 modelValue.buttons 始终存在） */
function normalizeActions() {
  const a = schema.actions as any
  if (Array.isArray(a.buttons)) return // 新格式已有 buttons
  // 旧格式转换
  const placement = (a.placement === 'toolbar' ? 'toolbar' : 'column') as 'toolbar' | 'column'
  const style = (a.style || 'button') as 'button' | 'icon' | 'text'
  const buttons: ViewActionButton[] = []
  if (a.create) buttons.push({ key: 'create', label: '新增', placement: 'toolbar', style })
  if (a.edit) buttons.push({ key: 'edit', label: '编辑', placement, style })
  if (a.delete) buttons.push({ key: 'delete', label: '删除', placement, style })
  if (a.view) buttons.push({ key: 'view', label: '查看', placement, style })
  schema.actions = { buttons, permissions: a.permissions || '' }
}

/** 加载绑定数据源 metadata 列（候选字段来源） */
async function loadBindColumns(dsId: string) {
  bindFormLoaded.value = false
  try {
    const res = await dataSourceApi.getMetadata(dsId)
    const meta = res.data as DataSourceMetadataDTO
    selectedColumns.value = meta.columns || []
    // 新页面（查询/显示均未配置）→ 默认全选：可筛选列默认查询，可展示列默认显示
    if (schema.searchFields.length === 0 && schema.columns.length === 0) {
      const filterable = new Set(filterableColumns.value.map((c) => c.key))
      schema.searchFields = viewColumns.value
        .filter((c) => filterable.has(c.key))
        .map((c) => ({ key: c.key, label: c.label, matchType: 'eq' }))
      schema.columns = viewColumns.value.map((c) => ({
        key: c.key,
        label: c.label,
        width: 130,
        align: 'left',
        sortable: false,
      }))
    }
  } catch {
    selectedColumns.value = []
  } finally {
    bindFormLoaded.value = true
  }
}

function handleDataSourceChange(dsId: string) {
  void loadBindColumns(dsId)
}

async function handleSave() {
  if (!pageName.value) {
    ElMessage.warning('请填写页面名称')
    return
  }
  if (!dataSourceId.value) {
    ElMessage.warning('请选择数据源')
    return
  }
  saving.value = true
  try {
    const res = await pageApi.updatePage(pageId.value, {
      name: pageName.value,
      key: pageKey.value,
      type: pageType.value || 'VIEW',
      dataSourceId: dataSourceId.value,
      schema: JSON.stringify({ ...schema }),
    })
    ElMessage.success('保存成功')
    formStatus.value = ((res.data as any)?.status as string) || formStatus.value
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    saving.value = false
  }
}

async function handlePublish() {
  if (!bindFormLoaded.value) return
  const isRepublish = formStatus.value === 'PUBLISHED'
  const confirmText = isRepublish
    ? '确定要重新发布此页面吗？将覆盖线上渲染配置。'
    : '确定要发布此页面吗？发布后不可修改。'
  try {
    await ElMessageBox.confirm(confirmText, isRepublish ? '确认重新发布' : '确认发布', {
      type: 'warning',
    })
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

/** 预览：新标签打开视图渲染页（preview=true 取最新 DRAFT 定义，无需先发布） */
function handlePreview() {
  if (!pageKey.value) {
    ElMessage.warning('页面标识为空，无法预览')
    return
  }
  window.open(`/page/${pageKey.value}?preview=true`, '_blank')
}

/** JSON 配置：弹出当前 schema JSON 弹窗 */
function handleShowJson() {
  previewJson.value = JSON.stringify({ ...schema }, null, 2)
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

function statusTagType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
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
.view-designer-page {
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

.page-name-input :deep(.el-input__wrapper) {
  font-weight: bold;
}

.page-key-input :deep(.el-input__wrapper) {
  font-size: 14px;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.designer-body {
  flex: 1;
  overflow: hidden;
  background: #fff;
}

.config-tabs {
  padding: 0 16px;
  height: 100%;
}

.config-tabs :deep(.el-tabs__content) {
  overflow-y: auto;
  height: calc(100% - 55px);
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