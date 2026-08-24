<template>
  <div class="data-source-list-page">
    <el-card style="overflow: hidden">
      <template #header>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-weight: bold; font-size: 14px">数据源管理</span>
          <el-tag type="info" size="small">FORM/WORKFLOW/SYSTEM 由系统自动管理；API 支持手动增删改</el-tag>
        </div>
      </template>
      <SearchTable
        ref="tableRef"
        :search-fields="searchFields"
        :columns="columns"
        :action-buttons="actionButtons"
        :fetch-api="fetchApi"
        :default-page-size="20"
        :max-visible-buttons="5"
      >
        <template #default>
          <el-button type="primary" :icon="Plus" v-permission="'data-source:manage'" @click="openCreate">
            新建
          </el-button>
        </template>
        <template #type="{ row }">
          <el-tag :type="typeTagType(row.type)">
            {{ typeLabel(row.type) }}
          </el-tag>
        </template>
        <template #bound="{ row }">
          <span>{{ row.formKey || row.sourceKey || '—' }}</span>
        </template>
        <template #status="{ row }">
          <el-tag :type="statusTagType(row.status)">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
        <template #updatedAt="{ row }">
          {{ formatDate(row.updatedAt) }}
        </template>
      </SearchTable>
    </el-card>

      <!-- 查看/新建/编辑数据源弹窗 -->
      <el-dialog
        v-model="dialogVisible"
        :title="dialogTitle"
        width="760px"
        top="6vh"
        destroy-on-close
        :close-on-click-modal="false"
      >
        <el-form :model="form" label-width="110px" label-position="left">
        <el-form-item label="数据源名称">
          <el-input v-model="form.name" placeholder="请输入数据源名称" maxlength="50" :disabled="isReadonlyForm" />
        </el-form-item>

        <el-form-item label="数据源类型">
          <el-tag :type="typeTagType(form.type)">{{ typeLabel(form.type) }}</el-tag>
        </el-form-item>
          <!-- ============ 统一 API 配置：FORM/SYSTEM 自动填充，API 手动配置 ============ -->
          <el-form-item label="标识">
            <template v-if="form.type === 'FORM'">
              <el-select v-model="form.formKey" placeholder="选择已发布的业务表单" filterable style="width: 320px" disabled>
                <el-option v-for="f in publishedForms" :key="f.key" :label="f.name" :value="f.key" />
              </el-select>
            </template>
            <template v-else-if="form.type === 'WORKFLOW'">
              <el-select v-model="form.formKey" placeholder="选择已发布的工作流表单" filterable style="width: 320px" disabled>
                <el-option v-for="f in publishedWorkflowForms" :key="f.key" :label="f.name" :value="f.key" />
              </el-select>
            </template>
            <template v-else-if="form.type === 'SYSTEM'">
              <el-select v-model="form.sourceKey" placeholder="选择系统结构" style="width: 320px" disabled>
                <el-option label="部门树" value="dept-tree" />
                <el-option label="用户列表" value="user-tree" />
              </el-select>
            </template>
            <template v-else>
              <el-input v-model="form.sourceKey" placeholder="如 external-stock（同一外部系统的稳定标识）" style="width: 320px" :disabled="isReadonlyForm" />
            </template>
          </el-form-item>
        </el-form>

        <el-tabs v-model="activeTab" @tab-click="onTabClick" style="margin-top: 16px">
          <el-tab-pane label="接口配置" name="config">
            <el-divider content-position="left">接口操作</el-divider>

            <!-- 可滚动的接口操作区域 -->
            <div class="ops-scroll">

              <!-- ===== API：可编辑表单 ===== -->
              <template v-if="form.type === 'API'">
            <el-form :model="form" label-width="110px" label-position="left">
                  <el-form-item :label="opLabel.list">
                    <div class="op-editor">
                      <el-input v-model="apiOps.list.action" placeholder="如 /v1/products" style="width: 260px" :disabled="isReadonlyForm" />
                      <el-select v-model="apiOps.list.method" style="width: 110px" :disabled="isReadonlyForm">
                        <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                      <el-input v-model="apiOps.list.parse" placeholder="列表解析（如 records / content / data.records）" style="width: 200px" :disabled="isReadonlyForm" />
                      <el-input v-model="apiOps.list.totalParse" placeholder="总数解析（留空取数组长度）" style="width: 180px" :disabled="isReadonlyForm" />
                    </div>
                  </el-form-item>

                  <el-form-item :label="opLabel.get">
                    <div class="op-editor">
                      <el-input v-model="apiOps.get.action" placeholder="如 /v1/products/{id}" style="width: 260px" :disabled="isReadonlyForm" />
                      <el-select v-model="apiOps.get.method" style="width: 110px" :disabled="isReadonlyForm">
                        <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                    </div>
                  </el-form-item>

                  <el-form-item :label="opLabel.create">
                    <div class="op-editor">
                      <el-input v-model="apiOps.create.action" placeholder="如 /v1/products" style="width: 260px" :disabled="isReadonlyForm" />
                      <el-select v-model="apiOps.create.method" style="width: 110px" :disabled="isReadonlyForm">
                        <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                    </div>
                  </el-form-item>

                  <el-form-item :label="opLabel.update">
                    <div class="op-editor">
                      <el-input v-model="apiOps.update.action" placeholder="如 /v1/products/{id}" style="width: 260px" :disabled="isReadonlyForm" />
                      <el-select v-model="apiOps.update.method" style="width: 110px" :disabled="isReadonlyForm">
                        <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                    </div>
                  </el-form-item>

                  <el-form-item :label="opLabel.delete">
                    <div class="op-editor">
                      <el-input v-model="apiOps.delete.action" placeholder="如 /v1/products/{id}" style="width: 260px" :disabled="isReadonlyForm" />
                      <el-select v-model="apiOps.delete.method" style="width: 110px" :disabled="isReadonlyForm">
                        <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                    </div>
                  </el-form-item>

                  <el-form-item label="搜索参数">
                    <div class="op-editor">
                      <el-input v-model="form.searchParam" placeholder="搜索参数名（如 kw，默认 keyword）" style="width: 200px" :disabled="isReadonlyForm" />
                      <el-input v-model="form.keywordColumn" placeholder="搜索列名（如 name）" style="width: 200px" :disabled="isReadonlyForm" />
                      <el-select v-model="form.pageBase" style="width: 130px" :disabled="isReadonlyForm">
                        <el-option label="页码从 1 开始" :value="1" />
                        <el-option label="页码从 0 开始" :value="0" />
                      </el-select>
                    </div>
                  </el-form-item>

                  <el-form-item label="固定参数 JSON">
                    <el-input v-model="form.data" placeholder='可选，如 {"dept":"IT"}' rows="2" type="textarea" :disabled="isReadonlyForm" />
                  </el-form-item>
                  <el-form-item label="请求头 JSON">
                    <el-input v-model="form.headers" placeholder='可选，如 {"X-Api-Key":"abc"}' rows="2" type="textarea" :disabled="isReadonlyForm" />
                  </el-form-item>

                  <el-divider content-position="left">列定义（列表展示与编辑弹窗使用）</el-divider>

                  <el-form-item label="列">
                    <div class="column-editor">
                      <div v-for="(col, idx) in apiColumns" :key="idx" class="column-row">
                        <el-input v-model="col.key" placeholder="字段名" style="width: 130px" :disabled="isReadonlyForm" />
                        <el-input v-model="col.label" placeholder="列名" style="width: 130px" :disabled="isReadonlyForm" />
                        <el-select v-model="col.columnType" placeholder="类型" style="width: 120px" :disabled="isReadonlyForm">
                          <el-option v-for="t in COLUMN_TYPES" :key="t" :label="t" :value="t" />
                        </el-select>
                        <el-input-number
                          v-if="needsLength(col.columnType)"
                          v-model="col.length"
                          :min="0"
                          :max="10000"
                          placeholder="长度"
                          controls-position="right"
                          style="width: 120px"
                          :disabled="isReadonlyForm"
                        />
                        <el-input-number
                          v-if="col.columnType === 'DECIMAL'"
                          v-model="col.scale"
                          :min="0"
                          :max="10"
                          placeholder="精度"
                          controls-position="right"
                          style="width: 110px"
                          :disabled="isReadonlyForm"
                        />
                        <el-checkbox v-model="col.required" title="必填" :disabled="isReadonlyForm">必填</el-checkbox>
                        <el-checkbox v-model="col.unique" title="唯一" :disabled="isReadonlyForm">唯一</el-checkbox>
                        <el-checkbox v-model="col.indexed" title="索引" :disabled="isReadonlyForm">索引</el-checkbox>
                        <el-button :icon="Delete" circle :disabled="isReadonlyForm" @click="apiColumns.splice(idx, 1)" />
                      </div>
                      <el-button type="primary" plain :icon="Plus" :disabled="isReadonlyForm" @click="addColumn">添加列</el-button>
                    </div>
                  </el-form-item>
                </el-form>
              </template>

              <!-- ===== FORM / SYSTEM：只读端点展示 ===== -->
              <template v-else-if="generateEndpoints()">
                <div class="auto-params-display">
                  <div v-for="(op, name) in generateEndpoints()" :key="name" class="op-row">
                    <el-tag :type="op.readonly ? 'info' : op.method === 'GET' ? 'primary' : op.method === 'POST' ? 'success' : 'warning'" size="small">
                      {{ op.method }}
                    </el-tag>
                    <code>{{ op.action }}</code>
                    <span class="op-label">（{{ name }}）</span>
                    <el-tag v-if="op.readonly" type="danger" size="small">只读</el-tag>
                    <template v-if="op.parse">
                      <span class="op-meta">parse: {{ op.parse }}</span>
                    </template>
                    <template v-if="op.totalParse">
                      <span class="op-meta">totalParse: {{ op.totalParse }}</span>
                    </template>
                  </div>
                </div>
              </template>

            </div>
          </el-tab-pane>

          <el-tab-pane label="字段元数据" name="metadata">
            <div class="metadata-section">
              <el-row :gutter="8" class="metadata-header">
                <el-col>
                  <el-tag :type="metadata?.writable ? 'success' : 'info'" size="small">
                    {{ metadata?.writable ? '可写' : '只读' }}
                  </el-tag>
                </el-col>
              </el-row>
              <el-table
                :data="metadata?.columns || []"
                v-loading="metadataLoading"
                style="width: 100%"
                :max-height="300"
              >
                <el-table-column prop="label" label="字段名" min-width="120" />
                <el-table-column prop="key" label="标识" min-width="120" />
                <el-table-column prop="componentType" label="组件" min-width="100" />
                <el-table-column prop="columnType" label="类型" min-width="100" />
                <el-table-column prop="length" label="长度" min-width="80" />
                <el-table-column prop="required" label="必填" min-width="80" />
                <el-table-column prop="unique" label="唯一" min-width="80" />
              </el-table>
              <div v-if="metadataError" class="metadata-error">
                <el-alert :title="metadataError" type="error" />
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="数据预览" name="data">
            <div class="preview-section">
              <el-row :gutter="8" class="preview-toolbar" style="align-items: center">
                <el-col>
                  <div style="display: flex; align-items: center; gap: 8px">
                    <el-input
                      v-model="previewKeyword"
                      placeholder="搜索关键词"
                      style="width: 200px"
                      size="small"
                    />
                    <el-button type="primary" size="small" :loading="dataLoading" @click="onSearch">
                      搜索
                    </el-button>
                  </div>
                </el-col>
                <el-col style="margin-left: auto">
                  <el-pagination
                    layout="total, prev, pager, next"
                    :page-size="previewSize"
                    :total="previewTotal"
                    :current-page="previewPage"
                    @size-change="onPageSizeChange"
                    @current-change="onPageChange"
                  />
                </el-col>
              </el-row>
              <el-table
                :data="previewTableData"
                v-loading="dataLoading"
                style="width: 100%"
                :max-height="300"
              >
                <el-table-column
                  v-for="col in displayColumns"
                  :key="col.key"
                  :prop="col.key"
                  :label="col.label"
                  min-width="120"
                  show-overflow-tooltip
                />
              </el-table>
              <div v-if="dataError" class="preview-error">
                <el-alert :title="dataError" type="error" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-dialog>
   </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, View, Edit, Delete, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton } from '@/components/business/types'
