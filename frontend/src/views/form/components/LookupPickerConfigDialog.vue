<template>
  <el-dialog v-model="visible" title="数据源配置" width="680px" :close-on-click-modal="false">
    <div style="display: flex; flex-direction: column; gap: 4px">
      <!-- 数据源 -->
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

      <!-- 展示 -->
      <el-divider content-position="left">展示与回填</el-divider>
      <el-form label-width="110px" size="default">
        <el-form-item label="显示字段">
          <el-input v-model="form.displayField" placeholder="如 name，输入框回显的字段名" />
        </el-form-item>
        <el-form-item label="列表显示列">
          <div style="width: 100%">
            <div v-for="(col, i) in form.columnRows" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px">
              <el-input v-model="col.prop" placeholder="字段名" style="width: 45%" />
              <el-input v-model="col.label" placeholder="列标题" style="width: 40%" />
              <el-button type="danger" link @click="form.columnRows.splice(i, 1)">删除</el-button>
            </div>
            <el-button type="primary" link @click="form.columnRows.push({ prop: '', label: '' })">+ 添加列</el-button>
            <span class="form-tip">弹窗表格展示的列（prop 对应响应字段）</span>
          </div>
        </el-form-item>
        <el-form-item label="返回字段映射">
          <div style="width: 100%">
            <div v-for="(row, i) in form.returnFieldsRows" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px">
              <el-input v-model="row.source" placeholder="源字段" style="width: 40%" />
              <el-select v-model="row.target" placeholder="回填到当前表单字段" style="width: 45%">
                <el-option v-for="f in currentFields" :key="f" :label="f" :value="f" />
              </el-select>
              <el-button type="danger" link @click="form.returnFieldsRows.splice(i, 1)">删除</el-button>
            </div>
            <el-button type="primary" link @click="form.returnFieldsRows.push({ source: '', target: '' })">+ 添加映射</el-button>
            <span class="form-tip">选中记录后把源字段值回填到当前表单字段</span>
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
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', props: Record<string, any>): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive({
  action: '',
  method: 'GET',
  parse: '',
  totalParse: '',
  dataRows: [] as KeyValueRow[],
  headerRows: [] as KeyValueRow[],
  displayField: '',
  columnRows: [] as ColumnRow[],
  returnFieldsRows: [] as { source: string; target: string }[],
})

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    const p = props.lookupProps || {}
    const fetch: LookupFetchConfig = p.fetch || {}
    form.action = fetch.action || ''
    form.method = fetch.method || 'GET'
    form.parse = fetch.parse || ''
    form.totalParse = fetch.totalParse || ''
    form.dataRows = Object.entries(fetch.data || {}).map(([key, value]) => ({ key, value: String(value) }))
    form.headerRows = Object.entries(fetch.headers || {}).map(([key, value]) => ({ key, value }))
    form.displayField = p.displayField || ''
    form.columnRows = (p.columns || []).map((c: any) => ({ prop: c.prop || '', label: c.label || '' }))
    const returnFields = p.returnFields || {}
    form.returnFieldsRows = Object.entries(returnFields).map(([s, t]) => ({ source: s, target: String(t) }))
  },
)

function handleConfirm() {
  if (!form.action.trim()) {
    ElMessage.warning('请填写 API 路径')
    return
  }
  const fetch: LookupFetchConfig = {
    action: form.action.trim(),
    method: form.method,
  }
  if (form.parse.trim()) fetch.parse = form.parse.trim()
  if (form.totalParse.trim()) fetch.totalParse = form.totalParse.trim()
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

  const columns = form.columnRows.filter(c => c.prop).map(c => ({ prop: c.prop, label: c.label || c.prop }))
  const returnFields: Record<string, string> = {}
  for (const row of form.returnFieldsRows) {
    if (row.source && row.target) {
      returnFields[row.source] = row.target
    }
  }
  const newProps: Record<string, any> = {
    fetch,
    displayField: form.displayField.trim() || undefined,
    columns,
    returnFields,
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
</style>