import { describe, expect, it } from 'vitest'
import { FormDefinitionWriteService } from '../../../../src/engine/form/form-definition-write.service'
import { runWithTenant } from '../../../../src/framework/tenant/tenant-context'
import type { FormDefinitionRow } from '../../../../src/engine/form/repository/form-definition.repository'

/**
 * 表单复制的单测（跨类型：WORKFLOW ↔ BUSINESS，新功能端点）。
 *
 * 覆盖：
 *   - 产物语义：新记录 DRAFT / version=1 / published_version=null / schema 原样；
 *   - 类型决定字段去留：column_config 只跟 BUSINESS、process_key 只跟 WORKFLOW；
 *   - 数据源同步：BUSINESS → FORM、WORKFLOW → WORKFLOW，name 跟随新表单名；
 *   - 错误形态：源不存在 / key 重复 → 普通 Error（HTTP 500），
 *     name/key 空白、type 非法 → BusinessException 400。
 * 发布时的校验（白名单拦截审批组件、列映射必填）由既有 publish 链承担，
 * publish.spec.ts 已覆盖，这里不重复。
 */

function source(overrides: Partial<FormDefinitionRow> = {}): FormDefinitionRow {
  return {
    id: 'src1',
    tenant_id: 'default',
    name: '请假申请',
    key: 'leave_apply',
    type: 'WORKFLOW',
    schema: '[{"type":"input","field":"reason"}]',
    column_config: null,
    version: 2,
    status: 'PUBLISHED',
    published_version: 1,
    process_key: 'leave_process',
    created_by: 'admin',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  }
}

interface Harness {
  service: FormDefinitionWriteService
  /** copy 插入的表单定义行。 */
  inserted: FormDefinitionRow[]
  /** copy 触发的数据源插入（syncOnCreated）。 */
  insertedSources: Array<Record<string, unknown>>
}

function harness(options: {
  current?: FormDefinitionRow | null
  existingKeys?: string[]
} = {}): Harness {
  const inserted: FormDefinitionRow[] = []
  const insertedSources: Array<Record<string, unknown>> = []
  const existingKeys = new Set(options.existingKeys ?? [])
  const service = new FormDefinitionWriteService(
    {
      findByIdAndTenantId: async () =>
        options.current === undefined ? source() : options.current,
      existsByKey: async (key: string) => existingKeys.has(key),
      insert: async (row: FormDefinitionRow) => {
        inserted.push(row)
      },
    } as never,
    {
      findByTenantIdAndFormKey: async () => null,
      insertDataSource: async (row: Record<string, unknown>) => {
        insertedSources.push(row)
      },
    } as never,
    {} as never,
  )
  return { service, inserted, insertedSources }
}

describe('copy 产物语义（复制完为草稿）', () => {
  it('新记录：新 id、DRAFT、version=1、published_version=null、schema 原样复制', async () => {
    const { service, inserted } = harness()
    const out = await runWithTenant('default', () =>
      service.copy('src1', '请假申请 副本', 'leave_apply_copy', 'WORKFLOW'),
    )
    expect(out.status).toBe('DRAFT')
    expect(out.version).toBe(1)
    expect(out.publishedVersion).toBeNull()
    expect(inserted).toHaveLength(1)
    expect(inserted[0].id).not.toBe('src1')
    expect(inserted[0].schema).toBe('[{"type":"input","field":"reason"}]')
    // 复制的是源行内容，出参是实体形状
    expect(out.name).toBe('请假申请 副本')
    expect(out.key).toBe('leave_apply_copy')
  })

  it('name/key 两侧空白被 trim', async () => {
    const { service, inserted } = harness()
    await runWithTenant('default', () => service.copy('src1', '  副本  ', '  key_copy  ', null))
    expect(inserted[0].name).toBe('副本')
    expect(inserted[0].key).toBe('key_copy')
  })

  it('type 缺省跟随源类型', async () => {
    const { service, inserted } = harness()
    await runWithTenant('default', () => service.copy('src1', '副本', 'key_copy', null))
    expect(inserted[0].type).toBe('WORKFLOW')
  })

  it('不修改源记录（无 update 调用路径，仅 insert）', async () => {
    const { service, inserted } = harness({
      current: source({ status: 'DRAFT', published_version: null }),
    })
    await runWithTenant('default', () => service.copy('src1', '副本', 'key_copy', 'BUSINESS'))
    expect(inserted).toHaveLength(1)
  })
})

