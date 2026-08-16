<template>
  <el-table
    :data="records"
    v-loading="loading"
    border
    stripe
    size="small"
    v-bind="tableAttrs"
    @row-click="handleRowClick"
  >
    <el-table-column
      v-for="col in resolvedColumns"
      :key="col.prop"
      :prop="col.prop"
      :label="col.label"
      :min-width="col.minWidth"
      :width="col.width"
    />
  </el-table>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/utils/http'

/** 动作总线（PageRendererPage provide）：dispatch(trigger, eventData) */
const actionBus = inject<{ dispatch: (trigger: string, eventData: any) => void } | undefined>('pageActionBus')

const props = defineProps<{
  /** 页面 key（数据源查询接口路径） */
  pageKey: string
  /** 数据源绑定 id（schema.dataSources[].id） */
  dataSourceId?: string
  /** 数据源 refId（全局数据源 id，直接查询用） */
  refId?: string
  /** 表格列配置 [{prop,label,width}] */
  columns?: { prop: string; label: string; width?: number | string; minWidth?: number | string }[]
  /** 附加表格属性（border/stripe/size 等） */
  [key: string]: any
}>()

const emit = defineEmits<{
  (e: 'row-click', row: any): void
  (e: 'loaded', records: any[]): void
  (e: 'ready', instance: any): void
}>()

const records = ref<any[]>([])
const loading = ref(false)
const size = ref(20)
/** 当前 filter（动作总线 set-filter 注入） */
const currentFilter = ref<Record<string, unknown> | undefined>(undefined)

const tableAttrs = computed(() => {
  const { columns, pageKey, dataSourceId, refId, ...rest } = props as any
  return rest
})

const resolvedColumns = computed(() =>
  (props.columns || []).map((c) => ({
    prop: c.prop,
    label: c.label,
    width: c.width,
    minWidth: c.minWidth || 120,
  })),
)

async function fetchData() {
  const dsId = props.dataSourceId || props.refId
  if (!dsId) {
    records.value = []
    return
  }
  loading.value = true
  try {
    const params: Record<string, any> = { page: 0, size: size.value }
    if (currentFilter.value) {
      params.filter = JSON.stringify({
        logic: 'AND',
        conditions: Object.entries(currentFilter.value).map(([column, value]) => ({ column, op: 'eq', value })),
      })
    }
    const res: any = await http.get(`/v1/pages/${props.pageKey}/ds/${dsId}/data`, { params })
    const data = res?.data ?? res
    records.value = (data.records || []).map((r: any) => ({ ...(r.data || {}), id: r.id, version: r.version }))
    emit('loaded', records.value)
  } catch {
    records.value = []
    ElMessage.error('页面数据源加载失败')
  } finally {
    loading.value = false
  }
}

/** 外部触发刷新（动作总线 refresh） */
function refresh() {
  fetchData()
}

/** 动作总线 set-filter：注入过滤条件后刷新 */
function setFilter(filter: Record<string, unknown>) {
  currentFilter.value = { ...(currentFilter.value || {}), ...filter }
  fetchData()
}

/** 动作总线 set-value：更新过滤条件不刷新（或清空） */
function resetFilter() {
  currentFilter.value = undefined
  fetchData()
}

function handleRowClick(row: any) {
  emit('row-click', row)
  // 通过动作总线直接触发（不依赖 form-create 的 on 桥接）
  actionBus?.dispatch('row-click', { node: row, row })
}

defineExpose({ refresh, fetchData, records, setFilter, resetFilter })

onMounted(() => {
  emit('ready', { refresh, fetchData, setFilter, resetFilter, records })
  fetchData()
})
</script>
