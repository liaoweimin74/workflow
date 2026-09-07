<template>
  <div class="data-source-list-page">
    <el-card class="ds-list-card" style="overflow: hidden">
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

      <!-- 查看/新建/编辑数据源：内嵌表单覆盖层（formMode=inline 样式） -->
      <div v-if="inlineVisible" class="inline-form-overlay">
        <div class="inline-form-container">
          <div class="inline-form-header">
            <span class="inline-form-title">{{ dialogTitle }}</span>
            <el-button text :icon="Close" @click="inlineVisible = false" />
          </div>
          <div class="inline-form-body">
        <el-form :model="form" label-width="auto" label-position="top">
          <!-- 数据源名称 / 数据源类型 / 标识：三个输入项一行，label 在输入项上方 -->
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="数据源名称">
                <el-input v-model="form.name" placeholder="请输入数据源名称" maxlength="50" :disabled="isReadonlyForm" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="数据源类型">
                <template v-if="!editingId && !viewOnly">
                  <el-radio-group v-model="form.type">
                    <el-radio-button value="API">第三方 API</el-radio-button>
                    <el-radio-button value="SQL">SQL 查询</el-radio-button>
                  </el-radio-group>
                </template>
                <template v-else>
                  <el-tag :type="typeTagType(form.type)">{{ typeLabel(form.type) }}</el-tag>
                </template>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <!-- ============ 统一 API 配置：FORM/SYSTEM 自动填充，API 手动配置 ============ -->
              <el-form-item>
                <template #label>
                  <span style="display: inline-flex; align-items: center" data-testid="sql-form-key-label">
                    标识
                    <el-tooltip v-if="form.type === 'SQL'" content="有值时合并表单列，CRUD 映射到主表" placement="top">
                      <el-icon data-testid="sql-form-key-hint" class="sql-key-hint-icon"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </span>
                </template>
                <template v-if="form.type === 'FORM'">
                  <el-select v-model="form.formKey" placeholder="选择已发布的业务表单" filterable style="width: 100%" disabled>
                    <el-option v-for="f in publishedForms" :key="f.key" :label="f.name" :value="f.key" />
                  </el-select>
                </template>
                <template v-else-if="form.type === 'WORKFLOW'">
                  <el-select v-model="form.formKey" placeholder="选择已发布的工作流表单" filterable style="width: 100%" disabled>
                    <el-option v-for="f in publishedWorkflowForms" :key="f.key" :label="f.name" :value="f.key" />
                  </el-select>
                </template>
                <template v-else-if="form.type === 'SYSTEM'">
                  <el-select v-model="form.sourceKey" placeholder="选择系统结构" style="width: 100%" disabled>
                    <el-option label="部门树" value="dept-tree" />
                    <el-option label="用户列表" value="user-tree" />
                  </el-select>
                </template>
                <template v-else-if="form.type === 'SQL'">
                  <el-input
                    v-model="form.sourceKey"
                    data-testid="sql-source-key-input"
                    placeholder="请输入唯一标识，如 orders-report（租户内唯一）"
                    :disabled="isReadonlyForm"
                  />
                  <el-select
                    v-model="form.formKey"
                    placeholder="绑定主表单（可选，用于 CRUD）"
                    filterable
                    clearable
                    style="width: 100%; margin-top: 8px"
                    :disabled="isReadonlyForm"
                  >
                    <el-option v-for="f in publishedForms" :key="f.key" :label="f.name" :value="f.key" />
                  </el-select>
                </template>
                <template v-else>
                  <el-input v-model="form.sourceKey" placeholder="如 external-stock（同一外部系统的稳定标识）" :disabled="isReadonlyForm" />
                </template>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>

        <el-tabs v-model="activeTab" @tab-click="onTabClick" style="margin-top: 4px">
          <el-tab-pane label="接口配置" name="config">
            <!-- 可滚动操作区 -->

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
                      <el-table :data="apiColumns" size="small" border class="ds-col-table">
                        <el-table-column label="字段名" min-width="110">
                          <template #default="{ row }">
                            <el-input v-model="row.key" placeholder="字段名" :disabled="isReadonlyForm" />
                          </template>
                        </el-table-column>
                        <el-table-column label="列名" min-width="110">
                          <template #default="{ row }">
                            <el-input v-model="row.label" placeholder="列名" :disabled="isReadonlyForm" />
                          </template>
                        </el-table-column>
                        <el-table-column label="类型" width="150">
                          <template #default="{ row }">
                            <el-select v-model="row.columnType" placeholder="类型" style="width: 100%" :disabled="isReadonlyForm">
                              <el-option v-for="t in COLUMN_TYPES" :key="t" :label="t" :value="t" />
                            </el-select>
                          </template>
                        </el-table-column>
                        <el-table-column label="长度" width="140" :show-overflow-tooltip="false">
                          <template #default="{ row }">
                            <el-input-number
                              v-if="needsLength(row.columnType)"
                              v-model="row.length"
                              :min="0"
                              :max="10000"
                              placeholder="长度"
                              controls-position="right"
                              style="width: 100%"
                              :disabled="isReadonlyForm"
                            />
                          </template>
                        </el-table-column>
                        <el-table-column label="精度" width="80">
                          <template #default="{ row }">
                            <el-input-number
                              v-if="row.columnType === 'DECIMAL'"
                              v-model="row.scale"
                              :min="0"
                              :max="10"
                              placeholder="精度"
                              controls-position="right"
                              style="width: 100%"
                              :disabled="isReadonlyForm"
                            />
                          </template>
                        </el-table-column>
                        <el-table-column label="属性" width="270" align="center">
                          <template #default="{ row }">
                            <el-checkbox v-model="row.required" title="必填" :disabled="isReadonlyForm">必填</el-checkbox>
                            <el-checkbox v-model="row.unique" title="唯一" :disabled="isReadonlyForm">唯一</el-checkbox>
                            <el-checkbox v-model="row.indexed" title="索引" :disabled="isReadonlyForm">索引</el-checkbox>
                          </template>
                        </el-table-column>
                        <el-table-column label="" width="52" align="center">
                          <template #default="{ $index }">
                            <el-button :icon="Delete" circle text :disabled="isReadonlyForm" @click="apiColumns.splice($index, 1)" />
                          </template>
                        </el-table-column>
                      </el-table>
                      <el-button type="primary" plain :icon="Plus" style="margin-top: 8px" :disabled="isReadonlyForm" @click="addColumn">添加列</el-button>
                    </div>
                  </el-form-item>
                </el-form>
              </template>

              <!-- ===== SQL：可视化配置/SQL 模式按钮切换 ===== -->
              <template v-else-if="form.type === 'SQL'">
                <el-radio-group v-model="sqlConfig.queryMode" style="margin-bottom: 12px" @change="onSqlModeChange">
                  <el-radio-button value="visual">可视化配置</el-radio-button>
                  <el-radio-button value="sql">SQL 模式</el-radio-button>
                </el-radio-group>
                <div v-if="sqlConfig.queryMode === 'visual'">
                  <el-alert v-if="sqlConfig.isStale" title="SQL 已手动修改，可视化配置已锁定" type="warning" show-icon :closable="false" style="margin-bottom: 12px">
                    <template #default>
                      <el-button size="small" type="primary" plain @click="resetToVisual">重置为可视化</el-button>
                    </template>
                  </el-alert>
                  <VisualQueryBuilder
                    v-if="!sqlConfig.isStale"
                    v-model="sqlConfig.visual"
                    v-model:params="sqlConfig.declaredParams"
                    :tables="visualTableCandidates"
                    :table-fields="sqlTableFields"
                    :disabled="isReadonlyForm"
                  />
                </div>
                <div v-else>
                  <SqlEditor
                    v-model="sqlConfig.queryText"
                    v-model:columns="sqlConfig.declaredColumns"
                    v-model:params="sqlConfig.declaredParams"
                    :disabled="isReadonlyForm"
                    @update:model-value="markSqlEdited"
                  />
                </div>
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
                <el-table-column prop="label" label="字段名" min-width="180" show-overflow-tooltip />
                <el-table-column prop="key" label="标识" min-width="160" show-overflow-tooltip />
                <el-table-column prop="componentType" label="组件" min-width="100" />
                <el-table-column label="必填" width="50" align="center">
                  <template #default="{ row }">
                    <span :style="boolIconStyle(row.required)">{{ row.required ? '✓' : '✗' }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="唯一" width="50" align="center">
                  <template #default="{ row }">
                    <span :style="boolIconStyle(row.unique)">{{ row.unique ? '✓' : '✗' }}</span>
                  </template>
                </el-table-column>
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
              <el-row :gutter="8" class="preview-pagination" style="margin-top: 8px">
                <el-col style="display: flex; justify-content: flex-end">
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
              <div v-if="dataError" class="preview-error">
                <el-alert :title="dataError" type="error" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
          </div>
          <div class="inline-form-footer">
            <template v-if="viewOnly">
              <el-button type="primary" @click="inlineVisible = false">关闭</el-button>
            </template>
            <template v-else>
              <el-button @click="inlineVisible = false">取消</el-button>
              <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
            </template>
          </div>
        </div>
      </div>
   </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'DataSourceList' })

