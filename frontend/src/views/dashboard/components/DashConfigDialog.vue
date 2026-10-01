<template>
  <el-dialog
    :model-value="modelValue"
    :title="mode === 'kpi' ? 'KPI 指标卡配置' : '统计图配置'"
    width="560px"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-alert
      v-if="formDataSources.length === 0"
      type="warning"
      :closable="false"
      show-icon
      title="页面尚未绑定数据源：请先通过工具栏「数据源配置」添加页面级数据源，再配置本组件"
      style="margin-bottom: 12px"
    />
    <el-form label-width="92px" @submit.prevent>
      <el-form-item label="数据源">
        <el-select v-model="form.dataSourceId" placeholder="选择页面级数据源" style="width: 100%">
          <el-option
            v-for="ds in formDataSources"
            :key="ds.id"
            :value="ds.id"
            :label="dsLabel(ds)"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="标题">
        <el-input v-model="form.title" placeholder="如：本月请假总天数" maxlength="30" />
      </el-form-item>

      <template v-if="mode === 'chart'">
        <el-form-item label="图表类型">
          <el-radio-group v-model="form.chartType">
            <el-radio-button value="bar">柱状图</el-radio-button>
            <el-radio-button value="line">折线图</el-radio-button>
            <el-radio-button value="pie">饼环图</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="分组维度">
          <el-select v-model="form.group" placeholder="选择字段" style="width: 100%" filterable>
            <el-option v-for="c in groupableColumns" :key="c.key" :value="c.key" :label="`${c.label || c.key} (${c.key})`" />
          </el-select>
          <div class="field-hint">按该字段的值分组统计</div>
        </el-form-item>
        <el-form-item v-if="isDateGroup" label="时间粒度">
          <el-radio-group v-model="form.timeGrain">
            <el-radio value="">不分桶</el-radio>
            <el-radio value="day">按日</el-radio>
            <el-radio value="week">按周</el-radio>
            <el-radio value="month">按月</el-radio>
          </el-radio-group>
        </el-form-item>
      </template>

      <el-form-item label="聚合方式">
        <el-radio-group v-model="form.agg">
          <el-radio value="count">计数</el-radio>
          <el-radio value="sum">求和</el-radio>
          <el-radio value="avg">平均</el-radio>
          <el-radio value="max">最大</el-radio>
          <el-radio value="min">最小</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="form.agg !== 'count'" label="聚合字段">
        <el-select v-model="form.metric" placeholder="选择数值字段" style="width: 100%" filterable>
          <el-option v-for="c in columns" :key="c.key" :value="c.key" :label="`${c.label || c.key} (${c.key})`" />
        </el-select>
      </el-form-item>

      <template v-if="mode === 'chart'">
        <el-form-item label="排序">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-select v-model="form.sort" style="flex: 1">
              <el-option value="key" label="按维度" />
              <el-option value="value" label="按数值" />
            </el-select>
            <el-select v-model="form.order" style="flex: 1">
              <el-option value="asc" label="升序" />
              <el-option value="desc" label="降序" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="条数上限">
          <el-input-number v-model="form.limit" :min="0" :max="100" :step="5" style="width: 100%" />
          <div class="field-hint">0 = 不限制；常用 5/10 显示 Top N</div>
        </el-form-item>
      </template>

      <template v-if="mode === 'kpi'">
        <el-form-item label="单位">
          <el-input v-model="form.unit" placeholder="如：天 / 人 / 单" maxlength="8" style="width: 160px" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="form.subtitle" placeholder="如：含子流程" maxlength="30" />
        </el-form-item>
        <el-form-item label="数字格式">
          <el-radio-group v-model="form.numberFormat">
            <el-radio value="">原样</el-radio>
            <el-radio value="thousand">千分位</el-radio>
          </el-radio-group>
        </el-form-item>
      </template>

      <template v-else>
        <el-form-item label="绘图高度">
          <el-select v-model="form.height" style="width: 160px">
            <el-option value="200px" label="矮 (200px)" />
            <el-option value="260px" label="标准 (260px)" />
            <el-option value="320px" label="高 (320px)" />
            <el-option value="420px" label="超高 (420px)" />
          </el-select>
        </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!canConfirm" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 仪表盘组件配置弹窗（Task 119）：KPI 指标卡 / 统计图共用。
 *
 * 数据源选择范围 = 页面级绑定（schema.dataSources），与 page-table 的
 * DsBindingConfigDialog 同一模型：组件只引用页内逻辑 id，refId 由渲染层解析。
 * 字段列表来自数据源 metadata（getMetadata），维度下拉只给非 JSON 列。
 */
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'

