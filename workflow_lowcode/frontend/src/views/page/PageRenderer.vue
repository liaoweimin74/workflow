<template>
  <div class="page-renderer">
    <!-- 自定义页面（PAGE）：独立渲染组件（数据源注册 + 动作总线）；definition 由宿主下传，避免二次请求 -->
    <PageRendererPage v-if="page?.type === 'PAGE'" :definition="page" />
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
              <el-button type="primary" :icon="Search" circle @click="handleSearch" />
              <el-button :icon="Refresh" circle @click="handleReset" />
            </div>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 数据表格（统一基于 SearchTable） / 卡片列表（display=card，字段由表格列自动映射） -->
      <SearchTable
        v-if="ready && displayMode === 'table'"
        ref="searchTableRef"
        class="page-search-table"
        :columns="searchTableColumns"
        :action-buttons="searchTableActionButtons"
        :toolbar-buttons="searchTableToolbarButtons"
        :fetch-api="searchTableFetchApi"
        :show-search="false"
        :show-pagination="paginationConfig.show"
        :default-page-size="paginationConfig.pageSize"
        :page-sizes="paginationConfig.pageSizes"
         :table-size="tableSize"
         :style-rule="tableStyle"
        :max-visible-buttons="20"
        @row-click="handleRowClick"
        @cell-click="handleCellClick"
        @selection-change="handleSelectionChange"
        @sort-change="handleSortChange"
      />
      <ListCards
        v-else-if="ready && displayMode === 'card'"
        ref="cardsRef"
        class="page-search-cards"
        :columns="cardColumns"
        :actions="cardActions"
        :fetch-api="cardFetchApi"
        :show-search="false"
        :show-pagination="paginationConfig.show"
        :default-page-size="paginationConfig.pageSize"
         :page-sizes="paginationConfig.pageSizes"
         :style="cardStyle"
        @row-click="handleRowClick"
        @action-click="handleCardActionClick"
      />
    </template>

    <!-- 详情弹窗双轨：FORM 数据源/遗留页 → 只读表单；WORKFLOW 等只读数据源 → KV 表格 -->
    <el-dialog v-model="detailVisible" :title="detailTitle" :width="detailWidth">
      <div class="dialog-body-scroll" :style="{ height: detailHeight || undefined }">
        <FormRenderer
          v-if="detailVisible && isFormDetail"
          :rule="detailRules"
          :option="detailOption"
          :data-sources="detailDataSources"
          :initial-values="currentRow && currentRow.data"
          readonly
        />
        <el-descriptions v-else-if="detailVisible" :column="1" border>
          <el-descriptions-item v-for="col in kvDetailColumns" :key="col.key" :label="col.label || col.key">
            {{ cellValue(currentRow, col.key) }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <!-- 新增/编辑弹窗（可编辑，提交后刷新） -->
    <el-dialog v-model="editVisible" :title="editTitle" :width="detailWidth">
      <div class="dialog-body-scroll" :style="{ height: detailHeight || undefined }">
        <FormRenderer
          v-if="editVisible"
          ref="editFormRef"
          :rule="detailRules"
          :option="detailOption"
          :data-sources="detailDataSources"
          :initial-values="editInitialValues"
        />
      </div>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleEditSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 内嵌表单（formMode=inline）：全屏覆盖视图，关闭后恢复 -->
    <div v-if="inlineVisible" class="inline-form-overlay">
      <div class="inline-form-container">
        <div class="inline-form-header">
          <span class="inline-form-title">{{ inlineTitle }}</span>
          <el-button text :icon="Close" @click="inlineVisible = false" />
        </div>
        <div class="inline-form-body">
          <FormRenderer
            v-if="isFormDetail"
            ref="inlineFormRef"
            :rule="detailRules"
            :option="detailOption"
            :data-sources="detailDataSources"
            :initial-values="inlineInitialValues"
            :readonly="inlineMode === 'view'"
          />
          <el-descriptions v-else :column="1" border>
            <el-descriptions-item v-for="col in kvDetailColumns" :key="col.key" :label="col.label || col.key">
              {{ cellValue(inlineRow, col.key) }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
        <div class="inline-form-footer">
          <template v-if="inlineMode === 'view'">
            <el-button type="primary" @click="inlineVisible = false">关闭</el-button>
          </template>
          <template v-else>
            <el-button @click="inlineVisible = false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="handleInlineSubmit">保存</el-button>
          </template>
        </div>
      </div>
    </div>

    <!-- 抽屉表单（formMode=drawer）：右侧弹出 -->
    <el-drawer v-model="drawerVisible" :title="drawerTitle" :size="detailWidth" destroy-on-close>
      <FormRenderer
        v-if="isFormDetail"
        ref="drawerFormRef"
        :rule="detailRules"
        :option="detailOption"
        :data-sources="detailDataSources"
        :initial-values="drawerInitialValues"
        :readonly="drawerMode === 'view'"
      />
      <el-descriptions v-else :column="1" border>
        <el-descriptions-item v-for="col in kvDetailColumns" :key="col.key" :label="col.label || col.key">
          {{ cellValue(drawerRow, col.key) }}
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <template v-if="drawerMode === 'view'">
          <el-button type="primary" @click="drawerVisible = false">关闭</el-button>
        </template>
        <template v-else>
          <el-button @click="drawerVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleDrawerSubmit">保存</el-button>
        </template>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
// 路由组件 name 与路由 name 一致，供 AdminLayout keep-alive include 匹配缓存
defineOptions({ name: 'PageRenderer' })

import { ref, computed, reactive, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Edit, Delete, View, Search, Refresh, Upload, Download, Document,
  Printer, Setting, Check, Close, Star, Collection, Message, Bell, User, Lock, Unlock,
} from '@element-plus/icons-vue'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import PageRendererPage from './PageRendererPage.vue'
import SearchTable from '@/components/business/SearchTable.vue'
import ListCards from '@/components/business/ListCards.vue'
import type { TableColumn, ActionButton, ToolbarButton, QueryParams, CardColumn, ListQueryParams, ListPageResult } from '@/components/business/types'
import { pageApi, type PageDefinitionDetailDTO } from '@/api/page'
import { formApi } from '@/api/form'
import { dataSourceApi, type DataSourceDTO, type DataSourceMetadataDTO } from '@/api/data-source'
import { bizDataApi } from '@/api/bizData'
import { executeScript, isScriptEventEnabled } from '@/utils/scriptSandbox'
import { buildCellRender, renderCellContent, type CellContentConfig } from '@/utils/tableColumnRenderer'
import type { CardStyle } from '@/components/business/ListCards.types'

const route = useRoute()
const router = useRouter()

// 挂载时快照：keep-alive 按 :key="route.path" 隔离实例，不同 pageKey 是独立实例；
// 缓存实例的全局 route 会随其他页签导航变化，此处不能 watch route.params（否则缓存实例错误重载）
const pageKey = ref(route.params.pageKey as string)

// ========== 加载状态 ==========
const error = ref('')
const page = ref<PageDefinitionDetailDTO | null>(null)
/** schema 解析 + 数据源 metadata 就绪后置 true，挂载 SearchTable（避免空 schema 提前请求） */
const ready = ref(false)
/** SearchTable 实例 ref（供 setQuery / sort / clearSelection / fetchList 控制） */
const searchTableRef = ref<InstanceType<typeof SearchTable> | null>(null)
/** ListCards 实例 ref（display=card 时的取数/刷新控制） */
const cardsRef = ref<InstanceType<typeof ListCards> | null>(null)
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

/** 确保数据源定义已加载（打开表单前调用，单次加载） */
async function ensureBoundDataSource() {
  if (boundDataSource.value || !page.value?.dataSourceId) return
  try {
    boundDataSource.value = (await dataSourceApi.getDataSource(page.value.dataSourceId)).data
  } catch {
    boundDataSource.value = null
  }
}

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
  /** 列内容类型：expression（JS 表达式）/ template（${字段} 插值） */
  contentType?: 'expression' | 'template'
  /** 列内容值（与 contentType 配对） */
  contentValue?: string
  /** 列内容模板（${字段} 插值；优先级高于 formatter，低于 expression） */
  template?: string
  /** 列动态内容表达式（$row.xxx 求值，结果仅作文本渲染；优先级最高） */
  expression?: string
  /** 单元格 class（透传 <td> 静态样式） */
  className?: string
  /** 单元格样式表达式（返回样式字符串/CSSProperties 对象） */
  styleExpr?: string
  /** 列头点击事件链（点击本列单元格触发；配置后短路整表级 cell-click） */
  onCellClick?: { actions: any[] }
  style?: import('@/utils/fieldStyle').FieldStyle
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
/** 显示方式：table（表格，默认）/ card（卡片，由视图 schema.display 编译透传） */
const displayMode = ref<'table' | 'card'>('table')
const tableStyle = ref<CardStyle | undefined>(undefined)
const cardStyle = ref<CardStyle | undefined>(undefined)
/** 视图级可排序字段（编译产物 sortableFields；空=跟随数据源全部可排字段） */
const sortableFieldKeys = ref<string[]>([])
/** 分页配置（编译产物 pagination；缺省显示分页 / 20 条 / [10,20,50]） */
const paginationConfig = ref<{ show: boolean; pageSize: number; pageSizes: number[] }>({
  show: true,
  pageSize: 20,
  pageSizes: [10, 20, 50],
})
const actionConfig = ref<Record<string, any>>({})
const detailConfig = ref<Record<string, any>>({ enabled: false, width: '800px', type: 'form' })
const eventsList = ref<any[]>([])
const detailRules = ref<any[]>([])
const detailOption = ref<Record<string, any>>({})
/** 绑定表单级数据源绑定（供 FormRenderer 选项数据源/数据组件按 dataSourceId 解析 refId） */
const detailDataSources = ref<Array<{ id: string; refId: string; name?: string }>>([])

// ========== 查询 ==========
const query = reactive<Record<string, any>>({})
const queryDefaults = ref<Record<string, any>>({})

// ========== 详情 ==========
const detailVisible = ref(false)
const detailTitle = ref('详情')
const detailWidth = ref('800px')
/** 表单容器内容区高度（detailConfig.height；弹窗内容区固定高度滚动） */
const detailHeight = computed(() => (detailConfig.value.height as string) || '')
const currentRow = ref<any>(null)

// ========== 新增/编辑 ==========
const editVisible = ref(false)
const editTitle = ref('新增')
const editMode = ref<'create' | 'edit'>('create')
const editInitialValues = ref<Record<string, any>>({})
const editFormRef = ref<InstanceType<typeof FormRenderer>>()
const saving = ref(false)

// ========== 内嵌表单（formMode=inline） ==========
const inlineVisible = ref(false)
const inlineTitle = ref('新增')
const inlineMode = ref<'create' | 'edit' | 'view'>('create')
const inlineRow = ref<any>(null)
const inlineInitialValues = ref<Record<string, any>>({})
const inlineFormRef = ref<InstanceType<typeof FormRenderer>>()

// ========== 抽屉表单（formMode=drawer，右侧弹出） ==========
const drawerVisible = ref(false)
const drawerTitle = ref('新增')
const drawerMode = ref<'create' | 'edit' | 'view'>('create')
const drawerRow = ref<any>(null)
const drawerInitialValues = ref<Record<string, any>>({})
const drawerFormRef = ref<InstanceType<typeof FormRenderer>>()

// ========== 加载页面 ==========
onMounted(load)
// 说明：不同 pageKey 由 AdminLayout keep-alive :key="route.path" 隔离为独立实例，
// 各自 onMounted 时按快照 pageKey 加载；缓存实例不再监听 route.params 变化。

// ========== 强制刷新（keep-alive 场景） ==========
// AdminLayout 菜单重击当前页签时携带 query._t 强制导航（keep-alive 下组件不重挂载）。
// 缓存的所有实例都会收到全局 route 变化，仅当前激活实例（path 匹配自身）响应。
const ownPath = route.path
watch(
  () => route.query._t,
  () => {
    if (route.path !== ownPath) return
    refresh()
  },
)

/** 强制刷新：重新拉取列表数据（保留搜索条件/分页/排序，不重置表单状态） */
function refresh() {
  if (page.value?.type === 'PAGE') return
  if (displayMode.value === 'card') cardsRef.value?.fetchData()
  else searchTableRef.value?.fetchList()
}

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
    // 数据源协议：绑定 dataSourceId 时拉取 metadata（列 + writable），定义（FORM 反查 formKey）延迟到首次表单打开时加载
    if (res.data.dataSourceId) {
      try {
        dataSourceMeta.value = (await dataSourceApi.getMetadata(res.data.dataSourceId)).data
      } catch {
        dataSourceMeta.value = null
      }
    }
    ready.value = true
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
    // 显示方式（编译产物顶层 display；缺省表格）
    displayMode.value = parsed.display === 'card' ? 'card' : 'table'
    detailOption.value = Array.isArray(parsed) ? {} : (parsed.option || {})
    searchRules.value = rule.filter((r) => r.type === 'input' || r.type === 'datePicker')
    // 视图级可排序字段（编译产物顶层 sortableFields；未声明=跟随数据源全部可排字段）
    sortableFieldKeys.value = Array.isArray(parsed.sortableFields) ? parsed.sortableFields : []
    // 分页配置（编译产物顶层 pagination；未声明使用默认）
    const pag = parsed.pagination || {}
    paginationConfig.value = {
      show: pag.show !== false,
      pageSize: Number(pag.pageSize) > 0 ? Number(pag.pageSize) : 20,
      pageSizes: Array.isArray(pag.pageSizes) && pag.pageSizes.length ? [...pag.pageSizes] : [10, 20, 50],
    }
    const tableRule = rule.find((r) => r.type === 'table')
    tableColumns.value = (tableRule?.props?.columns || []) as CompiledColumn[]
    tableStyle.value = tableRule?.props?.style as CardStyle | undefined
    cardStyle.value = tableRule?.props?.cardStyle as CardStyle | undefined
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
function buildFilter(params: Record<string, any>): string | undefined {
  const conditions: { column: string; op: string; value: any }[] = []
  for (const r of searchRules.value) {
    const v = params[r.field]
    if (v === undefined || v === null || v === '') continue
    if (r.matchType === 'like') conditions.push({ column: r.field, op: 'like', value: v })
    else if (r.matchType === 'range') conditions.push({ column: r.field, op: 'range', value: v })
    else conditions.push({ column: r.field, op: 'eq', value: v })
  }
  if (!conditions.length) return undefined
  return JSON.stringify({ logic: 'AND', conditions })
}

/** SearchTable 数据获取：page 为 1-based，转后端 0-based；搜索条件从 params（含外部注入 query）提取 */
const searchTableFetchApi = async (params: QueryParams): Promise<{ rows: any[]; total: number }> => {
  // 不分页（pagination.show=false）：请求全部数据（后端 size<=0 跳过 LIMIT），保留排序
  const p: Record<string, any> = paginationConfig.value.show === false
    ? { size: -1 }
    : { page: params.page || 1, size: params.size || 20 }
  // 排序状态透传（SearchTable 内部维护，服务器端排序）
  if (params.sort) p.sort = params.sort
  if (params.order) p.order = params.order
  const filter = buildFilter(params)
  if (filter) p.filter = filter
  const res = await pageApi.queryPageData(pageKey.value, p)
  const data = res.data as any
  triggerEvents('refresh', 'table', { row: null, params: route.query || {} })
  return { rows: data.records || [], total: data.total || 0 }
}

/** 卡片取数：ListCards 仅传 {page,size}，合并当前搜索 query 后经同一 fetchApi 取数（与表格共享查询/分页/排序语义） */
const cardFetchApi = async (params: ListQueryParams): Promise<ListPageResult> => {
  const merged: QueryParams = { ...query, page: params.page, size: params.size }
  return searchTableFetchApi(merged)
}

// ========== 查询交互 ==========
function handleSearch() {
  searchTableRef.value?.setQuery({ ...query })
  if (displayMode.value === 'card') cardsRef.value?.fetchData()
  triggerEvents('search', 'search', { row: null, params: route.query || {} })
}

function handleReset() {
  Object.keys(queryDefaults.value).forEach((k) => { query[k] = queryDefaults.value[k] })
  searchTableRef.value?.setQuery({ ...query })
  if (displayMode.value === 'card') cardsRef.value?.fetchData()
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

/** 视图表格使用正常（normal）尺寸，不使用 compact 紧凑模式。 */
const tableSize = computed<'default' | 'small'>(() => 'default')

/** 内置按钮默认图标（未配置 icon 时按 key 注入，操作列圆形图标用） */
const defaultIcons: Record<string, any> = { create: Plus, edit: Edit, delete: Delete, view: View }
/** 图标名 → 组件（对齐 ViewDesigner ActionsConfig.iconOptions value） */
const iconMap: Record<string, any> = {
  Plus, Edit, Delete, View, Search, Refresh, Upload, Download, Document,
  Printer, Setting, Check, Close, Star, Collection, Message, Bell, User, Lock, Unlock,
}

/** 编译产物按钮列表（buttons[] 或兼容旧布尔格式归一化） */
const actionButtonsConfig = computed<{ key: string; label: string; placement: 'toolbar' | 'column'; style: 'button' | 'icon' | 'text'; icon?: string; events?: any[] }[]>(() => {
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

/** 列 → SearchTable TableColumn：render 经公共模块承载 contentType/contentValue/styleExpr/className。
 * 排序能力由数据源 metadata 声明（方案 A：视图零配置），schema 残留 sortable 忽略。 */
const searchTableColumns = computed<TableColumn[]>(() =>
  tableColumns.value.map((c) => ({
    prop: c.prop,
    label: c.label,
    minWidth: c.minWidth,
    width: c.width,
    align: (c.align || 'left') as any,
    fixed: (c.fixed || undefined) as any,
    cellClassName: c.className,
    sortable: !!dataSourceMeta.value?.columns?.find((m) => m.key === c.prop)?.sortable
      && (sortableFieldKeys.value.length === 0 || sortableFieldKeys.value.includes(c.prop)),
    render: buildCellRender({
      key: c.prop,
      contentType: c.contentType,
      contentValue: c.contentValue,
      // 兼容旧编译产物（expression/template/formatter 字段）
      expression: c.expression,
      template: c.template,
      formatter: c.formatter,
      className: c.className,
      styleExpr: c.styleExpr,
      style: c.style,
    }),
  })),
)

/** 工具栏按钮（placement=toolbar）→ SearchTable ToolbarButton：button=普通按钮+图标+文字，text=文本按钮+图标，icon=圆形图标按钮 */
const searchTableToolbarButtons = computed<ToolbarButton[]>(() =>
  actionButtonsConfig.value
    .filter((b) => b.placement === 'toolbar' && isActionVisible(b))
    .map((b) => {
      const cfg = toButtonConfig(b)
      return {
        label: cfg.label,
        type: cfg.type || undefined,
        link: cfg.link,
        circle: cfg.circle,
        icon: cfg.icon,
        onClick: () => cfg.onClick(),
      }
    }),
)

/** 操作列按钮（placement=column）→ SearchTable ActionButton（onClick 注入事件链/内建行为，show 注入行级 visible） */
const searchTableActionButtons = computed<ActionButton[]>(() =>
  actionButtonsConfig.value
    .filter((b) => b.placement === 'column' && isActionVisible(b))
    .map((b) => {
      const cfg = toButtonConfig(b)
      return {
        label: cfg.label,
        type: cfg.type || undefined,
        icon: cfg.style === 'icon' ? cfg.icon : undefined,
        show: (row: any) => isButtonVisibleForRow(b, row),
        onClick: (row: any) => cfg.onClick(row),
      }
    }),
)

// ========== 卡片显示（display=card）：表格列自动映射卡片字段，复用同一查询/分页/取数/操作按钮 ==========
/** 卡片字段：由表格列（CompiledColumn）自动映射（role=field；contentType/contentValue/expression/template/formatter 兼容属性保留原生渲染）
 *  formatter 为字符串格式化器，转成 CardColumn.formatter 函数以复用同一渲染语义 */
const cardColumns = computed<CardColumn[]>(() =>
  tableColumns.value
    .filter((c) => !(c as any).hidden)
    .map((c): CardColumn => {
      const contentConfig: CellContentConfig = {
        key: c.prop,
        contentType: c.contentType,
        contentValue: c.contentValue,
        expression: c.expression,
        template: c.template,
        formatter: c.formatter,
      }
      const hasContent = !!(contentConfig.contentType && contentConfig.contentValue) || !!(contentConfig.expression) || !!(contentConfig.template) || !!(contentConfig.formatter)
      return {
        prop: c.prop,
        label: c.label,
        width: c.width,
        minWidth: c.minWidth,
        align: (c.align as CardColumn['align']) || undefined,
        sortable: c.sortable,
        fixed: (c.fixed as CardColumn['fixed']) || undefined,
        // 表格列默认卡片字段角色；内容列走 renderCellContent（含表达式/模板/格式化器）
        role: 'field' as const,
        formatter: hasContent
          ? (row: any) => renderCellContent(contentConfig, row)
          : undefined,
        valueType: undefined,
        style: c.style,
      }
    }),
)

/** 卡片操作按钮（placement=column）→ ListCards action（复用同一 onClick；icon 传图标名字符串，ListCards 内部经 getIcon 解析为组件）
 *  注：ListCards 不消费 show（行级 visible），按钮统一渲染后由 handleActionClick 决定行为 */
const cardActions = computed<Array<{ key: string; label: string; style: 'button' | 'icon' | 'text'; icon?: string; type?: string; onClick: (row: any) => void }>>(() =>
  actionButtonsConfig.value
    .filter((b) => b.placement === 'column' && isActionVisible(b))
    .map((b) => {
      const cfg = toButtonConfig(b)
      return {
        key: b.key,
        label: cfg.label,
        style: cfg.style,
        icon: b.icon && iconMap[b.icon] ? b.icon : undefined,
        type: cfg.type || undefined,
        onClick: (row: any) => cfg.onClick(row),
      }
    }),
)

/** 卡片行点击 → 与表格行点击一致（复用 handleRowClick：设 currentRow + 触发 row-click 事件链） */
// (见模板 @row-click="handleRowClick" 卡片分支)

/** 卡片操作点击（ListCards 统一 emit，action 仅带 key/label）：按 key 匹配 cardActions 执行同一行为 */
function handleCardActionClick(action: { key: string; label: string }, row: any) {
  const matched = cardActions.value.find((a) => a.key === action.key)
  if (matched) matched.onClick(row)
}

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

function requireRow(): any | null {
  if (currentRow.value) return currentRow.value
  ElMessage.warning('请先点击一行数据')
  return null
}

// ========== 详情弹窗 ==========
/** 表单方式分发：drawer 打开抽屉 / inline 打开内嵌覆盖层；返回 true 表示已由非弹窗容器处理 */
function openFormContainer(mode: 'create' | 'edit' | 'view', row?: any): boolean {
  const fm = (detailConfig.value.formMode as string) || 'popup'
  if (fm === 'drawer') {
    if (mode !== 'create' && !row) {
      row = requireRow()
      if (!row) return true
    }
    openDrawerForm(mode, row)
    return true
  }
  if (fm === 'inline') {
    if (mode !== 'create' && !row) {
      row = requireRow()
      if (!row) return true
    }
    openInlineForm(mode, row)
    return true
  }
  return false
}

/** 内嵌表单：覆盖视图打开（新增/编辑/查看共用），关闭后恢复视图 */
function openInlineForm(mode: 'create' | 'edit' | 'view', row?: any) {
  inlineMode.value = mode
  inlineRow.value = mode === 'create' ? null : (row || null)
  inlineInitialValues.value = mode === 'create' ? {} : (row?.data || {})
  inlineTitle.value = mode === 'view' ? '详情' : mode === 'create' ? '新增' : '编辑'
  inlineVisible.value = true
  if (!detailRules.value.length) {
    loadDetailSchema()
  }
}

/** 抽屉表单：右侧抽屉打开（新增/编辑/查看共用） */
function openDrawerForm(mode: 'create' | 'edit' | 'view', row?: any) {
  drawerMode.value = mode
  drawerRow.value = mode === 'create' ? null : (row || null)
  drawerInitialValues.value = mode === 'create' ? {} : (row?.data || {})
  drawerTitle.value = mode === 'view' ? '详情' : mode === 'create' ? '新增' : '编辑'
  drawerVisible.value = true
  if (!detailRules.value.length) {
    loadDetailSchema()
  }
}

/** 抽屉表单提交（新增/编辑，成功后关闭抽屉并刷新列表） */
async function handleDrawerSubmit() {
  const formKey = boundFormKey.value
  if (!formKey) return
  const formData = drawerFormRef.value?.getFormData() || {}
  saving.value = true
  try {
    if (drawerMode.value === 'create') {
      await bizDataApi.create(formKey, formData)
      ElMessage.success('新增成功')
      triggerEvents('create-success', 'create-dialog', { row: null, params: route.query || {} })
    } else {
      const row = drawerRow.value
      if (!row) return
      await bizDataApi.update(formKey, row.id, formData, row.version ?? 1)
      ElMessage.success('更新成功')
    }
    drawerVisible.value = false
    searchTableRef.value?.fetchList()
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    saving.value = false
  }
}

/** 内嵌表单提交（新增/编辑，成功后关闭覆盖层并刷新列表） */
async function handleInlineSubmit() {
  const formKey = boundFormKey.value
  if (!formKey) return
  const formData = inlineFormRef.value?.getFormData() || {}
  saving.value = true
  try {
    if (inlineMode.value === 'create') {
      await bizDataApi.create(formKey, formData)
      ElMessage.success('新增成功')
      triggerEvents('create-success', 'create-dialog', { row: null, params: route.query || {} })
    } else {
      const row = inlineRow.value
      if (!row) return
      await bizDataApi.update(formKey, row.id, formData, row.version ?? 1)
      ElMessage.success('更新成功')
    }
    inlineVisible.value = false
    searchTableRef.value?.fetchList()
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    saving.value = false
  }
}

async function openDetail(row?: any) {
  await ensureBoundDataSource()
  if (openFormContainer('view', row)) return
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
      detailDataSources.value = schema.dataSources || []
    }
  } catch {
    ElMessage.error('绑定表单 schema 加载失败')
  }
}

// ========== 新增/编辑 ==========
async function openCreate() {
  await ensureBoundDataSource()
  if (isReadonly.value) {
    ElMessage.warning('数据源为只读，不支持新增')
    return
  }
  if (openFormContainer('create')) return
  editMode.value = 'create'
  editTitle.value = '新增'
  editInitialValues.value = {}
  editVisible.value = true
  if (!detailRules.value.length) {
    loadDetailSchema()
  }
}

async function openEdit(row?: any) {
  await ensureBoundDataSource()
  if (isReadonly.value) {
    ElMessage.warning('数据源为只读，不支持编辑')
    return
  }
  if (openFormContainer('edit', row)) return
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
    searchTableRef.value?.fetchList()
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
    searchTableRef.value?.fetchList()
  } catch {
    // http 拦截器已弹出错误消息
  }
}

// ========== 导出 ==========
function exportData() {
  const rows = searchTableRef.value?.getList() || []
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
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
      searchTableRef.value?.fetchList()
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
      searchTableRef.value?.setQuery({ ...query })
      break
    case 'set-sort': {
      // 设置表格排序：params 包含 field 和 order
      const field = resolved.field || resolved.prop || ''
      const order = resolved.order || 'ascending'
      searchTableRef.value?.sort(field, order)
      break
    }
    case 'set-page': {
      // 设置分页：params 包含 page（1-based），不重置页
      const page = parseInt(resolved.page, 10)
      if (!isNaN(page) && page > 0) {
        searchTableRef.value?.setQuery({ page }, false)
      }
      break
    }
    case 'clear-selection': {
      // 清空行选择
      searchTableRef.value?.clearSelection()
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
            return searchTableRef.value?.fetchList() ?? Promise.resolve()
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
          refresh: () => searchTableRef.value?.fetchList() ?? Promise.resolve(),
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

/** 事件链上下文：row/params 为通用字段，column/selectedRows/prop/order 为特定触发器携带 */
interface EventContext {
  row?: any
  params?: Record<string, any>
  column?: any
  selectedRows?: any[]
  prop?: string
  order?: string
}

/** 按触发器 + 挂接组件执行事件链；target 为空 = 通配（匹配所有组件） */
function triggerEvents(trigger: string, target: string, ctx: EventContext) {
  for (const ev of eventsList.value) {
    if (ev.trigger !== trigger) continue
    if (ev.target && ev.target !== target) continue
    for (const action of ev.actions || []) {
      dispatchAction(action, { row: ctx.row, params: ctx.params || {} })
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
  // 列级 onCellClick 短路整表级 cell-click（点击该列触发列级事件链）
  const col = tableColumns.value.find(
    (c) => c.prop === (column?.property ?? column?.prop),
  )
  if (col?.onCellClick?.actions?.length) {
    for (const action of col.onCellClick.actions) {
      dispatchAction(action, { row, params: route.query || {} })
    }
    return
  }
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
  height: 100%;
  position: relative;
}
.search-card {
  flex-shrink: 0;
  /* flex 容器间距：gap(12px) + margin-bottom(4px) = 16px，与 SearchTable 直渲染的查询栏间距一致
     （不能写成 16px：会与 .page-renderer 的 flex gap 12px 叠加成 28px） */
  margin-bottom: 4px;
}
.search-card :deep(.el-card__body) {
  padding-bottom: 0;
}
/* SearchTable 撑满剩余空间（表格区域滚动） */
.page-search-table {
  flex: 1;
  min-height: 0;
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
/* 弹窗内容区：配置了弹窗高度时固定高度、超出滚动；未配置自然高度 */
.dialog-body-scroll {
  overflow-y: auto;
}
/* 内嵌表单覆盖层（formMode=inline）：覆盖当前页签内容区，关闭后恢复视图 */
.inline-form-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: #fff;
  display: flex;
  flex-direction: column;
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
  overflow: auto;
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