import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, View, Edit, Delete, Close, QuestionFilled } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton } from '@/components/business/types'
import { dataSourceApi, type DataSourceDTO, type DataSourceMetadataDTO } from '@/api/data-source'
import type { ColumnConfigItem, BizDataVO } from '@/api/bizData'
import { formApi, type FormDefinitionDTO } from '@/api/form'
import VisualQueryBuilder, { type VisualQueryConfig } from './components/VisualQueryBuilder.vue'
import SqlEditor from './components/SqlEditor.vue'

const tableRef = ref<InstanceType<typeof SearchTable>>()

/** 已发布业务表单（FORM 类型 formKey 下拉候选 + SQL 可视化主表候选） */
const publishedForms = ref<FormDefinitionDTO[]>([])
const visualTableCandidates = computed(() => {
  const main = (sqlConfig.visual.mainTable || '').trim()
  const list = main ? [main] : []
  const seen = new Set(list)
  for (const f of publishedForms.value) {
    const t = `wf_biz_${f.key}`
    if (!seen.has(t)) {
      list.push(t)
      seen.add(t)
    }
  }
  return list
})

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
      { label: 'SQL 查询', value: 'SQL' },
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
      page: params.page || 1,
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

// ========== 新建/编辑内嵌覆盖层状态 ==========
const inlineVisible = ref(false)
/** 保存进行中（footer 保存按钮 loading） */
const saving = ref(false)
const editingId = ref<string | null>(null)
/** 纯查看模式（openView 打开，区别于可编辑的 API 编辑模式） */
const viewOnly = ref(false)

