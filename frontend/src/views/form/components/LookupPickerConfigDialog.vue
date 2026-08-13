<template>
  <el-dialog v-model="visible" title="数据源配置" width="720px" :close-on-click-modal="false">
    <div style="display: flex; flex-direction: column; gap: 4px">
      <!-- 数据源类型 -->
      <el-form label-width="110px" size="default">
        <el-form-item label="数据源类型">
          <el-radio-group v-model="form.sourceType">
            <el-radio value="form">底表（业务表单）</el-radio>
            <el-radio value="api">外部 API</el-radio>
          </el-radio-group>
          <span class="form-tip">底表：引用已发布业务表单的数据；外部 API：任意后端接口</span>
        </el-form-item>
      </el-form>

      <!-- 底表模式 -->
      <template v-if="form.sourceType === 'form'">
        <el-divider content-position="left">数据源</el-divider>
        <el-form label-width="110px" size="default">
          <el-form-item label="目标表单" required>
            <el-select v-model="form.sourceFormKey" placeholder="选择已发布的业务表单" filterable style="width: 100%" @change="handleSourceChange">
              <el-option v-for="f in targetForms" :key="f.key" :label="f.name" :value="f.key" />
            </el-select>
          </el-form-item>
          <el-form-item label="显示字段" required>
            <el-select v-model="form.displayField" placeholder="选择目标表显示字段（搜索栏按此列模糊匹配）" style="width: 100%">
              <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
            </el-select>
          </el-form-item>
          <el-form-item label="列表显示列">
            <el-select v-model="form.selectedColumns" multiple placeholder="弹窗表格列（默认显示字段）" style="width: 100%">
              <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
            </el-select>
            <span class="form-tip">表头标题自动取底表列 label，可在下方核对</span>
          </el-form-item>
        </el-form>
      </template>

      <!-- 外部 API 模式 -->
      <template v-else>
        <el-divider content-position="left">数据源</el-divider>
        <el-form label-width="110px" size="default">
          <el-form-item label="API 路径" required>
            <el-input v-model="form.action" placeholder="/v1/biz-data/xxx" />
            <span class="form-tip">相对于 /api 的请求路径</span>
          </el-form-item>
          <el-form-item label="请求方法">
            <el-radio-group v-model="form.method">
              <el-radio-button value="GET">GET</el-radio-button>
              <el-radio-button value="POST">POST</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="列表解析">
            <el-input v-model="form.parse" placeholder="records" />
            <span class="form-tip">从响应 data 提取数组的表达式（如 records / content / list），缺省依次尝试 rows、records</span>
          </el-form-item>
          <el-form-item label="总数解析">
            <el-input v-model="form.totalParse" placeholder="留空自动取 data.total" />
            <span class="form-tip">总数表达式（点分路径），留空时优先取 data.total</span>
          </el-form-item>
          <el-form-item label="搜索参数名">
            <el-input v-model="form.searchParam" placeholder="keyword" />
            <span class="form-tip">搜索栏关键字映射的请求参数名，默认 keyword（如 API 用 name/kw 搜索则填对应名）</span>
          </el-form-item>
          <el-form-item label="搜索列名">
            <el-input v-model="form.keywordColumn" placeholder="选填，如 name" />
            <span class="form-tip">底表类 API 的按列搜索参数（keywordColumn=显示列），外部简单 API 可留空</span>
          </el-form-item>
          <el-form-item label="固定参数">
            <div class="key-value-list">
              <div v-for="(item, idx) in form.dataRows" :key="idx" class="key-value-row">
                <el-input v-model="item.key" placeholder="参数名" style="width: 40%" />
                <el-input v-model="item.value" placeholder="参数值" style="width: 45%" />
                <el-button :icon="Delete" circle size="small" @click="form.dataRows.splice(idx, 1)" />
              </div>
              <el-button size="small" :icon="Plus" @click="form.dataRows.push({ key: '', value: '' })">添加参数</el-button>
            </div>
          </el-form-item>
          <el-form-item label="请求头">
            <div class="key-value-list">
              <div v-for="(item, idx) in form.headerRows" :key="idx" class="key-value-row">
                <el-input v-model="item.key" placeholder="Header名" style="width: 40%" />
                <el-input v-model="item.value" placeholder="Header值" style="width: 45%" />
                <el-button :icon="Delete" circle size="small" @click="form.headerRows.splice(idx, 1)" />
              </div>
              <el-button size="small" :icon="Plus" @click="form.headerRows.push({ key: '', value: '' })">添加 Header</el-button>
            </div>
          </el-form-item>
        </el-form>
      </template>

      <!-- 展示与回填 -->
      <el-divider content-position="left">展示与回填</el-divider>
      <el-form label-width="110px" size="default">
        <el-form-item label="选择模式">
          <el-radio-group v-model="form.mode">
            <el-radio value="single">单选</el-radio>
            <el-radio value="multiple">多选</el-radio>
          </el-radio-group>
          <span class="form-tip">多选结果以快照数组存储，落子表后按行展示</span>
        </el-form-item>
        <el-form-item v-if="form.mode === 'single'" label="id 存储字段">
          <el-select v-model="form.idField" placeholder="选择当前表单字段存储选中记录 id" clearable style="width: 100%">
            <el-option v-for="f in currentFields" :key="f" :label="f" :value="f" />
          </el-select>
          <span class="form-tip">选中记录的 id 将写入该字段（建议设为隐藏），用于索引与追踪</span>
        </el-form-item>
        <el-form-item v-if="form.sourceType === 'api'" label="显示字段">
          <el-input v-model="form.displayField" placeholder="如 name，输入框回显的字段名" />
        </el-form-item>
        <el-form-item label="列表显示列">
          <div v-if="form.sourceType === 'form'" class="column-preview">
            <el-tag v-for="key in form.selectedColumns" :key="key" size="small" closable @close="removeSelectedColumn(key)">
              {{ columnLabel(key) }}
            </el-tag>
            <el-empty v-if="form.selectedColumns.length === 0" :image-size="40" description="选择上方列表列" />
          </div>
          <div v-else style="width: 100%">
            <div v-for="(col, i) in form.columnRows" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px">
              <el-input v-model="col.prop" placeholder="字段名" style="width: 45%" />
              <el-input v-model="col.label" placeholder="列标题" style="width: 40%" />
              <el-button type="danger" link @click="form.columnRows.splice(i, 1)">删除</el-button>
            </div>
            <el-button type="primary" link @click="form.columnRows.push({ prop: '', label: '' })">+ 添加列</el-button>
            <span class="form-tip">弹窗表格展示的列（prop 对应响应字段，label 为表头标题）</span>
          </div>
        </el-form-item>
        <el-form-item label="返回字段映射">
          <div style="width: 100%">
            <div v-for="(row, i) in form.returnFieldsRows" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px">
              <el-select v-if="form.sourceType === 'form'" v-model="row.source" placeholder="目标表字段" style="width: 40%">
                <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
              </el-select>
              <el-input v-else v-model="row.source" placeholder="源字段" style="width: 40%" />
              <el-select v-model="row.target" placeholder="回填到当前表单字段" style="width: 40%">
                <el-option v-for="f in currentFields" :key="f" :label="f" :value="f" />
              </el-select>
              <el-button type="danger" link @click="form.returnFieldsRows.splice(i, 1)">删除</el-button>
            </div>
            <el-button type="primary" link @click="form.returnFieldsRows.push({ source: '', target: '' })">+ 添加映射</el-button>
            <span class="form-tip">选中记录后把源字段值回填到当前表单字段</span>
          </div>
        </el-form-item>
        <el-form-item label="数据筛选">
          <div style="width: 100%">
            <el-radio-group v-model="form.filterLogic" size="small">
              <el-radio-button value="AND">所有（且）</el-radio-button>
              <el-radio-button value="OR">任一（或）</el-radio-button>
            </el-radio-group>
            <div v-for="(row, i) in form.filterRows" :key="i" style="display: flex; gap: 8px; margin-top: 8px">
              <el-select v-if="form.sourceType === 'form'" v-model="row.column" placeholder="目标列" style="width: 30%">
                <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
              </el-select>
              <el-input v-else v-model="row.column" placeholder="目标列" style="width: 30%" />
              <el-select v-model="row.op" style="width: 22%">
                <el-option label="等于" value="eq" />
                <el-option label="不等于" value="ne" />
                <el-option label="包含" value="like" />
                <el-option label="属于" value="in" />
                <el-option label="为空" value="isEmpty" />
                <el-option label="不为空" value="isNotEmpty" />
              </el-select>
              <el-radio-group v-model="row.source" size="small">
                <el-radio-button value="fixed">固定值</el-radio-button>
                <el-radio-button value="field">表单字段</el-radio-button>
              </el-radio-group>
              <el-select v-if="row.source === 'field'" v-model="row.field" placeholder="当前表单字段" style="width: 30%">
                <el-option v-for="f in currentFields" :key="f" :label="f" :value="f" />
              </el-select>
              <el-input v-else v-model="row.fixedValue" placeholder="固定值" style="width: 30%" />
              <el-button type="danger" link @click="form.filterRows.splice(i, 1)">删除</el-button>
            </div>
            <el-button type="primary" link style="margin-top: 8px"
              @click="form.filterRows.push({ column: '', op: 'eq', source: 'fixed', fixedValue: '', field: '' })">
              + 添加筛选条件
            </el-button>
            <span class="form-tip">限定可查范围（如仅查已支付订单）；动态条件依赖表单字段，变化时自动刷新选项</span>
          </div>
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import type { LookupFetchConfig } from '@/components/business/types'
import type { FormDefinitionDTO } from '@/api/form'
import type { ColumnConfigItem } from '@/api/bizData'

