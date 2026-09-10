<template>
  <el-dialog v-model="visible" title="数据引用配置" width="640px" :close-on-click-modal="false">
    <el-form label-width="110px" size="default">
      <!-- 页面内数据源（由 UniDataSourceBinding 统一管理） -->
      <UniDataSourceBinding
        :model-value="dsBindingValue"
        @update:model-value="syncBinding"
        :form-data-sources="formDataSources || []"
        :current-fields="currentFields"
        @columns="handleUnifiedColumns"
      />

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
import UniDataSourceBinding, { type UniDataSourceValue } from '@/views/form/components/UniDataSourceBinding.vue'

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
  formDataSources?: Array<{ id: string; refId: string }>
  /** 旧版表单设计器目标表单列表（兼容输入） */
  targetForms?: Array<{ key: string; name?: string }>
  /** 旧版目标表字段列表（兼容输入） */
  targetColumns?: ColumnConfigItem[]
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
const visibleColumns = computed(() => {
  const columns = dsColumns.value.length > 0 ? dsColumns.value : (props.targetColumns || [])
  return columns.filter(c => !c.hidden)
})

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

// ==================== UniDataSourceBinding 桥接 ====================
const dsBindingValue = ref<UniDataSourceValue>({ dataSourceId: '' })

function syncBinding(value: UniDataSourceValue) {
  dsBindingValue.value = value
  form.dataSourceId = value.dataSourceId ?? ''
  const filter = value.filter
  if (filter && Array.isArray(filter.conditions)) {
    form.filterLogic = filter.logic
    form.filterRows = filter.conditions.map((c: any) => ({
      column: String(c.column ?? ''), op: String(c.op ?? 'eq'),
      source: c.source === 'field' ? 'field' : 'fixed',
      fixedValue: String(c.value ?? c.fixedValue ?? ''), field: String(c.field ?? ''),
    }))
  } else {
    form.filterLogic = 'AND'
    form.filterRows = []
  }
}

function handleUnifiedColumns(cols: ColumnConfigItem[]) {
  dsColumns.value = cols
}

// DataPicker 独属副作用：监听数据源变更，清空字段配置并加载列
watch(
  () => dsBindingValue.value.dataSourceId,
  (newId, oldId) => {
    if (newId && oldId && newId !== oldId) {
      form.displayField = ''
      form.columns = []
      form.searchColumns = []
      form.filterRows.forEach(r => { r.column = '' })
      void loadDsColumns()
    }
  },
  { immediate: false },
)

/** 按绑定 refId 加载数据源列定义 */
async function loadDsColumns() {
  dsColumns.value = []
  const binding = (props.formDataSources || []).find(d => d.id === form.dataSourceId)
  if (!binding?.refId) return
  try {
    const res = await dataSourceApi.getMetadata(binding.refId)
    dsColumns.value = res.data?.columns || []
  } catch {
    // http 拦截器已提示
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    // 从 pickerProps 回填表单
    form.dataSourceId = props.pickerProps?.dataSourceId || props.pickerProps?.sourceFormKey || ''
    form.displayField = props.pickerProps?.displayField || ''
    form.columns = [...(props.pickerProps?.columns || [])]
    form.searchColumns = [...(props.pickerProps?.searchColumns || [])]
    form.maxCount = props.pickerProps?.maxCount ?? (props.pickerProps?.mode === 'single' ? 1 : undefined)
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
    if (form.dataSourceId && (props.formDataSources || []).length > 0) {
      void loadDsColumns()
    }
    // 初始化 dsBindingValue 供 UniDataSourceBinding 读取
    dsBindingValue.value = {
      dataSourceId: form.dataSourceId,
      ...(form.filterRows.length > 0 ? {
        filter: { logic: form.filterLogic, conditions: form.filterRows.map(r => ({
          column: r.column, op: r.op, source: r.source,
          ...(r.source === 'field' ? { field: r.field } : { value: r.fixedValue }),
        })) }
      } : {}),
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
    ...(props.targetForms ? { sourceFormKey: form.dataSourceId } : { dataSourceId: form.dataSourceId }),
    displayField: form.displayField,
    columns: form.columns,
    searchColumns: form.searchColumns,
    // maxCount：缺省不限；1 = 单选语义
    ...(form.maxCount ? { maxCount: form.maxCount } : {}),
    ...(props.targetForms ? {} : { filters }),
    ...(props.targetForms ? { filters } : {}),
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