/** 是否为查看模式（弹窗处于打开态） */
const isViewMode = computed(() => editingId.value !== null)

/** 是否为可手动编辑的类型（API + SQL） */
const isEditableType = computed(() => form.type === 'API' || form.type === 'SQL')

/** 表单整体只读：纯查看模式，或非可编辑类型（FORM/WORKFLOW/SYSTEM 由系统管理） */
const isReadonlyForm = computed(() => viewOnly.value || !isEditableType.value)

/** 弹窗标题 */
const dialogTitle = computed(() => {
  if (viewOnly.value) {
    return '查看数据源'
  }
  return isEditableType.value ? (editingId.value ? '编辑数据源' : '新建数据源') : '数据源详情'
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

/** SQL 类型：查询配置（复用 VisualQueryBuilder 导出的类型） */
const sqlConfig = reactive({
  queryMode: 'visual' as 'visual' | 'sql',
  visual: { mainTable: '', mainAlias: 'm', joins: [], selectColumns: [] as string[], selectColumnsInput: '', where: [], orderBy: [] } as VisualQueryConfig,
  queryText: '',
  declaredColumns: [] as ColumnConfigItem[],
  declaredParams: [] as string[],
  isStale: false,  // SQL 手改后标记为过期
})

/** SQL 可视化：主表/JOIN 目标表字段懒加载缓存（表名 → 字段 key 列表） */
const sqlTableFields = ref<Record<string, string[]>>({})

/** 按表单懒加载表字段：剥离全部 wf_biz 前缀后通过 formKey 查询字段定义 */
async function ensureTableFields(table: string) {
  if (!table || sqlTableFields.value[table]) return
  const formKey = table.replace(/^(wf_biz_)+/, '')
  try {
    const res = await formApi.getFormDefinitionByKey(formKey)
    const cfg = (res.data as any)?.columnConfig
    let cols: unknown = null
    if (typeof cfg === 'string' && cfg) {
      try {
        cols = JSON.parse(cfg)
      } catch {
        cols = null
      }
    } else if (Array.isArray(cfg)) {
      cols = cfg
    }
    sqlTableFields.value[table] = (Array.isArray(cols) ? cols : []).map((c: any) => c.key).filter(Boolean)
  } catch {
    // 表单加载失败不阻断主流程
  }
}

// 主表变化 → 懒加载字段
watch(
  () => sqlConfig.visual.mainTable,
  (t) => {
    if (t) ensureTableFields(t)
  },
)
// JOIN 目标表变化 → 懒加载字段
watch(
  () => sqlConfig.visual.joins.map((j) => j.targetTable),
  (targets) => {
    targets.forEach((t) => {
      if (t) ensureTableFields(t)
    })
  },
)

/** 当前激活标签：config / metadata / data */
const activeTab = ref('config')

/** ================ 字段元数据 ================= */
const metadata = ref<DataSourceMetadataDTO | null>(null)
const metadataLoading = ref(false)
const metadataError = ref<string | null>(null)

/** 布尔值图标样式：true 蓝色，false 灰色 */
function boolIconStyle(v: boolean | undefined): Record<string, string> {
  return { color: v ? '#409EFF' : '#c0c4cc', cursor: 'default' }
}

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
      page: previewPage.value,
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
  // 支持手动新建 API 和 SQL 数据源
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
  // SQL 类型初始化
  sqlConfig.queryMode = 'visual'
  sqlConfig.visual = { mainTable: '', mainAlias: 'm', joins: [], selectColumns: [], selectColumnsInput: '', where: [], orderBy: [] }
  sqlConfig.queryText = ''
  sqlConfig.declaredColumns = []
  sqlConfig.declaredParams = []
  sqlConfig.isStale = false
  resetMetadataState()
  resetPreviewState()
  activeTab.value = 'config'
  inlineVisible.value = true
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
  } else if (row.type === 'SQL') {
    // SQL 类型：解析 queryMode + visual/query
    sqlConfig.queryMode = (p.queryMode as 'visual' | 'sql') || 'visual'
    sqlConfig.isStale = false
    if (p.visual) {
      sqlConfig.visual.mainTable = p.visual.mainTable || ''
      sqlConfig.visual.mainAlias = p.visual.mainAlias || 'm'
      sqlConfig.visual.joins = p.visual.joins || []
      sqlConfig.visual.selectColumns = p.visual.selectColumns || []
      sqlConfig.visual.selectColumnsInput = (p.visual.selectColumns || []).join(', ')
      sqlConfig.visual.where = p.visual.where || []
      sqlConfig.visual.orderBy = p.visual.orderBy || []
    }
    sqlConfig.queryText = p.query || ''
    sqlConfig.declaredColumns = Array.isArray(p.columns) ? (p.columns as ColumnConfigItem[]) : []
    sqlConfig.declaredParams = Array.isArray(p.params) ? (p.params as string[]) : []
  } else if (row.type === 'FORM' || row.type === 'SYSTEM') {
    // FORM/SYSTEM：只读端点展示由模板根据 formKey/sourceKey 响应式计算，无需填充 apiOps
  }
  resetMetadataState()
  resetPreviewState()
  activeTab.value = 'config'
  inlineVisible.value = true
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
  } else if (row.type === 'SQL') {
    // SQL 类型：查看模式同样填充 sqlConfig（表单整体只读）
    sqlConfig.queryMode = (p.queryMode as 'visual' | 'sql') || 'visual'
    sqlConfig.isStale = false
    if (p.visual) {
      sqlConfig.visual.mainTable = p.visual.mainTable || ''
      sqlConfig.visual.mainAlias = p.visual.mainAlias || 'm'
      sqlConfig.visual.joins = p.visual.joins || []
      sqlConfig.visual.selectColumns = p.visual.selectColumns || []
      sqlConfig.visual.selectColumnsInput = (p.visual.selectColumns || []).join(', ')
      sqlConfig.visual.where = p.visual.where || []
      sqlConfig.visual.orderBy = p.visual.orderBy || []
    }
    sqlConfig.queryText = p.query || ''
    sqlConfig.declaredColumns = Array.isArray(p.columns) ? (p.columns as ColumnConfigItem[]) : []
    sqlConfig.declaredParams = Array.isArray(p.params) ? (p.params as string[]) : []
  }
  resetMetadataState()
  resetPreviewState()
  activeTab.value = 'config'
  inlineVisible.value = true
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

  /** SQL 类型：组装 params JSON */
  function buildSqlParams(): Record<string, any> {
    const params: Record<string, any> = {}
    params.queryMode = sqlConfig.queryMode
    if (sqlConfig.queryMode === 'visual') {
      // 可视化配置：selectColumnsInput 为自由文本，保存时解析为 selectColumns
      const text = (sqlConfig.visual.selectColumnsInput || '').trim()
      sqlConfig.visual.selectColumns = text.split(',').map((s: string) => s.trim()).filter((s: string) => s)
      params.visual = {
        mainTable: sqlConfig.visual.mainTable,
        mainAlias: sqlConfig.visual.mainAlias || 'm',
        joins: sqlConfig.visual.joins,
        selectColumns: sqlConfig.visual.selectColumns,
        where: sqlConfig.visual.where,
        orderBy: sqlConfig.visual.orderBy,
      }
      // 生成预览 SQL（前端简单拼接，后端 VisualSqlGenerator 会重新生成）
      params.query = generatePreviewSql()
    } else {
      // SQL 模式：直接使用手写 SQL
      params.query = sqlConfig.queryText
    }
    // 列声明
    const columns = sqlConfig.declaredColumns.filter((c) => c.key && c.key.trim())
    if (columns.length > 0) {
      params.columns = columns.map((c) => ({
        key: c.key.trim(),
        label: c.label || c.key.trim(),
        columnType: c.columnType || 'VARCHAR',
        sortable: !!c.sortable,
        filterable: !!c.filterable,
      }))
    }
    // 运行时参数白名单
    if (sqlConfig.declaredParams.length > 0) {
      params.params = sqlConfig.declaredParams
    }
    return params
  }

  /** 可视化模式：前端生成预览 SQL（简化版，后端会重新生成） */
  function generatePreviewSql(): string {
    const v = sqlConfig.visual
    if (!v.mainTable) return ''
    let sql = `SELECT ${v.selectColumns.join(', ') || '*'}`
    sql += ` FROM ${v.mainTable} ${v.mainAlias || 'm'}`
    for (const j of v.joins) {
      if (j.targetTable && j.on) {
        sql += ` ${j.joinType} ${j.targetTable} ${j.alias} ON ${j.on}`
      }
    }
    sql += ` WHERE ${v.mainAlias || 'm'}.tenant_id = :tenantId`
    for (const w of v.where) {
      if (w.column && w.op) {
        sql += ` AND ${w.column} ${w.op} ?`
      }
    }
    if (v.orderBy.length > 0) {
      const parts = v.orderBy.filter((o) => o.column).map((o) => `${o.column} ${o.order || 'ASC'}`)
      if (parts.length > 0) sql += ` ORDER BY ${parts.join(', ')}`
    }
    return sql
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
    if (form.type === 'SQL') {
      if (!form.sourceKey || !form.sourceKey.trim()) {
        ElMessage.warning('请输入数据源标识（sourceKey）')
        return
      }
      if (sqlConfig.queryMode === 'visual' && !sqlConfig.visual.mainTable.trim()) {
        ElMessage.warning('请配置主表')
        return
      }
      if (sqlConfig.queryMode === 'sql' && !sqlConfig.queryText.trim()) {
        ElMessage.warning('请输入 SQL 模板')
        return
      }
    }
    saving.value = true
    try {
      const payload = normalizePayload()
      if (editingId.value) {
        await dataSourceApi.updateDataSource(editingId.value, payload)
      } else {
        await dataSourceApi.createDataSource(payload)
      }
      ElMessage.success(editingId.value ? '保存成功' : '创建成功')
      inlineVisible.value = false
      tableRef.value?.fetchList()
    } catch {
      // http 拦截器已弹出错误消息
    } finally {
      saving.value = false
    }
 }

  /** 按类型归一化提交载荷：所有类型均通过统一 API 编辑器，FORM/SYSTEM params 由前端自动生成 */
  function normalizePayload(): any {
    return {
      name: form.name,
      type: form.type || 'FORM',
      formKey: form.type === 'SQL' ? form.formKey || null : form.type === 'FORM' || form.type === 'WORKFLOW' ? form.formKey || null : null,
      sourceKey: form.type === 'SYSTEM' ? form.sourceKey || null : form.type === 'API' || form.type === 'SQL' ? form.sourceKey || null : null,
      params: form.type === 'SQL' ? JSON.stringify(buildSqlParams()) : JSON.stringify(buildApiParams()),
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
/** API 和 SQL 类型可手动编辑/删除；FORM/WORKFLOW/SYSTEM 由系统管理，仅可查看 */
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
    show: (row: any) => row.type === 'API' || row.type === 'SQL',
    onClick: (row: any) => openEdit(row),
  },
  {
    label: '删除',
    type: 'danger',
    icon: Delete,
    permission: 'data-source:manage',
    show: (row: any) => row.type === 'API' || row.type === 'SQL',
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
function typeTagType(type: string): '' | 'primary' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'primary' | 'success' | 'warning' | 'info'> = {
    FORM: 'primary',
    WORKFLOW: 'primary',
    SYSTEM: 'success',
    API: 'warning',
    SQL: 'info',
  }
  return map[type] || ''
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    FORM: '业务表单',
    WORKFLOW: '工作流表单',
    SYSTEM: '系统结构',
    API: '第三方 API',
    SQL: 'SQL 查询',
  }
  return map[type] || type
}

