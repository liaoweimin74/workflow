<script setup lang="ts">
/**
 * 移动端卡片列表块：page-table / page-list-cards 的移动实现（Vant 模板键 card-list）。
 *
 * props 对齐桌面块的 rule.props（dataSourceId/columns/searchFields/showSearch/pageSize），
 * 同一份 form-create rule 按渠道注册到不同渲染器（designs §5 逻辑 schema 唯一）。
 * 取数复用 dataSourceApi.queryData——服务端字段策略/脱敏已在出口生效，前端原样呈现。
 * 卡片槽位=deriveCardSlots 缺省映射（端覆盖层 channelProfiles 接入后以其为准）。
 */
import { computed, ref } from 'vue'
import { Empty as VanEmpty, List as VanList, PullRefresh as VanPullRefresh, Search as VanSearch } from 'vant'

import { dataSourceApi } from '@/api/data-source'
import type { DataSourceQueryParams } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { deriveCardSlots, type CardSlotColumn } from '../cardSlots'

interface SearchFieldLike {
  key: string
  label?: string
  matchType?: string
}

const props = withDefaults(
  defineProps<{
    /** 页面内数据源绑定 id（dsRefId 缺省时经 activeDsBindings 解析） */
    dataSourceId?: string | number
    /** 全局数据源 refId（宿主 prepareMobileRule 注入，优先级最高——对齐桌面协议） */
    dsRefId?: string
    columns?: CardSlotColumn[]
    searchFields?: SearchFieldLike[]
    showSearch?: boolean
    pageSize?: number
  }>(),
  {
    dataSourceId: undefined,
    dsRefId: undefined,
    columns: () => [],
    searchFields: () => [],
    showSearch: false,
    pageSize: 20,
  },
)

const emit = defineEmits<{ (e: 'row-click', row: Record<string, unknown>): void }>()

const rows = ref<Record<string, any>[]>([])
const loading = ref(false)
const finished = ref(false)
const refreshing = ref(false)
const keyword = ref('')
const page = ref(0)

const slots = computed(() => deriveCardSlots(props.columns ?? []))
const showSearchBar = computed(() => props.showSearch && (props.searchFields?.length ?? 0) > 0)

/** 数据源解析：宿主 prepare 注入的 dsRefId 优先，其次页面内 dataSourceId 查全局绑定（对齐桌面） */
const sourceId = computed(() => {
  if (props.dsRefId) return props.dsRefId
  if (props.dataSourceId) {
    const binding = activeDsBindings.value.find((b) => b.id === String(props.dataSourceId))
    if (binding?.refId) return binding.refId
  }
  return ''
})

/** 空值统一呈现（v1 不做列级格式化：contentType 列本就不进槽位） */
function text(value: unknown): string {
  return value === null || value === undefined || value === '' ? '-' : String(value)
}

async function load() {
  // 守卫：van-list 只在非 loading/finished 时发 load 事件，但搜索/刷新重入须自行挡住
  if (loading.value || finished.value) return
  if (!sourceId.value) {
    finished.value = true
    return
  }
  loading.value = true
  try {
    const params: DataSourceQueryParams = { page: page.value + 1, size: props.pageSize }
    if (keyword.value) params.keyword = keyword.value
    const response = await dataSourceApi.queryData(sourceId.value, params)
    const records = response.data?.records || []
    const total = response.data?.total ?? 0
    rows.value.push(
      ...records.map((record: any) => ({ ...(record.data || {}), id: record.id, version: record.version })),
    )
    page.value += 1
    finished.value = rows.value.length >= total || records.length === 0
  } catch {
    // 请求失败止于当前页，不无限重试（van-list 语义：finished 后不再触发 load）
    finished.value = true
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function reload() {
  rows.value = []
  page.value = 0
  finished.value = false
  void load()
}

function onRefresh() {
  refreshing.value = true
  reload()
}
</script>

<template>
  <div class="mobile-card-list">
    <VanSearch v-if="showSearchBar" v-model="keyword" @search="reload" @clear="reload" />
    <VanPullRefresh v-model="refreshing" @refresh="onRefresh">
      <VanList v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="load">
        <div v-for="(row, index) in rows" :key="row.id ?? index" class="m-card" @click="emit('row-click', row)">
          <div v-if="slots.title" class="m-card__title">{{ text(row[slots.title.key]) }}</div>
          <div v-if="slots.subtitle" class="m-card__subtitle">{{ text(row[slots.subtitle.key]) }}</div>
          <div v-for="col in slots.kv" :key="col.key" class="m-card__kv">
            <span class="m-card__kv-label">{{ col.label }}</span>
            <span class="m-card__kv-value">{{ text(row[col.key]) }}</span>
          </div>
        </div>
        <VanEmpty v-if="finished && rows.length === 0" description="暂无数据" />
      </VanList>
    </VanPullRefresh>
  </div>
</template>

<style scoped>
.mobile-card-list {
  min-height: 120px;
}
.m-card {
  margin: 0 12px 10px;
  padding: 12px 14px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 6%);
}
.m-card__title {
  font-size: 15px;
  font-weight: 600;
  color: #323233;
}
.m-card__subtitle {
  margin-top: 2px;
  font-size: 13px;
  color: #969799;
}
.m-card__kv {
  display: flex;
  margin-top: 6px;
  font-size: 13px;
  line-height: 18px;
}
.m-card__kv-label {
  flex: none;
  margin-right: 8px;
  color: #969799;
}
.m-card__kv-value {
  color: #323233;
  word-break: break-all;
}
</style>
