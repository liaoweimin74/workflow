<template>
  <div class="page-renderer">
    <!-- 错误态：不存在/未发布/schema 畸形，不白屏 -->
    <el-result
      v-if="error"
      icon="error"
      :title="error"
      style="padding: 80px 0"
    />

    <template v-else>
      <!-- 查询条件区（由编译产物 searchFields 生成） -->
      <el-card v-if="searchRules.length" class="search-card">
        <el-form inline>
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
            <el-button type="primary" @click="handleSearch">查询</el-button>
            <el-button @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 数据表格 -->
      <el-card class="table-card">
        <div v-if="actionButtons.length" class="toolbar">
          <el-button
            v-for="b in actionButtons"
            :key="b.label"
            :type="b.type"
            size="small"
            @click="b.onClick"
          >
            {{ b.label }}
          </el-button>
        </div>
        <el-table
          :data="records"
          v-loading="loading"
          border
          stripe
          size="small"
          @row-click="handleRowClick"
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
          >
            <template #default="{ row }">
              {{ cellValue(row, col.prop) }}
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

    <!-- 详情弹窗（只读表单，复用绑定表单 schema） -->
    <el-dialog v-model="detailVisible" :title="detailTitle" :width="detailWidth">
      <FormRenderer
        v-if="detailVisible"
        :rule="detailRules"
        :option="detailOption"
        :initial-values="currentRow && currentRow.data"
        readonly
      />
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
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import { pageApi, type PageDefinitionDetailDTO } from '@/api/page'
import { formApi } from '@/api/form'
import { bizDataApi } from '@/api/bizData'
import { executeScript, isScriptEventEnabled } from '@/utils/scriptSandbox'

const route = useRoute()
const router = useRouter()

const pageKey = computed(() => route.params.pageKey as string)

// ========== 加载状态 ==========
const error = ref('')
const loading = ref(false)
const page = ref<PageDefinitionDetailDTO | null>(null)

// ========== 编译产物解析结果 ==========
interface CompiledColumn {
  prop: string
  label: string
  minWidth?: number | string
  width?: number | string
  align?: string
  sortable?: boolean
}
interface SearchRule {
  type: string
  field: string
  title: string
  matchType: string
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
    const res = await pageApi.getPageByKey(pageKey.value)
    page.value = res.data
    if (res.data.type !== 'VIEW') {
      error.value = '自定义页面（阶段二）暂未开放'
      return
    }
    if (!parseSchema(res.data.schema)) {
      error.value = '页面配置异常，请联系管理员'
      return
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
    triggerEvents('refresh', { row: null, params: route.query || {} })
  } catch (e: any) {
    ElMessage.error(e?.message || '数据加载失败')
  } finally {
    loading.value = false
  }
}

// ========== 查询交互 ==========
function handleSearch() {
  loadData(0)
  triggerEvents('search', { row: null, params: route.query || {} })
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
const actionButtons = computed(() => {
  const cfg = actionConfig.value
  const btns: { label: string; type: '' | 'primary' | 'danger'; onClick: () => void }[] = []
  if (cfg.create) {
    btns.push({ label: '新增', type: 'primary', onClick: () => openCreate() })
  }
  if (cfg.edit) {
    btns.push({ label: '编辑', type: '', onClick: () => openEdit() })
  }
  if (cfg.delete) {
    btns.push({ label: '删除', type: 'danger', onClick: () => handleDelete() })
  }
  if (cfg.view) {
    btns.push({ label: '查看', type: '', onClick: () => openDetail(currentRow.value) })
  }
  return btns
})

function requireRow(): any | null {
  if (currentRow.value) return currentRow.value
  ElMessage.warning('请先点击一行数据')
  return null
}

// ========== 详情弹窗 ==========
async function openDetail(row: any) {
  if (!row) {
    ElMessage.warning('暂无数据可查看')
    return
  }
  currentRow.value = row
  detailTitle.value = '详情'
  detailWidth.value = detailConfig.value.width || '800px'
  detailVisible.value = true
  if (!detailRules.value.length) {
    await loadDetailSchema()
  }
}

/** 加载绑定表单 schema（详情/新增/编辑共用） */
async function loadDetailSchema() {
  if (!page.value?.formKey) return
  try {
    const res = await formApi.getFormDefinitionByKey(page.value.formKey)
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
  editMode.value = 'create'
  editTitle.value = '新增'
  editInitialValues.value = {}
  editVisible.value = true
  if (!detailRules.value.length) {
    loadDetailSchema()
  }
}

function openEdit() {
  const row = requireRow()
  if (!row) return
  editMode.value = 'edit'
  editTitle.value = '编辑'
  editInitialValues.value = row.data || {}
  editVisible.value = true
  if (!detailRules.value.length) {
    loadDetailSchema()
  }
}

async function handleEditSubmit() {
  if (!page.value?.formKey) return
  const formData = editFormRef.value?.getFormData() || {}
  saving.value = true
  try {
    if (editMode.value === 'create') {
      await bizDataApi.create(page.value.formKey, formData)
      ElMessage.success('新增成功')
      triggerEvents('create-success', { row: null, params: route.query || {} })
    } else {
      const row = currentRow.value
      if (!row) return
      await bizDataApi.update(page.value.formKey, row.id, formData, row.version ?? 1)
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
async function handleDelete() {
  const row = requireRow()
  if (!row || !page.value?.formKey) return
  try {
    await ElMessageBox.confirm('确定要删除该记录吗？', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await bizDataApi.remove(page.value.formKey, row.id)
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
          detail: (id: string) => (page.value?.formKey ? bizDataApi.detail(page.value.formKey, id) : null),
          create: (data: Record<string, unknown>) =>
            page.value?.formKey ? bizDataApi.create(page.value.formKey, data) : Promise.reject(new Error('未绑定表单')),
          update: (id: string, data: Record<string, unknown>) =>
            page.value?.formKey
              ? bizDataApi.update(page.value.formKey, id, data, currentRow.value?.version || 1)
              : Promise.reject(new Error('未绑定表单')),
          remove: (id: string) =>
            page.value?.formKey ? bizDataApi.remove(page.value.formKey, id) : Promise.reject(new Error('未绑定表单')),
        },
        api: { formKey: page.value?.formKey || '', pageKey: pageKey.value },
        actions: {
          refresh: () => loadData(currentPage.value - 1),
          openDetail: () => openDetail(currentRow.value),
          openCreate: () => openCreate(),
          openEdit: () => openEdit(),
          remove: (id: string) => bizDataApi.remove(page.value?.formKey || '', id),
        },
        $: { message: (msg: string, type = 'info') => ElMessage({ message: msg, type: type as any }) },
      })
      break
    }
    default:
      console.warn('[page] 未知动作类型:', action.type)
  }
}

/** 按触发器执行事件链 */
function triggerEvents(trigger: string, ctx: { row: any; params: Record<string, any> }) {
  for (const ev of eventsList.value) {
    if (ev.trigger !== trigger) continue
    for (const action of ev.actions || []) {
      dispatchAction(action, ctx)
    }
  }
}

// ========== 行点击 ==========
function handleRowClick(row: any) {
  currentRow.value = row
  triggerEvents('row-click', { row, params: route.query || {} })
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
.pagination-bar {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>