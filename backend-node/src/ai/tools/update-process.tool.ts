import { Injectable, Logger } from '@nestjs/common'
import { AiTool, AiToolContext } from './ai-tool'
import { AiProcessGenerationService } from '../service/ai-process-generation.service'
import { buildLinearProcessBpmnXml } from '../service/ai-process-bpmn'
import {
  buildPlanNodeConfigs,
  containsNonLinearStructure,
  extractUserTasks,
  mergeOldNodeConfigs,
} from '../service/ai-process-node-configs'
import { FormDefinitionService } from '../../engine/form/service/form-definition.service'
import { ProcessDesignService, EditorVO } from '../../engine/process/process-design.service'
import { candidatesPayload, locateFormByName, locateProcessDraftByName } from './locate'

/**
 * 工具：按名称/ID 定位已有流程草稿，应用自然语言修改指令（真实保存设计）。
 *
 * 两种修改路径：
 *   A. 纯改名（仅 newName）→ saveDesign({name})，不动 BPMN 与节点配置；
 *   B. 内容修改（changeRequest/formName）→ 线性重建：
 *      从现有 XML+nodeConfigs 提取「当前计划摘要」→ LLM 修改模式生成新计划
 *      （未提及部分原样保留）→ 重建 BPMN + nodeConfigs（旧同名节点的
 *      approval/operations/timeout/form 在新计划未提及时保留）→ saveDesign。
 *
 * 安全边界：
 *   - 含网关/子流程/调用活动的流程拒绝结构重建（提示到设计器手工调整），
 *     避免破坏手工设计；纯改名仍可用；
 *   - key 强制保持原值（修改 key 会破坏与已部署版本/实例的关联）；
 *   - 修改不新建表单（无副作用），表单换绑仅支持绑定已有工作流表单；
 *   - DEPLOYED 草稿修改后返回 warning 提醒重新部署。
 */
@Injectable()
export class UpdateProcessTool implements AiTool {
  static readonly NAME = 'update_process'

  private readonly logger = new Logger(UpdateProcessTool.name)

  name = UpdateProcessTool.NAME

  description =
    '修改一个**已存在**的审批流程草稿（真实保存修改）。当用户想修改、调整流程时调用，' +
    '例如：改某环节审批人、增加/减少审批环节、调整环节顺序、给流程换绑表单、流程改名。' +
    '参数：changeRequest=修改要求（如「把「HR 备案」环节的审批人改成部门负责人」「在主管审批后加一个总经理审批环节」）；' +
    'processName=流程名称（与 draftId 二选一，建议先用 list_processes 确认）；draftId=流程草稿 ID（可选）；' +
    'formName=换绑为该已有工作流表单（可选）；newName=流程改名（可选）。'

  parametersSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      changeRequest: {
        type: 'string',
        description: '流程修改要求描述（改审批人/增删环节/改顺序等）',
      },
      processName: {
        type: 'string',
        description: '要修改的流程名称（精确名称，可用 list_processes 先查询）',
      },
      draftId: {
        type: 'string',
        description: '流程草稿 ID（已知时优先使用）',
      },
      formName: {
        type: 'string',
        description: '换绑为该已有工作流表单的名称（可选，仅支持已有表单）',
      },
      newName: {
        type: 'string',
        description: '新的流程名称（仅在用户要求重命名时提供）',
      },
    },
    required: [],
  }

  constructor(
    private readonly generation: AiProcessGenerationService,
    private readonly formService: FormDefinitionService,
    private readonly processDesignService: ProcessDesignService,
  ) {}

  async execute(args: Record<string, unknown>, _context: AiToolContext): Promise<string> {
    const changeRequest = String(args?.['changeRequest'] ?? '').trim()
    const processName = String(args?.['processName'] ?? '').trim()
    const draftIdArg = String(args?.['draftId'] ?? '').trim()
    const formName = String(args?.['formName'] ?? '').trim()
    const newName = String(args?.['newName'] ?? '').trim()

    if (!changeRequest && !formName && !newName) {
      return JSON.stringify({
        error: '缺少修改内容：请提供 changeRequest（修改要求）或 formName（换绑表单）或 newName（改名）',
      })
    }
    if (!processName && !draftIdArg) {
      return JSON.stringify({
        error: '缺少目标流程：请提供 processName（可先调用 list_processes 查询）或 draftId',
      })
    }

    try {
      // 1. 定位草稿
      let draftId: string
      if (draftIdArg !== '') {
        try {
          await this.processDesignService.loadEditor(draftIdArg)
          draftId = draftIdArg
        } catch {
          return JSON.stringify({ error: `未找到 ID 为 ${draftIdArg} 的流程草稿` })
        }
      } else {
        const located = await locateProcessDraftByName(this.processDesignService, processName)
        if (located.status === 'none') {
          return JSON.stringify({
            error: `未找到名称包含「${processName}」的流程草稿，可先调用 list_processes 查询`,
          })
        }
        if (located.status === 'multiple') {
          return candidatesPayload('流程', located.candidates)
        }
        draftId = located.target.id
      }

      const editor = await this.processDesignService.loadEditor(draftId)

      // 2. 纯改名：不动 XML 与节点配置
      if (changeRequest === '' && formName === '') {
        await this.processDesignService.saveDesign(draftId, { name: newName })
        this.logger.log(`[update_process] 已改名: id=${draftId} → ${newName}`)
        return JSON.stringify({
          ok: true,
          draftId,
          processKey: editor.key,
          name: newName,
          status: editor.status,
          changes: { renamed: true },
          warnings:
            editor.status === 'DEPLOYED'
              ? ['流程已部署，改名后无需重新部署（名称不参与编译），但实例列表展示名将随新版本更新']
              : [],
          designerUrl: `/designer?id=${draftId}`,
          hint: '流程名称已修改并保存。',
        })
      }

      // 3. 结构重建的安全边界：含网关/子流程的流程拒绝重建
      if (containsNonLinearStructure(editor.bpmnXml)) {
        return JSON.stringify({
          error:
            '该流程包含网关分支/子流程等复杂结构，AI 暂不支持自动修改（会破坏手工设计）；' +
            '请进入流程设计器手工调整，或仅要求 AI 修改流程名称',
          designerUrl: `/designer?id=${draftId}`,
        })
      }

      // 4. 表单解析：换绑优先，其次沿用现有流程级表单
      let formId: string | null = null
      const warnings: string[] = []
      if (formName !== '') {
        const located = await locateFormByName(this.formService, formName, 'WORKFLOW')
        if (located.status === 'multiple') {
          return candidatesPayload('表单', located.candidates)
        }
        if (located.status === 'none') {
          return JSON.stringify({
            error: `未找到名为「${formName}」的工作流表单；换绑仅支持已有工作流表单（可先调用 list_forms type=WORKFLOW 查询）`,
          })
        }
        formId = String(located.target.id)
        warnings.push(`已换绑表单「${located.target.name}」`)
      } else {
        formId = extractBoundFormId(editor)
        if (formId === null) {
          warnings.push('原流程未绑定表单，本次修改未新增绑定（如需绑定请提供 formName 或到设计器配置）')
        }
      }

      // 5. 构建当前计划摘要 → LLM 修改模式生成新计划
      const currentPlan = buildCurrentPlanSummary(editor)
      const { plan, warnings: planWarnings } = await this.generation.generate({
        title: editor.name,
        requirement: changeRequest,
        currentPlan,
      })
      warnings.push(...planWarnings)

      // 6. 修改模式硬约束：key 保持原值；显式 newName 覆盖名称
      plan.key = editor.key
      if (newName !== '') {
        plan.name = newName
      }

      // 7. 重建 BPMN + nodeConfigs，合并旧配置（未提及字段保留）
      const bpmnXml = buildLinearProcessBpmnXml(plan, 'http://flowable.org/bpmn')
      const nodeConfigs = buildPlanNodeConfigs(plan, formId)
      const mergeWarnings = mergeOldNodeConfigs(nodeConfigs, editor.nodeConfigs ?? {})
      warnings.push(...mergeWarnings)

      // 8. 保存设计（key 不传 → 沿用原 key）
      await this.processDesignService.saveDesign(draftId, {
        name: plan.name,
        bpmnXml,
        nodeConfigs,
      })

      this.logger.log(
        `[update_process] 已修改流程: id=${draftId} name=${plan.name} nodes=${plan.nodes.length} formId=${formId ?? '沿用/无'}`,
      )

      if (editor.status === 'DEPLOYED') {
        warnings.push('该流程已部署过：本次修改的是草稿设计，需在设计器中重新「部署」才会生成新版本生效')
      }

      return JSON.stringify({
        ok: true,
        draftId,
        processKey: editor.key,
        name: plan.name,
        status: editor.status,
        nodeCount: plan.nodes.length,
        nodes: plan.nodes.map((n) => ({
          name: n.name,
          type: n.type === 'initiator' ? '发起' : n.type === 'handler' ? '办理' : '审批',
          approver:
            n.approval === null
              ? null
              : n.approval.type === 'dept_head'
                ? '部门负责人'
                : n.approval.type === 'expression'
                  ? `表达式 ${n.approval.expression}`
                  : n.approval.type === 'initiator_select'
                    ? '发起人自选'
                    : '指定用户',
        })),
        formId,
        warnings,
        designerUrl: `/designer?id=${draftId}`,
        hint:
          '流程修改已保存到草稿。' +
          (editor.status === 'DEPLOYED'
            ? '流程已部署过，修改需重新部署生成新版本后生效。'
            : '可在流程设计器中检查后点击「部署」发布。'),
      })
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)) || '流程修改失败'
      this.logger.warn(`[update_process] 修改失败: ${msg}`)
      return JSON.stringify({ error: `流程修改失败：${msg}` })
    }
  }
}

