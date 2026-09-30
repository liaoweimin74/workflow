/**
 * process-definition.spec.ts —— 流程定义 saveDesign 分类语义单测
 *
 * Task 106 建立（11 用例）→ Task 108/109 增强为 12 用例（补显式 clearCategory=false、
 * tenant 隔离断言）。锁死流程定义页「移动」弹窗依赖的三类行为：
 *   ①缺省保留原值 ②传 categoryId 覆盖 ③clearCategory 强制清空为未分类。
 *
 * 运行：npx vitest run test/unit/engine/process-definition.spec.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'
import {
  ProcessDesignService,
  type DesignSaveRequest,
} from '../../../src/engine/process/process-design.service'
import type { DraftRow } from '../../../src/engine/process/repository/process-design.repository'

function draftRow(overrides: Record<string, unknown> = {}): DraftRow {
  return {
    id: 'd1',
    process_key: 'leave_key',
    name: '请假',
    category_id: 'cat-a',
    description: null,
    bpmn_xml: '<definitions/>',
    status: 'DRAFT',
    version: 0,
    tenant_id: 'default',
    deploy_id: null,
    process_definition_id: null,
    deployed_config_hash: null,
    deployed_xml: null,
    last_deployed_at: null,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    created_by: 'admin',
    ...overrides,
  } as unknown as DraftRow
}

type RepoMock = {
  findDraftById: ReturnType<typeof vi.fn>
  updateDraft: ReturnType<typeof vi.fn>
  deleteEditingConfigs: ReturnType<typeof vi.fn>
  insertConfigs: ReturnType<typeof vi.fn>
  findEditingConfigs: ReturnType<typeof vi.fn>
}

function makeRepo(draft: DraftRow | null): RepoMock {
  return {
    findDraftById: vi.fn(async () => draft),
    updateDraft: vi.fn(async () => {}),
    deleteEditingConfigs: vi.fn(async () => {}),
    insertConfigs: vi.fn(async () => {}),
    findEditingConfigs: vi.fn(async () => []),
  }
}

function save(repo: RepoMock, request: DesignSaveRequest) {
  const service = new ProcessDesignService(repo as never)
  return runWithTenant('default', () => service.saveDesign('d1', request))
}

describe('saveDesign 分类语义（Task 106）', () => {
  let repo: RepoMock

  beforeEach(() => {
    repo = makeRepo(draftRow())
  })

  it('缺省保留原分类（只传 name 时 category_id 不变）', async () => {
    await save(repo, { name: '新名' })
    expect(repo.updateDraft).toHaveBeenCalledTimes(1)
    expect(repo.updateDraft.mock.calls[0][2].category_id).toBe('cat-a')
  })

  it('传 categoryId → 覆盖原分类（移动到目标分类）', async () => {
    await save(repo, { categoryId: 'cat-b' })
    expect(repo.updateDraft.mock.calls[0][2].category_id).toBe('cat-b')
  })

  it('clearCategory=true → 强制清空为未分类', async () => {
    await save(repo, { clearCategory: true })
    expect(repo.updateDraft.mock.calls[0][2].category_id).toBeNull()
  })

  it('clearCategory=true 与 categoryId 同时出现时以 clearCategory 优先', async () => {
    await save(repo, { clearCategory: true, categoryId: 'cat-b' })
    expect(repo.updateDraft.mock.calls[0][2].category_id).toBeNull()
  })

  it('clearCategory=false（显式）不清空，走保留分支', async () => {
    await save(repo, { clearCategory: false })
    expect(repo.updateDraft.mock.calls[0][2].category_id).toBe('cat-a')
  })

  it('已是未分类（category_id=null）缺省保存 → 仍为 null 不误赋', async () => {
    repo = makeRepo(draftRow({ category_id: null }))
    await save(repo, { name: '改名' })
    expect(repo.updateDraft.mock.calls[0][2].category_id).toBeNull()
  })

  it('从未分类移动到目标分类（Task 106 主路径回归）', async () => {
    repo = makeRepo(draftRow({ category_id: null }))
    await save(repo, { categoryId: 'cat-b' })
    expect(repo.updateDraft.mock.calls[0][2].category_id).toBe('cat-b')
  })
})

describe('saveDesign 缺省保留语义（移动分类只传分类字段绝不碰 XML）', () => {
  it('空请求体 → name/key/description/bpmn_xml 全部保留原值', async () => {
    const repo = makeRepo(draftRow({ description: '说明', bpmn_xml: '<orig-xml/>' }))
    await save(repo, {})
    const patch = repo.updateDraft.mock.calls[0][2]
    expect(patch.name).toBe('请假')
    expect(patch.process_key).toBe('leave_key')
    expect(patch.description).toBe('说明')
    expect(patch.bpmn_xml).toBe('<orig-xml/>')
    expect(patch.category_id).toBe('cat-a')
  })

  it('设计器全量保存（name+key+categoryId+bpmnXml+nodeConfigs）→ 全部落库', async () => {
    const repo = makeRepo(draftRow())
    await save(repo, {
      name: '全量',
      key: 'full_key',
      categoryId: 'cat-b',
      bpmnXml: '<definitions><userTask id="t1"/></definitions>',
      nodeConfigs: { t1: '{"approve":"any"}' },
    })
    const patch = repo.updateDraft.mock.calls[0][2]
    expect(patch.name).toBe('全量')
    expect(patch.process_key).toBe('full_key')
    expect(patch.category_id).toBe('cat-b')
    expect(patch.bpmn_xml).toContain('userTask')
    expect(repo.insertConfigs).toHaveBeenCalledTimes(1)
    const rows = repo.insertConfigs.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0].node_id).toBe('t1')
    expect(rows[0].process_definition_id).toBeNull()
  })

  it('nodeConfigs 为空对象 → 不动配置表', async () => {
    const repo = makeRepo(draftRow())
    await save(repo, { nodeConfigs: {} })
    expect(repo.deleteEditingConfigs).not.toHaveBeenCalled()
    expect(repo.insertConfigs).not.toHaveBeenCalled()
  })
})

describe('saveDesign 异常路径', () => {
  it('草稿不存在 → 抛错（不写库）', async () => {
    const repo = makeRepo(null)
    await expect(save(repo, { categoryId: 'cat-b' })).rejects.toThrow(/not found/)
    expect(repo.updateDraft).not.toHaveBeenCalled()
  })

  it('updateDraft 带 tenant 隔离（tenant_id 透传）', async () => {
    const repo = makeRepo(draftRow())
    await save(repo, {})
    expect(repo.findDraftById).toHaveBeenCalledWith('d1', 'default')
    expect(repo.updateDraft.mock.calls[0][1]).toBe('default')
  })
})
