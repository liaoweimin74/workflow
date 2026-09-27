import { describe, expect, it, vi } from 'vitest'
import { UpdateFormTool, diffFormSchema } from '../../../src/ai/tools/update-form.tool'
import { extractFromSchema } from '../../../src/engine/form/column/form-schema-column-extractor'

/** update_form 工具：定位（id/名称/多候选/未找到）/ 修改落库 / BUSINESS 列配置重提取 / PUBLISHED 警告 / diff 计算。 */

const SCHEMA_V1 = JSON.stringify({
  rule: [
    { type: 'input', field: 'applicant_name', title: '姓名', value: null, validate: [{ required: true, message: '请填写姓名' }] },
    { type: 'select', field: 'leave_type', title: '请假类型', value: null, options: [{ label: '事假', value: '事假' }] },
    { type: 'input', field: 'reason', title: '请假原因', value: null, props: { type: 'textarea' } },
  ],
})

const SCHEMA_V2 = JSON.stringify({
  rule: [
    { type: 'input', field: 'applicant_name', title: '申请人', value: null, validate: [{ required: true, message: 'x' }] },
    { type: 'select', field: 'leave_type', title: '请假类型', value: null, options: [{ label: '事假', value: '事假' }, { label: '调休', value: '调休' }] },
    { type: 'inputNumber', field: 'days', title: '天数', value: null },
  ],
})

function makeTool(overrides: {
  generation?: Record<string, unknown>
  formService?: Record<string, unknown>
  formWriteService?: Record<string, unknown>
} = {}): { tool: UpdateFormTool; mocks: Record<string, ReturnType<typeof vi.fn>> } {
  const mocks = {
    reviseSync: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
  }
  const generation = { reviseSync: mocks.reviseSync, ...overrides.generation } as never
  const formService = { list: mocks.list, getById: mocks.getById, ...overrides.formService } as never
  const formWriteService = { update: mocks.update, ...overrides.formWriteService } as never
  const tool = new UpdateFormTool(generation, formService, formWriteService)
  return { tool, mocks }
}

function formDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'form-1',
    name: '员工请假单',
    key: 'leave_form',
    type: 'BUSINESS',
    version: 1,
    status: 'DRAFT',
    publishedVersion: null,
    processKey: null,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    schema: SCHEMA_V1,
    columnConfig: null,
    ...overrides,
  }
}

