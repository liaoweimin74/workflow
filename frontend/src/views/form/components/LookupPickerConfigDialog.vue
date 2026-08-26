<template>
  <el-dialog v-model="visible" title="数据源配置" width="720px" :close-on-click-modal="false">
    <el-form label-width="110px" size="default">
      <!-- 页面内数据源 -->
      <el-form-item label="页面内数据源" required>
        <el-select
          v-model="form.dataSourceId"
          placeholder="选择页面数据源绑定"
          style="width: 100%"
          @change="handleDataSourceChange"
        >
          <el-option
            v-for="ds in formDataSources"
            :key="ds.id"
            :label="ds.id"
            :value="ds.id"
          />
        </el-select>
        <span class="form-tip">数据源在「数据源配置」中绑定；切换后自动加载列定义</span>
      </el-form-item>

      <!-- 显示与回填 -->
      <el-divider content-position="left">显示与回填</el-divider>
      <el-form-item label="显示字段" required>
        <el-select v-model="form.displayField" placeholder="选择显示字段（输入框回显）" style="width: 100%" @change="handleDisplayChange">
          <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="列表显示列">
        <el-select v-model="form.selectedColumns" multiple placeholder="弹窗表格列（默认显示字段）" style="width: 100%">
          <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="搜索列">
        <el-select v-model="form.searchColumns" multiple placeholder="选择参与关键字搜索的列（默认显示字段）" style="width: 100%">
          <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
        </el-select>
        <span class="form-tip">支持多列全文搜索，弹窗搜索框按所选列模糊匹配</span>
      </el-form-item>
      <el-form-item label="id 存储字段">
        <el-select v-model="form.idField" placeholder="选择当前表单字段存储选中记录 id" clearable style="width: 100%">
          <el-option v-for="f in currentFields" :key="f" :label="f" :value="f" />
        </el-select>
        <span class="form-tip">选中记录的 id 将写入该字段（建议设为隐藏），用于索引与追踪</span>
      </el-form-item>
      <el-form-item label="返回字段映射">
        <div style="width: 100%">
          <div v-for="(row, i) in form.returnFieldsRows" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px">
            <el-select v-model="row.source" placeholder="数据源字段" style="width: 40%">
              <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
            </el-select>
            <el-select v-model="row.target" placeholder="回填到当前表单字段" style="width: 40%">
              <el-option v-for="f in currentFields" :key="f" :label="f" :value="f" />
            </el-select>
            <el-button type="danger" link @click="form.returnFieldsRows.splice(i, 1)">删除</el-button>
          </div>
          <el-button type="primary" link @click="form.returnFieldsRows.push({ source: '', target: '' })">+ 添加映射</el-button>
          <span class="form-tip">选中记录后把数据源字段值回填到当前表单字段</span>
        </div>
      </el-form-item>

      <!-- 组件级数据筛选 -->
      <el-divider content-position="left">组件级数据筛选</el-divider>
      <el-form-item label="筛选条件">
        <div style="width: 100%">
          <el-radio-group v-model="form.filterLogic" size="small">
            <el-radio-button value="AND">所有（且）</el-radio-button>
            <el-radio-button value="OR">任一（或）</el-radio-button>
          </el-radio-group>
          <div v-for="(row, i) in form.filterRows" :key="i" style="display: flex; gap: 8px; margin-top: 8px">
            <el-select v-model="row.column" placeholder="目标列" style="width: 30%">
              <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
            </el-select>
            <el-select v-model="row.op" style="width: 22%">
              <el-option label="等于" value="eq" />
              <el-option label="不等于" value="ne" />
              <el-option label="包含" value="like" />
              <el-option label="属于" value="in" />
              <el-option label="为空" value="isEmpty" />
              <el-option label="不为空" value="isNotEmpty" />
            </el-select>
            <el-select v-model="row.source" style="width: 22%">
              <el-option label="固定值" value="fixed" />
              <el-option label="表单字段" value="field" />
            </el-select>
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
          <span class="form-tip">与数据源级筛选（数据源配置中设置）以「且」合并；动态条件依赖表单字段，变化时自动刷新选项</span>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ColumnConfigItem } from '@/api/bizData'
import { dataSourceApi } from '@/api/data-source'

