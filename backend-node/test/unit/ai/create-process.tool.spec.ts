import { describe, expect, it, vi } from 'vitest'
import { CreateProcessTool } from '../../../src/ai/tools/create-process.tool'
import { AiError } from '../../../src/ai/service/ai-error'
import { normalizePlan } from '../../../src/ai/service/ai-process-plan'

/** create_process 工具编排：参数校验 / 表单匹配与新建 / nodeConfigs 契约 / key 冲突重试。 */

function makeTool(overrides: {
  generation?: Record<string, unknown>
  formGeneration?: Record<string, unknown>
  formService?: Record<string, unknown>
  formWriteService?: Record<string, unknown>
  processDesignService?: Record<string, unknown>
} = {}): { tool: CreateProcessTool; mocks: Record<string, ReturnType<typeof vi.fn>> } {
  const mocks = {
    generate: vi.fn(),
    generateFormSync: vi.fn(),
    listForms: vi.fn(),
    createForm: vi.fn(),
    updateForm: vi.fn(),
    createDraft: vi.fn(),
    saveDesign: vi.fn(),
  }

  const generation = {
    generate: mocks.generate,
    ...overrides.generation,
  } as never
  const formGeneration = {
    generateSync: mocks.generateFormSync,
    ...overrides.formGeneration,
  } as never
  const formService = {
    list: mocks.listForms,
    ...overrides.formService,
  } as never
  const formWriteService = {
    create: mocks.createForm,
    update: mocks.updateForm,
    ...overrides.formWriteService,
  } as never
  const processDesignService = {
    createDraft: mocks.createDraft,
    saveDesign: mocks.saveDesign,
    ...overrides.processDesignService,
  } as never

  const tool = new CreateProcessTool(
    generation,
    formGeneration,
    formService,
    formWriteService,
    processDesignService,
  )
  return { tool, mocks }
}

function stubPlan() {
  return normalizePlan({
    name: '员工请假审批流程',
    key: 'leave_approval',
    processForm: { formDescription: '姓名、请假类型、起止日期、事由' },
    nodes: [
      { type: 'initiator', name: '提交申请' },
      { type: 'userTask', name: '主管审批', approval: { type: 'dept_head' } },
    ],
  }).plan
}

describe('CreateProcessTool', () => {
  it('缺 title → error JSON', async () => {
    const { tool } = makeTool()
    const result = JSON.parse(await tool.execute({ requirement: '主管审批' }, { pages: [] }))
    expect(result.error).toContain('title')
  })

  it('缺 requirement → error JSON', async () => {
    const { tool } = makeTool()
    const result = JSON.parse(await tool.execute({ title: '请假流程' }, { pages: [] }))
    expect(result.error).toContain('requirement')
  })

  it('正常链路：表单新建 → 落库 → 返回 draftId/designerUrl 与 nodeConfigs 契约', async () => {
    const { tool, mocks } = makeTool()
    const plan = stubPlan()
    mocks.generate.mockResolvedValue({ plan, warnings: ['w1'] })
    // 表单匹配：未命中（空列表）→ 走新建
    mocks.listForms.mockResolvedValue({ content: [], totalElements: 0 })
    mocks.generateFormSync.mockResolvedValue({ schema: '{"rule":[]}', fields: [{ title: '姓名', field: 'name', componentType: 'input' }], warnings: [] })
    mocks.createForm.mockResolvedValue({ id: 'form_123', key: 'ai_form_x' })
    mocks.createDraft.mockResolvedValue({ id: 'draft_abc', key: 'leave_approval' })

    const result = JSON.parse(
      await tool.execute(
        { title: '员工请假审批', requirement: '提交后主管审批', formRequirement: '姓名、请假类型' },
        { pages: [] },
      ),
    )

    expect(result.ok).toBe(true)
    expect(result.draftId).toBe('draft_abc')
    expect(result.processKey).toBe('leave_approval')
    expect(result.designerUrl).toBe('/designer?id=draft_abc')
    expect(result.formId).toBe('form_123')
    expect(result.nodeCount).toBe(2)
    expect(result.nodes[0].type).toBe('发起')
    expect(result.nodes[1].approver).toBe('部门负责人')

    // 落库断言：createDraft + saveDesign（XML + nodeConfigs）
    expect(mocks.createDraft).toHaveBeenCalledWith('员工请假审批流程', 'leave_approval', null)
    expect(mocks.saveDesign).toHaveBeenCalledTimes(1)
    const saveArgs = mocks.saveDesign.mock.calls[0][1] as Record<string, unknown>
    expect(saveArgs['bpmnXml']).toContain('wf:nodeRole="initiator"')
    const configs = saveArgs['nodeConfigs'] as Record<string, string>
    expect(JSON.parse(configs['__PROCESS__']).form.formDefId).toBe('form_123')
    expect(JSON.parse(configs['ai_task_1']).form.formDefId).toBe('form_123')
    expect(JSON.parse(configs['ai_task_2']).approval.type).toBe('dept_head')
  })

  it('表单按名称匹配已有工作流表单（精确命中优先，不再新建）', async () => {
    const { tool, mocks } = makeTool()
    const plan = stubPlan()
    mocks.generate.mockResolvedValue({ plan, warnings: [] })
    mocks.listForms.mockResolvedValue({
      content: [
        { id: 'f_other', name: '别的请假单', key: 'other' },
        { id: 'f_exact', name: '员工请假单', key: 'qingjiadan' },
      ],
      totalElements: 2,
    })
    mocks.createDraft.mockResolvedValue({ id: 'draft_1', key: 'leave_approval' })

    const result = JSON.parse(
      await tool.execute(
        { title: '员工请假审批', requirement: '主管审批', formName: '员工请假单' },
        { pages: [] },
      ),
    )

    expect(result.formId).toBe('f_exact')
    expect(mocks.generateFormSync).not.toHaveBeenCalled()
    expect(mocks.createForm).not.toHaveBeenCalled()
    // formName 覆盖 plan.processFormRef
    expect(mocks.listForms).toHaveBeenCalledWith(1, 50, null, '员工请假单', 'WORKFLOW')
  })

  it('process_key 冲突 → 自动加后缀重试成功', async () => {
    const { tool, mocks } = makeTool()
    const plan = stubPlan()
    mocks.generate.mockResolvedValue({ plan, warnings: [] })
    mocks.listForms.mockResolvedValue({ content: [{ id: 'f1', name: '员工请假单', key: 'f1' }], totalElements: 1 })
    let call = 0
    mocks.createDraft.mockImplementation(async (_name: string, key: string) => {
      call += 1
      if (call === 1) throw new Error('Duplicate entry')
      return { id: 'draft_ok', key }
    })

    const result = JSON.parse(
      await tool.execute(
        { title: '员工请假审批', requirement: '主管审批', formName: '员工请假单' },
        { pages: [] },
      ),
    )
    expect(result.ok).toBe(true)
    expect(mocks.createDraft).toHaveBeenCalledTimes(2)
    expect(result.processKey).not.toBe('leave_approval') // 后缀已加
  })

  it('计划生成失败 → error JSON（不抛出）', async () => {
    const { tool, mocks } = makeTool()
    mocks.generate.mockRejectedValue(new AiError('MODEL_ERROR', 'AI 返回的流程计划不是合法 JSON'))
    const result = JSON.parse(
      await tool.execute({ title: '请假', requirement: '审批' }, { pages: [] }),
    )
    expect(result.error).toContain('流程创建失败')
  })
})
