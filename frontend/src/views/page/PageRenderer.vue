<template>
  <div class="page-renderer">
    <!-- 自定义页面（PAGE）：独立渲染组件（数据源注册 + 动作总线） -->
    <PageRendererPage v-if="page?.type === 'PAGE'" />
    <!-- 错误态：不存在/未发布/schema 畸形，不白屏 -->
    <el-result
      v-else-if="error"
      icon="error"
      :title="error"
      style="padding: 80px 0"
    />

    <template v-else>
      <!-- 查询条件区（由编译产物 searchFields 生成） -->
      <el-card v-if="searchRules.length" class="search-card">
        <el-form inline :size="tableSize">
          <el-form-item v-for="r in searchRules" :key="r.field" :label="r.title">
            <el-input
              v-if="r.type === 'input'"
              v-model="query[r.field]"
              :placeholder="r.title"
              :style="(r.props && r.props.style) || 'width: 180px'"
              clearable
            />
            <el-date-picker
              v-else-if="r.type === 'datePicker'"
              v-model="query[r.field]"
              type="datetimerange"
              start-placeholder="开始"
              end-placeholder="结束"
              value-format="YYYY-MM-DD HH:mm:ss"
              style="width: 360px"
            />
          </el-form-item>
          <el-form-item>
            <div class="toolbar-buttons">
              <el-button type="primary" :icon="Search" circle :size="tableSize === 'small' ? 'small' : 'default'" @click="handleSearch" />
              <el-button :icon="Refresh" circle :size="tableSize === 'small' ? 'small' : 'default'" @click="handleReset" />
            </div>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 数据表格 -->
      <el-card class="table-card">
        <div v-if="toolbarButtons.length" class="toolbar">
          <el-button
            v-for="b in toolbarButtons"
            :key="b.label"
            :type="b.type"
            :link="b.link"
            :circle="b.circle"
            :icon="b.icon"
            :size="toolbarButtonSize"
            :title="b.label"
            @click="b.onClick()"
          >
            {{ b.style === 'icon' ? '' : b.label }}
          </el-button>
        </div>
        <el-table
          ref="tableRef"
          :data="records"
          v-loading="loading"
          border
          stripe
          :size="tableSize"
          @row-click="handleRowClick"
          @cell-click="handleCellClick"
          @selection-change="handleSelectionChange"
          @sort-change="handleSortChange"
        >
          <el-table-column
            v-for="col in tableColumns"
            :key="col.prop"
            :prop="col.prop"
            :label="col.label"
            :min-width="col.minWidth"
            :width="col.width"
            :align="col.align || 'left'"
            :sortable="!!col.sortable"
            :fixed="col.fixed || undefined"
          >
            <template #default="{ row }">
              {{ col.formatter ? formatCellValue(row.data != null ? row.data[col.prop] : row[col.prop], col.formatter) : cellValue(row, col.prop) }}
            </template>
          </el-table-column>
          <el-table-column
            v-if="rowActionButtons.length"
            label="操作"
            :width="rowActionColumnWidth"
            align="center"
            fixed="right"
          >
            <template #default="{ row }">
              <div class="page-row-actions">
                <template v-for="b in rowActionButtons" :key="b.label">
                  <template v-if="isButtonVisibleForRow(b, row)">
                    <!-- 图标/按钮形态：circle + tooltip（对齐 SearchTable 操作列） -->
                    <el-tooltip v-if="b.style === 'icon'" :content="b.label" placement="top" :show-after="200">
                      <el-button :icon="b.icon" circle :type="b.type" @click.stop="b.onClick(row)" />
                    </el-tooltip>
                    <!-- 文字/按钮形态：link 文本按钮 -->
                    <el-button
                      v-else
                      :type="b.type"
                      :icon="b.style === 'button' ? b.icon : undefined"
                      link
                      @click.stop="b.onClick(row)"
                    >
                      {{ b.label }}
                    </el-button>
                  </template>
                </template>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-bar">
          <el-pagination
            :current-page="currentPage"
            :page-size="pageSize"
            :total="total"
            layout="total, prev, pager, next"
            background
            @current-change="handlePageChange"
          />
        </div>
      </el-card>
    </template>

    <!-- 详情弹窗双轨：FORM 数据源/遗留页 → 只读表单；WORKFLOW 等只读数据源 → KV 表格 -->
    <el-dialog v-model="detailVisible" :title="detailTitle" :width="detailWidth">
      <FormRenderer
        v-if="detailVisible && isFormDetail"
        :rule="detailRules"
        :option="detailOption"
        :initial-values="currentRow && currentRow.data"
        readonly
      />
      <el-descriptions v-else-if="detailVisible" :column="1" border>
        <el-descriptions-item v-for="col in kvDetailColumns" :key="col.key" :label="col.label || col.key">
          {{ cellValue(currentRow, col.key) }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <!-- 新增/编辑弹窗（可编辑，提交后刷新） -->
    <el-dialog v-model="editVisible" :title="editTitle" :width="detailWidth">
      <FormRenderer
        v-if="editVisible"
        ref="editFormRef"
        :rule="detailRules"
        :option="detailOption"
        :initial-values="editInitialValues"
      />
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleEditSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Edit, Delete, View, Search, Refresh, Upload, Download, Document,
  Printer, Setting, Check, Close, Star, Collection, Message, Bell, User, Lock, Unlock,
} from '@element-plus/icons-vue'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import PageRendererPage from './PageRendererPage.vue'
import { pageApi, type PageDefinitionDetailDTO } from '@/api/page'
import { formApi } from '@/api/form'
import { dataSourceApi, type DataSourceDTO, type DataSourceMetadataDTO } from '@/api/data-source'
import { bizDataApi } from '@/api/bizData'
import { executeScript, isScriptEventEnabled } from '@/utils/scriptSandbox'
import { formatCellValue } from '@/utils/formatters'