describe('copy 跨类型字段的去留', () => {
  it('WORKFLOW → BUSINESS：column_config 保留、process_key 置 null、数据源为 FORM', async () => {
    const { service, inserted, insertedSources } = harness({
      current: source({
        column_config: JSON.stringify([{ key: 'reason', columnType: 'VARCHAR', length: 255 }]),
      }),
    })
    const out = await runWithTenant('default', () =>
      service.copy('src1', '请假登记', 'leave_register', 'BUSINESS'),
    )
    expect(out.type).toBe('BUSINESS')
    expect(inserted[0].column_config).toBe(
      JSON.stringify([{ key: 'reason', columnType: 'VARCHAR', length: 255 }]),
    )
    expect(inserted[0].process_key).toBeNull()
    expect(insertedSources[0].type).toBe('FORM')
    expect(insertedSources[0].form_key).toBe('leave_register')
    expect(insertedSources[0].name).toBe('请假登记 数据源')
  })

  it('BUSINESS → WORKFLOW：column_config 不带过去、process_key 保留、数据源为 WORKFLOW', async () => {
    const { service, inserted, insertedSources } = harness({
      current: source({
        type: 'BUSINESS',
        column_config: JSON.stringify([{ key: 'a', columnType: 'VARCHAR', length: 64 }]),
        process_key: null,
      }),
    })
    const out = await runWithTenant('default', () =>
      service.copy('src1', '审批用副本', 'leave_copy_wf', 'WORKFLOW'),
    )
    expect(out.type).toBe('WORKFLOW')
    expect(inserted[0].column_config).toBeNull()
    expect(inserted[0].process_key).toBeNull()
    expect(insertedSources[0].type).toBe('WORKFLOW')
    expect(insertedSources[0].source_key).toBe('leave_copy_wf')
  })

  it('WORKFLOW → WORKFLOW（同类型复制）：process_key 保留', async () => {
    const { service, inserted } = harness()
    await runWithTenant('default', () =>
      service.copy('src1', '副本', 'key_copy', 'WORKFLOW'),
    )
    expect(inserted[0].process_key).toBe('leave_process')
  })
})

describe('copy 错误形态', () => {
  it('源不存在 → 普通 Error「Form definition not found」（→ HTTP 500）', async () => {
    const { service } = harness({ current: null })
    await expect(
      runWithTenant('default', () => service.copy('ghost', '副本', 'key_copy', 'BUSINESS')),
    ).rejects.toThrow('Form definition not found: ghost')
  })

  it('name 空白 → 业务 400「表单名称不能为空」', async () => {
    const { service } = harness()
    await expect(
      runWithTenant('default', () => service.copy('src1', '   ', 'key_copy', 'BUSINESS')),
    ).rejects.toMatchObject({ code: 400, message: '表单名称不能为空' })
  })

  it('key 空白 → 业务 400「表单标识不能为空」', async () => {
    const { service } = harness()
    await expect(
      runWithTenant('default', () => service.copy('src1', '副本', '  ', 'BUSINESS')),
    ).rejects.toMatchObject({ code: 400, message: '表单标识不能为空' })
  })

  it('type 非法 → 业务 400「无效的表单类型」', async () => {
    const { service } = harness()
    await expect(
      runWithTenant('default', () => service.copy('src1', '副本', 'key_copy', 'FORM')),
    ).rejects.toMatchObject({ code: 400, message: '无效的表单类型: FORM' })
  })

  it('key 重复 → 普通 Error「Form key already exists」（→ HTTP 500，与 create 一致）', async () => {
    const { service } = harness({ existingKeys: ['taken_key'] })
    await expect(
      runWithTenant('default', () => service.copy('src1', '副本', 'taken_key', 'BUSINESS')),
    ).rejects.toThrow('Form key already exists: taken_key')
  })

  it('key 重复时不插入任何记录', async () => {
    const { service, inserted, insertedSources } = harness({ existingKeys: ['taken_key'] })
    await runWithTenant('default', () =>
      service.copy('src1', '副本', 'taken_key', 'BUSINESS').catch(() => null),
    )
    expect(inserted).toHaveLength(0)
    expect(insertedSources).toHaveLength(0)
  })
})
