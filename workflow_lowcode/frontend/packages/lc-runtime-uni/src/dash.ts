/**
 * @lc/runtime-uni/dash：仪表盘组件族出码数据层（Task 7.2）。
 *
 * 语义对位 web DashKpi / DashNotice / DashTodo 的取数契约：
 *  · useUniKpi：GET /v1/data-sources/:refId/aggregate（group=__all__ 单行结果）→
 *    rows[0].value（Number 归一，空行集回 0）；失败静默（value 置 null + failed 置位，
 *    对位 web「仪表盘一个组件失败不干扰其他组件」，uni.request 侧 silent 不 toast）。
 *  · useUniNotice：GET /v1/notifications（messageType=PUBLIC，page=1，size=limit）→
 *    data.rows / data.total（用户端消息 PageResult）。公告数据来自用户端消息接口，
 *    没有数据源键——出码面不出现 refId。
 *  · useUniTodo：待办 GET /v1/tasks（assignee）、已办 GET /v1/tasks/historic（userId）→
 *    data.content / data.totalElements（PageResponse）。身份硬约束（web DashTodo 注释：
 *    assignee/userId 一律取当前登录用户，绝不成配置）——产物从本地存储 lc_user_id 取，
 *    未登录不发请求（后端拿空 assignee 会查出全量）。orderBy 仅待办有（服务端已办按
 *    办结时间排序，无该参数）。
 * 查询参数与行映射拆纯函数（单测无需 uni 全局），composable 只做请求器与状态接线；
 * 请求器注入面与 data.ts/list.ts 同口径（缺省 uniRequest：token + 租户头）。
 * dash-filter 广播联动（setFilter/refresh 事件面）产物无实例登记表，归 7.x 后续任务。
 */
import { ref } from 'vue'
import { uniRequest, type R, type UniRequestCall } from './http'

/** 注入面：与 list/data 同款（单测注入假 request） */
type UniDashRequest = <T>(call: UniRequestCall) => Promise<R<T>>

// ==================== dash-kpi ====================

/** aggregate 查询参数（纯函数）：group=__all__ 固定；metric/filter 空值剔除（对位 axios params 省略 null） */
export function buildUniKpiQuery(input: { agg: string; metric?: unknown; filter?: string }): {
  group: string
  agg: string
  metric?: unknown
  filter?: string
} {
  const out: { group: string; agg: string; metric?: unknown; filter?: string } = { group: '__all__', agg: input.agg }
  if (input.metric !== null && input.metric !== undefined && input.metric !== '') out.metric = input.metric
  if (input.filter) out.filter = input.filter
  return out
}

/** 单行结果 → 数值（纯函数）：rows[0].value Number 归一；空行集回 0（web 契约） */
export function uniKpiValueOf(rows: unknown): number {
  const list = Array.isArray(rows) ? rows : []
  const first = list[0] as { value?: unknown } | undefined
  const v = Number(first?.value ?? 0)
  return Number.isFinite(v) ? v : 0
}

export interface UniKpiOptions {
  refId: string
  agg: string
  metric?: string | null
  filter?: string
  request?: UniDashRequest
}

export function useUniKpi(options: UniKpiOptions) {
  const request = options.request ?? uniRequest({ tenantHeader: 'X-Tenant-Id' })
  const value = ref<number | null>(null)
  const failed = ref(false)
  const loading = ref(false)

  /** 重取：失败静默降级（value null + failed 置位），不抛出 */
  async function reload(): Promise<void> {
    if (!options.refId) {
      failed.value = true
      return
    }
    loading.value = true
    try {
      const res = await request<{ rows?: unknown[] }>({
        url: `/v1/data-sources/${options.refId}/aggregate`,
        data: buildUniKpiQuery({ agg: options.agg, metric: options.metric, filter: options.filter }),
        silent: true,
      })
      value.value = uniKpiValueOf(res.data?.rows)
      failed.value = false
    } catch {
      value.value = null
      failed.value = true
    } finally {
      loading.value = false
    }
  }

  return { value, failed, loading, reload }
}

// ==================== dash-notice ====================

/** 通知列表参数（纯函数）：messageType=PUBLIC 首页 size=limit（web DashNotice 同参） */
export function buildUniNoticeParams(limit: number): { messageType: string; page: number; size: number } {
  return { messageType: 'PUBLIC', page: 1, size: limit }
}

