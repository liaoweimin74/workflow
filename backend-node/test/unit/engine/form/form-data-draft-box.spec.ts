import { describe, expect, it } from 'vitest'
import { FormDataService } from '../../../../src/engine/form/form-data.service'
import { runWithTenant } from '../../../../src/framework/tenant/tenant-context'
import type { FormDataRow } from '../../../../src/engine/form/repository/form-data.repository'
import type { FormDefinitionRow } from '../../../../src/engine/form/repository/form-definition.repository'
import type { NodeConfigRow } from '../../../../src/engine/process/repository/process-design.repository'

/**
 * 草稿箱（Task 93）单测 —— Node 侧新能力，无 Java 对齐物：
 *   - saveDraft 把 created_by 锚定为登录用户（草稿按用户隔离的根基）；
 *   - findDraft / clearDraft 只命中本人草稿；
 *   - listMyDrafts 回填表单名 + 反查发起流程（ACTIVE、同 key 最新版、发起人节点表单优先）；
 *   - deleteMyDraft 的三重归属校验（本人 / 草稿行 / 非快照）。
 */

function draftRow(overrides: Partial<FormDataRow> = {}): FormDataRow {
  return {
    id: 'd1',
    tenant_id: 'default',
    form_def_id: 'f1',
    form_version: 1,
    process_instance_id: null,
    task_id: null,
    data_json: '{"reason":" family matters"}',
    created_by: '1',
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-02T00:00:00Z'),
    is_snapshot: 0,
    ...overrides,
  }
}

