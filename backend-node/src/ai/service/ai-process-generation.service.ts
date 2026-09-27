import { Injectable, Logger } from '@nestjs/common'
import { AiError } from './ai-error'
import { normalizePlan, type NormalizedPlan } from './ai-process-plan'
import { LlmMessage, ZaiLlmService } from './zai-llm.service'

/**
 * AI 流程计划生成服务（模式对齐 AiFormGenerationService）。
 *
 * 编排：prompt 组装 → LLM 调用（平台内置模型）→ JSON 提取 → 归一化校验。
 * 产出 ProcessPlan（中间表示，不含 XML）——BPMN 由 ai-process-bpmn 按确定性
 * 模板拼装，表单解析/落库由 create-process.tool 编排，本服务不碰数据库。
 */

/** 生成输入：自然语言需求。 */
export interface ProcessPlanInput {
  /** 流程名称/主题，例如「员工请假审批」。 */
  title: string
  /** 审批环节需求描述，例如「提交后主管审批，超过 3 天再由 HR 备案」。 */
  requirement: string
  /** 可选：发起表单字段需求描述。 */
  formRequirement?: string
  /** 可选：当前流程计划摘要（修改模式用，JSON 字符串）。 */
  currentPlan?: string
}

/** 系统提示：输出契约与设计规则。 */
function buildSystemPrompt(): string {
  return [
    '你是「工作流管理平台」的流程设计专家。根据用户的自然语言需求，设计一个线性审批流程计划，输出严格的 JSON。',
    '',
    '输出格式（整条回复只允许一个 JSON 对象，禁止输出任何其他文字、解释或代码围栏）：',
    '{',
    '  "name": "流程名称（中文，简洁）",',
    '  "key": "process_key（小写字母开头，仅小写字母/数字/下划线，3-50位）",',
    '  "processForm": {"formName": "已有表单名称或空", "formDescription": "发起表单字段需求描述（无则空串）"} 或 null,',
    '  "nodes": [',
    '    {"type": "initiator", "name": "提交申请"},',
    '    {"type": "userTask", "name": "节点名", "approval": {"type": "dept_head", "multiMode": ""}, "operations": {"allowReject": true, "allowAddSign": false, "allowTransfer": true, "allowDelegate": false}, "timeout": {"duration": 48, "action": "remind"}, "form": null}',
    '  ]',
    '}',
    '',
    '设计规则：',
    '- 第一个节点必须是 {"type": "initiator"} 发起节点（通常名为「提交申请」）；其后为 1~7 个 userTask 审批节点。',
    '- 节点类型 userTask=审批节点（通过/拒绝）；handler=办理节点（仅提交/转派/退回，无通过/拒绝语义）——用户明确说某环节是「办理/传阅/填报/备案」而非审批时用 handler。',
    '- approval.type 取值：dept_head=部门负责人（默认首选）；expression=流程表达式（需填 expression，如 ${initiator.deptManager}）；user=指定用户（仅在用户明确点名具体审批人时使用，userIds 留空数组）；initiator_select=发起人自选（用户说「由发起人自行选择审批人/办理人」时使用）。',
    '- multiMode 多人模式仅在描述中出现会签/或签/依次审批时设置，否则留空串。',
    '- operations 按审批语义设置：一般 allowReject=true、allowTransfer=true、allowAddSign=false、allowDelegate=false；末级备案类节点可关闭驳回。',
    '- timeout.duration 单位小时；用户未提超时则整个 timeout 字段省略。',
    '- processForm：用户描述了要填写的字段（如请假类型、起止日期）时，把字段清单写进 formDescription；用户提到复用已有表单时把表单名写进 formName；两者都没有则 processForm 为 null。',
    '- 节点不绑定表单时 form 为 null（节点表单只在用户明确说某环节需要独立填报时才给）。',
    '- 审批环节按用户描述的顺序编排；用户没描述审批环节时，设计一个合理的默认审批链（如直属负责人审批）。',
    '- name/key 不得与用户输入无关的占位词（如 xxx、test）。',
    '- 修改模式：输入会附带「当前流程计划」，只需应用用户要求的变更；未提及的节点、名称、',
    '  审批人、顺序必须原样保留（key 也保持不变）；仅在用户明确要求增删环节/调整顺序时才改动节点序列。',
  ].join('\n')
}

/** 组装 LLM 消息。 */
export function buildProcessPlanMessages(input: ProcessPlanInput): LlmMessage[] {
  const parts: string[] = []
  if (input.title.trim() !== '') {
    parts.push(`流程名称/主题：${input.title.trim()}`)
  }
  parts.push(`审批环节需求：${input.requirement.trim() || input.title.trim()}`)
  if (input.formRequirement && input.formRequirement.trim() !== '') {
    parts.push(`发起表单字段需求：${input.formRequirement.trim()}`)
  }
  if (input.currentPlan && input.currentPlan.trim() !== '') {
    parts.push([
      '当前流程计划（修改基准，未提及的部分保持原样）：',
      input.currentPlan.trim(),
    ].join('\n'))
  }
  return [
    { role: 'assistant', content: buildSystemPrompt() },
    { role: 'user', content: parts.join('\n') },
  ]
}

/** 从模型回复中提取 JSON（兼容围栏与前后杂散文本）。 */
export function extractPlanJson(text: string): unknown {
  if (!text) {
    throw new AiError('MODEL_ERROR', 'AI 未返回流程计划')
  }
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    s = fence[1].trim()
  } else {
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start >= 0 && end > start) {
      s = s.slice(start, end + 1)
    }
  }
  try {
    return JSON.parse(s)
  } catch {
    throw new AiError('MODEL_ERROR', 'AI 返回的流程计划不是合法 JSON')
  }
}

@Injectable()
export class AiProcessGenerationService {
  static readonly MODULE = 'process-gen'

  private readonly logger = new Logger(AiProcessGenerationService.name)

  constructor(private readonly llm: ZaiLlmService) {}

  /** 同步生成：LLM → JSON 提取 → 归一化。偶发输出跑飞时自动重试一次。 */
  async generate(input: ProcessPlanInput): Promise<NormalizedPlan> {
    const messages = buildProcessPlanMessages(input)
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.llm.complete(messages)
        const parsed = extractPlanJson(raw)
        const normalized = normalizePlan(parsed)
        this.logger.log(
          `[${AiProcessGenerationService.MODULE}] 生成成功（第 ${attempt + 1} 次尝试）：nodes=${normalized.plan.nodes.length} warnings=${normalized.warnings.length}`,
        )
        return normalized
      } catch (e) {
        lastError = e
        this.logger.warn(
          `[${AiProcessGenerationService.MODULE}] 生成第 ${attempt + 1} 次尝试失败: ${e instanceof Error ? e.message : String(e)}`,
        )
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }
    }
    throw lastError
  }
}