/** PageResult → { rows, total }（纯函数）：total Number 归一；无 data 回空 */
export function uniNoticeRowsOf(data: unknown): { rows: Array<Record<string, unknown>>; total: number } {
  const d = (data ?? {}) as { rows?: unknown[]; total?: unknown }
  const rows = Array.isArray(d.rows) ? (d.rows as Array<Record<string, unknown>>) : []
  const total = Number(d.total ?? rows.length)
  return { rows, total: Number.isFinite(total) ? total : rows.length }
}

export interface UniNoticeOptions {
  limit?: number
  request?: UniDashRequest
}

export function useUniNotice(options: UniNoticeOptions = {}) {
  const request = options.request ?? uniRequest({ tenantHeader: 'X-Tenant-Id' })
  const rows = ref<Array<Record<string, unknown>>>([])
  const total = ref(0)
  const loading = ref(false)

  /** 重取：失败静默（rows 清空，对位 web catch 口径），不抛出 */
  async function reload(): Promise<void> {
    loading.value = true
    try {
      const res = await request<{ rows?: unknown[]; total?: unknown }>({
        url: '/v1/notifications',
        data: buildUniNoticeParams(options.limit ?? 6),
        silent: true,
      })
      const next = uniNoticeRowsOf(res.data)
      rows.value = next.rows
      total.value = next.total
    } catch {
      rows.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  return { rows, total, loading, reload }
}

// ==================== dash-todo ====================

export interface UniTodoParamsInput {
  view: 'todo' | 'done'
  limit: number
  orderBy?: string
  userId: string
}

/** 任务列表参数（纯函数）：todo=assignee+orderBy（可选）、done=userId；首页 size=limit */
export function buildUniTodoParams(input: UniTodoParamsInput): Record<string, unknown> {
  const page = { page: 1, size: input.limit }
  if (input.view === 'done') return { userId: input.userId, ...page }
  return input.orderBy ? { assignee: input.userId, ...page, orderBy: input.orderBy } : { assignee: input.userId, ...page }
}

/** PageResponse → { rows, total }（纯函数）：content/totalElements 对位；无 data 回空 */
export function uniTodoRowsOf(data: unknown): { rows: Array<Record<string, unknown>>; total: number } {
  const d = (data ?? {}) as { content?: unknown[]; totalElements?: unknown }
  const rows = Array.isArray(d.content) ? (d.content as Array<Record<string, unknown>>) : []
  const total = Number(d.totalElements ?? rows.length)
  return { rows, total: Number.isFinite(total) ? total : rows.length }
}

/** 身份来源：产物侧登录用户 id 的本地存储键（Task 10.3 登录接线负责写入） */
export const LC_USER_ID_KEY = 'lc_user_id'

export interface UniTodoOptions {
  view?: 'todo' | 'done'
  limit?: number
  orderBy?: string
  /** 登录用户 id（composable 不读全局，由产物接线传值；未登录传空串） */
  userId: string
  request?: UniDashRequest
}

export function useUniTodo(options: UniTodoOptions) {
  const request = options.request ?? uniRequest({ tenantHeader: 'X-Tenant-Id' })
  const view = options.view ?? 'todo'
  const limit = options.limit ?? 8
  const rows = ref<Array<Record<string, unknown>>>([])
  const total = ref(0)
  const loading = ref(false)
  /** 空态文案（对位 web：未登录 / 无数据 / 失败各有措辞） */
  const empty = ref('')

  /** 重取：未登录不发请求；失败静默（rows 清空 + empty 文案），不抛出 */
  async function reload(): Promise<void> {
    const userId = String(options.userId ?? '')
    if (!userId) {
      rows.value = []
      total.value = 0
      empty.value = '未获取到当前登录用户'
      return
    }
    loading.value = true
    try {
      const res = await request<{ content?: unknown[]; totalElements?: unknown }>({
        url: view === 'done' ? '/v1/tasks/historic' : '/v1/tasks',
        data: buildUniTodoParams({ view, limit, orderBy: options.orderBy, userId }),
        silent: true,
      })
      const next = uniTodoRowsOf(res.data)
      rows.value = next.rows
      total.value = next.total
      empty.value = rows.value.length ? '' : view === 'done' ? '没有已办任务' : '没有待办任务'
    } catch {
      rows.value = []
      total.value = 0
      empty.value = view === 'done' ? '没有已办任务' : '没有待办任务'
    } finally {
      loading.value = false
    }
  }

  return { rows, total, loading, empty, reload }
}
