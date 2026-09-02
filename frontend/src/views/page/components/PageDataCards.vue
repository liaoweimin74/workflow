<template>
  <div class="page-data-cards" :class="{ 'stretch-fill': stretch }">
    <ListCards
      ref="cardsRef"
      :columns="resolvedColumns"
      :fetch-api="fetchApi"
      :card-min-width="cardMinWidth"
      :default-page-size="pageSize || 20"
      :show-pagination="pagination"
      :actions="resolvedActions"
      @row-click="handleRowClick"
      @action-click="handleActionClick"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import ListCards from '@/components/business/ListCards.vue'
import type { CardColumn, DataSourceBindingContext, ListQueryParams, ListPageResult } from '@/components/business/types'

const props = withDefaults(defineProps<{
  pageKey?: string
  dataSourceId?: string
  dsRefId?: string
  columns?: CardColumn[]
  cardMinWidth?: number | string
  pageSize?: number
  pagination?: boolean
  viewActions?: { buttons?: Array<{ key: string; label: string; placement?: string }> }
  stretch?: boolean
  [key: string]: any
}>(), { pageSize: 20, pagination: true, cardMinWidth: 280, stretch: false })

const emit = defineEmits<{
  (e: 'row-click', row: any): void
  (e: 'loaded', rows: any[]): void
  (e: 'ready', instance: any): void
}>()

const actionBus = inject<{ dispatch: (trigger: string, data: any) => boolean; register?: (id: string, instance: any) => void }>('pageActionBus')
const cardsRef = ref<InstanceType<typeof ListCards>>()

const resolvedRefId = computed(() => {
  if (props.dsRefId) return props.dsRefId
  const binding = activeDsBindings.value.find((item: DataSourceBindingContext) => item.id === props.dataSourceId)
  return binding?.refId || ''
})

const resolvedColumns = computed<CardColumn[]>(() => (props.columns || []).filter((column) => !column.hidden).map((column) => ({
  ...column,
  prop: column.prop || (column as any).key,
  label: column.label || column.prop || (column as any).key,
})))

const resolvedActions = computed(() => (props.viewActions?.buttons || [])
  .filter((button) => button.placement !== 'toolbar')
  .map((button) => ({ key: button.key, label: button.label })))

const fetchApi = async (params: ListQueryParams): Promise<ListPageResult> => {
  if (!resolvedRefId.value) return { rows: [], total: 0 }
  const response = await dataSourceApi.queryData(resolvedRefId.value, {
    page: Math.max(1, params.page),
    size: params.size,
  })
  const rows = (response.data?.records || []).map((record: any) => ({ ...(record.data || {}), id: record.id, version: record.version }))
  emit('loaded', rows)
  return { rows, total: response.data?.total || 0 }
}

function handleRowClick(row: any) {
  emit('row-click', row)
  actionBus?.dispatch('row-click', { node: row, row, source: props.dataSourceId })
}

function handleActionClick(action: { key: string; label: string }, row: any) {
  const mode = action.key === 'create' ? 'create' : action.key === 'view' ? 'view' : action.key === 'edit' ? 'edit' : undefined
  if (mode && actionBus?.openLinkedContainer) {
    actionBus.openLinkedContainer(props.dataSourceId || '', mode, row)
    return
  }
  actionBus?.dispatch('action-click', { action, row, source: props.dataSourceId })
}

onMounted(() => {
  const instance = { fetchData: () => cardsRef.value?.fetchData(), refresh: () => cardsRef.value?.refresh() }
  actionBus?.register?.(props.dataSourceId || '', instance)
  emit('ready', instance)
})
</script>

<style scoped>
.page-data-cards { height: 100%; min-height: 0; }
.stretch-fill { height: 100%; }
</style>
