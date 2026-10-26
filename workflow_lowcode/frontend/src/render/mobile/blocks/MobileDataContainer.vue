<script setup lang="ts">
/**
 * 移动端数据容器（page-data-container → 模板 container）：与桌面 PageDataContainer 同协议——
 * 绑一个数据源自取数，把记录集作为 {rows}/{row} 作用域供给子规则展示文案，子组件不各自绑源。
 * 差异=内嵌渲染走 @form-create/vant 实例，子规则过移动改写（EP-only 字段/未实现块占位）。
 * 边界与桌面一致：子树不复制、只插展示文案、聚合类子组件照旧自取数。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { applyScopeToRules, buildContainerScope } from '@/views/page/components/containerScope'
import {
  mergeDashFilter,
  parseDashFilter,
  upsertDashConditions,
  type DashCondition,
} from '@/views/dashboard/components/dash-shared'

import { createMobileForm, MOBILE_IMPLEMENTED_TEMPLATES } from '../vantRegistry'
import { rewriteFieldTypesForMobile } from '../fieldTemplates'
import { transformRuleForMobile } from '../mobileRuleTransform'

const FormCreateMobile = createMobileForm()

const props = defineProps<{
  title?: string
  dataSourceId?: string
  dsRefId?: string
  queryMode?: 'list' | 'single'
  pageSize?: number
  filter?: string
  childRules?: any[]
  designMode?: boolean
}>()

const emit = defineEmits<{
  ready: [payload: { refresh: () => void; setFilter: (c: Record<string, unknown>) => void }]
}>()

const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const loading = ref(false)
const loaded = ref(false)
const baseFilter = ref(parseDashFilter(props.filter))
const extraConditions = ref<DashCondition[]>([])

const sourceId = computed(
  () => props.dsRefId || activeDsBindings.value.find((b) => b.id === props.dataSourceId)?.refId || '',
)

const hasChildRules = computed(() => Array.isArray(props.childRules) && props.childRules.length > 0)
const canRenderChildren = computed(() => !!sourceId.value && loaded.value && hasChildRules.value)

const emptyText = computed(() => {
  if (loading.value) return ''
  if (!sourceId.value) return '未绑定数据源'
  if (!loaded.value) return '没有数据'
  if (!hasChildRules.value) return '容器里还没有组件'
  return ''
})

/** 子规则：作用域插值 → 字段占位改写 → 块三态占位（implemented=渲染器注册面，与宿主同源） */
const scopedChildRules = computed(() => {
  const scoped = applyScopeToRules(props.childRules, buildContainerScope(rows.value)) as Record<string, any>[]
  return transformRuleForMobile(rewriteFieldTypesForMobile(scoped) as any, MOBILE_IMPLEMENTED_TEMPLATES)
})

/** 内嵌 form-create 只用于展示，提交/重置按钮一律不出 */
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
    rows.value = (Array.isArray(records) ? records : []).map(
      (r: any) => ({ ...(r?.data || {}), id: r?.id, version: r?.version }),
    )
    total.value = Number(res.data?.total ?? rows.value.length)
    loaded.value = true
  } catch (e: unknown) {
    console.warn('[mobile-data-container] query failed:', e instanceof Error ? e.message : String(e))
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

<template>
  <div class="mobile-data-container">
    <div class="m-dc-head">
      <span class="m-dc-title">{{ title }}</span>
      <span v-if="total" class="m-dc-count">{{ total }}</span>
    </div>
    <div class="m-dc-body">
      <component :is="FormCreateMobile" v-if="canRenderChildren" :rule="scopedChildRules" :option="childOption" />
      <div v-else-if="emptyText" class="m-dc-empty">{{ emptyText }}</div>
    </div>
  </div>
</template>

<style scoped>
.mobile-data-container {
  margin: 8px 12px;
  padding: 12px;
  background: #fff;
  border-radius: 10px;
}
.m-dc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.m-dc-title {
  font-size: 14px;
  font-weight: 600;
  color: #323233;
}
.m-dc-count {
  font-size: 12px;
  color: #969799;
}
.m-dc-empty {
  padding: 16px 0;
  font-size: 12px;
  color: #c8c9cc;
  text-align: center;
}
</style>
