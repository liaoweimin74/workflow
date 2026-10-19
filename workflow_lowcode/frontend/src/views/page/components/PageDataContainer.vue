<template>
  <div class="page-data-container" :class="{ 'is-fixed-height': fixedHeight, 'is-fill-height': fillHeight }" :style="layoutStyle">
    <div class="pdc-head">
      <span class="pdc-title">{{ title }}</span>
      <span v-if="total" class="pdc-count">{{ total }}</span>
    </div>
    <div v-loading="loading" class="pdc-body">
      <!-- 子规则由容器自己起一个 form-create 渲染：数据是异步回来的，插值只能发生在渲染前一刻 -->
      <form-create v-if="canRenderChildren" v-model="childFormData" :rule="scopedChildRules" :option="childOption" />
      <div v-else-if="emptyText" class="pdc-empty">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 数据容器（语义 A）：绑一个数据源、自己取一次数，把记录集作为 {rows} / {row} 作用域
 * 提供给内部组件的展示文案，子组件不再各自绑数据源。
 *
 * 边界（刻意的）：
 *  - 子树不复制。列表形态下作用域只有 rows 数组，一份子树；要「一条记录一张卡」是语义 B，
 *    需要先解决「第 i 份怎么寻址」（动作 target 与筛选器广播都会撞车）。
 *  - 只插展示文案。字段名、数据源 ID、动作参数都不碰——动作里的 {row.id} 由动作链在点击时
 *    按触发数据解析，容器提前固化会让「运行时取值」变成「渲染时取值」，联动就失效了。
 *  - 聚合类子组件（dash-kpi / dash-chart 等）照旧自取数，容器只多给一层文案作用域。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { applyScopeToRules, buildContainerScope } from './containerScope'
import {
  dashHeightStyle,
  dashSpanGapStyle,
  isDashFillHeight,
  mergeDashFilter,
  parseDashFilter,
  upsertDashConditions,
  type DashCondition,
} from '@/views/dashboard/components/dash-shared'

const props = defineProps<{
  title?: string
  dataSourceId?: string
  /** 宿主注入的数据源标识（与仪表盘组件同一套解析优先级） */
  dsRefId?: string
  queryMode?: 'list' | 'single'
  pageSize?: number
  /** 容器级固定筛选（JSON 文本），与筛选器广播条件合并 */
  filter?: string
  /** 保存态的子规则（props.rule），由宿主 normalize 后放进 props.childRules */
  childRules?: any[]
  span?: number
  height?: string
  designMode?: boolean
}>()

const emit = defineEmits<{ ready: [payload: { refresh: () => void; setFilter: (c: Record<string, unknown>) => void }] }>()

const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const loading = ref(false)
const loaded = ref(false)
const childFormData = ref<Record<string, unknown>>({})
const baseFilter = ref<Record<string, unknown> | null>(parseDashFilter(props.filter))
const extraConditions = ref<DashCondition[]>([])

const sourceId = computed(
  () => props.dsRefId || activeDsBindings.value.find((b) => b.id === props.dataSourceId)?.refId || '',
)

const layoutStyle = computed<Record<string, string>>(() => ({
  ...dashSpanGapStyle(props.span),
  ...(dashHeightStyle(props.height) || {}),
}))
const fixedHeight = computed(() => !!dashHeightStyle(props.height))
const fillHeight = computed(() => isDashFillHeight(props.height))

const hasChildRules = computed(() => Array.isArray(props.childRules) && props.childRules.length > 0)
const canRenderChildren = computed(() => !!sourceId.value && loaded.value && hasChildRules.value)

const emptyText = computed(() => {
  if (loading.value) return ''
  if (!sourceId.value) return '未绑定数据源'
  if (!loaded.value) return '没有数据'
  if (!hasChildRules.value) return '容器里还没有组件'
  return ''
})

const scopedChildRules = computed(() => applyScopeToRules(props.childRules, buildContainerScope(rows.value)))

/** 内嵌 form-create 只用于展示，提交/重置按钮一律不出（页面非表单提交场景） */
const childOption = { submitBtn: { show: false }, resetBtn: { show: false } }

function currentFilter(): string | null {
  return mergeDashFilter(baseFilter.value, extraConditions.value, props.filter)
}

async function fetchRows(): Promise<void> {
  const id = sourceId.value
  if (!id) {
    rows.value = []
    total.value = 0
    loaded.value = false
    return
  }
  const filter = currentFilter()
  const params: Record<string, unknown> = {
    page: 1,
    size: props.queryMode === 'single' ? 1 : Number(props.pageSize) || 20,
  }
  if (filter) params.filter = filter

  loading.value = true
  try {
    const res = await dataSourceApi.queryData(id, params)
    const records = res.data?.records ?? []
    // 后端 records 是 BizDataVO（业务列在 r.data 里），必须展开成扁平行，{row.name} 才取得到；
    // 口径与 PageDataTable / PageTreeTable 一致：id / version 提升到行上
    rows.value = (Array.isArray(records) ? records : []).map(
      (r: any) => ({ ...(r?.data || {}), id: r?.id, version: r?.version }),
    )
    total.value = Number(res.data?.total ?? rows.value.length)
    loaded.value = true
  } catch (e: unknown) {
    console.warn('[page-data-container] query failed:', e instanceof Error ? e.message : e)
    rows.value = []
    total.value = 0
    loaded.value = false
  } finally {
    loading.value = false
  }
}

function setFilter(cond: Record<string, unknown>): void {
  upsertDashConditions(extraConditions.value, cond)
  void fetchRows()
}

function refresh(): void {
  extraConditions.value = []
  void fetchRows()
}

watch(
  () => props.filter,
  (next) => {
    baseFilter.value = parseDashFilter(next)
  },
)

onMounted(() => {
  void fetchRows()
  emit('ready', { refresh, setFilter })
})

defineExpose({ refresh, setFilter })
</script>

<style scoped>
.page-data-container {
  box-sizing: border-box;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
}
.page-data-container.is-fixed-height,
.page-data-container.is-fill-height {
  min-height: 0;
}
.pdc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex: none;
}
.pdc-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.pdc-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pdc-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.pdc-empty {
  padding: 16px 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}
</style>
