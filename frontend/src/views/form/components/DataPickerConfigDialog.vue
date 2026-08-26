<template>
  <el-dialog v-model="visible" title="数据引用配置" width="640px" :close-on-click-modal="false">
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

      <el-form-item label="显示字段" required>
        <el-select v-model="form.displayField" placeholder="选择显示字段（输入框回显）" style="width: 100%">
          <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
        </el-select>
      </el-form-item>

      <el-form-item label="列表显示列">
        <el-select v-model="form.columns" multiple placeholder="弹窗表格列（默认显示字段）" style="width: 100%">
          <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
        </el-select>
      </el-form-item>

      <el-form-item label="搜索列">
        <el-select v-model="form.searchColumns" multiple placeholder="选择参与关键字搜索的列（默认显示字段）" style="width: 100%">
          <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
        </el-select>
        <span class="form-tip">支持多列全文搜索，弹窗搜索框按所选列模糊匹配（多列以 / 分隔提示）</span>
      </el-form-item>

      <el-form-item label="最多可选数">
        <el-input-number v-model="form.maxCount" :min="1" :max="100" placeholder="不限" style="width: 160px" />
        <span class="form-tip">缺省不限；填 1 为单选（点行即选），>1 限制勾选数量</span>
      </el-form-item>

      <!-- 组件级数据筛选 -->
      <el-divider content-position="left">组件级数据筛选</el-divider>
      <el-form-item label="筛选条件">
        <div style="width: 100%">
          <el-radio-group v-model="form.filterLogic" size="small">
            <el-radio-button value="AND">所有（且）</el-radio-button>
            <el-radio-button value="OR">任一（或）</el-radio-button>
          </el-radio-group>
          <div
            v-for="(row, i) in form.filterRows"
            :key="i"
            style="display: flex; gap: 8px; margin-top: 8px; align-items: center"
          >
            <el-select v-model="row.column" placeholder="目标表列" style="width: 24%">
              <el-option v-for="c in visibleColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
            </el-select>
            <el-select v-model="row.op" style="width: 20%">
              <el-option label="等于" value="eq" />
              <el-option label="不等于" value="ne" />
              <el-option label="包含" value="like" />
              <el-option label="属于" value="in" />
              <el-option label="为空" value="isEmpty" />
              <el-option label="不为空" value="isNotEmpty" />
            </el-select>
            <el-select v-model="row.source" style="width: 18%">
              <el-option label="固定值" value="fixed" />
              <el-option label="表单字段" value="field" />
            </el-select>
            <el-select
              v-if="row.source === 'field'"
              v-model="row.field"
              placeholder="当前表单字段"
              clearable
              style="width: 26%"
            >
              <el-option v-for="f in currentFields" :key="f" :label="f" :value="f" />
            </el-select>
            <el-input
              v-else
              v-model="row.fixedValue"
              :placeholder="row.op === 'in' ? '多个值逗号分隔' : '固定值'"
              style="width: 26%"
            />
            <el-button type="danger" link @click="form.filterRows.splice(i, 1)">删除</el-button>
          </div>
          <el-button type="primary" link style="margin-top: 8px" @click="addFilterRow">+ 添加筛选条件</el-button>
          <span class="form-tip">与数据源级筛选（数据源配置中设置）以「且」合并；动态条件依赖表单字段，值变化时自动刷新选项</span>
        </div>
      </el-form-item>

      <el-form-item label="行为设置">
        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%">
          <el-switch v-model="form.clearOnCascadeChange" active-text="级联变化时清空已选值" />
          <el-switch v-model="form.allowCreate" active-text="允许新增目标记录" />
          <el-switch v-model="form.detailReadonly" active-text="详情弹窗表单只读" />
          <span class="form-tip">点击已选 Tag 弹出目标表单详情；"详情弹窗表单只读"关闭后详情表单可编辑并支持保存修改</span>
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

/** 筛选条件行（对齐 LookupPicker：op + 固定值/表单字段 来源） */
interface FilterRow {
  column: string
  op: string
  source: 'fixed' | 'field'
  fixedValue: string
  field: string
}