import { dataSourceApi, type DataSourceDTO, type DataSourceMetadataDTO, type DataSourceQueryParams } from '@/api/data-source'
import type { ColumnConfigItem, BizDataVO } from '@/api/bizData'
import { formApi, type FormDefinitionDTO } from '@/api/form'

const tableRef = ref<InstanceType<typeof SearchTable>>()

/** 已发布业务表单（FORM 类型 formKey 下拉候选） */
const publishedForms = ref<FormDefinitionDTO[]>([])

/** 已发布工作流表单（WORKFLOW 类型 formKey 下拉候选） */
const publishedWorkflowForms = ref<FormDefinitionDTO[]>([])

/** API 操作 HTTP 方法候选 */
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const

/** 列定义字段类型候选（第一版：仅列定义字段，不含 componentType） */
const COLUMN_TYPES = ['VARCHAR', 'INTEGER', 'BIGINT', 'DECIMAL', 'DATETIME', 'DATE', 'TEXT', 'TINYINT'] as const

// ========== 搜索 ==========
const searchFields = computed<SearchField[]>(() => [
  { type: 'input', label: '数据源名称', prop: 'name', placeholder: '搜索数据源名称', style: 'width: 200px' },
  {
    type: 'select',
    label: '类型',
    prop: 'type',
    placeholder: '全部',
    options: [
      { label: '业务表单', value: 'FORM' },
      { label: '工作流表单', value: 'WORKFLOW' },
      { label: '系统结构', value: 'SYSTEM' },
      { label: '第三方 API', value: 'API' },
    ],
    style: 'width: 140px',
  },
  {
    type: 'select',
    label: '状态',
    prop: 'status',
    placeholder: '全部',
    options: [
      { label: '草稿', value: 'DRAFT' },
      { label: '已启用', value: 'ENABLED' },
      { label: '已禁用', value: 'DISABLED' },
    ],
    style: 'width: 140px',
  },
])

