<template>
  <el-dialog v-model="visible" title="图表配置" width="680px" :close-on-click-modal="false" destroy-on-close>
    <el-form label-position="top" class="chart-config-form">
      <el-form-item label="图表类型">
        <el-radio-group v-model="local.type">
          <el-radio-button value="bar">柱状图</el-radio-button>
          <el-radio-button value="line">折线图</el-radio-button>
          <el-radio-button value="pie">饼图</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="维度列（X 轴 / 饼图分组依据）">
        <el-select v-model="local.dimension" placeholder="选择维度列" clearable filterable style="width: 320px">
          <el-option v-for="c in candidates" :key="c.key" :label="columnLabel(c)" :value="c.key" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <template #label>
          指标列（聚合口径与汇总行一致：数值列开放求和/平均/最大/最小/计数，其余列仅计数）
        </template>
        <div class="measure-rows">
          <div v-for="(row, i) in local.measures" :key="i" class="measure-row">
            <el-select
              v-model="row.key"
              placeholder="字段"
              filterable
              style="width: 34%"
              @change="onMeasureKeyChange(row)"
            >
              <el-option v-for="c in candidates" :key="c.key" :label="columnLabel(c)" :value="c.key" />
            </el-select>
            <el-select v-model="row.agg" style="width: 22%">
              <el-option v-for="o in aggOptionsOf(row.key)" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <el-input v-model="row.label" placeholder="显示名（可选，用于图例/系列名）" style="width: 30%" />
            <el-button type="danger" link @click="removeMeasure(i)">删除</el-button>
          </div>
          <el-button type="primary" link @click="addMeasure">+ 添加指标</el-button>
        </div>
      </el-form-item>
      <!-- 饼图仅取第一条指标（buildPieDataset 退化语义）：界面提示，不阻断多行编辑 -->
      <el-alert
        v-if="local.type === 'pie' && local.measures.length > 1"
        type="info"
        :closable="false"
        title="饼图仅使用第一个指标列，其余指标在饼图形态下将被忽略"
      />
      <el-empty v-if="!hasCandidates" description="当前数据源暂无可用列" :image-size="60" />
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!canConfirm" @click="handleConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * page-chart 图表配置弹窗（Task 3-e，设计器属性面板「配置图表」入口）。
 *
 * 产出 props.config 持久化形态 PageChartConfig（{type, dimension, measures}），
 * 渲染端 PageDataChartPage 经 chartDataset 归一后交 PageDataChart 聚合渲染。
 *
 * 口径对齐：
 * - 聚合下拉复用 tableEnhance.aggregateOptionsOf（数值列全量 5 项，其余列仅计数，与汇总行同源）；
 *   指标字段切换为非数值列时，当前聚合不在可用口径内自动回落 count；
 * - 饼图仅取第一条指标（chartDataset.buildPieDataset 退化语义），多行保留可编辑并界面提示。
 *
 * 回传通道：confirm 事件（回传完整配置并关弹窗，对齐 CardStyleConfigDialog 惯例）
 * 与 update:config（支持父组件 v-model:config）同时触发，父组件按需取用其一。
 * 校验：维度列与至少一条有效指标齐备才可确认（确定按钮禁用，无需 ElMessage 打断）。
 */
import { computed, reactive, watch } from 'vue'
import { aggregateOptionsOf } from './tableEnhance'
import type { AggregateFn } from './tableEnhance'
import type { PageChartConfig, PageChartMeasure } from './pageChartConfig'

/** 候选列（数据源 metadata columns：{key,label,columnType}） */
interface CandidateColumn {
  key: string
  label?: string | null
  columnType?: string | null
}

const props = defineProps<{
  /** 弹窗可见（v-model） */
  modelValue: boolean
  /** 当前配置（打开弹窗时回显） */
  config?: PageChartConfig | null
  /** 候选列（数据源 metadata 列声明） */
  candidates?: CandidateColumn[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', value: PageChartConfig): void
  (e: 'update:config', value: PageChartConfig): void
}>()

/** 弹窗可见（v-model 透传，对齐 CardStyleConfigDialog.visible computed 读写器） */
const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) })

/** 候选列可选（未传视为空列）：空列占位提示 */
const hasCandidates = computed(() => (props.candidates?.length ?? 0) > 0)

/** 本地编辑态（打开时从 props.config 深拷贝回显） */
const local = reactive<{ type: 'bar' | 'line' | 'pie'; dimension: string; measures: PageChartMeasure[] }>({
  type: 'bar',
  dimension: '',
  measures: [],
})

const CHART_TYPE_SET = new Set(['bar', 'line', 'pie'])
const AGG_SET = new Set<AggregateFn>(['sum', 'avg', 'count', 'max', 'min'])

function initForm() {
  const src = props.config && typeof props.config === 'object' ? props.config : {}
  local.type = CHART_TYPE_SET.has(String(src.type)) ? (src.type as 'bar' | 'line' | 'pie') : 'bar'
  local.dimension = typeof src.dimension === 'string' ? src.dimension : ''
  local.measures = (Array.isArray(src.measures) ? src.measures : [])
    .filter((m: any) => m && typeof m.key === 'string' && m.key !== '')
    .map((m: any) => ({
      key: m.key as string,
      agg: (AGG_SET.has(m.agg) ? m.agg : 'sum') as AggregateFn,
      ...(typeof m.label === 'string' && m.label !== '' ? { label: m.label as string } : {}),
    }))
  // 新配置预填一条空指标行，减少一次点击（确认前剔除空行）
  if (local.measures.length === 0) {
    local.measures.push({ key: '', agg: 'sum' })
  }
}

watch(() => props.modelValue, (open) => {
  if (open) initForm()
})
// 挂载时 modelValue 已为 true 的场景（父组件先置 visible 再渲染）watch 不触发：初始化一次（对齐 CardStyleConfigDialog）
initForm()

// ==================== 候选列与聚合口径 ====================

function columnLabel(c: CandidateColumn): string {
  return c.label ? `${c.label} (${c.key})` : c.key
}

function columnTypeOf(key: string): string | null | undefined {
  return props.candidates?.find((c) => c.key === key)?.columnType
}

/** 该字段可用聚合口径（aggregateOptionsOf：数值列全量，其余仅计数；未知字段按非数值兜底） */
function aggOptionsOf(key: string): { label: string; value: AggregateFn }[] {
  return aggregateOptionsOf(columnTypeOf(key))
}

/** 指标字段切换：当前聚合不在新字段可用口径内时回落 count（与汇总行「计数→无」修复后语义一致） */
function onMeasureKeyChange(row: PageChartMeasure) {
  if (!aggOptionsOf(row.key).some((o) => o.value === row.agg)) {
    row.agg = 'count'
  }
}

// ==================== 指标行增删 ====================

function addMeasure() {
  local.measures.push({ key: '', agg: 'sum' })
}

function removeMeasure(index: number) {
  local.measures.splice(index, 1)
}

// ==================== 确认回传 ====================

/** 维度与至少一条有效指标齐备才可确认 */
const canConfirm = computed(() =>
  !!local.dimension && local.measures.some((m) => m.key !== ''),
)

function handleConfirm() {
  const payload: PageChartConfig = {
    type: local.type,
    dimension: local.dimension,
    measures: local.measures
      .filter((m) => m.key !== '')
      .map((m) => ({ key: m.key, agg: m.agg, ...(m.label ? { label: m.label } : {}) })),
  }
  emit('update:config', payload)
  emit('confirm', payload)
  visible.value = false
}
</script>

<style scoped>
.chart-config-form :deep(.el-form-item__label) {
  line-height: 1.4;
}
.measure-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.measure-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