const props = defineProps<{
  modelValue: boolean
  /** 当前表单字段 key 列表（回填映射的目标字段） */
  currentFields: string[]
  /** 正在编辑的 LookupPicker 字段 props */
  lookupProps?: Record<string, any>
  /** 页面内数据源绑定配置 */
  formDataSources: Array<{ id: string; refId: string }>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', props: Record<string, any>): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/** 当前选中绑定的列定义（来自数据源 metadata） */
const dsColumns = ref<ColumnConfigItem[]>([])

/** 可引用列：排除隐藏列 */
const visibleColumns = computed(() => dsColumns.value.filter(c => !c.hidden))

const form = reactive({
  dataSourceId: '',
  displayField: '',
  selectedColumns: [] as string[],
  searchColumns: [] as string[],
  idField: '',
  returnFieldsRows: [] as { source: string; target: string }[],
  filterLogic: 'AND' as 'AND' | 'OR',
  filterRows: [] as { column: string; op: string; source: 'fixed' | 'field'; fixedValue: string; field: string }[],
})

/** 按绑定 refId 加载数据源列定义 */
async function loadDsColumns() {
  dsColumns.value = []
  const binding = props.formDataSources.find(d => d.id === form.dataSourceId)
  if (!binding?.refId) return
  try {
    const res = await dataSourceApi.getMetadata(binding.refId)
    dsColumns.value = res.data?.columns || []
  } catch {
    // http 拦截器已提示
  }
}

/** 切换数据源：清空依赖列配置并重新加载列候选 */
function handleDataSourceChange() {
  form.displayField = ''
  form.selectedColumns = []
  form.searchColumns = []
  form.filterRows.forEach(r => { r.column = '' })
  void loadDsColumns()
}

/** 切换显示字段：默认选中列跟随 */
function handleDisplayChange() {
  if (form.selectedColumns.length === 0 && form.displayField) {
    form.selectedColumns = [form.displayField]
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    const p = props.lookupProps || {}
    form.dataSourceId = p.dataSourceId || ''
    form.displayField = p.displayField || ''
    form.selectedColumns = (p.columns || []).map((c: any) => c.prop || c.key || '').filter(Boolean)
    form.searchColumns = [...(p.searchColumns || [])]
    form.idField = p.idField || ''
    form.returnFieldsRows = Object.entries(p.returnFields || {}).map(([s, t]) => ({ source: s, target: String(t) }))
    const pFilter = p.filter || {}
    form.filterLogic = pFilter.logic === 'OR' ? 'OR' : 'AND'
    form.filterRows = (pFilter.conditions || []).map((c: any) => ({
      column: c.column || '',
      op: c.op || 'eq',
      source: c.field ? 'field' : 'fixed',
      fixedValue: c.field ? '' : (c.value === undefined ? '' : String(c.value)),
      field: c.field || '',
    }))
    if (form.dataSourceId) {
      void loadDsColumns()
    }
  },
)

function handleConfirm() {
  if (!form.dataSourceId) {
    ElMessage.warning('请选择页面内数据源')
    return
  }
  if (!form.displayField) {
    ElMessage.warning('请选择显示字段')
    return
  }

  const columnLabel = (key: string): string => {
    const col = dsColumns.value.find(c => c.key === key)
    return col?.label || key
  }
  const columns = (form.selectedColumns.length > 0 ? form.selectedColumns : [form.displayField])
    .map(key => ({ prop: key, label: columnLabel(key) }))

  const returnFields: Record<string, string> = {}
  for (const row of form.returnFieldsRows) {
    if (row.source && row.target) returnFields[row.source] = row.target
  }

  const newProps: Record<string, any> = {
    dataSourceId: form.dataSourceId,
    displayField: form.displayField,
    columns,
    searchColumns: form.searchColumns.length > 0 ? form.searchColumns : [form.displayField],
    returnFields,
  }
  if (form.idField) newProps.idField = form.idField

  const validFilterRows = form.filterRows.filter(r => r.column)
  if (validFilterRows.length > 0) {
    newProps.filter = {
      logic: form.filterLogic,
      conditions: validFilterRows.map(r => {
        const cond: Record<string, unknown> = { column: r.column, op: r.op }
        const isNullOp = r.op === 'isEmpty' || r.op === 'isNotEmpty'
        if (!isNullOp) {
          if (r.source === 'field' && r.field) cond.field = r.field
          else cond.value = r.op === 'in'
            ? (r.fixedValue || '').split(',').map(s => s.trim()).filter(Boolean)
            : r.fixedValue
        }
        return cond
      }),
    }
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
</style>