// ========== 列 ==========
const columns: TableColumn[] = [
  { prop: 'name', label: '数据源名称', minWidth: 180 },
  { prop: 'type', label: '类型', width: 110, align: 'center', slotName: 'type' },
  { prop: 'bound', label: '绑定对象', minWidth: 160, slotName: 'bound' },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'updatedAt', label: '最近更新时间', width: 170, slotName: 'updatedAt' },
]

// ========== 数据获取 ==========
async function fetchApi(params: any) {
  const res = await dataSourceApi.getDataSources({
    page: (params.page || 1) - 1,
    size: params.size || 20,
    name: params.name || undefined,
    status: params.status || undefined,
    type: params.type || undefined,
  })
  const data = res.data as any
  return {
    rows: data.content || data.rows || [],
    total: data.totalElements || data.total || 0,
  }
}

// ========== 新建/编辑弹窗状态 ==========
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
/** 纯查看模式（openView 打开，区别于可编辑的 API 编辑模式） */
const viewOnly = ref(false)

/** 是否为查看模式（弹窗处于打开态） */
const isViewMode = computed(() => editingId.value !== null)

/** 是否为 API 类型（唯一支持手动增删改的类型） */
const isApiType = computed(() => form.type === 'API')

/** 表单整体只读：纯查看模式，或非 API 类型（FORM/WORKFLOW/SYSTEM 由系统管理） */
const isReadonlyForm = computed(() => viewOnly.value || !isApiType.value)

