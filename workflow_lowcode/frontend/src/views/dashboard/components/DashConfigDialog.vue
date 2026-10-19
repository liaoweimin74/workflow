<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-alert
      v-if="formDataSources.length === 0 && needsDataSource"
      type="warning"
      :closable="false"
      show-icon
      title="页面尚未绑定数据源：请先通过工具栏「数据源配置」添加页面级数据源，再配置本组件"
      style="margin-bottom: 12px"
    />
    <el-form label-width="92px" @submit.prevent>
      <!-- 筛选器：无数据源依赖 -->
      <template v-if="mode === 'filter'">
        <el-form-item label="筛选类型">
          <el-radio-group v-model="form.filterType">
            <el-radio-button value="date-range">日期区间</el-radio-button>
            <el-radio-button value="select">下拉枚举</el-radio-button>
            <el-radio-button value="keyword">关键词</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="目标字段">
          <el-input v-model="form.field" placeholder="筛选的列名（如 startTime）" maxlength="60" />
          <div class="field-hint">变更后自动向同页所有仪表盘组件广播该字段条件（autoBroadcast）</div>
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="form.label" placeholder="如：日期范围" maxlength="12" style="width: 160px" />
        </el-form-item>
        <el-form-item v-if="form.filterType !== 'date-range'" label="占位提示">
          <el-input v-model="form.placeholder" :placeholder="form.filterType === 'select' ? '全部' : '输入关键词'" maxlength="20" />
        </el-form-item>
        <el-form-item v-if="form.filterType === 'select'" label="枚举项">
          <el-input v-model="form.options" placeholder="逗号分隔，如：running,completed" maxlength="200" />
        </el-form-item>
      </template>

      <!-- 待办清单：数据来自工作流任务接口，无数据源依赖；查询身份固定当前登录用户，故这里没有身份配置项 -->
      <template v-else-if="mode === 'todo'">
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="如：我的待办" maxlength="30" />
        </el-form-item>
        <el-form-item label="视图">
          <el-radio-group v-model="form.view">
            <el-radio-button value="todo">待办</el-radio-button>
            <el-radio-button value="done">已办</el-radio-button>
          </el-radio-group>
          <div class="field-hint">列表只包含当前登录用户自己的任务，不提供查询他人的入口</div>
        </el-form-item>
        <el-form-item label="列表条数">
          <el-input-number v-model="form.limit" :min="1" :max="50" :step="1" style="width: 100%" />
          <div class="field-hint">卡片内最多显示的任务条数（右上角计数为总数）</div>
        </el-form-item>
        <el-form-item v-if="form.view === 'todo'" label="排序">
          <el-select v-model="form.orderBy" style="width: 100%">
            <el-option value="priority" label="优先级高的在前" />
            <el-option value="" label="最新接收的在前" />
          </el-select>
        </el-form-item>
      </template>

      <!-- 公告栏：数据来自用户端消息接口（公告=公开消息），无数据源依赖；可见范围由后端登录态判定，故这里没有身份配置项 -->
      <template v-else-if="mode === 'notice'">
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="如：公司公告" maxlength="30" />
        </el-form-item>
        <el-form-item label="显示方式">
          <el-radio-group v-model="form.display">
            <el-radio-button value="list">列表</el-radio-button>
            <el-radio-button value="carousel">轮播</el-radio-button>
          </el-radio-group>
          <div class="field-hint">列表在卡片内滚动，轮播一条一屏（轮播需配合固定高度）</div>
        </el-form-item>
        <el-form-item v-if="form.display === 'carousel'" label="切换间隔">
          <el-input-number v-model="form.interval" :min="1000" :max="60000" :step="500" style="width: 100%" />
          <div class="field-hint">单位毫秒，自动切换到下一条公告</div>
        </el-form-item>
        <el-form-item label="列表条数">
          <el-input-number v-model="form.limit" :min="1" :max="50" :step="1" style="width: 100%" />
          <div class="field-hint">卡片内最多显示的公告条数（右上角计数为总数）</div>
        </el-form-item>
        <div class="field-hint notice-scope-hint">只显示当前登录账号收到的公告，不提供查看他人公告的入口</div>
      </template>

      <template v-else>
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

        <template v-if="mode === 'chart' || mode === 'leaderboard'">
          <el-form-item v-if="mode === 'chart'" label="图表类型">
            <el-radio-group v-model="form.chartType">
              <el-radio-button value="bar">柱状图</el-radio-button>
              <el-radio-button value="line">折线图</el-radio-button>
              <el-radio-button value="area">面积图</el-radio-button>
              <el-radio-button value="pie">饼环图</el-radio-button>
              <el-radio-button value="scatter">散点图</el-radio-button>
              <el-radio-button value="heatmap">热力图</el-radio-button>
              <el-radio-button value="funnel">漏斗图</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="分组维度">
            <el-select v-model="form.group" placeholder="选择字段" style="width: 100%" filterable>
              <el-option v-for="c in groupableColumns" :key="c.key" :value="c.key" :label="`${c.label || c.key} (${c.key})`" />
            </el-select>
            <div class="field-hint">按该字段的值分组统计{{ form.chartType === 'heatmap' ? '；热力图建议再选第二维度形成交叉' : '' }}</div>
          </el-form-item>
          <el-form-item v-if="form.chartType === 'heatmap'" label="第二维度">
            <el-select v-model="form.group2" placeholder="可选：形成 x×y 交叉" style="width: 100%" filterable clearable>
              <el-option v-for="c in groupableColumns" :key="c.key" :value="c.key" :label="`${c.label || c.key} (${c.key})`" />
            </el-select>
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

        <el-form-item v-if="mode === 'leaderboard'" label="Top N">
          <el-input-number v-model="form.limit" :min="1" :max="20" :step="1" style="width: 100%" />
          <div class="field-hint">按数值降序展示前 N 名</div>
        </el-form-item>

        <template v-if="isKpiLike">
          <el-form-item label="单位">
            <el-input v-model="form.unit" placeholder="如：天 / 人 / 单" maxlength="8" style="width: 160px" />
          </el-form-item>
          <el-form-item v-if="mode === 'kpi'" label="副标题">
            <el-input v-model="form.subtitle" placeholder="如：含子流程" maxlength="30" />
          </el-form-item>
          <el-form-item label="数字格式">
            <el-radio-group v-model="form.numberFormat">
              <el-radio value="">原样</el-radio>
              <el-radio value="thousand">千分位</el-radio>
            </el-radio-group>
          </el-form-item>

          <template v-if="mode === 'goal'">
            <el-form-item label="目标值">
              <el-input-number v-model="form.target" :min="1" :max="100000000" style="width: 100%" />
            </el-form-item>
          </template>

          <template v-if="mode === 'alert'">
            <el-form-item label="告警条件">
              <div style="display: flex; gap: 8px; width: 100%">
                <el-select v-model="form.condition" style="width: 110px">
                  <el-option value="gt" label="大于 >" />
                  <el-option value="lt" label="小于 <" />
                  <el-option value="gte" label="不小于 ≥" />
                  <el-option value="lte" label="不超过 ≤" />
                  <el-option value="eq" label="等于 =" />
                </el-select>
                <el-input-number v-model="form.threshold" :min="-100000000" :max="100000000" style="flex: 1" />
              </div>
            </el-form-item>
            <el-form-item label="告警文案">
              <el-input v-model="form.alertText" placeholder="触发时展示，如：请求数超过基线" maxlength="40" />
            </el-form-item>
          </template>

          <template v-if="mode === 'kpiTrend'">
            <el-form-item label="时间字段">
              <el-select v-model="form.trendField" placeholder="选择日期字段（空 = 全量主值，不算环比）" style="width: 100%" filterable clearable>
                <el-option v-for="c in dateColumns" :key="c.key" :value="c.key" :label="`${c.label || c.key} (${c.key})`" />
              </el-select>
            </el-form-item>
            <el-form-item label="对比窗口">
              <el-radio-group v-model="form.compareOffset">
                <el-radio value="day">日环比</el-radio>
                <el-radio value="week">周环比</el-radio>
                <el-radio value="month">月环比</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="环比标签">
              <el-input v-model="form.compareLabel" maxlength="8" style="width: 160px" />
            </el-form-item>
            <el-form-item label="趋势配色">
              <el-radio-group v-model="form.trendColorScheme">
                <el-radio value="up-good">升好（涨绿跌红）</el-radio>
                <el-radio value="down-good">降好（涨红跌绿）</el-radio>
              </el-radio-group>
            </el-form-item>
          </template>
          <template v-if="mode === 'kpi'">
            <el-form-item label="环比趋势">
              <el-switch v-model="form.trendEnabled" />
              <div class="field-hint">需要选择一个时间字段（用于计算上期区间）</div>
            </el-form-item>
            <template v-if="form.trendEnabled">
              <el-form-item label="时间字段">
                <el-select v-model="form.trendField" placeholder="选择日期字段" style="width: 100%" filterable>
                  <el-option v-for="c in dateColumns" :key="c.key" :value="c.key" :label="`${c.label || c.key} (${c.key})`" />
                </el-select>
              </el-form-item>
              <el-form-item label="对比粒度">
                <el-radio-group v-model="form.trendGrain">
                  <el-radio value="day">日环比</el-radio>
                  <el-radio value="week">周环比</el-radio>
                  <el-radio value="month">月环比</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="迷你折线">
                <el-switch v-model="form.sparkline" />
                <div class="field-hint">展示最近 N 个时间桶的走势（与对比粒度一致）</div>
              </el-form-item>
              <el-form-item v-if="form.sparkline" label="桶数">
                <el-input-number v-model="form.sparkRange" :min="5" :max="30" style="width: 120px" />
              </el-form-item>
            </template>
          </template>
        </template>
      </template>

      <!-- 宽高段：全模式共用同一套档位（含 chart / filter），事实源 dash-shared -->
      <DashSizeFields v-model:span="form.span" v-model:height="form.height" />
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!canConfirm" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 仪表盘组件配置弹窗（Task 119 → Task 120 扩展）：
 * kpi / chart / goal（目标进度）/ alert（告警）/ leaderboard（排行榜）/ filter（筛选器）
 * / todo（待办清单：不选数据源，只配视图/条数/排序，查询身份固定当前登录用户）
 * / notice（公告栏：不选数据源，只配标题/条数/显示方式，可见范围由后端登录态判定）。
 *
 * 数据源选择范围 = 页面级绑定（schema.dataSources），与 page-table 的
 * DsBindingConfigDialog 同一模型：组件只引用页内逻辑 id，refId 由渲染层解析。
 * 字段列表来自数据源 metadata（getMetadata），维度下拉只给非 JSON 列。
 * 热力图支持双维度（group=第一列,group2=第二列 → 后端 "a,b" 复合 key）。
 */
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import DashSizeFields from './DashSizeFields.vue'
import { clampDashSpan } from './dash-shared'

