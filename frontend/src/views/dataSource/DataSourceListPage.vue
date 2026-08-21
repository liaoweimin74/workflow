<template>
  <div class="data-source-list-page">
    <el-card style="overflow: hidden">
      <template #header>
        <span style="font-weight: bold; font-size: 14px">数据源管理</span>
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

    <!-- 新建/编辑数据源弹窗（自持：API 类型需多操作 + 列定义编辑器，SearchTable 标准弹窗无法承载） -->
      <el-dialog
        v-model="dialogVisible"
        :title="editingId ? '编辑数据源' : '新建数据源'"
        width="760px"
        top="6vh"
        destroy-on-close
        :close-on-click-modal="false"
      >
        <el-form :model="form" label-width="110px">
        <el-form-item label="数据源名称" required>
          <el-input v-model="form.name" placeholder="请输入数据源名称" maxlength="50" />
        </el-form-item>

        <el-form-item label="数据源类型" required>
          <el-radio-group v-model="form.type" :disabled="!!editingId" @change="onSourceSelected">
            <el-radio-button value="FORM">业务表单</el-radio-button>
            <el-radio-button value="SYSTEM">系统结构</el-radio-button>
            <el-radio-button value="API">第三方 API</el-radio-button>
          </el-radio-group>
        </el-form-item>
          <!-- ============ 统一 API 配置：FORM/SYSTEM 自动填充，API 手动配置 ============ -->
          <el-form-item label="标识" required>
            <template v-if="form.type === 'FORM'">
              <el-select v-model="form.formKey" placeholder="选择已发布的业务表单" filterable style="width: 320px" @change="onSourceSelected">
                <el-option v-for="f in publishedForms" :key="f.key" :label="f.name" :value="f.key" />
              </el-select>
            </template>
            <template v-else-if="form.type === 'SYSTEM'">
              <el-select v-model="form.sourceKey" placeholder="选择系统结构" style="width: 320px" @change="onSourceSelected">
                <el-option label="部门树" value="dept-tree" />
                <el-option label="用户列表" value="user-tree" />
              </el-select>
            </template>
            <template v-else>
              <el-input v-model="form.sourceKey" placeholder="如 external-stock（同一外部系统的稳定标识）" style="width: 320px" />
            </template>
          </el-form-item>

          <el-divider content-position="left">接口操作</el-divider>

          <el-form-item :label="opLabel.list" required>
            <div class="op-editor">
              <el-input v-model="apiOps.list.action" :readonly="opsReadonly" placeholder="如 /v1/products" style="width: 260px" />
              <el-select v-model="apiOps.list.method" :readonly="opsReadonly" style="width: 110px">
                <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
              </el-select>
              <el-input v-model="apiOps.list.parse" :readonly="opsReadonly" placeholder="列表解析（如 records / content / data.records）" style="width: 200px" />
              <el-input v-model="apiOps.list.totalParse" :readonly="opsReadonly" placeholder="总数解析（留空取数组长度）" style="width: 180px" />
            </div>
          </el-form-item>

          <el-form-item :label="opLabel.get">
            <div class="op-editor">
              <el-input v-model="apiOps.get.action" :readonly="opsReadonly" placeholder="如 /v1/products/{id}" style="width: 260px" />
              <el-select v-model="apiOps.get.method" :readonly="opsReadonly" style="width: 110px">
                <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
              </el-select>
            </div>
          </el-form-item>

          <el-form-item :label="opLabel.create">
            <div class="op-editor">
              <el-input v-model="apiOps.create.action" :readonly="opsReadonly" placeholder="如 /v1/products" style="width: 260px" />
              <el-select v-model="apiOps.create.method" :readonly="opsReadonly" style="width: 110px">
                <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
              </el-select>
            </div>
          </el-form-item>

          <el-form-item :label="opLabel.update">
            <div class="op-editor">
              <el-input v-model="apiOps.update.action" :readonly="opsReadonly" placeholder="如 /v1/products/{id}" style="width: 260px" />
              <el-select v-model="apiOps.update.method" :readonly="opsReadonly" style="width: 110px">
                <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
              </el-select>
            </div>
          </el-form-item>

          <el-form-item :label="opLabel.delete">
            <div class="op-editor">
              <el-input v-model="apiOps.delete.action" :readonly="opsReadonly" placeholder="如 /v1/products/{id}" style="width: 260px" />
              <el-select v-model="apiOps.delete.method" :readonly="opsReadonly" style="width: 110px">
                <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
              </el-select>
            </div>
          </el-form-item>

          <el-form-item label="搜索参数">
            <div class="op-editor">
              <el-input v-model="form.searchParam" :readonly="opsReadonly" placeholder="搜索参数名（如 kw，默认 keyword）" style="width: 200px" />
              <el-input v-model="form.keywordColumn" :readonly="opsReadonly" placeholder="搜索列名（如 name）" style="width: 200px" />
              <el-select v-model="form.pageBase" :readonly="opsReadonly" style="width: 130px">
                <el-option label="页码从 1 开始" :value="1" />
                <el-option label="页码从 0 开始" :value="0" />
              </el-select>
            </div>
          </el-form-item>

          <el-form-item label="固定参数 JSON">
            <el-input v-model="form.data" :readonly="opsReadonly" placeholder='可选，如 {"dept":"IT"}' rows="2" type="textarea" />
          </el-form-item>
          <el-form-item label="请求头 JSON">
            <el-input v-model="form.headers" :readonly="opsReadonly" placeholder='可选，如 {"X-Api-Key":"abc"}' rows="2" type="textarea" />
          </el-form-item>

          <el-divider content-position="left">列定义（列表展示与编辑弹窗使用）</el-divider>

          <el-form-item label="列">
            <div class="column-editor">
              <div v-for="(col, idx) in apiColumns" :key="idx" class="column-row">
                <el-input v-model="col.key" placeholder="字段名" style="width: 130px" />
                <el-input v-model="col.label" placeholder="列名" style="width: 130px" />
                <el-select v-model="col.columnType" placeholder="类型" style="width: 120px">
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
                />
                <el-input-number
                  v-if="col.columnType === 'DECIMAL'"
                  v-model="col.scale"
                  :min="0"
                  :max="10"
                  placeholder="精度"
                  controls-position="right"
                  style="width: 110px"
                />
                <el-checkbox v-model="col.required" title="必填">必填</el-checkbox>
                <el-checkbox v-model="col.unique" title="唯一">唯一</el-checkbox>
                <el-checkbox v-model="col.indexed" title="索引">索引</el-checkbox>
                <el-button :icon="Delete" circle :disabled="opsReadonly" @click="apiColumns.splice(idx, 1)" />
              </div>
              <el-button type="primary" plain :icon="Plus" :disabled="opsReadonly" @click="addColumn">添加列</el-button>
            </div>
          </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton } from '@/components/business/types'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import type { ColumnConfigItem } from '@/api/bizData'
