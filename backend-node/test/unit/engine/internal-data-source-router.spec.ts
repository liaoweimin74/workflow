import { describe, expect, it } from 'vitest'
import { InternalDataSourceRouter } from '../../../src/engine/datasource/internal-data-source-router'
import type { DataSourceRef } from '../../../src/engine/datasource/adapter/data-source-adapter'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * `internal://` 派发路由的单测。
 *
 * 契约场景（「数据源行数据写路径」）只覆盖到**目标分支里那几条错误形态**
 * （WORKFLOW 只读 / SYSTEM 不支持 / SQL 未绑定表单 / API 未配置），
 * 覆盖不到路由本身：`resolve` 的返回值在 Node 侧没有消费者，
 * 它的价值全在**校验与 allowlist**上 —— 而其中很大一部分分支
 * （未注册 sourceKey、不支持的操作、未知类型）在契约里根本不可达，
 * 因为上游创建端点已经先把非法 sourceKey 拦掉了。
 *
 * 因此这里的用例是「与 Java 逐条对照」的，而不是「golden 的补充说明」。
 */

const router = new InternalDataSourceRouter()

function ref(partial: Partial<DataSourceRef>): DataSourceRef {
  return {
    id: 'ds-1',
    tenantId: 'default',
    name: '测试数据源',
    type: 'FORM',
    formKey: null,
    sourceKey: null,
    params: null,
    status: 'ENABLED',
    ...partial,
  }
}

/** 在租户上下文里执行（`resolve` 会先取租户，缺租户会抛）。 */
function resolve(dataSource: DataSourceRef, operation: string) {
  return runWithTenant('default', () => router.resolve(dataSource, operation))
}

/** 断言抛出的消息并返回它。 */
function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('预期抛错，但没有抛')
}

describe('InternalDataSourceRouter.resolve / FORM 与 SQL', () => {
  it('FORM 的五个操作各映射到一个端点上', () => {
    const ds = ref({ type: 'FORM', formKey: 'person' })
    expect(resolve(ds, 'list')).toEqual({
      controller: 'BizDataController',
      method: 'query',
      httpMethod: 'GET',
      path: '/api/v1/biz-data/person',
    })
    expect(resolve(ds, 'get').path).toBe('/api/v1/biz-data/person/{id}')
    expect(resolve(ds, 'create')).toEqual({
      controller: 'BizDataController',
      method: 'create',
      httpMethod: 'POST',
      path: '/api/v1/biz-data/person',
    })
    expect(resolve(ds, 'update')).toEqual({
      controller: 'BizDataController',
      method: 'update',
      httpMethod: 'PUT',
      path: '/api/v1/biz-data/person/{id}',
    })
    expect(resolve(ds, 'delete')).toEqual({
      controller: 'BizDataController',
      method: 'delete',
      httpMethod: 'DELETE',
      path: '/api/v1/biz-data/person/{id}',
    })
  })

  it('FORM 缺 formKey → 400（消息与其他路径不同，不能复用 SQL 那条）', () => {
    expect(messageOf(() => resolve(ref({ type: 'FORM', formKey: null }), 'create'))).toBe(
      'FORM 数据源缺少 formKey',
    )
    expect(messageOf(() => resolve(ref({ type: 'FORM', formKey: '   ' }), 'delete'))).toBe(
      'FORM 数据源缺少 formKey',
    )
  })

  it('FORM 未知操作 → 400「不支持的操作」', () => {
    expect(messageOf(() => resolve(ref({ type: 'FORM', formKey: 'person' }), 'explore'))).toBe(
      '不支持的操作: explore',
    )
  })

  it('SQL 有 formKey → 走与 FORM 相同的表单端点', () => {
    expect(resolve(ref({ type: 'SQL', formKey: 'leave_apply_biz' }), 'create')).toEqual({
      controller: 'BizDataController',
      method: 'create',
      httpMethod: 'POST',
      path: '/api/v1/biz-data/leave_apply_biz',
    })
  })

  it('SQL 无 formKey → **返回虚拟端点而不是报错**（Java 的旁路）', () => {
    // 这条最容易被"顺手统一"成报错：Java 显式写明「仅用于租户上下文验证」。
    expect(resolve(ref({ type: 'SQL', formKey: null }), 'create')).toEqual({
      controller: 'SqlDataSource',
      method: 'query',
      httpMethod: 'GET',
      path: '/api/v1/sql-data-source',
    })
    expect(resolve(ref({ type: 'SQL', formKey: '  ' }), 'delete').controller).toBe('SqlDataSource')
  })
})

describe('InternalDataSourceRouter.resolve / SYSTEM allowlist', () => {
  it('user-tree 支持 list/get/create/delete', () => {
    const ds = ref({ type: 'SYSTEM', sourceKey: 'user-tree' })
    expect(resolve(ds, 'list').path).toBe('/api/v1/internal/system/users')
    expect(resolve(ds, 'get').path).toBe('/api/v1/internal/system/users/{id}')
    expect(resolve(ds, 'create')).toEqual({
      controller: 'SystemInternalController',
      method: 'createUser',
      httpMethod: 'POST',
      path: '/api/v1/internal/system/user',
    })
    expect(resolve(ds, 'delete').path).toBe('/api/v1/internal/system/user/{id}')
  })

  it('dept-tree 支持 list/create/delete', () => {
    const ds = ref({ type: 'SYSTEM', sourceKey: 'dept-tree' })
    expect(resolve(ds, 'list').path).toBe('/api/v1/internal/system/dept-tree')
    expect(resolve(ds, 'create').path).toBe('/api/v1/internal/system/dept')
    expect(resolve(ds, 'delete').path).toBe('/api/v1/internal/system/dept/{id}')
  })

  it.each([
    ['dept-tree', 'get'],
    ['dept-tree', 'update'],
    ['user-tree', 'update'],
  ])('%s 不支持的操作 %s → 400，且消息里带 sourceKey', (sourceKey, operation) => {
    expect(messageOf(() => resolve(ref({ type: 'SYSTEM', sourceKey }), operation))).toBe(
      `${sourceKey} 不支持的操作: ${operation}`,
    )
  })

  it('未注册的 sourceKey → 400（allowlist 的意义所在）', () => {
    expect(messageOf(() => resolve(ref({ type: 'SYSTEM', sourceKey: 'role-tree' }), 'list'))).toBe(
      '未注册的系统数据源: role-tree',
    )
  })

  it('缺 sourceKey → 400', () => {
    expect(messageOf(() => resolve(ref({ type: 'SYSTEM', sourceKey: null }), 'list'))).toBe(
      'SYSTEM 数据源缺少 sourceKey',
    )
  })
})

describe('InternalDataSourceRouter.resolve / 其他类型', () => {
  it.each(['API', 'WORKFLOW'])('%s 不在 internal:// 的派发范围内 → 400', (type) => {
    expect(messageOf(() => resolve(ref({ type, formKey: 'x' }), 'list'))).toBe(
      `不支持的内部数据源类型: ${type}`,
    )
  })
})