function formRow(overrides: Partial<FormDefinitionRow> = {}): FormDefinitionRow {
  return {
    id: 'f1',
    tenant_id: 'default',
    name: '请假表单',
    key: 'form_leave',
    type: 'WORKFLOW',
    schema: '[]',
    column_config: null,
    version: 1,
    status: 'PUBLISHED',
    published_version: 1,
    process_key: null,
    created_by: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as FormDefinitionRow
}

function configRow(overrides: Partial<NodeConfigRow> = {}): NodeConfigRow {
  return {
    id: 'c1',
    process_def_id: 'unused',
    process_definition_id: 'leave:1:1',
    node_id: '__PROCESS__',
    node_type: 'processForm',
    config_json: '{"form":{"formDefId":"f1","fieldPermissions":null}}',
    tenant_id: 'default',
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

interface HarnessOptions {
  drafts?: FormDataRow[]
  forms?: FormDefinitionRow[]
  defs?: Array<Record<string, unknown>>
  configs?: NodeConfigRow[]
  /** findDraft 命中的行（saveDraft 更新分支 / findDraft / clearDraft 用） */
  existingDraft?: FormDataRow | null
  /** findByIdAndTenantId 命中的行（deleteMyDraft 用） */
  draftById?: FormDataRow | null
}

function harness(options: HarnessOptions = {}) {
  const inserted: FormDataRow[] = []
  const updated: Array<{ id: string; dataJson: string }> = []
  const deleted: string[] = []

  const service = new FormDataService(
    {
      findDraft: async (_t: string, formDefId: string, createdBy: string) => {
        const hit = options.existingDraft
        if (hit === null) return null
        return hit && hit.form_def_id === formDefId && hit.created_by === createdBy ? hit : null
      },
      listDraftsByUser: async (_t: string, createdBy: string) =>
        (options.drafts ?? []).filter((d) => d.created_by === createdBy),
      findByIdAndTenantId: async (_id: string) => options.draftById ?? null,
      insert: async (row: FormDataRow) => {
        inserted.push(row)
      },
      updateData: async (id: string, dataJson: string) => {
        updated.push({ id, dataJson })
      },
      deleteById: async (id: string) => {
        deleted.push(id)
      },
    } as never,
    {
      findByIds: async (ids: string[]) =>
        (options.forms ?? []).filter((f) => ids.includes(f.id)),
      // requireFormVersion 用：返回任一表单即可（只取 version）
      findByIdAndTenantId: async () => (options.forms ?? [])[0] ?? null,
    } as never,
    {
      listDeployedDefsWithModel: async () => options.defs ?? [],
      findConfigsByProcessDefinitionIds: async (ids: string[]) =>
        (options.configs ?? []).filter((c) => ids.includes(c.process_definition_id ?? '')),
    } as never,
  )

  return { service, inserted, updated, deleted }
}

describe('FormDataService 草稿箱', () => {
  it('saveDraft 新建时把 created_by 写成登录用户 id', async () => {
    const { service, inserted } = harness({ existingDraft: null, forms: [formRow()] })
    await runWithTenant('default', () =>
      service.saveDraft('f1', '{"a":1}', 7),
    )
    expect(inserted).toHaveLength(1)
    expect(inserted[0].created_by).toBe('7')
    expect(inserted[0].process_instance_id).toBeNull()
    expect(inserted[0].is_snapshot).toBe(0)
  })

  it('saveDraft 更新分支只更新本人已有草稿的数据', async () => {
    const mine = draftRow({ id: 'd9', created_by: '7', form_def_id: 'f1' })
    const { service, updated, inserted } = harness({ existingDraft: mine, forms: [formRow()] })
    await runWithTenant('default', () => service.saveDraft('f1', '{"a":2}', 7))
    expect(updated).toEqual([{ id: 'd9', dataJson: '{"a":2}' }])
    expect(inserted).toHaveLength(0)
  })

  it('findDraft / clearDraft 限定本人：他人草稿不可见', async () => {
    const others = draftRow({ id: 'dX', created_by: '2' })
    const { service, deleted } = harness({ existingDraft: others })
    const found = await runWithTenant('default', () => service.findDraft('f1', 1))
    expect(found).toBeNull()
    await runWithTenant('default', () => service.clearDraft('f1', 1))
    expect(deleted).toHaveLength(0)
  })

  it('listMyDrafts 回填表单名并反查 ACTIVE 最新版发起流程', async () => {
    const { service } = harness({
      drafts: [draftRow({ id: 'd1', form_def_id: 'f1', created_by: '1' })],
      forms: [formRow({ id: 'f1', name: '请假表单' })],
      defs: [
        // 同 key 两个版本：v2 ACTIVE（应命中）、v1 ACTIVE（跳过）
        { id: 'leave:2:2', process_key: 'leave', name: '请假', version: 2, status: 'ACTIVE', model_json: null },
        { id: 'leave:1:1', process_key: 'leave', name: '请假', version: 1, status: 'ACTIVE', model_json: null },
        // 挂起版本即使有同名表单也不参与反查
        { id: 'old:1:1', process_key: 'old', name: '旧流程', version: 1, status: 'SUSPENDED', model_json: null },
      ],
      configs: [
        configRow({ process_definition_id: 'leave:2:2' }),
        configRow({ process_definition_id: 'leave:1:1' }),
        configRow({ process_definition_id: 'old:1:1' }),
      ],
    })
    const list = await runWithTenant('default', () => service.listMyDrafts(1))
    expect(list).toHaveLength(1)
    expect(list[0].formName).toBe('请假表单')
    expect(list[0].processDefId).toBe('leave:2:2')
    expect(list[0].processKey).toBe('leave')
    expect(list[0].processVersion).toBe(2)
  })

  it('发起人节点表单优先于 __PROCESS__ 流程级表单', async () => {
    const { service } = harness({
      drafts: [draftRow({ id: 'd1', form_def_id: 'f-init', created_by: '1' })],
      forms: [formRow({ id: 'f-init', name: '发起人表单' })],
      defs: [
        {
          id: 'leave:1:1',
          process_key: 'leave',
          name: '请假',
          version: 1,
          status: 'ACTIVE',
          // model_json 指明发起人节点是 startNode1
          model_json: '{"initiatorNodeId":"startNode1"}',
        },
      ],
      configs: [
        configRow({
          process_definition_id: 'leave:1:1',
          node_id: 'startNode1',
          config_json: '{"form":{"formDefId":"f-init"}}',
        }),
        configRow({
          process_definition_id: 'leave:1:1',
          node_id: '__PROCESS__',
          config_json: '{"form":{"formDefId":"f-other"}}',
        }),
      ],
    })
    const list = await runWithTenant('default', () => service.listMyDrafts(1))
    expect(list[0].processDefId).toBe('leave:1:1')
    // 表单名按草稿自己的 formDefId 回填
    expect(list[0].formName).toBe('发起人表单')
  })

  it('发起表单没有 ACTIVE 流程时 processDefId 为 null（仅可删除）', async () => {
    const { service } = harness({
      drafts: [draftRow({ id: 'd1', form_def_id: 'f-gone', created_by: '1' })],
      forms: [formRow({ id: 'f-gone', name: '下线表单' })],
      defs: [
        { id: 'leave:1:1', process_key: 'leave', name: '请假', version: 1, status: 'ACTIVE', model_json: null },
      ],
      configs: [configRow({ process_definition_id: 'leave:1:1' })],
    })
    const list = await runWithTenant('default', () => service.listMyDrafts(1))
    expect(list[0].processDefId).toBeNull()
    expect(list[0].processName).toBeNull()
    expect(list[0].formName).toBe('下线表单')
  })

  it('deleteMyDraft 拒绝删他人草稿 / 非草稿行 / 快照', async () => {
    // 他人草稿
    const h1 = harness({ draftById: draftRow({ id: 'd1', created_by: '2' }) })
    expect(await runWithTenant('default', () => h1.service.deleteMyDraft('d1', 1))).toBe(false)
    expect(h1.deleted).toHaveLength(0)

    // 已关联实例的行不是发起页草稿
    const h2 = harness({
      draftById: draftRow({ id: 'd1', created_by: '1', process_instance_id: 'pi1' }),
    })
    expect(await runWithTenant('default', () => h2.service.deleteMyDraft('d1', 1))).toBe(false)

    // 快照
    const h3 = harness({ draftById: draftRow({ id: 'd1', created_by: '1', is_snapshot: 1 }) })
    expect(await runWithTenant('default', () => h3.service.deleteMyDraft('d1', 1))).toBe(false)

    // 本人的发起页草稿 → 删除成功
    const h4 = harness({ draftById: draftRow({ id: 'd1', created_by: '1' }) })
    expect(await runWithTenant('default', () => h4.service.deleteMyDraft('d1', 1))).toBe(true)
    expect(h4.deleted).toEqual(['d1'])
  })
})