/** 弹窗标题 */
const dialogTitle = computed(() => {
  if (viewOnly.value) {
    return '查看数据源'
  }
  return isApiType.value ? (editingId.value ? '编辑数据源' : '新建数据源') : '数据源详情'
})

/** 单操作配置（多操作 params 结构） */
interface ApiOpConfig {
  action: string
  method: string
  parse?: string
  totalParse?: string
}

/** 弹窗表单（类型无关字段 + API 公共字段） */
const form = reactive({
  name: '',
  type: 'FORM' as string,
  formKey: '',
  sourceKey: '',
  searchParam: '',
  keywordColumn: '',
  pageBase: 1 as 0 | 1,
  data: '',
  headers: '',
})

/** API 类型：五个操作配置 */
const apiOps = reactive<Record<'list' | 'get' | 'create' | 'update' | 'delete', ApiOpConfig>>({
  list: { action: '', method: 'GET' },
  get: { action: '', method: 'GET' },
  create: { action: '', method: 'POST' },
  update: { action: '', method: 'PUT' },
  delete: { action: '', method: 'DELETE' },
})

/** API 类型：列定义 */
const apiColumns = ref<ColumnConfigItem[]>([])

/** 当前激活标签：config / metadata / data */
const activeTab = ref('config')

/** ================ 字段元数据 ================= */
const metadata = ref<DataSourceMetadataDTO | null>(null)
const metadataLoading = ref(false)
const metadataError = ref<string | null>(null)