describe('UpdateFormTool', () => {
  it('缺 changeRequest → error', async () => {
    const { tool } = makeTool()
    const r = JSON.parse(await tool.execute({ formName: '员工请假单' }, { pages: [] }))
    expect(r.error).toContain('changeRequest')
  })

  it('缺目标（formName/formId 均空）→ error 引导 list_forms', async () => {
    const { tool } = makeTool()
    const r = JSON.parse(await tool.execute({ changeRequest: '加字段' }, { pages: [] }))
    expect(r.error).toContain('list_forms')
  })

  it('formId 定位不存在 → error', async () => {
    const { tool, mocks } = makeTool()
    mocks.getById.mockRejectedValue(new Error('Form definition not found: x'))
    const r = JSON.parse(await tool.execute({ changeRequest: '加字段', formId: 'x' }, { pages: [] }))
    expect(r.error).toContain('未找到')
  })

  it('名称未命中 → error 提示先调用 list_forms', async () => {
    const { tool, mocks } = makeTool()
    mocks.list.mockResolvedValue({ totalElements: 0, content: [] })
    const r = JSON.parse(await tool.execute({ changeRequest: '加字段', formName: '不存在' }, { pages: [] }))
    expect(r.error).toContain('list_forms')
  })

  it('名称多命中 → 返回 candidates 不落库', async () => {
    const { tool, mocks } = makeTool()
    mocks.list.mockResolvedValue({
      totalElements: 2,
      content: [formDetail({ id: 'a', name: '请假单A' }), formDetail({ id: 'b', name: '请假单B' })],
    })
    const r = JSON.parse(await tool.execute({ changeRequest: '加字段', formName: '请假单' }, { pages: [] }))
    expect(r.error).toContain('多个')
    expect(r.candidates).toHaveLength(2)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('唯一模糊命中 → 修改落库并返回 diff 摘要', async () => {
    const { tool, mocks } = makeTool()
    mocks.list.mockResolvedValue({ totalElements: 1, content: [formDetail({ name: '员工请假单（旧）' })] })
    mocks.getById.mockResolvedValue(formDetail())
    mocks.reviseSync.mockResolvedValue({
      schema: SCHEMA_V2,
      fields: [],
      warnings: [],
    })
    mocks.update.mockResolvedValue({})
    const r = JSON.parse(
      await tool.execute({ changeRequest: '标题改申请人，加天数，删请假原因', formName: '员工请假单' }, { pages: [] }),
    )
    expect(r.ok).toBe(true)
    expect(r.formId).toBe('form-1')
    expect(r.changes.added.map((a: { field: string }) => a.field)).toEqual(['days'])
    expect(r.changes.removed.map((a: { field: string }) => a.field)).toEqual(['reason'])
    expect(r.changes.modified).toHaveLength(2) // applicant_name 标题 + leave_type 选项
    expect(r.designerUrl).toBe('/form/designer?id=form-1')
    // BUSINESS → column_config 重提取
    const updateArgs = mocks.update.mock.calls[0]
    expect(updateArgs[0]).toBe('form-1')
    expect(updateArgs[3]).toBe(SCHEMA_V2)
    expect(JSON.parse(updateArgs[4])).toEqual(extractFromSchema(SCHEMA_V2))
  })

  it('PUBLISHED 表单修改 → 警告重新发布', async () => {
    const { tool, mocks } = makeTool()
    mocks.getById.mockResolvedValue(formDetail({ status: 'PUBLISHED' }))
    mocks.reviseSync.mockResolvedValue({ schema: SCHEMA_V2, fields: [], warnings: [] })
    const r = JSON.parse(await tool.execute({ changeRequest: '改字段', formId: 'form-1' }, { pages: [] }))
    expect(r.ok).toBe(true)
    expect(r.warnings.join()).toContain('重新')
  })

  it('WORKFLOW 表单不重提取 column_config（保持 null）', async () => {
    const { tool, mocks } = makeTool()
    mocks.getById.mockResolvedValue(formDetail({ type: 'WORKFLOW' }))
    mocks.reviseSync.mockResolvedValue({ schema: SCHEMA_V2, fields: [], warnings: [] })
    await tool.execute({ changeRequest: '改字段', formId: 'form-1' }, { pages: [] })
    expect(mocks.update.mock.calls[0][4]).toBeNull()
  })

  it('newName 重命名透传 update 第二参', async () => {
    const { tool, mocks } = makeTool()
    mocks.getById.mockResolvedValue(formDetail())
    mocks.reviseSync.mockResolvedValue({ schema: SCHEMA_V2, fields: [], warnings: [] })
    await tool.execute({ changeRequest: '改字段', formId: 'form-1', newName: '请假单V2' }, { pages: [] })
    expect(mocks.update.mock.calls[0][1]).toBe('请假单V2')
  })

  it('LLM 输出与原 schema 相同 → ok:false 显式失败防幻报', async () => {
    const { tool, mocks } = makeTool()
    mocks.getById.mockResolvedValue(formDetail())
    mocks.reviseSync.mockResolvedValue({ schema: SCHEMA_V1, fields: [], warnings: [] })
    const r = JSON.parse(await tool.execute({ changeRequest: '改字段', formId: 'form-1' }, { pages: [] }))
    expect(r.ok).toBe(false)
    expect(r.noChanges).toBe(true)
    expect(r.error).toContain('未产生任何字段变更')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('LLM 失败 → error JSON 不抛出', async () => {
    const { tool, mocks } = makeTool()
    mocks.getById.mockResolvedValue(formDetail())
    mocks.reviseSync.mockRejectedValue(new Error('MODEL_ERROR'))
    const r = JSON.parse(await tool.execute({ changeRequest: '改', formId: 'form-1' }, { pages: [] }))
    expect(r.error).toContain('表单修改失败')
  })
})

describe('diffFormSchema', () => {
  it('新增/删除/修改识别', () => {
    const d = diffFormSchema(SCHEMA_V1, SCHEMA_V2)
    expect(d.added).toHaveLength(1)
    expect(d.added[0].field).toBe('days')
    expect(d.removed).toHaveLength(1)
    expect(d.removed[0].field).toBe('reason')
    expect(d.modified).toHaveLength(2)
    const nameChange = d.modified.find((m) => m.field === 'applicant_name')!
    expect(nameChange.changes.join()).toContain('申请人')
    const typeChange = d.modified.find((m) => m.field === 'leave_type')!
    expect(typeChange.changes.join()).toContain('选项')
  })

  it('无变化 → 三清单全空', () => {
    const d = diffFormSchema(SCHEMA_V1, SCHEMA_V1)
    expect(d.added).toHaveLength(0)
    expect(d.removed).toHaveLength(0)
    expect(d.modified).toHaveLength(0)
  })

  it('非法 schema 不抛出', () => {
    expect(() => diffFormSchema('not-json', SCHEMA_V2)).not.toThrow()
  })
})