import { formApi, type FormDefinitionDTO } from '@/api/form'

const tableRef = ref<InstanceType<typeof SearchTable>>()

/** 已发布业务表单（FORM 类型 formKey 下拉候选） */
const publishedForms = ref<FormDefinitionDTO[]>([])

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

/** 操作表单标签（统一界面，所有类型显示相同标签） */
const opLabel = computed(() => ({ list: '列表查询 (list)', get: '单条查询 (get)', create: '新增 (create)', update: '修改 (update)', delete: '删除 (delete)' }))

/** FORM/SYSTEM 类型时，API 操作编辑器只读（自动生成） */
const opsReadonly = computed(() => form.type !== 'API')

  /** 当选择 FORM/SYSTEM 标识时，自动填充 API 操作（先清空全部，再填充） */
  function onSourceSelected() {
    // 先清空全部操作字段，避免残留
    for (const op of Object.keys(apiOps) as (keyof typeof apiOps)[]) {
      apiOps[op] = { action: '', method: 'GET', parse: '', totalParse: '' }
    }
    apiColumns.value = []
    form.searchParam = ''
    form.keywordColumn = ''
    form.pageBase = 1
    form.data = ''
    form.headers = ''
    // 再填充自动生成的端点
    const endpoints = generateEndpoints()
    if (endpoints) {
      for (const op of Object.keys(apiOps) as (keyof typeof apiOps)[]) {
        const cfg = endpoints[op]
        if (cfg) {
          apiOps[op] = { action: cfg.action, method: cfg.method, parse: cfg.parse || '', totalParse: cfg.totalParse || '' }
        }
      }
    }
  }

function openCreate() {
  editingId.value = null
  form.name = ''
  form.type = 'FORM'
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
  dialogVisible.value = true
}

async function openEdit(row: DataSourceDTO) {
  editingId.value = row.id
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
    // 根据已保存的标识自动填充接口操作
    nextTick(() => onSourceSelected())
  }
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
      formKey: form.type === 'FORM' ? form.formKey || null : null,
      sourceKey: form.type === 'SYSTEM' ? form.sourceKey || null : form.type === 'API' ? form.sourceKey || null : null,
      params: JSON.stringify(buildApiParams()),
    }
  }

  /** 生成统一 API 端点描述（FORM/SYSTEM 自动填充到 API 编辑器） */
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
    return null
  }

// ========== 操作按钮 ==========
const actionButtons: ActionButton[] = [
  {
    label: '新建',
    type: 'primary',
    permission: 'data-source:manage',
    onClick: () => openCreate(),
  },
  {
    label: '编辑',
    permission: 'data-source:manage',
    onClick: (row: any) => openEdit(row),
  },
  {
    label: '启用',
    type: 'primary',
    permission: 'data-source:manage',
    show: (row: any) => row.status !== 'ENABLED',
    onClick: async (row: any) => {
      try {
        await dataSourceApi.enableDataSource(row.id)
        ElMessage.success('启用成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    },
  },
  {
    label: '禁用',
    permission: 'data-source:manage',
    show: (row: any) => row.status === 'ENABLED',
    onClick: async (row: any) => {
      try {
        await dataSourceApi.disableDataSource(row.id)
        ElMessage.success('禁用成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    },
  },
  {
    label: '删除',
    type: 'danger',
    permission: 'data-source:manage',
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
    SYSTEM: 'success',
    API: 'warning',
  }
  return map[type] || ''
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    FORM: '业务表单',
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

// ========== 初始化：加载已发布业务表单（FORM 类型 formKey 下拉候选） ==========
onMounted(async () => {
  try {
    const res = await formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED', size: 100 })
    const data = res.data as any
    publishedForms.value = data.content || data.rows || []
  } catch {
    // 表单加载失败不阻断列表
  }
})
</script>

<style scoped>
:deep(.el-dialog__body) {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 4px;
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