export interface DashConfigResult {
  dataSourceId: string
  title: string
  agg: string
  metric: string | null
  /** chart only */
  chartType?: string
  group?: string
  timeGrain?: string | null
  sort?: string
  order?: string
  limit?: number
  height?: string
  /** kpi only */
  unit?: string
  subtitle?: string
  numberFormat?: string
}

const props = defineProps<{
  modelValue: boolean
  mode: 'kpi' | 'chart'
  bindingProps: Record<string, any>
  formDataSources: Array<{ id: string; refId: string; name?: string }>
  enabledDataSources: DataSourceDTO[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', result: DashConfigResult): void
}>()

const columns = ref<Array<{ key: string; label: string | null; columnType: string | null }>>([])
const loadingMeta = ref(false)

const form = reactive({
  dataSourceId: '',
  title: '',
  agg: 'count',
  metric: null as string | null,
  chartType: 'bar',
  group: '',
  timeGrain: '' as string,
  sort: 'key',
  order: 'asc',
  limit: 0,
  height: '260px',
  unit: '',
  subtitle: '',
  numberFormat: '',
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const p = props.bindingProps || {}
    form.dataSourceId = p.dataSourceId || ''
    form.title = p.title || ''
    form.agg = p.agg || 'count'
    form.metric = p.metric || null
    form.chartType = p.chartType || 'bar'
    form.group = p.group || ''
    form.timeGrain = p.timeGrain || ''
    form.sort = p.sort || 'key'
    form.order = p.order || 'asc'
    form.limit = Number(p.limit || 0)
    form.height = p.height || '260px'
    form.unit = p.unit || ''
    form.subtitle = p.subtitle || ''
    form.numberFormat = p.numberFormat || ''
    void loadColumns()
  },
)

watch(() => form.dataSourceId, () => void loadColumns())

watch(
  () => form.agg,
  (agg) => {
    if (agg === 'count') form.metric = null
  },
)

function dsLabel(ds: { id: string; refId: string; name?: string }): string {
  if (ds.name) return ds.name
  const global = props.enabledDataSources.find((d) => d.id === ds.refId)
  return global ? global.name : ds.refId
}

const isDateGroup = computed(() => {
  const col = columns.value.find((c) => c.key === form.group)
  if (!col) return false
  return ['DATE', 'DATETIME', 'TIMESTAMP'].includes(String(col.columnType || '').toUpperCase())
})

/** 维度列：JSON 类型不进维度下拉（聚合语义不符，后端也拒绝） */
const groupableColumns = computed(() =>
  columns.value.filter((c) => String(c.columnType || '').toUpperCase() !== 'JSON'),
)

const canConfirm = computed(() => {
  if (!form.dataSourceId) return false
  if (props.mode === 'chart' && !form.group) return false
  if (form.agg !== 'count' && !form.metric) return false
  return true
})

async function loadColumns(): Promise<void> {
  columns.value = []
  const binding = props.formDataSources.find((d) => d.id === form.dataSourceId)
  if (!binding) return
  loadingMeta.value = true
  try {
    const res = await dataSourceApi.getMetadata(binding.refId)
    columns.value = (res.data?.columns || []).map((c: any) => ({
      key: String(c.key),
      label: c.label ?? null,
      columnType: c.columnType ?? null,
    }))
  } catch (e: any) {
    ElMessage.warning(e?.message || '获取数据源列失败')
  } finally {
    loadingMeta.value = false
  }
}

function confirm(): void {
  if (props.mode === 'chart') {
    emit('confirm', {
      dataSourceId: form.dataSourceId,
      title: form.title,
      agg: form.agg,
      metric: form.metric,
      chartType: form.chartType,
      group: form.group,
      timeGrain: form.timeGrain === '' ? null : form.timeGrain,
      sort: form.sort,
      order: form.order,
      limit: form.limit,
      height: form.height,
    })
  } else {
    emit('confirm', {
      dataSourceId: form.dataSourceId,
      title: form.title,
      agg: form.agg,
      metric: form.metric,
      unit: form.unit,
      subtitle: form.subtitle,
      numberFormat: form.numberFormat,
    })
  }
  emit('update:modelValue', false)
  ElMessage.success('组件配置已保存（保存页面后生效）')
}
</script>

<style scoped>
.field-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder, #c0c4cc);
  line-height: 1.4;
  width: 100%;
}
</style>
