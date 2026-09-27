import { describe, expect, it, vi } from 'vitest'
import { UpdateProcessTool, buildCurrentPlanSummary } from '../../../src/ai/tools/update-process.tool'
import { containsNonLinearStructure, extractUserTasks, mergeOldNodeConfigs } from '../../../src/ai/service/ai-process-node-configs'
import { normalizePlan } from '../../../src/ai/service/ai-process-plan'

/** update_process 工具：定位 / 纯改名 / 网关拒绝 / 线性重建 + 旧配置保留 / key 锁定 / DEPLOYED 警告。 */

function stubPlan() {
  return normalizePlan({
    name: '员工请假审批流程',
    key: 'leave_approval',
    nodes: [
      { type: 'initiator', name: '提交申请' },
      { type: 'userTask', name: '主管审批', approval: { type: 'dept_head' } },
      { type: 'userTask', name: 'HR 备案', approval: { type: 'dept_head' } },
    ],
  }).plan
}

const LINEAR_XML =
  '<definitions><process><bpmn:userTask id="ai_task_1" name="提交申请" wf:nodeRole="initiator"/>' +
  '<bpmn:userTask id="ai_task_2" name="主管审批"/><bpmn:userTask id="ai_task_3" name="HR 备案"/></process></definitions>'

const EDITOR_BASE = {
  id: 'draft-1',
  key: 'leave_approval',
  name: '员工请假审批流程',
  categoryId: null,
  status: 'DRAFT',
  bpmnXml: LINEAR_XML,
  nodeConfigs: {
    __PROCESS__: JSON.stringify({ form: { formDefId: 'form-9', fieldPermissions: null } }),
    ai_task_1: JSON.stringify({ name: '提交申请', form: { formDefId: 'form-9', fieldPermissions: null } }),
    ai_task_2: JSON.stringify({ name: '主管审批', approval: { type: 'dept_head', userIds: [], expression: '', multiMode: '' } }),
    ai_task_3: JSON.stringify({
      name: 'HR 备案',
      approval: { type: 'expression', userIds: [], expression: '${hr}', multiMode: '' },
      timeout: { duration: 48, action: 'remind' },
    }),
  },
}

function makeTool(overrides: {
  generation?: Record<string, unknown>
  formService?: Record<string, unknown>
  processDesignService?: Record<string, unknown>
} = {}): { tool: UpdateProcessTool; mocks: Record<string, ReturnType<typeof vi.fn>> } {
  const mocks = {
    generate: vi.fn(),
    list: vi.fn(),
    listDrafts: vi.fn(),
    loadEditor: vi.fn(),
    saveDesign: vi.fn(),
  }
  // 默认草稿列表命中目标（测试可覆盖）
  mocks.listDrafts.mockResolvedValue({
    totalElements: 1,
    content: [{ id: 'draft-1', key: 'leave_approval', name: '员工请假审批流程', status: 'DRAFT' }],
  })
  const generation = { generate: mocks.generate, ...overrides.generation } as never
  const formService = { list: mocks.list, ...overrides.formService } as never
  const processDesignService = {
    listDrafts: mocks.listDrafts,
    loadEditor: mocks.loadEditor,
    saveDesign: mocks.saveDesign,
    ...overrides.processDesignService,
  } as never
  const tool = new UpdateProcessTool(generation, formService, processDesignService)
  return { tool, mocks }
}