export type DashConfigMode = 'kpi' | 'chart' | 'goal' | 'alert' | 'leaderboard' | 'filter' | 'kpiTrend' | 'todo' | 'notice'

export interface DashConfigResult {
  mode: DashConfigMode
  /** 无数据源的成员（filter / todo）不带该键 */
  dataSourceId?: string
  title: string
  agg?: string
  metric?: string | null
  /** todo（待办清单，数据来自工作流任务接口） */
  view?: 'todo' | 'done'
  orderBy?: string
  /** notice（公告栏，数据来自用户端消息接口） */
  display?: 'list' | 'carousel'
  interval?: number
  /** chart / leaderboard */
  chartType?: string
  group?: string
  /** 热力图第二维度（与 group 拼为 "a,b"） */
  group2?: string
  timeGrain?: string | null
  sort?: string
  order?: string
  limit?: number
  /** 显示高度（全模式；'' = 自适应） */
  height?: string
  /** kpi-like */
  unit?: string
  subtitle?: string
  numberFormat?: string
  target?: number
  condition?: string
  threshold?: number
  alertText?: string
  trendEnabled?: boolean
  trendGrain?: string
  trendField?: string
  sparkline?: boolean
  sparkRange?: number
  /** kpiTrend（环比指标卡 Task 3-h） */
  compareOffset?: string
  compareLabel?: string
  trendColorScheme?: string
  /** Task 123：宽度栅格跨度（1-24；设计器同步写入 rule.col.span） */
  span?: number
  /** filter */
  filterType?: string
  field?: string
  label?: string
  placeholder?: string
  options?: string
  autoBroadcast?: boolean
}

