import { describe, expect, it } from 'vitest'
import { PageDefinitionService } from '../../../src/engine/page/service/page-definition.service'
import type { PageDefinitionRow } from '../../../src/engine/page/repository/page-definition.repository'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 页面预览（`getPreviewByKey`，规格 U15/U32 残余）的单测。
 *
 * 契约场景「VIEW 页面编译与取数」已经端到端钉住了主链路：
 * DRAFT 的 VIEW 页面预览 → 返回的 schema 里**多出编译产物 `rule`**，
 * 而紧接着 `GET /pages/{id}` 读回的 schema **仍然没有 `rule`**（证明预览不落库）。
 *
 * 这里补 golden 够不到的两个分支：
 *   ① **非 VIEW（PAGE）** → 原样返回，不做编译（Java 的 `!"VIEW".equals(type)` 提前返回）；
 *   ② **schema 里已经有 `rule`**（发布过或残留）→ 原样返回，不重复编译
 *      （否则发布过的页面每次预览都会重编一次，白花代价且可能覆盖已发布产物）。
 */

function page(partial: Partial<PageDefinitionRow>): PageDefinitionRow {
  return {
    id: 'p1',
    tenant_id: 'default',
    name: '页面',
    key: 'k',
    type: 'VIEW',
    form_key: 'person',
    data_source_id: null,
    schema: null,
    version: 1,
    status: 'DRAFT',
    published_version: null,
    created_by: null,
    created_at: null,
    updated_at: null,
    ...partial,
  }
}

function serviceWith(row: PageDefinitionRow | null): {
  service: PageDefinitionService
  calls: string[]
} {
  const calls: string[] = []
  const service = new PageDefinitionService(
    { findLatestByKey: async () => row } as never,
    {
      validateForPublish: async () => {
        calls.push('validate')
      },
      resolveBindColumns: async () => {
        calls.push('resolveBindColumns')
        return [{ key: 'code' }]
      },
    } as never,
    {
      compile: () => {
        calls.push('compile')
        return JSON.stringify({ rule: [{ type: 'input', field: 'code' }], option: {}, display: 'table' })
      },
    } as never,
  )
  return { service, calls }
}

describe('PageDefinitionService.getPreviewByKey', () => {
  it('DRAFT 的 VIEW 页面：动态编译，且**不落库**（只有返回的副本带 rule）', async () => {
    const original = page({ schema: '{"searchFields":[{"key":"code"}]}' })
    const { service, calls } = serviceWith(original)
    const vo = await runWithTenant('default', () => service.getPreviewByKey('k'))
    expect(calls).toEqual(['validate', 'resolveBindColumns', 'compile'])
    // 返回的 schema 里合并进了 rule，且声明的键仍在前面（键序是契约的一部分）
    expect(vo.schema).toBe(
      '{"searchFields":[{"key":"code"}],"rule":[{"type":"input","field":"code"}],"option":{},"display":"table"}',
    )
    // 关键：**原对象没被改**（没有持久化副作用）
    expect(original.schema).toBe('{"searchFields":[{"key":"code"}]}')
  })

  it('PAGE 类型：原样返回，**不编译**', async () => {
    const { service, calls } = serviceWith(page({ type: 'PAGE', schema: '{"rule":[]}' }))
    const vo = await runWithTenant('default', () => service.getPreviewByKey('k'))
    expect(calls).toEqual([])
    expect(vo.schema).toBe('{"rule":[]}')
  })

  it('schema 已含 rule（发布过）：原样返回，不重复编译', async () => {
    const compiled = '{"searchFields":[],"rule":[{"type":"input"}],"option":{}}'
    const { service, calls } = serviceWith(page({ schema: compiled, status: 'PUBLISHED' }))
    const vo = await runWithTenant('default', () => service.getPreviewByKey('k'))
    expect(calls).toEqual([])
    expect(vo.schema).toBe(compiled)
  })

  it('页面不存在 → 404「页面不存在: <key>」（注意与已发布版的 404 消息不同）', async () => {
    const { service } = serviceWith(null)
    const error = await runWithTenant('default', () =>
      service.getPreviewByKey('missing').catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('页面不存在: missing')
  })
})
