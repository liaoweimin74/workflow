import { describe, expect, it } from 'vitest'
import { UnifiedDataSourceAdapter } from '../../../src/engine/datasource/adapter/unified-data-source-adapter'
import { InternalDataSourceRouter } from '../../../src/engine/datasource/internal-data-source-router'
import type { DataSourceRef } from '../../../src/engine/datasource/adapter/data-source-adapter'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 数据源适配器**写路径**（`create`/`update`/`delete`）的单测。
 *
 * 契约场景「数据源行数据写路径」已经端到端钉住了每种类型的**错误形态**
 * （WORKFLOW 只读 / SYSTEM 不支持 / SQL 未绑定表单 / 未启用 / API 未配置 / 真正落到 bizData 的增改删）。
 * 这里补的是契约网够不到的几类：
 *   ① `apiOperation` 的**兼容旁路只对 `list` 生效** —— 顶层 `action` 不能让
 *      create/update/delete 变得"已配置"；
 *   ② API `params` 的三条解析失败形态（缺 params / 非法 JSON / 不是对象）；
 *   ③ 操作**已配置**时显式抛「尚未迁移」（规格 U30），而不是假装成功；
 *   ④ 「未绑定表单」这条消息里必须带**数据源名**（场景只覆盖了一种名字）。
 */

const router = new InternalDataSourceRouter()

interface Recorded {
  calls: string[]
  adapter: UnifiedDataSourceAdapter
}

function adapterWith(): Recorded {
  const calls: string[] = []
  const bizDataService = {
    create: async (formKey: string, data: Record<string, unknown> | null) => {
      calls.push(`create:${formKey}:${JSON.stringify(data)}`)
      return { id: 'new-row-1' }
    },
    update: async (
      formKey: string,
      id: string,
      data: Record<string, unknown> | null,
      version: number | null,
    ) => {
      calls.push(`update:${formKey}:${id}:${JSON.stringify(data)}:${version ?? 'null'}`)
    },
    remove: async (formKey: string, id: string) => {
      calls.push(`remove:${formKey}:${id}`)
    },
  }
  return {
    calls,
    // 第三个参数是 SystemService（SYSTEM 数据源的读路径用它）；写路径用不到，给空壳
    // 第六参 SystemSourceQueryService：写路径用不到，给空壳（构造器已扩至 6 参）
    adapter: new UnifiedDataSourceAdapter(bizDataService as never, router, {} as never, {} as never, {} as never, {} as never),
  }
}

function ref(partial: Partial<DataSourceRef>): DataSourceRef {
  return {
    id: 'ds-1',
    tenantId: 'default',
    name: '契约数据源',
    type: 'FORM',
    formKey: null,
    sourceKey: null,
    params: null,
    status: 'ENABLED',
    ...partial,
  }
}

function inTenant<T>(fn: () => Promise<T> | T): Promise<T> | T {
  return runWithTenant('default', fn as () => T)
}

/**
 * 断言抛出的消息。
 *
 * ⚠️ 适配器的方法都是 `async`：抛错发生在微任务里，同步 `try/catch` **接不住**，
 *    只会留下一个 unhandled rejection，而断言照样"通过"。所以这里必须 `await`。
 */