const props = defineProps<{
  modelValue: boolean
  mode: DashConfigMode
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

const DIALOG_TITLES: Record<DashConfigMode, string> = {
  kpi: 'KPI 指标卡配置',
  chart: '统计图配置',
  goal: '目标进度配置',
  alert: '告警标记配置',
  leaderboard: '排行榜配置',
  filter: '筛选器配置',
  kpiTrend: '环比指标卡配置',
  todo: '待办清单配置',
  notice: '公告栏配置',
}
const dialogTitle = computed(() => DIALOG_TITLES[props.mode] || '组件配置')
/** 是否依赖页面数据源：筛选器、待办清单与公告栏都不依赖（后两者的数据来自任务/消息接口） */
const needsDataSource = computed(() => props.mode !== 'filter' && props.mode !== 'todo' && props.mode !== 'notice')
/** 单值型（KPI/目标/告警/环比卡共用单位/格式段） */
const isKpiLike = computed(() => props.mode === 'kpi' || props.mode === 'goal' || props.mode === 'alert' || props.mode === 'kpiTrend')

const form = reactive({
  dataSourceId: '',
  title: '',
  agg: 'count',
  metric: null as string | null,
  chartType: 'bar',
  group: '',
  group2: '',
  timeGrain: '' as string,
  sort: 'key',
  order: 'asc',
  limit: 0,
  unit: '',
  subtitle: '',
  numberFormat: '',
  target: 100,
  condition: 'gt',
  threshold: 0,
  alertText: '',
  trendEnabled: false,
  trendGrain: 'day',
  trendField: '',
  sparkline: false,
  sparkRange: 12,
  // kpiTrend（环比指标卡）
  compareOffset: 'month',
  compareLabel: '环比',
  trendColorScheme: 'up-good',
  filterType: 'date-range',
  field: '',
  label: '',
  placeholder: '',
  options: '',
  // todo（待办清单）
  view: 'todo' as 'todo' | 'done',
  orderBy: 'priority',
  // notice（公告栏）
  display: 'list' as 'list' | 'carousel',
  interval: 4000,
  // 宽高（档位事实源 dash-shared；spanMode 由 DashSizeFields 内部维护）
  span: 24 as number,
  height: '' as string,
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
    const groupText = String(p.group || '')
    // 热力图复合维度回填："a,b" → group=a / group2=b
    const commaIdx = groupText.indexOf(',')
    form.group = commaIdx >= 0 ? groupText.slice(0, commaIdx) : groupText
    form.group2 = commaIdx >= 0 ? groupText.slice(commaIdx + 1) : ''
    form.timeGrain = p.timeGrain || ''
    form.sort = p.sort || 'key'
    form.order = p.order || 'asc'
    form.limit = Number(
      p.limit ||
        (props.mode === 'leaderboard' ? 5 : props.mode === 'todo' ? 8 : props.mode === 'notice' ? 6 : 0),
    )
    form.view = p.view === 'done' ? 'done' : 'todo'
    form.orderBy = p.orderBy ?? 'priority'
    form.display = p.display === 'carousel' ? 'carousel' : 'list'
    form.interval = Number(p.interval || 4000)
    form.unit = p.unit || ''
    form.subtitle = p.subtitle || ''
    form.numberFormat = p.numberFormat || ''
    form.target = Number(p.target || 100)
    form.condition = p.condition || 'gt'
    form.threshold = Number(p.threshold || 0)
    form.alertText = p.alertText || ''
    form.trendEnabled = p.trendEnabled === true
    form.trendGrain = p.trendGrain || 'day'
    form.trendField = p.trendField || ''
    form.compareOffset = p.compareOffset || 'month'
    form.compareLabel = p.compareLabel || '环比'
    form.trendColorScheme = p.trendColorScheme || 'up-good'
    form.sparkline = p.sparkline === true
    form.sparkRange = Number(p.sparkRange || 12)
    form.filterType = p.filterType || 'date-range'
    form.field = p.field || ''
    form.label = p.label || ''
    form.placeholder = p.placeholder || ''
    form.options = p.options || ''
    // 宽高回填（生效值直存 props.span / props.height，档位归一在 DashSizeFields 内部）
    form.span = clampDashSpan(p.span ?? 24)
    form.height = String(p.height ?? '')
    if (needsDataSource.value) void loadColumns()
  },
)

watch(() => form.dataSourceId, () => {
  if (needsDataSource.value) void loadColumns()
})

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

/** 日期列（环比时间字段下拉用） */
const dateColumns = computed(() =>
  columns.value.filter((c) => ['DATE', 'DATETIME', 'TIMESTAMP'].includes(String(c.columnType || '').toUpperCase())),
)

const canConfirm = computed(() => {
  // 待办清单与公告栏：不依赖数据源，也无必填项
  if (props.mode === 'todo' || props.mode === 'notice') return true
  if (props.mode === 'filter') {
    return form.field.trim() !== ''
  }
  if (!form.dataSourceId) return false
  if ((props.mode === 'chart' || props.mode === 'leaderboard') && !form.group) return false
  if (props.mode === 'chart' && form.chartType === 'heatmap' && form.group === form.group2) return false
  if (form.agg !== 'count' && !form.metric) return false
  if (props.mode === 'kpi' && form.trendEnabled && !form.trendField) return false
  if (props.mode === 'alert' && form.threshold === null) return false
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
  if (props.mode === 'todo') {
    // 已办视图不支持排序（服务端固定按办结时间倒序），不回落成脏参数
    emit('confirm', {
      mode: 'todo',
      title: form.title,
      view: form.view,
      limit: form.limit,
      orderBy: form.view === 'done' ? '' : form.orderBy,
      span: form.span,
      height: form.height,
    })
  } else if (props.mode === 'notice') {
    // 列表形态不吃轮播间隔，但仍把生效值原样带回，避免下次打开弹窗丢配置
    emit('confirm', {
      mode: 'notice',
      title: form.title,
      limit: form.limit,
      display: form.display,
      interval: form.interval,
      span: form.span,
      height: form.height,
    })
  } else if (props.mode === 'filter') {
    emit('confirm', {
      mode: 'filter',
      dataSourceId: '',
      title: '',
      agg: 'count',
      metric: null,
      filterType: form.filterType,
      field: form.field.trim(),
      label: form.label,
      placeholder: form.placeholder,
      options: form.options,
      autoBroadcast: true,
      span: form.span,
      height: form.height,
    })
  } else if (props.mode === 'chart') {
    // 热力图双维度："a,b"（后端 splitGroupColumns 契约）
    const groupText = form.chartType === 'heatmap' && form.group2
      ? `${form.group},${form.group2}`
      : form.group
    emit('confirm', {
      mode: 'chart',
      dataSourceId: form.dataSourceId,
      title: form.title,
      agg: form.agg,
      metric: form.metric,
      chartType: form.chartType,
      group: groupText,
      timeGrain: form.timeGrain === '' ? null : form.timeGrain,
      sort: form.sort,
      order: form.order,
      limit: form.limit,
      height: form.height,
      span: form.span,
    })
  } else if (props.mode === 'leaderboard') {
    emit('confirm', {
      mode: 'leaderboard',
      dataSourceId: form.dataSourceId,
      title: form.title,
      agg: form.agg,
      metric: form.metric,
      group: form.group,
      timeGrain: form.timeGrain === '' ? null : form.timeGrain,
      limit: form.limit,
      numberFormat: form.numberFormat,
      span: form.span,
      height: form.height,
    })
  } else if (props.mode === 'goal') {
    emit('confirm', {
      mode: 'goal',
      dataSourceId: form.dataSourceId,
      title: form.title,
      agg: form.agg,
      metric: form.metric,
      unit: form.unit,
      target: form.target,
      numberFormat: form.numberFormat,
      span: form.span,
      height: form.height,
    })
  } else if (props.mode === 'alert') {
    emit('confirm', {
      mode: 'alert',
      dataSourceId: form.dataSourceId,
      title: form.title,
      agg: form.agg,
      metric: form.metric,
      unit: form.unit,
      condition: form.condition,
      threshold: form.threshold,
      alertText: form.alertText,
      numberFormat: form.numberFormat,
      span: form.span,
      height: form.height,
    })
  } else if (props.mode === 'kpiTrend') {
    emit('confirm', {
      mode: 'kpiTrend',
      dataSourceId: form.dataSourceId,
      title: form.title,
      agg: form.agg,
      metric: form.metric,
      unit: form.unit,
      numberFormat: form.numberFormat,
      trendField: form.trendField,
      compareOffset: form.compareOffset,
      compareLabel: form.compareLabel,
      trendColorScheme: form.trendColorScheme,
      span: form.span,
      height: form.height,
    })
  } else {
    emit('confirm', {
      mode: 'kpi',
      dataSourceId: form.dataSourceId,
      title: form.title,
      agg: form.agg,
      metric: form.metric,
      unit: form.unit,
      subtitle: form.subtitle,
      numberFormat: form.numberFormat,
      trendEnabled: form.trendEnabled,
      trendGrain: form.trendGrain,
      trendField: form.trendField,
      sparkline: form.sparkline,
      sparkRange: form.sparkRange,
      span: form.span,
      height: form.height,
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