/** ================ 数据预览 ================= */
const previewData = ref<BizDataVO[]>([])
const previewTotal = ref(0)
const previewPage = ref(1)
const previewSize = ref(20)
const previewKeyword = ref('')
const dataLoading = ref(false)
const dataError = ref<string | null>(null)

/** 操作表单标签（统一界面，所有类型显示相同标签） */
const opLabel = computed(() => ({ list: '列表查询 (list)', get: '单条查询 (get)', create: '新增 (create)', update: '修改 (update)', delete: '删除 (delete)' }))

/** 元数据表格列定义（用于渲染） */
const displayColumns = computed(() => metadata.value?.columns || [])

/** 数据预览表格显示数据（扁平化 BizDataVO.data） */
const previewTableData = computed(() => {
  return previewData.value.map((row) => ({
    id: row.id,
    _version: row.version,
    ...(row.data || {})
  }))
})

/** 重置元数据/预览状态（每次打开弹窗时清空） */
function resetMetadataState() {
  metadata.value = null
  metadataLoading.value = false
  metadataError.value = null
}

function resetPreviewState() {
  previewData.value = []
  previewTotal.value = 0
  previewPage.value = 1
  previewKeyword.value = ''
  dataLoading.value = false
  dataError.value = null
}

/** 处理标签切换 (el-tabs @tab-click 事件) */
async function onTabClick(tab: { props: { name: string } }) {
  await handleTabChange(tab.props.name)
}

/** 处理标签切换 (直接调用用) */
async function handleTabChange(tab: string) {
  activeTab.value = tab
  if (tab === 'metadata' && editingId.value && !metadata.value) {
    await loadMetadata()
  }
  if (tab === 'data' && editingId.value) {
    // 数据预览需要列定义：若元数据未加载，先加载元数据
    if (!metadata.value) {
      await loadMetadata()
    }
    await loadPreviewData()
  }
}

/** 加载元数据 */
async function loadMetadata() {
  if (!editingId.value) return
  metadataLoading.value = true
  metadataError.value = null
  try {
    const res = await dataSourceApi.getMetadata(editingId.value)
    metadata.value = res.data
  } catch (e: any) {
    metadataError.value = e?.message || '加载字段元数据失败'
  } finally {
    metadataLoading.value = false
  }
}

/** 加载数据预览 */
async function loadPreviewData() {
  if (!editingId.value) return
  dataLoading.value = true
  dataError.value = null
  try {
    const res = await dataSourceApi.queryData(editingId.value, {
      page: previewPage.value - 1, // API 使用 0-indexed 页码
      size: previewSize.value,
      keyword: previewKeyword.value || undefined,
    })
    previewData.value = res.data.records || []
    previewTotal.value = res.data.total || 0
  } catch (e: any) {
    dataError.value = e?.message || '加载数据失败'
  } finally {
    dataLoading.value = false
  }
}

/** 搜索 */
function onSearch() {
  previewPage.value = 1
  loadPreviewData()
}

/** 分页尺寸改变 */
function onPageSizeChange(size: number) {
  previewSize.value = size
  previewPage.value = 1
  loadPreviewData()
}

/** 页码改变 */
function onPageChange(page: number) {
  previewPage.value = page
  loadPreviewData()
}

function openCreate() {
  editingId.value = null
  viewOnly.value = false
  form.name = ''
  // 仅第三方 API 数据源支持手动新建；系统管理类型不开放手动创建
  form.type = 'API'
  form.formKey = ''
  form.sourceKey = ''
  form.searchParam = ''
  form.keywordColumn = ''
  form.pageBase = 1
  form.data = ''
  form.headers = ''
  apiOps.list = { action: '', method: 'GET' }
  apiOps.get = { action: '', method: 'GET' }
  apiOps.create = { action: '', method: 'POST' }
  apiOps.update = { action: '', method: 'PUT' }
  apiOps.delete = { action: '', method: 'DELETE' }
  apiColumns.value = []
  resetMetadataState()
  resetPreviewState()
  activeTab.value = 'config'
  dialogVisible.value = true
}

