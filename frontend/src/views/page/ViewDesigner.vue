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
        <el-tab-pane label="数据源" name="datasource">
          <el-form label-width="100px" size="default">
            <el-form-item label="选择数据源" required>
              <el-select
                v-model="dataSourceId"
                placeholder="选择全局数据源"
                style="width: 100%"
                @change="handleDataSourceChange"
              >
                <el-option v-for="ds in enabledDataSources" :key="ds.id" :label="ds.name" :value="ds.id" />
              </el-select>
              <span class="form-tip">切换后自动加载列定义</span>
            </el-form-item>
          </el-form>
          <el-divider content-position="left">数据源筛选</el-divider>
          <FilterConfig
            v-model="schema.filter"
            :columns="filterableColumnsForFilter"
          />
        </el-tab-pane>
        <el-tab-pane label="显示&查询" name="query">
          <QueryColumnsConfig
            :candidates="viewColumns"
            :filterable-keys="filterableColumnKeys"
            v-model:search-fields="schema.searchFields"
            v-model:columns="schema.columns"
            v-model:sortable-fields="schema.sortableFields"
            :sortable-candidates="sortableCandidates"
            :mode="schema.display === 'card' ? 'card' : 'table'"
          />
          <!-- 显示方式：表格 / 卡片（切换后兼容属性在渲染时保留，表格列自动映射卡片字段） -->
          <el-divider content-position="left">显示方式</el-divider>
          <el-form label-width="100px" size="default">
            <el-form-item label="显示方式">
              <el-radio-group v-model="schema.display">
                <el-radio-button value="table">表格</el-radio-button>
                <el-radio-button value="card">卡片</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-form>
          <!-- 分页配置（视图级） -->
          <el-divider content-position="left">分页</el-divider>
          <el-form label-width="100px" size="default">
            <el-form-item label="显示分页">
              <el-switch v-model="schema.pagination.show" />
            </el-form-item>
            <el-form-item label="每页条数">
              <el-input-number
                v-model="schema.pagination.pageSize"
                :min="1"
                :max="200"
                :step="10"
                style="width: 160px"
              />
            </el-form-item>
            <el-form-item label="可选页大小">
              <el-select
                v-model="schema.pagination.pageSizes"
                multiple
                allow-create
                filterable
                default-first-option
                :reserve-keyword="false"
                placeholder="选择或输入每页大小"
                style="width: 100%"
              >
                <el-option v-for="n in [10, 20, 50, 100]" :key="n" :label="n + ' 条'" :value="n" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="操作" name="actions">
          <ActionsConfig v-model="schema.actions" v-model:detail="schema.detail" />
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
import FilterConfig from './components/FilterConfig.vue'

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
  /** @deprecated 排序能力由数据源 metadata 声明（方案 A），本字段不再配置；历史残留被忽略 */
  sortable?: boolean
  /** 列内容类型：expression（JS 表达式）/ template（${字段} 插值） */
  contentType?: 'expression' | 'template'
  /** 列内容值（与 contentType 配对：expression → JS 表达式，template → 插值模板） */
  contentValue?: string
  /** @deprecated 已迁移至 contentType='expression' + contentValue */
  formatter?: string
  /** 固定列（left/right） */
  fixed?: string
  /** @deprecated 已迁移至 contentType='template' + contentValue */
  template?: string
  /** @deprecated 已迁移至 contentType='expression' + contentValue */
  expression?: string
  /** 单元格 class（透传 <td> 静态样式） */
  className?: string
  /** 单元格样式表达式（返回样式字符串/CSSProperties 对象，如 $row.status==='PENDING' ? 'color:red' : ''） */
  styleExpr?: string
  /** 列头点击事件链（点击本列单元格触发；配置后短路整表级 cell-click） */
  onCellClick?: { actions: any[] }
  /** 自定义计算列标记（key 非数据源字段；由"添加自定义列"写入，后端编译时跳过引用列校验） */
  custom?: boolean
  /** 自定义列隐藏标记（取消勾选展示时置 true：保留列定义与高级配置，仅不在表格渲染） */
  hidden?: boolean
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
  /** 表单容器高度（弹窗/抽屉/内嵌内容区高度，超出滚动） */
  height?: string
  type: string
  /** 表单展示方式：popup（弹窗）/ drawer（抽屉）/ inline（内嵌） */
  formMode?: 'popup' | 'drawer' | 'inline'
}
export interface ViewSchema {
  searchFields: SearchFieldConfig[]
  /** 视图级可排序字段（受数据源 metadata 上限约束；缺省=跟随数据源全部可排字段） */
  sortableFields: string[]
  /** 分页配置（缺省显示分页 / 20 条 / [10,20,50]） */
  pagination: { show: boolean; pageSize: number; pageSizes: number[] }
  columns: ColumnViewConfig[]
  actions: ViewActionsConfig
  detail: ViewDetailConfig
  events: any[]
  /** 显示方式：table（表格）/ card（卡片）；缺省表格 */
  display?: 'table' | 'card'
  /** 数据源静态筛选（可选；运行时与用户搜索条件 AND 合并） */
  filter?: { logic: 'AND' | 'OR'; conditions: Array<{ column: string; op: string; source: 'fixed'; value: string }> }
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
const activeTab = ref('datasource')
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
  sortableFields: [],
  pagination: { show: true, pageSize: 20, pageSizes: [10, 20, 50] },
  columns: [],
  display: 'table',
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
  filter: undefined,
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

/** 可排序字段候选（数据源 metadata 声明 sortable=true 的列；数据源不可排字段不可配置） */
const sortableCandidates = computed(() =>
  viewColumns.value.filter((c) => c.sortable).map((c) => ({ key: c.key, label: c.label })),
)

/** 数据源筛选可用列候选（所有可展示列，供 FilterConfig 使用） */
const filterableColumnsForFilter = computed(() =>
  viewColumns.value.map((c) => ({ key: c.key, label: c.label || c.key })),
)

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
        normalizePagination()
        normalizeDisplay()
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

/** 归一化 pagination：兼容旧 schema 缺失/部分字段，回填默认（显示 / 20 / [10,20,50]） */
function normalizePagination() {
  const p = (schema.pagination || {}) as Partial<ViewSchema['pagination']>
  schema.pagination = {
    show: p.show !== false,
    pageSize: Number(p.pageSize) > 0 ? Number(p.pageSize) : 20,
    pageSizes: Array.isArray(p.pageSizes) && p.pageSizes.length ? [...p.pageSizes] : [10, 20, 50],
  }
}

/** 归一化显示方式：兼容旧 schema 缺失 display，缺省表格 */
function normalizeDisplay() {
  const d = schema.display
  schema.display = d === 'card' ? 'card' : 'table'
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
      }))
      // 排序能力默认跟随数据源全部可排字段（视图级收窄，可再编辑）
      schema.sortableFields = viewColumns.value
        .filter((c) => c.sortable)
        .map((c) => c.key)
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
.form-tip {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>