const route = useRoute()
const router = useRouter()

const pageKey = computed(() => route.params.pageKey as string)

// ========== 加载状态 ==========
const error = ref('')
const loading = ref(false)
const page = ref<PageDefinitionDetailDTO | null>(null)
/** 表格 ref（供 clear-selection / set-sort 操作使用） */
const tableRef = ref<any>(null)
/** 当前选中行（selection-change 事件） */
const selectedRows = ref<any[]>([])

// ========== 数据源协议（dataSourceId → metadata/类型缓存，双轨渲染依据） ==========
/** 绑定数据源 metadata（列 + 可写标记）；null=遗留 formKey 页未绑定数据源 */
const dataSourceMeta = ref<DataSourceMetadataDTO | null>(null)
/** 绑定数据源定义（type/formKey 反查用） */
const boundDataSource = ref<DataSourceDTO | null>(null)
/** 详情/CRUD 用表单 key：遗留页取 page.formKey；FORM 数据源取 ds.formKey；WORKFLOW 数据源为 null（KV 只读） */
const boundFormKey = computed(
  () =>
    page.value?.formKey ||
    (boundDataSource.value?.type === 'FORM' ? (boundDataSource.value.formKey || null) : null),
)
/** 是否只读数据源（无 metadata=遗留可编辑页 → false；有 metadata 按 writable） */
const isReadonly = computed(() => (dataSourceMeta.value ? !dataSourceMeta.value.writable : false))
/** 详情渲染形态：有 formKey → 表单；否则 KV 只读表格 */
const isFormDetail = computed(() => !!boundFormKey.value)
/** KV 详情列（metadata 列；无 metadata 时回退当前表格列） */
const kvDetailColumns = computed(() => {
  const meta = dataSourceMeta.value
  if (meta?.columns?.length) return meta.columns
  return tableColumns.value.map((c) => ({ key: c.prop, label: c.label }))
})

// ========== 编译产物解析结果 ==========
interface CompiledColumn {
  prop: string
  label: string
  minWidth?: number | string
  width?: number | string
  align?: string
  sortable?: boolean
  /** 固定列（left/right） */
  fixed?: string
  /** 列值格式化器（currency/date/datetime/boolean/enum） */
  formatter?: string
}
interface SearchRule {
  type: string
  field: string
  title: string
  matchType: string
  value?: any
  props?: Record<string, any>
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const searchRules = ref<SearchRule[]>([])
const tableColumns = ref<CompiledColumn[]>([])
const actionConfig = ref<Record<string, any>>({})
const detailConfig = ref<Record<string, any>>({ enabled: false, width: '800px', type: 'form' })
const eventsList = ref<any[]>([])
const detailRules = ref<any[]>([])
const detailOption = ref<Record<string, any>>({})

// ========== 查询 ==========
const query = reactive<Record<string, any>>({})
const queryDefaults = ref<Record<string, any>>({})
const records = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)