async function openEdit(row: DataSourceDTO) {
  editingId.value = row.id
  viewOnly.value = false
  form.name = row.name
  form.type = row.type
  form.formKey = row.formKey || ''
  form.sourceKey = row.sourceKey || ''
  form.searchParam = ''
  form.keywordColumn = ''
  form.pageBase = 1
  form.data = ''
  form.headers = ''
  apiOps.list = { action: '', method: 'GET' }
  apiOps.get = { action: '', method: 'GET' }
  apiOps.create = { action: '', method: 'POST' }
  apiOps.update = { action: '', method: 'PUT' }
  apiOps.delete = { action: '', method: 'DELETE' }
   apiColumns.value = []
  // 解析 params JSON：API类型手动配置；FORM/SYSTEM则根据标识自动填充
  let p: Record<string, any> = {}
  if (row.params) {
    try {
      p = JSON.parse(row.params)
    } catch {
      p = {}
    }
  }
  if (row.type === 'API') {
    for (const op of Object.keys(apiOps) as (keyof typeof apiOps)[]) {
      const cfg = p[op]
      if (cfg && typeof cfg === 'object') {
        apiOps[op] = {
          action: cfg.action || '',
          method: (cfg.method || 'GET').toUpperCase(),
          parse: cfg.parse || '',
          totalParse: cfg.totalParse || '',
        }
      }
    }
    form.searchParam = p.searchParam || ''
    form.keywordColumn = p.keywordColumn || ''
    form.pageBase = p.pageBase === 0 ? 0 : 1
    form.data = p.data ? JSON.stringify(p.data) : ''
    form.headers = p.headers ? JSON.stringify(p.headers) : ''
    apiColumns.value = Array.isArray(p.columns) ? (p.columns as ColumnConfigItem[]) : []
  } else if (row.type === 'FORM' || row.type === 'SYSTEM') {
    // FORM/SYSTEM：只读端点展示由模板根据 formKey/sourceKey 响应式计算，无需填充 apiOps
  }
  resetMetadataState()
  resetPreviewState()
  activeTab.value = 'config'
  dialogVisible.value = true
}

