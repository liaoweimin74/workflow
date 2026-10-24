// ----- Task 7.2: @lc/runtime-uni/dash —— 仪表盘组件族出码数据层 -----
// 语义对位 web DashKpi/DashNotice/DashTodo 取数契约：
//  · useUniKpi：GET /v1/data-sources/:refId/aggregate（group=__all__ 单行）→ rows[0].value；
//    失败静默（failed 置位、value 置 null，对位 web「一个组件失败不干扰其他组件」）。
//  · useUniNotice：GET /v1/notifications（messageType=PUBLIC，page=1，size=limit）
//    → data.rows / data.total（用户端消息 PageResult）。
//  · useUniTodo：待办 GET /v1/tasks（assignee）已办 GET /v1/tasks/historic（userId）
//    → data.content / data.totalElements；身份硬约束（登录用户），未登录不发请求。
// 查询参数与行映射拆纯函数（单测无需 uni 全局），composable 只做请求器与状态接线。

import { describe, expect, it } from 'vitest'

import {
  buildUniKpiQuery,
  buildUniNoticeParams,
  buildUniTodoParams,
  uniKpiValueOf,
  uniNoticeRowsOf,
  uniTodoRowsOf,
  useUniKpi,
  useUniNotice,
  useUniTodo,
} from '../src/dash'

describe('@lc/runtime-uni/dash 纯函数', () => {
  it('buildUniKpiQuery：group=__all__ 固定；metric/filter 空值剔除（对位 web axios params 省略 null）', () => {
    expect(buildUniKpiQuery({ agg: 'count', metric: null })).toEqual({ group: '__all__', agg: 'count' })
    expect(buildUniKpiQuery({ agg: 'sum', metric: 'order_amount', filter: '{"x":1}' })).toEqual({
      group: '__all__',
      agg: 'sum',
      metric: 'order_amount',
      filter: '{"x":1}',
    })
  })

  it('uniKpiValueOf：单行取 value（Number 归一）；空行集回 0（对位 web 契约）', () => {
    expect(uniKpiValueOf([{ key: '__all__', value: '7' }])).toBe(7)
    expect(uniKpiValueOf([{ value: 42 }])).toBe(42)
    expect(uniKpiValueOf([])).toBe(0)
    expect(uniKpiValueOf(undefined)).toBe(0)
  })

  it('buildUniNoticeParams：messageType=PUBLIC 首页 size=limit（web DashNotice 同参）', () => {
    expect(buildUniNoticeParams(5)).toEqual({ messageType: 'PUBLIC', page: 1, size: 5 })
  })

  it('uniNoticeRowsOf：rows/total（Number 归一）；无 data 回空', () => {
    expect(uniNoticeRowsOf({ rows: [{ id: 1 }], total: '9' })).toEqual({ rows: [{ id: 1 }], total: 9 })
    expect(uniNoticeRowsOf(undefined)).toEqual({ rows: [], total: 0 })
  })

  it('buildUniTodoParams：todo=assignee+orderBy；done=userId 且无 orderBy', () => {
    expect(buildUniTodoParams({ view: 'todo', limit: 5, orderBy: 'priority', userId: 'u1' })).toEqual({
      assignee: 'u1',
      page: 1,
      size: 5,
      orderBy: 'priority',
    })
    expect(buildUniTodoParams({ view: 'todo', limit: 5, userId: 'u1' })).toEqual({ assignee: 'u1', page: 1, size: 5 })
    expect(buildUniTodoParams({ view: 'done', limit: 5, userId: 'u1' })).toEqual({ userId: 'u1', page: 1, size: 5 })
  })

  it('uniTodoRowsOf：content/totalElements（对位 PageResponse）；无 data 回空', () => {
    expect(uniTodoRowsOf({ content: [{ taskId: 't1' }], totalElements: 3 })).toEqual({ rows: [{ taskId: 't1' }], total: 3 })
    expect(uniTodoRowsOf(undefined)).toEqual({ rows: [], total: 0 })
  })
})