// ========== 详情 ==========
const detailVisible = ref(false)
const detailTitle = ref('详情')
const detailWidth = ref('800px')
const currentRow = ref<any>(null)

// ========== 新增/编辑 ==========
const editVisible = ref(false)
const editTitle = ref('新增')
const editMode = ref<'create' | 'edit'>('create')
const editInitialValues = ref<Record<string, any>>({})
const editFormRef = ref<InstanceType<typeof FormRenderer>>()
const saving = ref(false)

// ========== 加载页面 ==========
onMounted(load)

async function load() {
  try {
    // preview=true（视图设计器预览）：取最新 DRAFT 定义而非已发布版本
    const preview = route.query.preview === 'true'
    const res = await pageApi.getPageByKey(pageKey.value, preview)
    page.value = res.data
    if (res.data.type === 'PAGE') {
      // 自定义页面（阶段二）：交给 PageRendererPage 渲染（数据源注册 + 动作总线）
      return
    }
    if (res.data.type !== 'VIEW') {
      error.value = '未知页面类型'
      return
    }
    if (!parseSchema(res.data.schema)) {
      error.value = '页面配置异常，请联系管理员'
      return
    }
    // 数据源协议：绑定 dataSourceId 时拉取 metadata（列 + writable）与定义（FORM 反查 formKey）
    if (res.data.dataSourceId) {
      try {
        const [metaRes, dsRes] = await Promise.all([
          dataSourceApi.getMetadata(res.data.dataSourceId),
          dataSourceApi.getDataSource(res.data.dataSourceId),
        ])
        dataSourceMeta.value = metaRes.data
        boundDataSource.value = dsRes.data
      } catch {
        dataSourceMeta.value = null
        boundDataSource.value = null
      }
    }
    await loadData(0)
  } catch (e: any) {
    error.value = e?.message || '页面加载失败'
    ElMessage.error(error.value)
  }
}

/** 解析编译产物 {rule, option}，按 rule.type 分段提取 */
function parseSchema(schema: string): boolean {
  try {
    const parsed = JSON.parse(schema || '{}')
    const rule: any[] = Array.isArray(parsed) ? parsed : (parsed.rule || [])
    detailOption.value = Array.isArray(parsed) ? {} : (parsed.option || {})
    searchRules.value = rule.filter((r) => r.type === 'input' || r.type === 'datePicker')
    const tableRule = rule.find((r) => r.type === 'table')
    tableColumns.value = (tableRule?.props?.columns || []) as CompiledColumn[]
    const actionsRule = rule.find((r) => r.type === '__page_actions')
    actionConfig.value = actionsRule?.props || {}
    const detailRule = rule.find((r) => r.type === '__page_detail')
    if (detailRule?.props?.enabled) {
      detailConfig.value = detailRule.props
    }
    const eventsRule = rule.find((r) => r.type === '__page_events')
    eventsList.value = eventsRule?.events || []
    // 查询默认值（编译产物 rule.value）
    queryDefaults.value = Object.fromEntries(searchRules.value.map((r) => [r.field, r.value ?? '']))
    Object.keys(queryDefaults.value).forEach((k) => { query[k] = queryDefaults.value[k] })
    return true
  } catch {
    return false
  }
}

/** 构建结构化 filter {logic, conditions:[{column,op,value}]}；空条件返回 undefined */
function buildFilter(): string | undefined {
  const conditions: { column: string; op: string; value: any }[] = []
  for (const r of searchRules.value) {
    const v = query[r.field]
    if (v === undefined || v === null || v === '') continue
    if (r.matchType === 'like') conditions.push({ column: r.field, op: 'like', value: v })
    else if (r.matchType === 'range') conditions.push({ column: r.field, op: 'range', value: v })
    else conditions.push({ column: r.field, op: 'eq', value: v })
  }
  if (!conditions.length) return undefined
  return JSON.stringify({ logic: 'AND', conditions })
}

async function loadData(pageNo: number) {
  loading.value = true
  try {
    const params: Record<string, any> = { page: pageNo, size: pageSize.value }
    const filter = buildFilter()
    if (filter) params.filter = filter
    const res = await pageApi.queryPageData(pageKey.value, params)
    const data = res.data as any
    records.value = data.records || []
    total.value = data.total || 0
    currentPage.value = pageNo + 1
    triggerEvents('refresh', 'table', { row: null, params: route.query || {} })
  } catch (e: any) {
    ElMessage.error(e?.message || '数据加载失败')
  } finally {
    loading.value = false
  }
}

