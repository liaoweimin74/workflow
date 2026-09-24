import { describe, expect, it } from 'vitest'
import { FormDefinitionWriteService } from '../../../../src/engine/form/form-definition-write.service'
import { runWithTenant } from '../../../../src/framework/tenant/tenant-context'
import type { FormDefinitionRow } from '../../../../src/engine/form/repository/form-definition.repository'

/**
 * 表单发布的单测（对齐 Java `FormDefinitionService.publish`）。
 *
 * golden（场景「表单发布与建表」）覆盖了端到端与两类错误形态，
 * 这里补契约网**看不到**的部分：
 *   - 状态机的三条分支（只有 DRAFT/PUBLISHED 可发布、旧 PUBLISHED 降 ARCHIVED）；
 *   - 「内容未变化」的比对**必须排除自身**（否则重新发布恒等、永远报无需发布）；
 *   - 只有 `type=BUSINESS` 才建表、`page-list-cards` 与外部展示字段被过滤掉；
 *   - 写入的字段（status / publishedVersion）。
 */

function draft(overrides: Partial<FormDefinitionRow> = {}): FormDefinitionRow {
  return {
    id: 'f1',
    tenant_id: 'default',
    name: '契约发布表单',
    key: 'contract_pub_x',
    type: 'BUSINESS',
    schema: '[{"type":"input","field":"a"}]',
    column_config: JSON.stringify([{ key: 'a', columnType: 'VARCHAR', length: 64, required: true }]),
    version: 1,
    status: 'DRAFT',
    published_version: null,
    process_key: null,
    created_by: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

interface Harness {
  service: FormDefinitionWriteService
  /** publish 触发的数据源插入（syncOnCreated）。 */
  insertedSources: Array<Record<string, unknown>>
  updates: Array<{ id: string; patch: Partial<FormDefinitionRow> }>
  ensured: string[]
  ensuredSubs: string[]
}

function harness(options: {
  current?: FormDefinitionRow | null
  lastPublished?: FormDefinitionRow | null
} = {}): Harness {
  const updates: Array<{ id: string; patch: Partial<FormDefinitionRow> }> = []
  const ensured: string[] = []
  const ensuredSubs: string[] = []
  const insertedSources: Array<Record<string, unknown>> = []
  const service = new FormDefinitionWriteService(
    {
      findByIdAndTenantId: async () => (options.current === undefined ? draft() : options.current),
      findLatestPublishedByKey: async () => options.lastPublished ?? null,
      findLatestPublishedByKeyExcluding: async () => options.lastPublished ?? null,
      update: async (id: string, patch: Partial<FormDefinitionRow>) => {
        updates.push({ id, patch })
      },
    } as never,
    // 数据源同步：publish 会触发 `syncOnCreated`（`BUSINESS → FORM`）。
    // 这里给一个「查不到已有数据源 + 记录插入」的假仓库，让同步走完整条路径。
    {
      findByTenantIdAndFormKey: async () => null,
      insertDataSource: async (row: Record<string, unknown>) => {
        insertedSources.push(row)
      },
    } as never,
    {
      ensureTable: async (key: string) => {
        ensured.push(key)
      },
      ensureSubTable: async (key: string, field: string) => {
        ensuredSubs.push(`${key}.${field}`)
      },
    } as never,
  )
  return { service, updates, ensured, ensuredSubs, insertedSources }
}

describe('publish 状态机', () => {
  it('记录不存在 → 普通 Error「Form definition not found」（→ HTTP 500）', async () => {
    const { service } = harness({ current: null })
    await expect(runWithTenant('default', () => service.publish('ghost'))).rejects.toThrow(
      'Form definition not found: ghost',
    )
  })

  it('状态不是 DRAFT/PUBLISHED → 业务 400（HTTP 200 + body code）', async () => {
    const { service } = harness({ current: draft({ status: 'ARCHIVED' }) })
    await expect(runWithTenant('default', () => service.publish('f1'))).rejects.toMatchObject({
      code: 400,
      message: '仅草稿或已发布表单可发布，当前状态: ARCHIVED',
    })
  })

  it('DRAFT → PUBLISHED，并写入 publishedVersion', async () => {
    const { service, updates } = harness()
    const out = await runWithTenant('default', () => service.publish('f1'))
    expect(out.status).toBe('PUBLISHED')
    expect(out.publishedVersion).toBe(1)
    expect(updates[0].patch).toMatchObject({ status: 'PUBLISHED', published_version: 1 })
  })

  it('重新发布（当前已是 PUBLISHED）允许，且用「排除自身」的比对', async () => {
    const { service, updates } = harness({
      current: draft({ status: 'PUBLISHED', published_version: 1 }),
    })
    const out = await runWithTenant('default', () => service.publish('f1'))
    expect(out.status).toBe('PUBLISHED')
    // 排除自身后没有别的已发布记录 ⇒ 不做「内容未变化」判定 ⇒ 不会被误拒
    expect(updates.some((u) => u.patch.status === 'ARCHIVED')).toBe(false)
  })

  // ⚠️ 这条是「排除自身」的意义所在：不排除的话自己和自己比恒等，永远报无需发布
  it('存在另一条同 key 的已发布记录且 schema 相同 → 业务 400「内容未变化」', async () => {
    const { service } = harness({
      current: draft({ id: 'f2', status: 'DRAFT' }),
      lastPublished: draft({ id: 'f1', status: 'PUBLISHED' }),
    })
    await expect(runWithTenant('default', () => service.publish('f2'))).rejects.toMatchObject({
      code: 400,
      message: '表单内容未变化，无需发布',
    })
  })

  it('旧的已发布记录降为 ARCHIVED（同 key 的其它记录）', async () => {
    const { service, updates } = harness({
      current: draft({ id: 'f2', schema: '[{"type":"input","field":"b"}]' }),
      lastPublished: draft({ id: 'f1', status: 'PUBLISHED' }),
    })
    await runWithTenant('default', () => service.publish('f2'))
    expect(updates).toContainEqual({
      id: 'f1',
      patch: expect.objectContaining({ status: 'ARCHIVED' }),
    })
    expect(updates).toContainEqual({
      id: 'f2',
      patch: expect.objectContaining({ status: 'PUBLISHED', published_version: 1 }),
    })
  })
})

describe('publish 的建表（只有 BUSINESS）', () => {
  it('BUSINESS：建主表（列来自 column_config）', async () => {
    const { service, ensured } = harness()
    await runWithTenant('default', () => service.publish('f1'))
    expect(ensured).toEqual(['contract_pub_x'])
  })

  it('WORKFLOW：完全不建表', async () => {
    const { service, ensured } = harness({ current: draft({ type: 'WORKFLOW' }) })
    await runWithTenant('default', () => service.publish('f1'))
    expect(ensured).toEqual([])
  })

  it('带子列的字段会额外建子表；子表占位字段本身不进主表列', async () => {
    const { service, ensured, ensuredSubs } = harness({
      current: draft({
        column_config: JSON.stringify([
          { key: 'a', columnType: 'VARCHAR', length: 64 },
          {
            key: 'items',
            componentType: 'subForm',
            subColumns: [{ key: 'sku', columnType: 'VARCHAR', length: 32 }],
          },
        ]),
      }),
    })
    await runWithTenant('default', () => service.publish('f1'))
    // `items` 是子表占位字段 ⇒ 主表仍会建（因为有 a），子表另建一张
    expect(ensured).toEqual(['contract_pub_x'])
    expect(ensuredSubs).toEqual(['contract_pub_x.items'])
  })

  // ⚠️ `page-list-cards` 与「外部展示字段」都要被过滤掉：前者是仅展示外部数据的组件，
  //    后者的 key 由其 schema 声明 —— 两者都不该生成业务列（防旧版 column_config 残留误建列）
  it('page-list-cards 组件与外部展示字段都不参与建表', async () => {
    const { service, ensured } = harness({
      current: draft({
        schema: JSON.stringify([{ type: 'page-list-cards', field: 'extCol' }]),
        column_config: JSON.stringify([
          { key: 'a', columnType: 'VARCHAR', length: 64 },
          { key: 'extCol', columnType: 'VARCHAR', length: 64 },
          { key: 'cards1', columnType: 'JSON', componentType: 'page-list-cards' },
        ]),
      }),
    })
    // 三列里只剩 a（extCol 被 schema 声明为外部展示、cards1 是 page-list-cards 组件）
    // ⇒ 仍会建表，但**只带 a 一列**
    const out = await runWithTenant('default', () => service.publish('f1'))
    expect(out.status).toBe('PUBLISHED')
    expect(ensured).toEqual(['contract_pub_x'])
  })

  it('列全被过滤掉时不建表', async () => {
    const { service, ensured } = harness({
      current: draft({
        schema: '[]',
        column_config: JSON.stringify([
          { key: 'cards1', columnType: 'JSON', componentType: 'page-list-cards' },
        ]),
      }),
    })
    await runWithTenant('default', () => service.publish('f1'))
    expect(ensured).toEqual([])
  })
})

describe('publish 的校验链（错误消息逐字对齐 Java）', () => {
  it('column_config 为空 → 400', async () => {
    const { service } = harness({ current: draft({ column_config: null }) })
    await expect(runWithTenant('default', () => service.publish('f1'))).rejects.toMatchObject({
      code: 400,
      message: '业务表单发布前必须配置列映射（column_config）',
    })
  })

  it('schema 含白名单外组件 → 400（消息含组件名，白名单制拦截未知类型）', async () => {
    const { service } = harness({
      current: draft({ schema: JSON.stringify([{ type: 'userPicker', field: 'u' }]) }),
    })
    await expect(runWithTenant('default', () => service.publish('f1'))).rejects.toMatchObject({
      code: 400,
      message: '业务表单暂不支持组件（userPicker），请在设计器中使用标准组件后发布',
    })
  })

  it('schema 含 AI formgen 曾误造的不存在类型 → 400（白名单制根治 date/inputTextarea 漏网）', async () => {
    const { service } = harness({
      current: draft({
        schema: JSON.stringify([{ type: 'date', field: 'd1' }, { type: 'inputTextarea', field: 'r1' }]),
      }),
    })
    await expect(runWithTenant('default', () => service.publish('f1'))).rejects.toMatchObject({
      code: 400,
      message: '业务表单暂不支持组件（date、inputTextarea），请在设计器中使用标准组件后发布',
    })
  })

  // ⚠️ schema 为空串 ≠ 合法：Jackson 的 readTree("") 返回 MissingNode（不抛异常），
  //    于是「不是数组」→ 400「表单 schema 格式非法」。把它当成 "[]" 会吞掉这条错误。
  it('schema 为空串 → 400「表单 schema 格式非法」（不是"解析失败"）', async () => {
    const { service } = harness({ current: draft({ schema: '' }) })
    await expect(runWithTenant('default', () => service.publish('f1'))).rejects.toMatchObject({
      code: 400,
      message: '表单 schema 格式非法',
    })
  })

  it('schema 非法 JSON → 400「表单 schema 解析失败」', async () => {
    const { service } = harness({ current: draft({ schema: '{' }) })
    await expect(runWithTenant('default', () => service.publish('f1'))).rejects.toMatchObject({
      code: 400,
      message: '表单 schema 解析失败',
    })
  })

  it('列名为系统保留列 → 400', async () => {
    const { service } = harness({
      current: draft({
        column_config: JSON.stringify([{ key: 'tenant_id', columnType: 'VARCHAR', length: 64 }]),
      }),
    })
    await expect(runWithTenant('default', () => service.publish('f1'))).rejects.toMatchObject({
      code: 400,
      message: '列名 tenant_id 为系统保留列',
    })
  })

  it('storageMode=SUB_TABLE → 400「子表存储模式暂未实现」', async () => {
    const { service } = harness({
      current: draft({
        column_config: JSON.stringify([
          { key: 'a', columnType: 'VARCHAR', length: 64, storageMode: 'SUB_TABLE' },
        ]),
      }),
    })
    await expect(runWithTenant('default', () => service.publish('f1'))).rejects.toMatchObject({
      code: 400,
      message: '子表存储模式暂未实现: a',
    })
  })
})