interface KeyValueRow {
  key: string
  value: string
}

interface ColumnRow {
  prop: string
  label: string
}

const props = defineProps<{
  modelValue: boolean
  /** 当前表单字段 key 列表（回填映射的目标字段） */
  currentFields: string[]
  /** 正在编辑的 LookupPicker 字段 props */
  lookupProps?: Record<string, any>
  /** 已发布业务表单列表（底表模式目标表单） */
  targetForms: FormDefinitionDTO[]
  /** 目标表单列（父组件根据 sourceFormKey 加载后传入） */
  targetColumns: ColumnConfigItem[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', props: Record<string, any>): void
  (e: 'sourceChange', formKey: string): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/** 回填时保留的旧 label 映射（key → label），targetColumns 未加载时兜底，避免列标题退化为字段标识 */
const legacyColumnLabels = ref<Record<string, string>>({})

/** 底表模式可引用列：排除隐藏列（_text 冗余列等） */
const visibleColumns = computed(() => props.targetColumns.filter(c => !c.hidden))

const form = reactive({
  sourceType: 'form',
  mode: 'single' as 'single' | 'multiple',
  idField: '',
  filterLogic: 'AND' as 'AND' | 'OR',
  filterRows: [] as { column: string; op: string; source: 'fixed' | 'field'; fixedValue: string; field: string }[],
  sourceFormKey: '',
  action: '',
  method: 'GET' as 'GET' | 'POST',
  parse: '',
  totalParse: '',
  searchParam: '',
  keywordColumn: '',
  dataRows: [] as KeyValueRow[],
  headerRows: [] as KeyValueRow[],
  displayField: '',
  selectedColumns: [] as string[],
  columnRows: [] as ColumnRow[],
  returnFieldsRows: [] as { source: string; target: string }[],
})

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    const p = props.lookupProps || {}
    const fetch: LookupFetchConfig = p.fetch || {}
    // 显式 sourceType 标记优先；兼容旧配置（无标记时按 sourceFormKey/action 前缀推断）
    const explicitType = p.sourceType
    const isFormSource = explicitType !== undefined
      ? explicitType === 'form'
      : !!(p.sourceFormKey || fetch.action?.startsWith('/v1/biz-data/'))
    form.sourceType = isFormSource ? 'form' : 'api'
    form.mode = p.mode === 'multiple' ? 'multiple' : 'single'
    form.idField = p.idField || ''
    form.sourceFormKey = isFormSource ? (p.sourceFormKey || fetch.action?.replace('/v1/biz-data/', '') || '') : ''
    form.action = fetch.action || ''
    form.method = fetch.method || 'GET'
    form.parse = fetch.parse || ''
    form.totalParse = fetch.totalParse || ''
    form.searchParam = fetch.searchParam || ''
    form.keywordColumn = fetch.keywordColumn || ''
    form.dataRows = Object.entries(fetch.data || {}).map(([key, value]) => ({ key, value: String(value) }))
    form.headerRows = Object.entries(fetch.headers || {}).map(([key, value]) => ({ key, value }))
    form.displayField = p.displayField || ''
    // 数据筛选还原
    const pFilter = p.filter || {}
    form.filterLogic = pFilter.logic === 'OR' ? 'OR' : 'AND'
    form.filterRows = (pFilter.conditions || []).map((c: any) => ({
      column: c.column || '',
      op: c.op || 'eq',
      source: c.field ? 'field' : 'fixed',
      fixedValue: c.field ? '' : (c.value === undefined ? '' : String(c.value)),
      field: c.field || '',
    }))
    // 底表模式列：按 key 存；外部 API：存 prop/label
    form.selectedColumns = (p.columns || []).map((c: any) => c.prop || c.key || '')
    form.columnRows = (p.columns || []).map((c: any) => ({ prop: c.prop || '', label: c.label || '' }))
    const returnFields = p.returnFields || {}
    form.returnFieldsRows = Object.entries(returnFields).map(([s, t]) => ({ source: s, target: String(t) }))
    // 记住旧列 label（key → label），供 targetColumns 未加载时兜底，避免列标题退化为字段标识
    const labels: Record<string, string> = {}
    for (const c of p.columns || []) {
      const key = c.prop || c.key || ''
      if (key && c.label) labels[key] = c.label
    }
    legacyColumnLabels.value = labels
  },
)