describe('UpdateProcessTool', () => {
  it('完全缺参 → error', async () => {
    const { tool } = makeTool()
    const r = JSON.parse(await tool.execute({ processName: '请假' }, { pages: [] }))
    expect(r.error).toContain('修改内容')
  })

  it('缺目标（processName/draftId 均空）→ error', async () => {
    const { tool } = makeTool()
    const r = JSON.parse(await tool.execute({ changeRequest: '改审批人' }, { pages: [] }))
    expect(r.error).toContain('list_processes')
  })

  it('名称未命中 → error 引导 list_processes', async () => {
    const { tool, mocks } = makeTool()
    mocks.listDrafts.mockResolvedValue({ totalElements: 0, content: [] })
    const r = JSON.parse(await tool.execute({ changeRequest: '改', processName: '不存在' }, { pages: [] }))
    expect(r.error).toContain('list_processes')
  })

  it('纯改名 → saveDesign({name}) 且不动 XML', async () => {
    const { tool, mocks } = makeTool()
    mocks.loadEditor.mockResolvedValue(EDITOR_BASE)
    const r = JSON.parse(await tool.execute({ processName: '员工请假审批流程', newName: '请假流程V2' }, { pages: [] }))
    expect(r.ok).toBe(true)
    expect(r.name).toBe('请假流程V2')
    expect(r.changes.renamed).toBe(true)
    expect(mocks.saveDesign).toHaveBeenCalledWith('draft-1', { name: '请假流程V2' })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('含网关的流程结构修改 → 拒绝并给设计器链接', async () => {
    const { tool, mocks } = makeTool()
    mocks.loadEditor.mockResolvedValue({
      ...EDITOR_BASE,
      bpmnXml: LINEAR_XML + '<exclusiveGateway id="gw1"/>',
    })
    const r = JSON.parse(
      await tool.execute({ changeRequest: '加一个环节', processName: '员工请假审批流程' }, { pages: [] }),
    )
    expect(r.error).toContain('网关')
    expect(r.designerUrl).toBe('/designer?id=draft-1')
    expect(mocks.saveDesign).not.toHaveBeenCalled()
  })

  it('线性流程修改 → 重建 XML + key 锁定 + 旧配置保留', async () => {
    const { tool, mocks } = makeTool()
    mocks.loadEditor.mockResolvedValue(EDITOR_BASE)
    mocks.generate.mockResolvedValue({
      plan: stubPlan(),
      warnings: [],
    })
    const r = JSON.parse(
      await tool.execute(
        { changeRequest: '把 HR 备案改为总经理审批', processName: '员工请假审批流程' },
        { pages: [] },
      ),
    )
    expect(r.ok).toBe(true)
    expect(r.processKey).toBe('leave_approval') // key 锁定
    // currentPlan 摘要作为修改基准传给 LLM
    const genArgs = mocks.generate.mock.calls[0][0]
    expect(genArgs.currentPlan).toContain('HR 备案')
    expect(genArgs.currentPlan).toContain('${hr}')
    // saveDesign 收到重建产物
    const saveArgs = mocks.saveDesign.mock.calls[0][1]
    expect(saveArgs.name).toBe('员工请假审批流程')
    expect(saveArgs.bpmnXml).toContain('userTask')
    // HR 备案节点被 LLM 改名 → 旧 timeout 不再匹配名称 → 不保留；主管审批未提 → approval 保留旧值
    expect(saveArgs.nodeConfigs['__PROCESS__']).toBeDefined()
  })

  it('旧同名节点的 timeout/operations 在新计划未提及时保留', () => {
    const newConfigs = {
      __PROCESS__: JSON.stringify({ form: { formDefId: 'form-9' } }),
      ai_task_1: JSON.stringify({ name: '提交申请' }),
      ai_task_2: JSON.stringify({ name: '主管审批', approval: { type: 'dept_head' } }),
    }
    const oldConfigs = {
      ai_task_2: JSON.stringify({
        name: '主管审批',
        approval: { type: 'expression', expression: '${x}' },
        timeout: { duration: 24, action: 'remind' },
        operations: { allowReject: false },
      }),
    }
    const warnings = mergeOldNodeConfigs(newConfigs, oldConfigs)
    const merged = JSON.parse(newConfigs['ai_task_2'])
    // approval 已由新计划给出（dept_head）→ 不覆盖
    expect(merged.approval.type).toBe('dept_head')
    // timeout/operations 新计划未提 → 保留旧值
    expect(merged.timeout.duration).toBe(24)
    expect(merged.operations.allowReject).toBe(false)
    expect(warnings.join()).toContain('主管审批')
  })

  it('__PROCESS__ 表单在 formId=null 时保留旧绑定', () => {
    const newConfigs: Record<string, string> = {
      ai_task_1: JSON.stringify({ name: '提交申请' }),
    }
    const oldConfigs = {
      __PROCESS__: JSON.stringify({ form: { formDefId: 'form-9', fieldPermissions: null } }),
    }
    mergeOldNodeConfigs(newConfigs, oldConfigs)
    expect(JSON.parse(newConfigs['__PROCESS__']).form.formDefId).toBe('form-9')
  })

  it('DEPLOYED 草稿修改 → 警告重新部署', async () => {
    const { tool, mocks } = makeTool()
    mocks.loadEditor.mockResolvedValue({ ...EDITOR_BASE, status: 'DEPLOYED' })
    mocks.generate.mockResolvedValue({ plan: stubPlan(), warnings: [] })
    const r = JSON.parse(
      await tool.execute({ changeRequest: '微调', processName: '员工请假审批流程' }, { pages: [] }),
    )
    expect(r.ok).toBe(true)
    expect(r.warnings.join()).toContain('部署')
  })

  it('换绑表单 → 名称匹配工作流表单', async () => {
    const { tool, mocks } = makeTool()
    mocks.loadEditor.mockResolvedValue(EDITOR_BASE)
    mocks.list.mockResolvedValue({
      totalElements: 1,
      content: [{ id: 'form-new', name: '新请假表单', key: 'new_form', name_: '' }],
    })
    mocks.generate.mockResolvedValue({ plan: stubPlan(), warnings: [] })
    const r = JSON.parse(
      await tool.execute(
        { changeRequest: '换绑表单', formName: '新请假表单', processName: '员工请假审批流程' },
        { pages: [] },
      ),
    )
    expect(r.ok).toBe(true)
    expect(r.formId).toBe('form-new')
    expect(r.warnings.join()).toContain('新请假表单')
  })

  it('LLM 失败 → error JSON', async () => {
    const { tool, mocks } = makeTool()
    mocks.loadEditor.mockResolvedValue(EDITOR_BASE)
    mocks.generate.mockRejectedValue(new Error('MODEL_ERROR'))
    const r = JSON.parse(
      await tool.execute({ changeRequest: '改', processName: '员工请假审批流程' }, { pages: [] }),
    )
    expect(r.error).toContain('流程修改失败')
  })
})

describe('buildCurrentPlanSummary / XML 工具函数', () => {
  it('extractUserTasks 按序提取并识别发起节点', () => {
    const tasks = extractUserTasks(LINEAR_XML)
    expect(tasks).toHaveLength(3)
    expect(tasks[0].initiator).toBe(true)
    expect(tasks[1].name).toBe('主管审批')
  })

  it('containsNonLinearStructure 识别网关与子流程', () => {
    expect(containsNonLinearStructure(LINEAR_XML)).toBe(false)
    expect(containsNonLinearStructure('<bpmn:exclusiveGateway id="g"/>')).toBe(true)
    expect(containsNonLinearStructure('<subProcess id="s">')).toBe(true)
    expect(containsNonLinearStructure('')).toBe(false)
  })

  it('buildCurrentPlanSummary 输出 LLM 可读计划', () => {
    const summary = buildCurrentPlanSummary(EDITOR_BASE as never)
    const parsed = JSON.parse(summary)
    expect(parsed.key).toBe('leave_approval')
    expect(parsed.nodes).toHaveLength(3)
    expect(parsed.nodes[0].type).toBe('initiator')
    expect(parsed.nodes[2].approval.expression).toBe('${hr}')
  })
})
