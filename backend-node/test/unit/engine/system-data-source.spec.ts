import { describe, expect, it, vi } from 'vitest'
import { UnifiedDataSourceAdapter } from '../../../src/engine/datasource/adapter/unified-data-source-adapter'
import { InternalDataSourceRouter } from '../../../src/engine/datasource/internal-data-source-router'
import { SystemSourceQueryService } from '../../../src/engine/datasource/service/system-source-query.service'
import { builtInSourceByKey } from '../../../src/engine/datasource/service/system-source-catalog'
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
  systemSourceQuery?: Record<string, unknown>
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
    (overrides.systemSourceQuery ?? {}) as never,
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

  it('dept-tree：keyword 非空时忽略大小写过滤 label/code（子树仍遍历）；keyword 为空保持全量', async () => {
    const orgTree: OrgNode[] = [
      {
        id: 1,
        parentId: null,
        label: '总公司',
        code: '01',
        children: [
          { id: 2, parentId: 1, label: '武汉分公司', code: '0101', children: null },
          { id: 3, parentId: 1, label: '上海分公司', code: 'SH', children: null },
        ],
      },
    ]
    const adapter = adapterWith({ orgTree })
    // 命中 code（大小写不敏感）：只有上海分公司
    const byCode = await runWithTenant('default', () =>
      adapter.query(ref('dept-tree'), { ...emptyRequest, keyword: 'sh' }),
    )
    expect(byCode.records.map((r) => r.id)).toEqual(['3'])
    // 命中 label：只有武汉分公司
    const byLabel = await runWithTenant('default', () =>
      adapter.query(ref('dept-tree'), { ...emptyRequest, keyword: '武汉' }),
    )
    expect(byLabel.records.map((r) => r.id)).toEqual(['2'])
    // 空白串视作无 keyword：全量返回
    const blank = await runWithTenant('default', () =>
      adapter.query(ref('dept-tree'), { ...emptyRequest, keyword: '   ' }),
    )
    expect(blank.records.map((r) => r.id)).toEqual(['1', '2', '3'])
  })

  it('sys-posts：路由到 SystemSourceQueryService 并透传请求（V45 新增内建源）', async () => {
    const querySpy = vi.fn().mockResolvedValue({
      records: [{ id: '5', data: { id: '5', postName: '会计', postCode: 'FIN-01', description: '' }, version: null, createdAt: null, updatedAt: null }],
      total: 1,
      page: 1,
      size: 20,
    })
    const adapter = adapterWith({ systemSourceQuery: { query: querySpy } })
    const page = await runWithTenant('default', () =>
      adapter.query(ref('sys-posts'), { ...emptyRequest, keyword: '会计' }),
    )
    expect(querySpy).toHaveBeenCalledWith('sys-posts', expect.objectContaining({ keyword: '会计', page: 1, size: 5 }))
    expect(page.records[0].data).toEqual({ id: '5', postName: '会计', postCode: 'FIN-01', description: '' })
  })

  it('sys-posts：元数据 4 列（目录唯一事实源）', async () => {
    const adapter = adapterWith({
      systemSourceQuery: { columnsOf: async (key: string) => builtInSourceByKey(key)?.columns ?? [] },
    })
    const meta = await runWithTenant('default', () => adapter.metadata(ref('sys-posts')))
    expect(meta.writable).toBe(false)
    expect(meta.columns.map((c) => c.key)).toEqual(['id', 'postName', 'postCode', 'description'])
    expect(meta.columns.every((c) => c.length === null)).toBe(true)
  })
})

describe('SystemSourceQueryService / sys-posts 取数', () => {
  function serviceWith(listPosts: ReturnType<typeof vi.fn>): SystemSourceQueryService {
    return new SystemSourceQueryService(
      { listPosts } as never,
      {} as never,
      {} as never,
      {} as never,
    )
  }

  const req = (overrides: Record<string, unknown> = {}) => ({
    filter: null,
    keyword: null,
    keywordColumn: null,
    sort: null,
    order: null,
    params: null,
    page: 1,
    size: 20,
    ...overrides,
  })

  it('仅暴露启用岗位（status=1 硬过滤），字段空值给空串', async () => {
    const listPosts = vi.fn().mockResolvedValue({
      total: 2,
      page: 1,
      size: 20,
      rows: [
        { id: 5, postName: '会计', postCode: 'FIN-01', description: '财务核算' },
        { id: 6, postName: null, postCode: null, description: null },
      ],
    })
    const page = await serviceWith(listPosts).query('sys-posts', req())
    expect(listPosts).toHaveBeenCalledWith(1, 20, { keyword: null, status: 1 })
    expect(page.records[0].data).toEqual({ id: '5', postName: '会计', postCode: 'FIN-01', description: '财务核算' })
    expect(page.records[1].data).toEqual({ id: '6', postName: '', postCode: '', description: '' })
    expect({ total: page.total, page: page.page, size: page.size }).toEqual({ total: 2, page: 1, size: 20 })
  })

  it('keyword 透传给 listPosts；page 从 1 起钳制', async () => {
    const listPosts = vi.fn().mockResolvedValue({ total: 0, page: 3, size: 10, rows: [] })
    await serviceWith(listPosts).query('sys-posts', req({ page: 3, size: 10, keyword: '工程' }))
    expect(listPosts).toHaveBeenCalledWith(3, 10, { keyword: '工程', status: 1 })
  })

  it('handles 含 sys-posts；未知 sourceKey 仍报未注册', async () => {
    expect(SystemSourceQueryService.handles('sys-posts')).toBe(true)
    const error = await serviceWith(vi.fn()).query('sys-posts-x', req()).catch((e: unknown) => e)
    expect((error as Error).message).toBe('未注册的系统数据源: sys-posts-x')
  })
})