// ========== SQL 类型辅助函数 ==========
function onSqlModeChange() {
  // 切到 SQL 模式：若尚未生成 SQL 文本（首次进入/重置后），用当前可视化配置生成作为起点
  if (sqlConfig.queryMode === 'sql' && !sqlConfig.queryText) {
    sqlConfig.queryText = generatePreviewSql()
  }
}

/** 用户在 SQL 模式下手动编辑 SQL → 标记可视化已过期 */
function markSqlEdited() {
  if (sqlConfig.queryMode === 'sql' && !isReadonlyForm.value) {
    sqlConfig.isStale = true
  }
}

function resetToVisual() {
  sqlConfig.isStale = false
  sqlConfig.queryText = ''
  sqlConfig.queryMode = 'visual'
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
.data-source-list-page {
  /* 占满 main 可视区：列表卡片内部滚动，覆盖层（absolute inset:0）高度不超过视口，
     footer 固定于可视底部不随内容滚出屏幕 */
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.ds-list-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ds-list-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sql-key-hint-icon {
  margin-left: 4px;
  cursor: help;
  color: #909399;
}
.ops-scroll {
  /* 内层不再滚动：由页签内容区（.el-tabs__content）统一承接滚动 */
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
/* 内嵌表单覆盖层（替代弹窗）：覆盖当前页签内容区，关闭后恢复视图 */
.inline-form-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: #fff;
  display: flex;
  flex-direction: column;
}
/* 嵌入页面内表格行内组件统一普通字体 */
.inline-form-overlay :deep(.el-table) {
  font-size: 14px;
}
/* API 配置区表单项紧凑间距 */
.inline-form-overlay :deep(.el-form-item) {
  margin-bottom: 8px;
}
.inline-form-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 24px;
  overflow: hidden;
}
.inline-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.inline-form-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.inline-form-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
/* 主表单（顶部输入区）固定不滚动 */
.inline-form-body > .el-form {
  flex-shrink: 0;
}
.inline-form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  margin-top: 16px;
  flex-shrink: 0;
}
</style>