/** 查看数据源详情（只读模式） */
function openView(row: DataSourceDTO) {
  editingId.value = row.id
  viewOnly.value = true
  form.name = row.name
  form.type = row.type
  form.formKey = row.formKey || ''
  form.sourceKey = row.sourceKey || ''
  form.searchParam = ''
  form.keywordColumn = ''
  form.pageBase = 1
  form.data = ''
  form.headers = ''
  apiOps.list = { action: '', method: 'GET' }
  apiOps.get = { action: '', method: 'GET' }
  apiOps.create = { action: '', method: 'POST' }
  apiOps.update = { action: '', method: 'PUT' }
  apiOps.delete = { action: '', method: 'DELETE' }
  apiColumns.value = []
  // 解析 params JSON
  let p: Record<string, any> = {}
  if (row.params) {
    try {
      p = JSON.parse(row.params)
    } catch {
      p = {}
    }
  }
  if (row.type === 'API') {
    for (const op of Object.keys(apiOps) as (keyof typeof apiOps)[]) {
      const cfg = p[op]
      if (cfg && typeof cfg === 'object') {
        apiOps[op] = {
          action: cfg.action || '',
          method: (cfg.method || 'GET').toUpperCase(),
          parse: cfg.parse || '',
          totalParse: cfg.totalParse || '',
        }
      }
    }
    form.searchParam = p.searchParam || ''
    form.keywordColumn = p.keywordColumn || ''
    form.pageBase = p.pageBase === 0 ? 0 : 1
    form.data = p.data ? JSON.stringify(p.data) : ''
    form.headers = p.headers ? JSON.stringify(p.headers) : ''
    apiColumns.value = Array.isArray(p.columns) ? (p.columns as ColumnConfigItem[]) : []
  }
  resetMetadataState()
  resetPreviewState()
  activeTab.value = 'config'
  dialogVisible.value = true
}

   function addColumn() {
   apiColumns.value.push({
     key: '',
     label: '',
     columnType: 'VARCHAR',
     length: null,
     scale: null,
     required: false,
     unique: false,
     indexed: false,
   })
 }

 /** 长度输入框仅对需要长度的类型显示 */
 function needsLength(type?: string | null): boolean {
   return type === 'VARCHAR' || type === 'DECIMAL' || type === 'INTEGER' || type === 'BIGINT' || type === 'TINYINT'
 }

 /** 解析 params JSON 为对象，空/非法返回 undefined */
 function parseParamsJson(text: string | null | undefined): Record<string, any> | undefined {
   if (!text || !text.trim()) return undefined
   try {
     const parsed = JSON.parse(text)
     if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
     return undefined
   } catch {
     return undefined
   }
 }

 /** API 类型：组装多操作 params（未配置的操作省略；列定义仅写入非空 key 行） */
 function buildApiParams(): Record<string, any> {
   const params: Record<string, any> = {}
   // 五个操作：action 为空则整体省略
   for (const op of Object.keys(apiOps) as (keyof typeof apiOps)[]) {
     const cfg = apiOps[op]
     if (cfg.action && cfg.action.trim()) {
       const item: Record<string, any> = { action: cfg.action.trim(), method: (cfg.method || 'GET').toUpperCase() }
       if (op === 'list') {
         if (cfg.parse && cfg.parse.trim()) item.parse = cfg.parse.trim()
         if (cfg.totalParse && cfg.totalParse.trim()) item.totalParse = cfg.totalParse.trim()
       }
       params[op] = item
     }
   }
   // 列定义：过滤未填写 key 的行
   const columns = apiColumns.value.filter((c) => c.key && c.key.trim())
   if (columns.length > 0) {
     params.columns = columns.map((c) => {
       const item: Record<string, any> = { key: c.key.trim(), label: c.label || c.key.trim() }
       if (c.columnType) item.columnType = c.columnType
       if (c.length != null) item.length = c.length
       if (c.columnType === 'DECIMAL' && c.scale != null) item.scale = c.scale
       if (c.required) item.required = true
       if (c.unique) item.unique = true
       if (c.indexed) item.indexed = true
       return item
     })
   }
   // 搜索/分页/固定参数/请求头
   if (form.searchParam && form.searchParam.trim()) params.searchParam = form.searchParam.trim()
   if (form.keywordColumn && form.keywordColumn.trim()) params.keywordColumn = form.keywordColumn.trim()
   if (form.pageBase === 0 || form.pageBase === 1) params.pageBase = form.pageBase
   const dataObj = parseParamsJson(form.data)
   if (dataObj) params.data = dataObj
   const headersObj = parseParamsJson(form.headers)
   if (headersObj) params.headers = headersObj
   return params
 }

 /** 校验并保存 */
 async function handleSave() {
   if (!form.name || !form.name.trim()) {
     ElMessage.warning('请输入数据源名称')
     return
   }
    if (form.type === 'FORM' && !form.formKey) {
      ElMessage.warning('请选择绑定的业务表单')
      return
    }
    if (form.type === 'WORKFLOW' && !form.formKey) {
      ElMessage.warning('请选择绑定的工作流表单')
      return
    }
   if (form.type === 'SYSTEM' && !form.sourceKey) {
     ElMessage.warning('请选择系统结构')
     return
   }
   if (form.type === 'API') {
     if (!form.sourceKey || !form.sourceKey.trim()) {
       ElMessage.warning('请输入接口标识')
       return
     }
     if (!apiOps.list.action || !apiOps.list.action.trim()) {
       ElMessage.warning('列表查询 (list) 接口路径必填')
       return
     }
   }
   try {
     const payload = normalizePayload()
     if (editingId.value) {
       await dataSourceApi.updateDataSource(editingId.value, payload)
     } else {
       await dataSourceApi.createDataSource(payload)
     }
     ElMessage.success(editingId.value ? '保存成功' : '创建成功')
     dialogVisible.value = false
     tableRef.value?.fetchList()
   } catch {
     // http 拦截器已弹出错误消息
   }
 }

  /** 按类型归一化提交载荷：所有类型均通过统一 API 编辑器，FORM/SYSTEM params 由前端自动生成 */
  function normalizePayload(): any {
    return {
      name: form.name,
      type: form.type || 'FORM',
      formKey: form.type === 'FORM' || form.type === 'WORKFLOW' ? form.formKey || null : null,
      sourceKey: form.type === 'SYSTEM' ? form.sourceKey || null : form.type === 'API' ? form.sourceKey || null : null,
      params: JSON.stringify(buildApiParams()),
    }
  }

  /** 生成统一 API 端点描述（FORM/SYSTEM 自动填充到 API 编辑器；WORKFLOW 经 SPI 按数据源 ID 访问） */
  function generateEndpoints(): Record<string, any> | null {
    if (form.type === 'FORM' && form.formKey) {
      const base = `/api/v1/biz-data/${form.formKey}`
      return {
        list: { action: base, method: 'GET', parse: 'records', totalParse: 'total' },
        get: { action: `${base}/{id}`, method: 'GET' },
        create: { action: base, method: 'POST' },
        update: { action: `${base}/{id}`, method: 'PUT' },
        delete: { action: `${base}/{id}`, method: 'DELETE' },
      }
    }
    if (form.type === 'SYSTEM' && form.sourceKey) {
      const internalKey = form.sourceKey === 'user-tree' ? 'users' : form.sourceKey
      return {
        list: { action: `/api/v1/internal/system/${internalKey}`, method: 'GET' },
      }
    }
    // WORKFLOW：只读数据源，经统一 SPI（DataSourceController）按数据源 ID 访问；写操作一律 400 拒绝
    if (form.type === 'WORKFLOW' && editingId.value) {
      const base = `/api/v1/data-sources/${editingId.value}`
      return {
        metadata: { action: `${base}/metadata`, method: 'GET' },
        list: { action: `${base}/data`, method: 'GET', parse: 'records', totalParse: 'total' },
        get: { action: `${base}/data/{id}`, method: 'GET' },
        create: { action: `${base}/data`, method: 'POST', readonly: true },
        update: { action: `${base}/data/{id}`, method: 'PUT', readonly: true },
        delete: { action: `${base}/data/{id}`, method: 'DELETE', readonly: true },
      }
    }
    return null
  }