function handleSourceChange() {
  // 切换目标表单：重置显示字段与列
  form.displayField = ''
  form.selectedColumns = []
  form.keywordColumn = ''
  emit('sourceChange', form.sourceFormKey)
}

function columnLabel(key: string): string {
  const col = props.targetColumns.find(c => c.key === key)
  if (col?.label) return col.label
  // targetColumns 未加载/不含此列时，回退已记忆的旧 label，避免退化为字段标识
  return legacyColumnLabels.value[key] || key
}

function removeSelectedColumn(key: string) {
  form.selectedColumns = form.selectedColumns.filter(k => k !== key)
}

function handleConfirm() {
  if (form.sourceType === 'form') {
    if (!form.sourceFormKey) {
      ElMessage.warning('请选择目标表单')
      return
    }
    if (!form.displayField) {
      ElMessage.warning('请选择显示字段')
      return
    }
  } else if (!form.action.trim()) {
    ElMessage.warning('请填写 API 路径')
    return
  }

  // 底表模式：自动生成 fetch 配置（action/parse/total/searchParam/keywordColumn/pageBase=0 后端 0 起分页）
  // 外部 API：按表单字段生成
  const fetch: LookupFetchConfig = form.sourceType === 'form'
    ? {
        action: `/v1/biz-data/${form.sourceFormKey}`,
        method: 'GET',
        parse: 'records',
        totalParse: 'total',
        searchParam: 'keyword',
        keywordColumn: form.displayField,
        pageBase: 0,
      }
    : { action: form.action.trim(), method: form.method }
  if (form.sourceType === 'api') {
    if (form.parse.trim()) fetch.parse = form.parse.trim()
    if (form.totalParse.trim()) fetch.totalParse = form.totalParse.trim()
    if (form.searchParam.trim()) fetch.searchParam = form.searchParam.trim()
    if (form.keywordColumn.trim()) fetch.keywordColumn = form.keywordColumn.trim()
    const data: Record<string, unknown> = {}
    for (const row of form.dataRows) {
      if (row.key) data[row.key] = row.value
    }
    if (Object.keys(data).length > 0) fetch.data = data
    const headers: Record<string, string> = {}
    for (const row of form.headerRows) {
      if (row.key) headers[row.key] = row.value
    }
    if (Object.keys(headers).length > 0) fetch.headers = headers
  }

  // 列表列：底表模式按 key + label；外部 API 按 prop/label
  const columns = form.sourceType === 'form'
    ? form.selectedColumns.map(key => ({ prop: key, label: columnLabel(key) }))
    : form.columnRows.filter(c => c.prop).map(c => ({ prop: c.prop, label: c.label || c.prop }))

  const returnFields: Record<string, string> = {}
  for (const row of form.returnFieldsRows) {
    if (row.source && row.target) {
      returnFields[row.source] = row.target
    }
  }
  const newProps: Record<string, any> = {
    sourceType: form.sourceType,
    mode: form.mode,
    fetch,
    displayField: form.displayField.trim() || undefined,
    columns,
    returnFields,
  }
  if (form.mode === 'single' && form.idField) {
    newProps.idField = form.idField
  }
  // 数据筛选：有有效条件才产出 filter
  const validFilterRows = form.filterRows.filter(r => r.column)
  if (validFilterRows.length > 0) {
    newProps.filter = {
      logic: form.filterLogic,
      conditions: validFilterRows.map(r => {
        const cond: Record<string, unknown> = { column: r.column, op: r.op }
        const isNullOp = r.op === 'isEmpty' || r.op === 'isNotEmpty'
        if (!isNullOp) {
          if (r.source === 'field' && r.field) {
            cond.field = r.field
          } else {
            cond.value = r.op === 'in'
              ? (r.fixedValue || '').split(',').map(s => s.trim()).filter(Boolean)
              : r.fixedValue
          }
        }
        return cond
      }),
    }
  }
  if (form.sourceType === 'form') {
    newProps.sourceFormKey = form.sourceFormKey
  } else {
    // 清除历史底表模式残留，避免对象合并后回填误判
    newProps.sourceFormKey = undefined
  }
  emit('confirm', newProps)
  visible.value = false
}
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  display: block;
}

.key-value-list {
  width: 100%;
}

.key-value-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  width: 100%;
}

.column-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  width: 100%;
}
</style>