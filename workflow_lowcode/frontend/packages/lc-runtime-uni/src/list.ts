/**
 * @lc/runtime-uni/list：出码列表页数据层（Task 5.1）。
 *
 * 语义对位 web PageDataCards.fetchApi：GET /v1/data-sources/:refId/data
 * （params page/size/filter）→ records → rows（{...data, id, version}，回填写入依赖
 * 后两个键）。web 的分页条映射成 uni 触底加载（loadMore + finished）；pagination=false
 * → size=-1 全量、触底无效（design「触底分页与 pageSize/pageSizes 语义映射」口径）。
 * 查询条件与行映射拆成纯函数（buildUniListQuery/uniListRowsOf）——单测无需 uni 全局；
 * useUniList 只做请求器与状态的接线。
 */
import { computed, ref } from 'vue'
import { uniRequest, type R, type UniRequestCall } from './http'

export interface UniListFilterCondition {
  column: string
  op: 'eq' | 'like'
  value: unknown
}

export interface UniListSearchField {
  prop: string
  label?: string
}

export interface UniListQueryInput {
  page: number
  size: number
  /** 搜索条关键字：like 命中全部 searchFields（对位 web searchFields → like 硬编码） */
  keyword?: string
  /** 筛选抽屉逐字段输入：like（对位 web params[field.prop] → like） */
  fieldValues?: Record<string, unknown>
  /** 链 set-filter 注入的等值条件（对位 web currentFilter → eq） */
  filters?: UniListFilterCondition[]
  searchFields?: string[]
  /** false → 全量（size=-1，无 page 参数） */
  pagination?: boolean
}

/** 查询参数（纯函数）：空值条件剔除；conditions 非空才出 filter JSON */
export function buildUniListQuery(input: UniListQueryInput): { page?: number; size: number; filter?: string } {
  const conditions = [
    ...(input.keyword
      ? (input.searchFields ?? []).map((column) => ({ column, op: 'like' as const, value: input.keyword }))
      : []),
    ...Object.entries(input.fieldValues ?? {})
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([column, v]) => ({ column, op: 'like' as const, value: v })),
    ...(input.filters ?? []).filter((c) => c.value !== '' && c.value !== null && c.value !== undefined),
  ]
  const params: { page?: number; size: number; filter?: string } =
    input.pagination === false ? { size: -1 } : { page: Math.max(1, input.page), size: input.size }
  if (conditions.length) params.filter = JSON.stringify({ logic: 'AND', conditions })
  return params
}

/** records → 行（纯函数）：展开 data、id/version 提到行上——回填写入与 :key 依赖这两个键 */
export function uniListRowsOf(records: unknown): Array<Record<string, unknown>> {
  const list = Array.isArray(records) ? records : []
  return list.map((r: any) => ({ ...(r?.data ?? {}), id: r?.id, version: r?.version }))
}

export interface UniListOptions {
  refId: string
  /** 页大小（缺省 20，与 web PageDataCards defaultPageSize 对齐） */
  pageSize?: number
  /** false → 全量取数，触底加载停用（缺省 true） */
  pagination?: boolean
  /** 搜索条关键字命中的字段面（emit 侧从契约 searchFields 生成） */
  searchFields?: UniListSearchField[]
  /** 请求器注入（缺省 uniRequest 缺省配置：token + 租户头，baseURL=/api 平台前缀） */
  request?: <T>(call: UniRequestCall) => Promise<R<T>>
}

/**
 * 出码列表页的数据状态与动作。模板消费解构后的 ref（script setup 顶层自动解包），
 * handler 调实例方法（reload/loadMore/applyFilter/...）。
 */
export function useUniList(options: UniListOptions) {
  const request = options.request ?? uniRequest({ tenantHeader: 'X-Tenant-Id' })
  const rows = ref<Array<Record<string, unknown>>>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = options.pageSize ?? 20
  const pagination = options.pagination !== false
  const loading = ref(false)
  const finished = computed(() => (pagination ? rows.value.length >= total.value : true))
  const keyword = ref('')
  const fieldValues = ref<Record<string, string>>({})
  const filters = ref<UniListFilterCondition[]>([])

  async function fetchRows(reset: boolean): Promise<void> {
    if (!options.refId) return
    loading.value = true
    try {
      const query = buildUniListQuery({
        page: page.value,
        size: pageSize,
        keyword: keyword.value,
        fieldValues: fieldValues.value,
        searchFields: (options.searchFields ?? []).map((f) => f.prop),
        filters: filters.value,
        pagination,
      })
      const res = await request<{ records?: unknown[]; total?: number }>({
        url: `/v1/data-sources/${options.refId}/data`,
        data: query,
      })
      const next = uniListRowsOf(res.data?.records)
      rows.value = reset ? next : [...rows.value, ...next]
      total.value = res.data?.total ?? rows.value.length
    } finally {
      loading.value = false
    }
  }

  /** 回首页重查：搜索/筛选变化后的统一入口 */
  async function reload(): Promise<void> {
    page.value = 1
    await fetchRows(true)
  }

  /** 触底加载下一页（全量口径或已取完时不动） */
  async function loadMore(): Promise<void> {
    if (!pagination || loading.value || finished.value) return
    page.value += 1
    await fetchRows(false)
  }

  /** 搜索确认：关键字 + 抽屉字段值生效 */
  async function onSearch(): Promise<void> {
    await reload()
  }

  /** 链 set-filter 注入：eq 条件按列 upsert 后重查（对位 web setFilter({ [字段]: 值 })） */
  async function applyFilter(patch: Record<string, unknown>): Promise<void> {
    for (const [column, value] of Object.entries(patch)) {
      const hit = filters.value.find((c) => c.column === column)
      if (hit) hit.value = value
      else filters.value.push({ column, op: 'eq', value })
    }
    await reload()
  }

  /** 清空全部搜索/筛选状态后重查（抽屉「重置」） */
  async function resetSearch(): Promise<void> {
    keyword.value = ''
    fieldValues.value = {}
    filters.value = []
    await reload()
  }

  /** 跳页（链 set-page）：页码钳正数 */
  async function gotoPage(n: number): Promise<void> {
    const target = Math.floor(n)
    if (!Number.isFinite(target) || target < 1 || target === page.value) return
    page.value = target
    await fetchRows(true)
  }

  /** 行删除：DELETE 后本地移除（对位 web deleteData+refresh，移动端免整页回卷） */
  async function removeRow(rowId: string): Promise<void> {
    await request({ url: `/v1/data-sources/${options.refId}/data/${rowId}`, method: 'DELETE' })
    const i = rows.value.findIndex((r) => String(r.id) === rowId)
    if (i >= 0) rows.value.splice(i, 1)
    total.value = Math.max(0, total.value - 1)
  }

  return {
    rows,
    total,
    page,
    loading,
    finished,
    keyword,
    fieldValues,
    filters,
    reload,
    loadMore,
    onSearch,
    applyFilter,
    resetSearch,
    gotoPage,
    removeRow,
  }
}