const props = defineProps<{
  modelValue: boolean
  /** 当前表单字段 key 列表 */
  currentFields: string[]
  /** 正在编辑的 dataPicker 字段 props */
  pickerProps?: Record<string, any>
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
  columns: [] as string[],
  searchColumns: [] as string[],
  maxCount: undefined as number | undefined,
  filterLogic: 'AND' as 'AND' | 'OR',
  filterRows: [] as FilterRow[],
  clearOnCascadeChange: false,
  allowCreate: false,
  detailReadonly: true,
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
  form.columns = []
  form.searchColumns = []
  form.filterRows.forEach(r => { r.column = '' })
  void loadDsColumns()
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    // 从 pickerProps 回填表单
    form.dataSourceId = props.pickerProps?.dataSourceId || ''
    form.displayField = props.pickerProps?.displayField || ''
    form.columns = [...(props.pickerProps?.columns || [])]
    form.searchColumns = [...(props.pickerProps?.searchColumns || [])]
    form.maxCount = props.pickerProps?.maxCount
    // 筛选条件：filters（v3 结构化 {logic, conditions}）优先；v2 数组兼容；dependOn（v1）兼容为单条 field 型
    const filters = props.pickerProps?.filters
    if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
      form.filterLogic = filters.logic === 'OR' ? 'OR' : 'AND'
      form.filterRows = (filters.conditions || []).map((c: any) => ({
        column: c.column || '',
        op: c.op || 'eq',
        source: c.field ? 'field' : 'fixed',
        fixedValue: c.field ? '' : (c.value === undefined || c.value === null ? '' : String(c.value)),
        field: c.field || '',
      }))
    } else if (Array.isArray(filters) && filters.length > 0) {
      form.filterLogic = 'AND'
      form.filterRows = filters.map((f: any) => ({
        column: f.column || '',
        op: f.operator === '<>' ? 'ne' : (f.operator || '='),
        source: f.valueType === 'field' ? 'field' : 'fixed',
        fixedValue: f.valueType === 'field' ? '' : String(f.value ?? ''),
        field: f.valueType === 'field' ? String(f.value ?? '') : '',
      }))
    } else {
      const dep = props.pickerProps?.dependOn
      form.filterRows = dep?.field && dep?.sourceColumn
        ? [{ column: dep.sourceColumn, op: 'eq', source: 'field', fixedValue: '', field: dep.field }]
        : []
      form.filterLogic = 'AND'
    }
    form.clearOnCascadeChange = props.pickerProps?.clearOnCascadeChange || false
    form.allowCreate = props.pickerProps?.allowCreate || false
    form.detailReadonly = props.pickerProps?.detailReadonly !== false
    if (form.dataSourceId) {
      void loadDsColumns()
    }
  },
  { immediate: true },
)

function addFilterRow() {
  form.filterRows.push({ column: '', op: 'eq', source: 'fixed', fixedValue: '', field: '' })
}

function handleConfirm() {
  if (!form.dataSourceId) {
    ElMessage.warning('请选择页面内数据源')
    return
  }
  if (!form.displayField) {
    ElMessage.warning('请选择显示字段')
    return
  }
  // 筛选条件：结构化 { logic, conditions }；isEmpty/isNotEmpty 无 value；in 逗号转数组；field 型产出 field
  const validRows = form.filterRows.filter(r => r.column)
  let filters: Record<string, unknown> | undefined
  if (validRows.length > 0) {
    filters = {
      logic: form.filterLogic,
      conditions: validRows.map(r => {
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
  const newProps: Record<string, any> = {
    dataSourceId: form.dataSourceId,
    displayField: form.displayField,
    columns: form.columns,
    searchColumns: form.searchColumns,
    // maxCount：缺省不限；1 = 单选语义
    ...(form.maxCount ? { maxCount: form.maxCount } : {}),
    filters,
    clearOnCascadeChange: form.clearOnCascadeChange,
    allowCreate: form.allowCreate,
    detailReadonly: form.detailReadonly,
  }
  emit('confirm', newProps)
  visible.value = false
}

defineExpose({ form })
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  display: block;
}
</style>