/** 从编辑器数据提取流程级表单绑定（__PROCESS__ → 发起节点兜底）。 */
function extractBoundFormId(editor: EditorVO): string | null {
  const configs = editor.nodeConfigs ?? {}
  try {
    if (configs['__PROCESS__']) {
      const obj = JSON.parse(configs['__PROCESS__']) as Record<string, unknown>
      const form = obj['form'] as Record<string, unknown> | undefined
      if (form && typeof form['formDefId'] === 'string' && form['formDefId'] !== '') {
        return form['formDefId']
      }
    }
  } catch {
    // 忽略
  }
  // 兜底：发起节点的 form
  for (const [id, json] of Object.entries(configs)) {
    if (id === '__PROCESS__') continue
    try {
      const obj = JSON.parse(json) as Record<string, unknown>
      const form = obj['form'] as Record<string, unknown> | undefined
      if (form && typeof form['formDefId'] === 'string' && form['formDefId'] !== '') {
        return form['formDefId']
      }
    } catch {
      // 忽略
    }
  }
  return null
}

/** 把编辑器数据（XML + nodeConfigs）折算成 LLM 可读的「当前流程计划」JSON。 */
export function buildCurrentPlanSummary(editor: EditorVO): string {
  const tasks = extractUserTasks(editor.bpmnXml)
  const configs = editor.nodeConfigs ?? {}

  const parseConfig = (id: string): Record<string, unknown> | null => {
    const json = configs[id]
    if (!json) return null
    try {
      const obj = JSON.parse(json) as Record<string, unknown>
      return obj && typeof obj === 'object' ? obj : null
    } catch {
      return null
    }
  }

  const nodes = tasks.map((t) => {
    const cfg = parseConfig(t.id)
    const approval = cfg && cfg['approval'] != null ? cfg['approval'] : null
    const timeout = cfg && cfg['timeout'] != null ? cfg['timeout'] : null
    const hasForm = !!(cfg && cfg['form'] != null)
    return {
      type: t.initiator ? 'initiator' : t.handler ? 'handler' : 'userTask',
      name: t.name || cfg?.['name'] || t.id,
      approval,
      timeout,
      form: hasForm ? '（已绑定表单）' : null,
    }
  })

  // XML 无任务时退回 nodeConfigs 的名称信息（防御：空/手绘 XML）
  if (nodes.length === 0) {
    for (const [id, json] of Object.entries(configs)) {
      if (id === '__PROCESS__') continue
      try {
        const obj = JSON.parse(json) as Record<string, unknown>
        if (typeof obj['name'] === 'string') {
          nodes.push({
            type: obj['taskRole'] === 'handler' ? 'handler' : 'userTask',
            name: obj['name'],
            approval: obj['approval'] ?? null,
            timeout: obj['timeout'] ?? null,
            form: obj['form'] != null ? '（已绑定表单）' : null,
          })
        }
      } catch {
        // 忽略
      }
    }
  }

  let processForm: unknown = null
  try {
    const procCfg = configs['__PROCESS__'] ? (JSON.parse(configs['__PROCESS__']) as Record<string, unknown>) : null
    if (procCfg && procCfg['form'] != null) processForm = '（已绑定表单）'
  } catch {
    // 忽略
  }

  return JSON.stringify({
    name: editor.name,
    key: editor.key,
    processForm,
    nodes,
  })
}