// ========== 操作按钮 ==========
/** 仅第三方 API 数据源可手动编辑/删除；FORM/WORKFLOW/SYSTEM 由系统管理，仅可查看 */
const actionButtons: ActionButton[] = [
  {
    label: '查看',
    icon: View,
    onClick: (row: any) => openView(row),
  },
  {
    label: '编辑',
    icon: Edit,
    permission: 'data-source:manage',
    show: (row: any) => row.type === 'API',
    onClick: (row: any) => openEdit(row),
  },
  {
    label: '删除',
    type: 'danger',
    icon: Delete,
    permission: 'data-source:manage',
    show: (row: any) => row.type === 'API',
    onClick: async (row: any) => {
      try {
        await ElMessageBox.confirm('确定要删除此数据源吗？', '删除确认', { type: 'warning' })
      } catch {
        return
      }
      try {
        await dataSourceApi.deleteDataSource(row.id)
        ElMessage.success('删除成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息（如"请先禁用"）
      }
    },
  },
]

// ========== 工具函数 ==========
function typeTagType(type: string): '' | 'primary' | 'success' | 'warning' {
  const map: Record<string, '' | 'primary' | 'success' | 'warning'> = {
    FORM: 'primary',
    WORKFLOW: 'primary',
    SYSTEM: 'success',
    API: 'warning',
  }
  return map[type] || ''
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    FORM: '业务表单',
    WORKFLOW: '工作流表单',
    SYSTEM: '系统结构',
    API: '第三方 API',
  }
  return map[type] || type
}

function statusTagType(status: string): '' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'info'> = {
    DRAFT: 'warning',
    ENABLED: 'success',
    DISABLED: 'info',
  }
  return map[status] || ''
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    ENABLED: '已启用',
    DISABLED: '已禁用',
  }
  return map[status] || status
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ========== 初始化：加载已发布业务/工作流表单（FORM/WORKFLOW 类型 formKey 下拉候选） ==========
onMounted(async () => {
  try {
    const res = await formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED', size: 100 })
    const data = res.data as any
    publishedForms.value = data.content || data.rows || []
  } catch {
    // 表单加载失败不阻断列表
  }
  try {
    const res = await formApi.getFormDefinitions({ type: 'WORKFLOW', status: 'PUBLISHED', size: 100 })
    const data = res.data as any
    publishedWorkflowForms.value = data.content || data.rows || []
  } catch {
    // 表单加载失败不阻断列表
  }
})
</script>

<style scoped>
.ops-scroll {
  max-height: 50vh;
  overflow-y: auto;
  padding-right: 4px;
}
.auto-params-display {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}
.op-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.op-row code {
  font-family: 'Courier New', monospace;
  background: #f4f6f8;
  padding: 2px 6px;
  border-radius: 3px;
}
.op-label {
  color: #909399;
  font-size: 12px;
}
.op-meta {
  color: #909399;
  font-size: 12px;
  background: #f4f6f8;
  padding: 1px 6px;
  border-radius: 3px;
}
.op-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}
.column-editor {
  width: 100%;
}
.column-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
</style>

