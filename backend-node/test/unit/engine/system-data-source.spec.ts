import { describe, expect, it } from 'vitest'
import { UnifiedDataSourceAdapter } from '../../../src/engine/datasource/adapter/unified-data-source-adapter'
import { InternalDataSourceRouter } from '../../../src/engine/datasource/internal-data-source-router'
import type { DataSourceRef } from '../../../src/engine/datasource/adapter/data-source-adapter'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * SYSTEM 数据源读路径（`metadata` / `query` / `get`）的单测。
 *
 * 契约场景「SYSTEM 数据源读路径」已经端到端钉住了两个分支（user-tree 分页 / dept-tree 扁平化）
 * 与元数据常量、404 形态。这里补契约网够不到的边界：
 *   ① `metadata` 的列是常量、**不查库**（服务返回什么都无关）；
 *   ② `copyWithSortableFalse` **不拷 length**（golden 实测 length=null，
 *      而常量里写的是 64/128 —— 「顺手拷过来」会立刻分叉）；
 *   ③ `get` 的匹配是**字符串比较**（id 是数字，URL 里是字符串）；
 *   ④ dept-tree 分支下 `orgTree` 的递归扁平化顺序（父在前、子随后，深度优先）。
 */

interface OrgNode {
  id: number
  parentId: number | null
  label: string | null
  code: string | null
  children?: OrgNode[] | null
}

function ref(sourceKey: string): DataSourceRef {
  return {
    id: 'ds-1',
    tenantId: 'default',
    name: `${sourceKey} 数据源`,
    type: 'SYSTEM',
    formKey: null,
    sourceKey,
    params: null,
    status: 'ENABLED',
  }
}

function adapterWith(overrides: {
  orgTree?: OrgNode[]
  users?: Array<Record<string, unknown>>
  total?: number
}): UnifiedDataSourceAdapter {
  const users = overrides.users ?? []
  return new UnifiedDataSourceAdapter(
    {} as never,
    new InternalDataSourceRouter(),
    {
      orgTree: async () => overrides.orgTree ?? [],
      listUsersByUsername: async (_keyword: string | null, page: number, size: number) => ({
        rows: users,
        total: overrides.total ?? users.length,
        page,
        size,
      }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
  )
}

const emptyRequest = {
  filter: null,
  keyword: null,
  keywordColumn: null,
  sort: null,
  order: null,
  params: null,
  page: 1,
  size: 5,
}

describe('UnifiedDataSourceAdapter / SYSTEM 元数据', () => {
  it('user-tree → 6 列、dept-tree → 4 列；全部 sortable=false 且 length=null', async () => {
    const adapter = adapterWith({})
    const users = await runWithTenant('default', () => adapter.metadata(ref('user-tree')))
    expect(users.writable).toBe(false)
    expect(users.formKey).toBeNull()
    expect(users.columns.map((c) => c.key)).toEqual([
      'id',
      'username',
      'nickname',
      'orgId',
      'orgName',
      'status',
    ])
    expect(users.columns.every((c) => c.sortable === false)).toBe(true)
    // ⚠️ 关键：length 全是 null（Java 的 copyWithSortableFalse 只拷 key/label/columnType）
    expect(users.columns.every((c) => c.length === null)).toBe(true)

    const dept = await runWithTenant('default', () => adapter.metadata(ref('dept-tree')))
    expect(dept.columns.map((c) => c.key)).toEqual(['id', 'parentId', 'label', 'code'])
    expect(dept.columns.map((c) => c.label)).toEqual([
      '部门 ID',
      '上级部门 ID',
      '部门名称',
      '部门编码',
    ])
  })
})

describe('UnifiedDataSourceAdapter / SYSTEM 取数', () => {
  it('dept-tree：深度优先扁平化，空值给空串，且外壳**忽略请求分页**（page=0/size=行数）', async () => {
    const adapter = adapterWith({
      orgTree: [
        {
          id: 1,
          parentId: null,
          label: '总公司',
          code: '01',
          children: [
            { id: 2, parentId: 1, label: '武汉分公司', code: '0101', children: null },
            { id: 3, parentId: 1, label: null, code: null, children: [] },
          ],
        },
      ],
    })
    const page = await runWithTenant('default', () => adapter.query(ref('dept-tree'), emptyRequest))
    expect(page.records.map((r) => r.id)).toEqual(['1', '2', '3'])
    expect(page.records[0].data).toEqual({
      id: '1',
      parentId: '', // null → 空串（不是 null）
      label: '总公司',
      code: '01',
    })
    expect(page.records[2].data).toEqual({ id: '3', parentId: '1', label: '', code: '' })
    // 请求里给的是 page=1&size=5，返回的却是 page=0 / size=3
    expect({ total: page.total, page: page.page, size: page.size }).toEqual({
      total: 3,
      page: 0,
      size: 3,
    })
  })

  it('user-tree：走用户分页（page/size 来自请求），空值给空串', async () => {
    const adapter = adapterWith({
      users: [
        { id: 1, username: 'admin', nickname: '管理员', orgId: null, orgName: null, status: 1 },
        { id: 2, username: 'test', nickname: null, orgId: 7, orgName: '武汉', status: 0 },
      ],
      total: 9,
    })
    const page = await runWithTenant('default', () =>
      adapter.query(ref('user-tree'), { ...emptyRequest, page: 2, size: 5 }),
    )
    expect(page.records[0].data).toEqual({
      id: '1',
      username: 'admin',
      nickname: '管理员',
      orgId: '',
      orgName: '',
      status: 1,
    })
    expect(page.records[1].data).toEqual({
      id: '2',
      username: 'test',
      nickname: '',
      orgId: '7',
      orgName: '武汉',
      status: 0,
    })
    expect({ total: page.total, page: page.page, size: page.size }).toEqual({
      total: 9,
      page: 2,
      size: 5,
    })
  })

  it('get：在全部行里按 id 找（字符串比较），找不到 → 404「系统数据不存在」', async () => {
    const adapter = adapterWith({
      users: [{ id: 1, username: 'admin', nickname: '管理员', orgId: null, orgName: null, status: 1 }],
    })
    const found = await runWithTenant('default', () => adapter.get(ref('user-tree'), '1'))
    expect(found.id).toBe('1')
    const missing = await runWithTenant('default', () =>
      adapter.get(ref('user-tree'), 'nope').catch((e: unknown) => e),
    )
    expect((missing as Error).message).toBe('系统数据不存在: nope')
  })

  it('未注册的 sourceKey **先被 router 拦下**（验证顺序：router 在取数之前）', async () => {
    const adapter = adapterWith({ orgTree: [{ id: 1, parentId: null, label: 'X', code: 'c' }] })
    // ⚠️ Java 的 SYSTEM 分支是 `router.resolve(ds,"list")` → `systemQuery(...)`：
    //    allowlist 在**取数之前**，所以未注册的 sourceKey 拿到的是
    //    「未注册的系统数据源」而不是「走了部门树分支」。
    //    （上游创建端点也把 sourceKey 限制在 allowlist 内，这是第二道防线。）
    const error = await runWithTenant('default', () =>
      adapter.query(ref('role-tree'), emptyRequest).catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('未注册的系统数据源: role-tree')
  })
})