// ========== 查询交互 ==========
function handleSearch() {
  loadData(0)
  triggerEvents('search', 'search', { row: null, params: route.query || {} })
}

function handleReset() {
  Object.keys(queryDefaults.value).forEach((k) => { query[k] = queryDefaults.value[k] })
  loadData(0)
}

function handlePageChange(p: number) {
  loadData(p - 1)
}

/** 行取值：优先 BizDataVO 内层 row.data[key]，回退顶层 row[key] */
function cellValue(row: any, key: string): unknown {
  const v = row?.data != null && typeof row.data === 'object' ? row.data[key] : row?.[key]
  return v === null || v === undefined ? '—' : v
}

// ========== 操作按钮 ==========
interface ActionButtonConfig {
  label: string
  type: '' | 'primary' | 'danger'
  icon?: any
  link?: boolean
  circle?: boolean
  onClick: (row?: any) => void
  /** 按钮形态：button（带图标+文字）/ icon（仅图标）/ text（文字链接） */
  style: 'button' | 'icon' | 'text'
}

/** 内置按钮 key（固定行为映射） */
const BUILTIN_ACTION_KEYS = ['create', 'edit', 'delete', 'view']

/** 按钮显隐：数据源只读时隐藏写操作内置按钮（create/edit/delete），保留查看与自定义按钮 */
function isActionVisible(b: { key: string; events?: any[] }): boolean {
  if (!isReadonly.value) return true
  if (b.events && b.events.length > 0) return true
  return b.key === 'view'
}