describe('@lc/runtime-uni/dash useUniKpi（请求器接线）', () => {
  it('reload：GET aggregate（silent 对位 web 静默降级），值归一', async () => {
    const seen: unknown[] = []
    const store = useUniKpi({
      refId: 'ref_ds_1',
      agg: 'sum',
      metric: 'order_amount',
      request: async (call) => {
        seen.push(call)
        return { code: 200, data: { rows: [{ key: '__all__', value: 42 }] } }
      },
    })
    await store.reload()
    expect(seen[0]).toEqual({
      url: '/v1/data-sources/ref_ds_1/aggregate',
      data: { group: '__all__', agg: 'sum', metric: 'order_amount' },
      silent: true,
    })
    expect(store.value.value).toBe(42)
    expect(store.failed.value).toBe(false)
  })

  it('失败静默：value 置 null、failed 置位（不抛出）', async () => {
    const store = useUniKpi({
      refId: 'ref_ds_1',
      request: async () => {
        throw new Error('boom')
      },
    })
    await store.reload()
    expect(store.value.value).toBeNull()
    expect(store.failed.value).toBe(true)
  })

  it('refId 空：不发请求，failed 置位（对位 useUniList 防御）', async () => {
    const seen: unknown[] = []
    const store = useUniKpi({
      refId: '',
      request: async (call) => {
        seen.push(call)
        return { code: 200, data: {} }
      },
    })
    await store.reload()
    expect(seen).toEqual([])
    expect(store.failed.value).toBe(true)
  })
})

describe('@lc/runtime-uni/dash useUniNotice（请求器接线）', () => {
  it('reload：GET /v1/notifications（messageType=PUBLIC），rows/total/loading 接线', async () => {
    const seen: unknown[] = []
    const store = useUniNotice({
      limit: 5,
      request: async (call) => {
        seen.push(call)
        return { code: 200, data: { rows: [{ id: 1, title: '公告一' }], total: 9 } }
      },
    })
    await store.reload()
    expect(seen[0]).toEqual({ url: '/v1/notifications', data: { messageType: 'PUBLIC', page: 1, size: 5 }, silent: true })
    expect(store.rows.value).toEqual([{ id: 1, title: '公告一' }])
    expect(store.total.value).toBe(9)
    expect(store.loading.value).toBe(false)
  })
})

describe('@lc/runtime-uni/dash useUniTodo（请求器接线）', () => {
  it('todo 视图：GET /v1/tasks（assignee=登录用户）', async () => {
    const seen: unknown[] = []
    const store = useUniTodo({
      view: 'todo',
      limit: 5,
      orderBy: 'priority',
      userId: 'u1',
      request: async (call) => {
        seen.push(call)
        return { code: 200, data: { content: [{ taskId: 't1', processName: '请假' }], totalElements: 3 } }
      },
    })
    await store.reload()
    expect(seen[0]).toEqual({
      url: '/v1/tasks',
      data: { assignee: 'u1', page: 1, size: 5, orderBy: 'priority' },
      silent: true,
    })
    expect(store.rows.value).toEqual([{ taskId: 't1', processName: '请假' }])
    expect(store.total.value).toBe(3)
    expect(store.empty.value).toBe('')
  })

  it('done 视图：GET /v1/tasks/historic（userId，无 orderBy）', async () => {
    const seen: unknown[] = []
    const store = useUniTodo({
      view: 'done',
      userId: 'u1',
      request: async (call) => {
        seen.push(call)
        return { code: 200, data: { content: [], totalElements: 0 } }
      },
    })
    await store.reload()
    expect(seen[0]).toEqual({ url: '/v1/tasks/historic', data: { userId: 'u1', page: 1, size: 8 }, silent: true })
    expect(store.empty.value).toBe('没有已办任务')
  })

  it('身份硬约束：未登录（userId 空）不发请求，empty 提示对位 web', async () => {
    const seen: unknown[] = []
    const store = useUniTodo({
      userId: '',
      request: async (call) => {
        seen.push(call)
        return { code: 200, data: {} }
      },
    })
    await store.reload()
    expect(seen).toEqual([])
    expect(store.rows.value).toEqual([])
    expect(store.empty.value).toBe('未获取到当前登录用户')
  })

  it('失败静默：rows 清空 + empty 文案（对位 web catch 口径）', async () => {
    const store = useUniTodo({
      userId: 'u1',
      request: async () => {
        throw new Error('boom')
      },
    })
    await store.reload()
    expect(store.rows.value).toEqual([])
    expect(store.empty.value).toBe('没有待办任务')
  })
})