async function rejectionOf(fn: () => unknown): Promise<string> {
  try {
    await fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('预期抛错，但没有抛')
}

describe('UnifiedDataSourceAdapter 写路径 / FORM 与 SQL', () => {
  it('FORM create 返回 bizDataService 给出的 id', async () => {
    const { adapter, calls } = adapterWith()
    const id = await inTenant(() =>
      adapter.create(ref({ type: 'FORM', formKey: 'person' }), { code: 'A' }),
    )
    expect(id).toBe('new-row-1')
    expect(calls).toEqual(['create:person:{"code":"A"}'])
  })

  it('FORM update 把 version 原样透传（null 就是 null，不在这里兜底成 1）', async () => {
    const { adapter, calls } = adapterWith()
    await inTenant(() =>
      adapter.update(ref({ type: 'FORM', formKey: 'person' }), 'row-1', { name: 'X' }, null),
    )
    await inTenant(() =>
      adapter.update(ref({ type: 'FORM', formKey: 'person' }), 'row-1', { name: 'Y' }, 7),
    )
    expect(calls).toEqual([
      'update:person:row-1:{"name":"X"}:null',
      'update:person:row-1:{"name":"Y"}:7',
    ])
  })

  it('FORM delete 走 remove', async () => {
    const { adapter, calls } = adapterWith()
    await inTenant(() => adapter.delete(ref({ type: 'FORM', formKey: 'person' }), 'row-1'))
    expect(calls).toEqual(['remove:person:row-1'])
  })

  it('FORM 缺 formKey 由 router 拦下、SQL 缺 formKey 由 requireFormKey 拦下，都进不到 bizData', async () => {
    const { adapter, calls } = adapterWith()
    expect(
      await rejectionOf(() =>
        inTenant(() => adapter.create(ref({ type: 'FORM', formKey: null }), {})),
      ),
    ).toBe('FORM 数据源缺少 formKey')
    expect(
      await rejectionOf(() => inTenant(() => adapter.create(ref({ type: 'SQL', formKey: null }), {}))),
    ).toBe('SQL 数据源未绑定表单，不支持create操作: 契约数据源')
    expect(
      await rejectionOf(() =>
        inTenant(() => adapter.update(ref({ type: 'SQL', formKey: ' ' }), 'r', {}, null)),
      ),
    ).toBe('SQL 数据源未绑定表单，不支持update操作: 契约数据源')
    expect(
      await rejectionOf(() =>
        inTenant(() => adapter.delete(ref({ type: 'SQL', formKey: null }), 'r')),
      ),
    ).toBe('SQL 数据源未绑定表单，不支持delete操作: 契约数据源')
    expect(calls).toEqual([])
  })

  it('SQL 绑定表单后落到与 FORM 同一条 bizData 写路径', async () => {
    const { adapter, calls } = adapterWith()
    const id = await inTenant(() =>
      adapter.create(ref({ type: 'SQL', formKey: 'leave_apply_biz' }), { reason: 'R' }),
    )
    expect(id).toBe('new-row-1')
    expect(calls).toEqual(['create:leave_apply_biz:{"reason":"R"}'])
  })
})

describe('UnifiedDataSourceAdapter 写路径 / WORKFLOW 与 SYSTEM', () => {
  it.each(['create', 'update', 'delete'] as const)('WORKFLOW %s 恒 400 只读', async (op) => {
    const { adapter, calls } = adapterWith()
    const ds = ref({ type: 'WORKFLOW', formKey: 'baoxiaodan' })
    const run = (): Promise<unknown> => {
      if (op === 'create') return adapter.create(ds, {})
      if (op === 'update') return adapter.update(ds, 'r', {}, null)
      return adapter.delete(ds, 'r')
    }
    expect(await rejectionOf(() => inTenant(run))).toBe('工作流表单数据源为只读，不支持该操作')
    expect(calls).toEqual([])
  })

  it('SYSTEM create/update → 「不支持」，且**不经过 router**', async () => {
    const { adapter, calls } = adapterWith()
    // 用一个"未注册"的 sourceKey：若 create/update 走了 router，消息会变成
    // 「未注册的系统数据源」—— 用这条反证 Java switch 里 SYSTEM 没有 router 调用。
    const ds = ref({ type: 'SYSTEM', sourceKey: 'role-tree' })
    expect(await rejectionOf(() => inTenant(() => adapter.create(ds, {})))).toBe(
      '该数据源不支持create: 契约数据源',
    )
    expect(await rejectionOf(() => inTenant(() => adapter.update(ds, 'r', {}, null)))).toBe(
      '该数据源不支持update: 契约数据源',
    )
    expect(calls).toEqual([])
  })

  it('SYSTEM delete **先过 router 再拒绝**（Java 注释：router allows for audit）', async () => {
    const { adapter } = adapterWith()
    expect(
      await rejectionOf(() =>
        inTenant(() => adapter.delete(ref({ type: 'SYSTEM', sourceKey: 'user-tree' }), 'r')),
      ),
    ).toBe('该数据源不支持delete: 契约数据源')
    // 未注册的 sourceKey 会被 router 先拦下 —— 这正是 delete 与 create/update 的结构差异
    expect(
      await rejectionOf(() =>
        inTenant(() => adapter.delete(ref({ type: 'SYSTEM', sourceKey: 'role-tree' }), 'r')),
      ),
    ).toBe('未注册的系统数据源: role-tree')
  })

  it('未知类型落到 default 分支', async () => {
    const { adapter } = adapterWith()
    expect(await rejectionOf(() => inTenant(() => adapter.create(ref({ type: 'FILE' }), {})))).toBe(
      '该数据源不支持create: 契约数据源',
    )
  })
})

describe('UnifiedDataSourceAdapter 写路径 / API', () => {
  it('params 的三条解析失败形态（消息都带数据源名）', async () => {
    const { adapter } = adapterWith()
    expect(
      await rejectionOf(() => inTenant(() => adapter.create(ref({ type: 'API', params: null }), {}))),
    ).toBe('API 数据源缺少 params: 契约数据源')
    expect(
      await rejectionOf(() =>
        inTenant(() => adapter.create(ref({ type: 'API', params: '{oops' }), {})),
      ),
    ).toBe('API 数据源 params 不是合法 JSON: 契约数据源')
    expect(
      await rejectionOf(() => inTenant(() => adapter.create(ref({ type: 'API', params: '[]' }), {}))),
    ).toBe('API 数据源 params 必须是 JSON 对象: 契约数据源')
  })

  it.each(['create', 'update', 'delete'] as const)(
    'API 未配置 %s 操作 → 400（顶层 action 不构成"已配置"）',
    async (op) => {
      const { adapter } = adapterWith()
      // `{"action":"/x"}` 正是创建端点接受的形状（LookupFetchConfig 契约），
      // 但 `operation()` 的兼容旁路**只对 list 生效**，写路径必须显式配 create/update/delete。
      const ds = ref({ type: 'API', params: '{"action":"/api/v1/ping"}' })
      const run = (): Promise<unknown> => {
        if (op === 'create') return adapter.create(ds, {})
        if (op === 'update') return adapter.update(ds, 'r', {}, null)
        return adapter.delete(ds, 'r')
      }
      expect(await rejectionOf(() => inTenant(run))).toBe(`API 数据源未配置 ${op} 操作: 契约数据源`)
    },
  )

  it('API 配了操作但缺 action → 400（这条消息**不带**数据源名，照抄 Java）', async () => {
    const { adapter } = adapterWith()
    const ds = ref({ type: 'API', params: '{"create":{"method":"POST"}}' })
    expect(await rejectionOf(() => inTenant(() => adapter.create(ds, {})))).toBe(
      'API 数据源 create 操作缺少 action',
    )
  })

  it('API 配好了操作 → **真的发出请求**（U30 已关闭），出站失败的消息来自执行器', async () => {
    // ⚠️ 这条以前断言的是「显式抛尚未迁移」——`HttpLogicExecutor` 迁移之后，
    //    写路径也会真的出站调用了（失败形态由执行器统一给出）。
    const calls: string[] = []
    const adapter = new UnifiedDataSourceAdapter(
      {} as never,
      router,
      {} as never,
      {
        execute: async (url: string, method: string) => {
          calls.push(`${method} ${url}`)
          throw new Error('HTTP request failed after 1 attempts')
        },
      } as never,
      {} as never,
      {} as never,
    )
    const ds = ref({ type: 'API', params: '{"delete":{"action":"http://x/d","method":"delete"}}' })
    const message = await rejectionOf(() => inTenant(() => adapter.delete(ds, 'r')))
    expect(message).toBe('HTTP request failed after 1 attempts')
    // 方法被**转成大写**（Java 的 opMethod 行为）
    expect(calls).toEqual(['DELETE http://x/d'])
  })
})
