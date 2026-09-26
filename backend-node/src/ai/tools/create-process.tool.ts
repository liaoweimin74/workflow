import { Injectable, Logger } from '@nestjs/common'
import { AiTool, AiToolContext } from './ai-tool'
import { AiFormGenerationService } from '../service/ai-form-generation.service'
import { AiProcessGenerationService } from '../service/ai-process-generation.service'
import {
  ProcessPlan,
  PlanFormRef,
} from '../service/ai-process-plan'
import { buildLinearProcessBpmnXml } from '../service/ai-process-bpmn'
import { FormDefinitionService } from '../../engine/form/service/form-definition.service'
import { FormDefinitionWriteService } from '../../engine/form/form-definition-write.service'
import { ProcessDesignService } from '../../engine/process/process-design.service'

/**
 * 工具：根据自然语言需求**真实创建**审批流程（落库为草稿，含 BPMN 图与节点配置）。
 *
 * 编排链：
 *   1. AiProcessGenerationService 生成流程计划（线性节点序列）
 *   2. 表单解析：优先按名称匹配已有工作流表单；匹配不到且给了字段描述 →
 *      复用 formgen 管线新建 WORKFLOW 表单草稿
 *   3. buildLinearProcessBpmnXml 拼装 BPMN（含 DI 与 wf:nodeRole）
 *   4. ProcessDesignService.createDraft + saveDesign 落库（XML + nodeConfigs）
 *
 * 与 create_form 的关系：本工具只创建「流程」；发起表单若无匹配会顺带创建
 * （作为发起节点与流程级表单绑定），审批表单同理。发布/部署仍需用户在设计器
 * 确认后手动触发。
 */
@Injectable()
export class CreateProcessTool implements AiTool {
  static readonly NAME = 'create_process'

  private readonly logger = new Logger(CreateProcessTool.name)

  name = CreateProcessTool.NAME

  description =
    '真实创建一个审批流程（保存为草稿，含流程图与节点配置，可在流程设计器中调整并部署）。' +
    '当用户想要新建、创建审批流程/工作流时调用。参数：title=流程名称；' +
    'requirement=审批环节需求描述（按顺序说明有哪些审批环节，如「提交后主管审批，再由 HR 备案」）；' +
    'formRequirement=发起表单需要哪些字段（可选，如「姓名、请假类型、起止日期、事由」）；' +
    'formName=复用已有表单的名称（可选，给了就不再新建表单）。'

  parametersSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '流程名称，例如：员工请假审批流程',
      },
      requirement: {
        type: 'string',
        description:
          '审批环节需求描述，按顺序列出环节与审批人，例如：员工提交申请后，先由部门负责人审批，超过 3 天再由 HR 备案',
      },
      formRequirement: {
        type: 'string',
        description: '发起表单字段需求描述（可选），例如：包含姓名、部门、请假类型、起止日期、请假原因',
      },
      formName: {
        type: 'string',
        description: '复用已有表单的名称（可选）；提供后流程将绑定该表单而不新建',
      },
    },
    required: ['title', 'requirement'],
  }

  constructor(
    private readonly generation: AiProcessGenerationService,
    private readonly formGeneration: AiFormGenerationService,
    private readonly formService: FormDefinitionService,
    private readonly formWriteService: FormDefinitionWriteService,
    private readonly processDesignService: ProcessDesignService,
  ) {}

  async execute(args: Record<string, unknown>, _context: AiToolContext): Promise<string> {
    const title = String(args?.['title'] ?? '').trim()
    const requirement = String(args?.['requirement'] ?? '').trim()
    const formRequirement = String(args?.['formRequirement'] ?? '').trim()
    const formName = String(args?.['formName'] ?? '').trim()

    if (!title) {
      return JSON.stringify({ error: '缺少 title 参数（流程名称）' })
    }
    if (!requirement) {
      return JSON.stringify({ error: '缺少 requirement 参数（审批环节需求描述）' })
    }

    try {
      // 1. 生成流程计划（LLM）
      const { plan, warnings } = await this.generation.generate({
        title,
        requirement,
        formRequirement: formRequirement === '' ? undefined : formRequirement,
      })
      if (formName !== '') {
        // 用户显式指定表单 → 覆盖计划中的表单引用
        warnings.push(`已按用户指定绑定表单「${formName}」`)
        plan.processFormRef = { formName, formDescription: '' }
      }

      // 2. 表单解析（匹配或新建）
      const formWarnings: string[] = []
      const formId = await this.resolveForm(plan.processFormRef, title, formWarnings)
      warnings.push(...formWarnings)

      // 3. 拼装 BPMN + nodeConfigs
      const bpmnXml = buildLinearProcessBpmnXml(plan, 'http://flowable.org/bpmn')
      const nodeConfigs = this.buildNodeConfigs(plan, formId)

      // 4. 落库：key 冲突自动加后缀重试
      const draft = await this.createDraftWithRetry(plan)

      await this.processDesignService.saveDesign(draft.id, {
        name: plan.name,
        key: plan.key,
        bpmnXml,
        nodeConfigs,
      })

      this.logger.log(
        `[create_process] 已创建流程草稿: name=${plan.name} key=${plan.key} nodes=${plan.nodes.length} formId=${formId ?? '无'}`,
      )

      return JSON.stringify({
        ok: true,
        draftId: draft.id,
        processKey: draft.key,
        name: plan.name,
        status: 'DRAFT',
        nodeCount: plan.nodes.length,
        nodes: plan.nodes.map((n) => ({
          name: n.name,
          type: n.type === 'initiator' ? '发起' : '审批',
          approver:
            n.approval === null
              ? null
              : n.approval.type === 'dept_head'
                ? '部门负责人'
                : n.approval.type === 'expression'
                  ? `表达式 ${n.approval.expression}`
                  : '指定用户',
          formBound: formId !== null && (n.type === 'initiator' || n.formRef !== null),
        })),
        formId,
        warnings,
        designerUrl: `/designer?id=${draft.id}`,
        processListUrl: '/process/definition',
        hint:
          '流程已创建为草稿（未部署）：流程图、节点审批人与表单绑定已按计划配置。' +
          '可点击入口进入流程设计器检查调整，确认无误后点击「部署」发布；' +
          '若审批人需要指定具体用户，需在设计器中逐节点选择。',
      })
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)) || '流程创建失败'
      this.logger.warn(`[create_process] 创建失败: ${msg}`)
      return JSON.stringify({ error: `流程创建失败：${msg}` })
    }
  }

  /**
   * 表单解析：匹配已有工作流表单（名称精确命中 → 首个模糊命中）；
   * 匹配不到且有字段描述 → 复用 formgen 管线新建 WORKFLOW 表单草稿。
   * 两者都不满足 → 返回 null（不绑定，用户可在设计器补配）。
   */
  private async resolveForm(
    ref: PlanFormRef | null,
    fallbackName: string,
    warnings: string[],
  ): Promise<string | null> {
    if (ref === null) {
      warnings.push('未提供表单需求，流程未绑定表单；可在流程设计器中为节点配置表单')
      return null
    }

    // 匹配已有表单
    if (ref.formName !== '') {
      const matched = await this.matchWorkflowForm(ref.formName)
      if (matched !== null) {
        warnings.push(`已绑定已有表单「${matched.name}」`)
        return matched.id
      }
      warnings.push(`未找到名为「${ref.formName}」的工作流表单`)
    }

    // 新建表单
    const description = ref.formDescription !== '' ? ref.formDescription : `${fallbackName} 填报表单`
    const formName = ref.formName !== '' ? ref.formName : `${fallbackName}表单`
    const generated = await this.formGeneration.generateSync(description)
    const key = `ai_${Date.now().toString(36)}${Math.floor(Math.random() * 90 + 10)}`
    const created = await this.formWriteService.create(formName, key, 'WORKFLOW', null)
    const formId = String(created['id'])
    await this.formWriteService.update(formId, null, null, generated.schema, null, null)
    warnings.push(
      `已新建工作流表单「${formName}」（草稿，${generated.fields.length} 字段），可与流程一起在设计器中调整后发布`,
    )
    return formId
  }

  /** 按名称/标识匹配工作流表单（精确优先，其次首个包含命中）。 */
  private async matchWorkflowForm(
    formName: string,
  ): Promise<{ id: string; name: string } | null> {
    const res = await this.formService.list(1, 50, null, formName, 'WORKFLOW')
    if (res.totalElements === 0 || res.content.length === 0) {
      return null
    }
    const exact = res.content.find((f) => f.name === formName || f.key === formName)
    const hit = exact ?? res.content[0]
    return { id: String(hit.id), name: hit.name }
  }

  /** nodeConfigs：发起/审批节点 + __PROCESS__ 流程级表单（契约对齐设计器 PropertyPanel）。 */
  private buildNodeConfigs(plan: ProcessPlan, formId: string | null): Record<string, string> {
    const configs: Record<string, string> = {}

    if (formId !== null) {
      configs['__PROCESS__'] = JSON.stringify({
        form: { formDefId: formId, fieldPermissions: null },
      })
    }

    plan.nodes.forEach((node, index) => {
      const nodeId = `ai_task_${index + 1}`
      const form =
        formId !== null && (node.type === 'initiator' || node.formRef !== null)
          ? { formDefId: formId, fieldPermissions: null }
          : undefined
      if (node.type === 'initiator') {
        const config: Record<string, unknown> = { name: node.name }
        if (form !== undefined) config['form'] = form
        configs[nodeId] = JSON.stringify(config)
        return
      }
      const config: Record<string, unknown> = { name: node.name }
      if (node.approval !== null) config['approval'] = node.approval
      if (node.operations !== null) config['operations'] = node.operations
      if (node.timeout !== null) config['timeout'] = node.timeout
      if (form !== undefined) config['form'] = form
      configs[nodeId] = JSON.stringify(config)
    })

    return configs
  }

  /** createDraft；process_key 冲突（唯一约束）时加时间戳后缀重试，最多 3 次。 */
  private async createDraftWithRetry(plan: ProcessPlan): Promise<{ id: string; key: string }> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const draft = await this.processDesignService.createDraft(plan.name, plan.key, null)
        return { id: draft.id, key: draft.key }
      } catch (e) {
        lastError = e
        plan.key = `${plan.key.slice(0, 38)}_${Date.now().toString(36).slice(-4)}`
      }
    }
    throw lastError instanceof Error ? lastError : new Error('流程草稿创建失败')
  }
}