/** 行级按钮可见性：根据 visible 表达式判断（$row 变量替换求值） */
function isButtonVisibleForRow(b: { key: string; visible?: string; events?: any[] }, row: any): boolean {
  // 先通过全局可见性检查
  if (!isActionVisible(b)) return false
  // 无 visible 表达式 → 始终显示
  if (!b.visible) return true
  // 替换 $row.xxx 变量后求值
  try {
    const expr = b.visible.replace(/\$row\.([\w]+)/g, (_: string, k: string) => {
      const v = row?.data != null && typeof row.data === 'object' ? row.data[k] : row?.[k]
      return v === null || v === undefined ? 'undefined' : JSON.stringify(v)
    }).replace(/\$param\.([\w]+)/g, (_: string, k: string) => {
      const v = route.query?.[k]
      return v === null || v === undefined ? 'undefined' : JSON.stringify(v)
    })
    // 安全求值：仅允许比较运算，禁止函数调用
    if (/[a-zA-Z_$]\s*\(/.test(expr)) return false
    return !!Function('"use strict"; return (' + expr + ')')()
  } catch {
    return true // 求值失败时默认显示
  }
}

/** 表格尺寸：预览（preview=true）普通模式，非预览紧凑模式 */
const tableSize = computed<'default' | 'small'>(() => (route.query.preview === 'true' ? 'default' : 'small'))
/** 操作栏按钮尺寸：预览普通，非预览紧凑 */
const toolbarButtonSize = computed<'default' | 'small'>(() => (route.query.preview === 'true' ? 'default' : 'small'))

/** 编译产物按钮列表（buttons[] 或兼容旧布尔格式归一化） */
const actionButtonsConfig = computed<{ key: string; label: string; placement: 'toolbar' | 'column'; style: 'button' | 'icon' | 'text'; events?: any[] }[]>(() => {
  const cfg = actionConfig.value
  if (Array.isArray(cfg.buttons) && cfg.buttons.length > 0) {
    return cfg.buttons
  }
  // 兼容旧布尔格式：create/edit/delete/view + 全局 placement/style
  const placement = (cfg.placement === 'toolbar' ? 'toolbar' : 'column') as 'toolbar' | 'column'
  const style = (cfg.style || 'button') as 'button' | 'icon' | 'text'
  const out: any[] = []
  if (cfg.create) out.push({ key: 'create', label: '新增', placement: 'toolbar', style })
  if (cfg.edit) out.push({ key: 'edit', label: '编辑', placement, style })
  if (cfg.delete) out.push({ key: 'delete', label: '删除', placement, style })
  if (cfg.view) out.push({ key: 'view', label: '查看', placement, style })
  return out
})

/** 工具栏按钮（placement=toolbar） */
const toolbarButtons = computed<ActionButtonConfig[]>(() =>
  actionButtonsConfig.value
    .filter((b) => b.placement === 'toolbar' && isActionVisible(b))
    .map(toButtonConfig),
)

/** 操作列按钮（placement=column，行内渲染带行参数） */
const rowActionButtons = computed<ActionButtonConfig[]>(() =>
  actionButtonsConfig.value
    .filter((b) => b.placement === 'column' && isActionVisible(b))
    .map(toButtonConfig),
)

/** 自定义按钮：点击触发其绑定事件链（trigger 恒为 click，target=按钮 key） */
function handleCustomButton(btn: { key: string; events?: any[] }, row?: any) {
  if (row) currentRow.value = row
  for (const ev of btn.events || []) {
    for (const action of ev.actions || []) {
      dispatchAction(action, { row: currentRow.value, params: route.query || {} })
    }
  }
}

function toButtonConfig(b: { key: string; label: string; style: 'button' | 'icon' | 'text'; icon?: string; events?: any[] }): ActionButtonConfig {
  const defaultIcons: Record<string, any> = { create: Plus, edit: Edit, delete: Delete, view: View }
  const iconMap: Record<string, any> = {
    Plus, Edit, Delete, View, Search, Refresh, Upload, Download, Document,
    Printer, Setting, Check, Close, Star, Collection, Message, Bell, User, Lock, Unlock,
  }
  const handlers: Record<string, (row?: any) => void> = {
    create: () => openCreate(),
    edit: (row?: any) => openEdit(row),
    delete: (row?: any) => handleDelete(row),
    view: (row?: any) => openDetail(row),
  }
  const type = b.key === 'create' ? 'primary' : b.key === 'delete' ? 'danger' : ''
  const isBuiltin = BUILTIN_ACTION_KEYS.includes(b.key)
  const hasEvents = !!(b.events && b.events.length > 0)
  // 有绑定事件 → 优先执行事件链（内建/自定义都一样）
  const onClick = hasEvents
    ? (row?: any) => handleCustomButton(b, row)
    : isBuiltin
      ? handlers[b.key]
      : () => {}
  return {
    label: b.label,
    type: type as '' | 'primary' | 'danger',
    icon: (b.icon && iconMap[b.icon]) || defaultIcons[b.key],
    style: b.style,
    link: b.style === 'text',
    circle: b.style === 'icon',
    onClick,
  }
}

/** 行操作列宽：优先用配置 actionColumnWidth；缺省按按钮数量自动计算 */
const rowActionColumnWidth = computed(() => {
  const count = rowActionButtons.value.length
  if (count === 0) return 0
  const cfgWidth = actionConfig.value.actionColumnWidth
  if (cfgWidth && cfgWidth > 0) return cfgWidth
  const iconCount = rowActionButtons.value.filter((b) => b.style === 'icon').length
  const textCount = count - iconCount
  return iconCount * 56 + textCount * 70 + 20
})

function requireRow(): any | null {
  if (currentRow.value) return currentRow.value
  ElMessage.warning('请先点击一行数据')
  return null
}

// ========== 详情弹窗 ==========
async function openDetail(row?: any) {
  if (!row) {
    row = requireRow()
  }
  if (!row) return
  currentRow.value = row
  detailTitle.value = '详情'
  detailWidth.value = detailConfig.value.width || '800px'
  detailVisible.value = true
  // 表单形态详情才需要加载表单 schema；KV 只读详情直接展示行数据
  if (isFormDetail.value && !detailRules.value.length) {
    await loadDetailSchema()
  }
}

/** 加载绑定表单 schema（详情/新增/编辑共用；FORM 数据源经 ds.formKey，遗留页经 page.formKey） */
async function loadDetailSchema() {
  const formKey = boundFormKey.value
  if (!formKey) return
  try {
    const res = await formApi.getFormDefinitionByKey(formKey)
    const schema = JSON.parse(res.data?.schema || '[]')
    if (Array.isArray(schema)) {
      detailRules.value = schema
    } else if (schema?.rule) {
      detailRules.value = schema.rule
      detailOption.value = schema.option || {}
    }
  } catch {
    ElMessage.error('绑定表单 schema 加载失败')
  }
}

// ========== 新增/编辑 ==========
function openCreate() {
  if (isReadonly.value) {
    ElMessage.warning('数据源为只读，不支持新增')
    return
  }
  editMode.value = 'create'
  editTitle.value = '新增'
  editInitialValues.value = {}
  editVisible.value = true
  if (!detailRules.value.length) {
    loadDetailSchema()
  }
}

function openEdit(row?: any) {
  if (isReadonly.value) {
    ElMessage.warning('数据源为只读，不支持编辑')
    return
  }
  if (!row) {
    row = requireRow()
    if (!row) return
  }
  currentRow.value = row
  editMode.value = 'edit'
  editTitle.value = '编辑'
  editInitialValues.value = row.data || {}
  editVisible.value = true
  if (!detailRules.value.length) {
    loadDetailSchema()
  }
}

async function handleEditSubmit() {
  const formKey = boundFormKey.value
  if (!formKey) return
  const formData = editFormRef.value?.getFormData() || {}
  saving.value = true
  try {
    if (editMode.value === 'create') {
      await bizDataApi.create(formKey, formData)
      ElMessage.success('新增成功')
      triggerEvents('create-success', 'create-dialog', { row: null, params: route.query || {} })
    } else {
      const row = currentRow.value
      if (!row) return
      await bizDataApi.update(formKey, row.id, formData, row.version ?? 1)
      ElMessage.success('更新成功')
    }
    editVisible.value = false
    loadData(currentPage.value - 1)
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    saving.value = false
  }
}

// ========== 删除 ==========
async function handleDelete(row?: any) {
  const formKey = boundFormKey.value
  if (!row) {
    row = requireRow()
  }
  if (!row || !formKey) return
  currentRow.value = row
  try {
    await ElMessageBox.confirm('确定要删除该记录吗？', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await bizDataApi.remove(formKey, row.id)
    ElMessage.success('删除成功')
    loadData(currentPage.value - 1)
  } catch {
    // http 拦截器已弹出错误消息
  }
}

// ========== 导出 ==========
function exportData() {
  const blob = new Blob([JSON.stringify(records.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${pageKey.value || 'page'}-data.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ========== 事件动作执行器 ==========
/** 模板变量替换：$row.字段（当前行，优先 row.data 内层）/ $param.参数（路由参数） */
function resolveTemplate(tpl: string, ctx: { row: any; params: Record<string, any> }): string {
  return tpl
    .replace(/\$row\.([\w]+)/g, (_, k) => {
      const row = ctx.row || {}
      const v = row.data != null && typeof row.data === 'object' ? row.data[k] : row[k]
      return v === null || v === undefined ? '' : String(v)
    })
    .replace(/\$param\.([\w]+)/g, (_, k) => (ctx.params?.[k] == null ? '' : String(ctx.params[k])))
}

/** 解析动作参数 [{key,value}] → {key: 模板替换后的值} */
function resolveParams(
  params: { key: string; value: string }[],
  ctx: { row: any; params: Record<string, any> },
): Record<string, any> {
  const out: Record<string, any> = {}
  for (const p of params || []) {
    out[p.key] = resolveTemplate(p.value, ctx)
  }
  return out
}

/** 动作类型分发 */
async function dispatchAction(
  action: { type: string; params?: { key: string; value: string }[] },
  ctx: { row: any; params: Record<string, any> },
) {
  const resolved = resolveParams(action.params || [], ctx)
  switch (action.type) {
    case 'open-detail':
      await openDetail(ctx.row)
      if (resolved.title) detailTitle.value = resolved.title
      if (resolved.width) detailWidth.value = resolved.width
      break
    case 'open-link':
      if (resolved.url) router.push(resolved.url)
      break
    case 'open-create':
      openCreate()
      break
    case 'edit':
      currentRow.value = ctx.row
      openEdit()
      break
    case 'delete': {
      currentRow.value = ctx.row
      await handleDelete()
      break
    }
    case 'refresh':
      await loadData(currentPage.value - 1)
      break
    case 'export':
      exportData()
      break
    case 'message':
      ElMessage({
        message: resolved.text || resolved.message || '提示',
        type: (resolved.type as any) || 'info',
      })
      break
    case 'set-filter':
      for (const [k, v] of Object.entries(resolved)) {
        if (k in query) query[k] = v
      }
      await loadData(0)
      break
    case 'set-sort': {
      // 设置表格排序：params 包含 field 和 order
      const field = resolved.field || resolved.prop || ''
      const order = resolved.order || 'ascending'
      if (tableRef.value) {
        tableRef.value.sort(field, order)
      }
      break
    }
    case 'set-page': {
      // 设置分页：params 包含 page
      const page = parseInt(resolved.page, 10)
      if (!isNaN(page) && page > 0) {
        currentPage.value = page
        await loadData(page - 1)
      }
      break
    }
    case 'clear-selection': {
      // 清空行选择
      if (tableRef.value) {
        tableRef.value.clearSelection()
      }
      selectedRows.value = []
      break
    }
    case 'script': {
      const source: string = resolved.source || ''
      if (!source) {
        console.warn('[page] 脚本动作缺少 source 参数')
        break
      }
      if (!isScriptEventEnabled()) {
        console.warn('[page] 脚本事件未启用（设置 VITE_PAGE_SCRIPT_ENABLED=true 开启）')
        break
      }
      await executeScript(source, {
        row: ctx.row,
        params: ctx.params || {},
        selectedRows: currentRow.value ? [currentRow.value] : [],
        ds: {
          query: (filter?: Record<string, any>) => {
            if (filter) for (const [k, v] of Object.entries(filter)) query[k] = v
            return loadData(0)
          },
          detail: (id: string) => (boundFormKey.value ? bizDataApi.detail(boundFormKey.value, id) : null),
          create: (data: Record<string, unknown>) =>
            boundFormKey.value ? bizDataApi.create(boundFormKey.value, data) : Promise.reject(new Error('数据源只读')),
          update: (id: string, data: Record<string, unknown>) =>
            boundFormKey.value
              ? bizDataApi.update(boundFormKey.value, id, data, currentRow.value?.version || 1)
              : Promise.reject(new Error('数据源只读')),
          remove: (id: string) =>
            boundFormKey.value ? bizDataApi.remove(boundFormKey.value, id) : Promise.reject(new Error('数据源只读')),
        },
        api: { formKey: boundFormKey.value || '', pageKey: pageKey.value },
        actions: {
          refresh: () => loadData(currentPage.value - 1),
          openDetail: () => openDetail(currentRow.value),
          openCreate: () => openCreate(),
          openEdit: () => openEdit(),
          remove: (id: string) => (boundFormKey.value ? bizDataApi.remove(boundFormKey.value, id) : Promise.reject(new Error('数据源只读'))),
        },
        $: { message: (msg: string, type = 'info') => ElMessage({ message: msg, type: type as any }) },
      })
      break
    }
    default:
      console.warn('[page] 未知动作类型:', action.type)
  }
}

/** 按触发器 + 挂接组件执行事件链；target 为空 = 通配（匹配所有组件） */
function triggerEvents(trigger: string, target: string, ctx: { row: any; params: Record<string, any> }) {
  for (const ev of eventsList.value) {
    if (ev.trigger !== trigger) continue
    if (ev.target && ev.target !== target) continue
    for (const action of ev.actions || []) {
      dispatchAction(action, ctx)
    }
  }
}

// ========== 行点击 ==========
function handleRowClick(row: any) {
  currentRow.value = row
  triggerEvents('row-click', 'table', { row, params: route.query || {} })
}

// ========== 单元格点击（新增） ==========
function handleCellClick(row: any, column: any) {
  triggerEvents('cell-click', 'table', { row, column, params: route.query || {} })
}

// ========== 行选择变化（新增） ==========
function handleSelectionChange(selection: any[]) {
  selectedRows.value = selection
  triggerEvents('selection-change', 'table', { selectedRows: selection, params: route.query || {} })
}

// ========== 排序变化（新增） ==========
function handleSortChange({ column, prop, order }: { column: any; prop: string; order: string }) {
  triggerEvents('sort-change', 'table', { column, prop, order, params: route.query || {} })
}
</script>

<style scoped>
.page-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px;
}
.search-card {
  flex-shrink: 0;
  margin-bottom: 16px;
}
.search-card :deep(.el-card__body) {
  padding-bottom: 0;
}
.table-card {
  flex: 1;
  overflow: hidden;
}
.toolbar {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
/* 查询工具栏图标按钮（对齐 SearchTable） */
.toolbar-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.toolbar-buttons .el-button.is-circle {
  padding: 5px;
}
.page-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 0;
  white-space: nowrap;
}
/* 操作列按钮紧凑样式（对齐 SearchTable） */
.page-row-actions .el-button {
  margin-left: 0;
  padding: 4px 6px;
}
.page-row-actions .el-button + .el-button {
  margin-left: 0;
}
.pagination-bar {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>