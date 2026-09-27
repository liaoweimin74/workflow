import { ProcessPlan } from './ai-process-plan'

/**
 * ProcessPlan → nodeConfigs（契约对齐设计器 PropertyPanel）。
 *
 * 从 create-process.tool 抽取为共享函数：create 与 update 两个工具
 * 使用同一构建规则，保证节点配置结构一致（发起/审批节点 + __PROCESS__
 * 流程级表单），便于测试与后续维护。
 */
export function buildPlanNodeConfigs(plan: ProcessPlan, formId: string | null): Record<string, string> {
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

/**
 * 合并旧节点配置：修改模式下 LLM 输出只覆盖它提到的部分，未提及字段
 * （approval/operations/timeout/form）按「null=未提及→保留旧值」策略从
 * 同名旧节点回填，避免 AI 重建时静默丢失设计器中手工配置。
 *
 * @returns 合并期间产生的提示（哪些节点保留了旧配置）
 */
export function mergeOldNodeConfigs(
  newConfigs: Record<string, string>,
  oldConfigs: Record<string, string>,
): string[] {
  const warnings: string[] = []

  const oldByName = new Map<string, Record<string, unknown>>()
  for (const [id, json] of Object.entries(oldConfigs)) {
    if (id === '__PROCESS__') continue
    try {
      const obj = JSON.parse(json) as Record<string, unknown>
      if (obj && typeof obj['name'] === 'string' && obj['name'] !== '') {
        oldByName.set(obj['name'], obj)
      }
    } catch {
      // 旧配置非法时跳过（不阻塞修改）
    }
  }

  for (const [id, json] of Object.entries(newConfigs)) {
    if (id === '__PROCESS__') continue
    try {
      const obj = JSON.parse(json) as Record<string, unknown>
      const nodeName = typeof obj['name'] === 'string' ? obj['name'] : ''
      const old = nodeName !== '' ? oldByName.get(nodeName) : undefined
      if (old) {
        let touched = false
        if (obj['approval'] == null && old['approval'] != null) {
          obj['approval'] = old['approval']
          warnings.push(`节点「${nodeName}」未提及审批人，已保留原配置`)
          touched = true
        }
        if (obj['timeout'] == null && old['timeout'] != null) {
          obj['timeout'] = old['timeout']
          warnings.push(`节点「${nodeName}」未提及超时设置，已保留原配置`)
          touched = true
        }
        if (obj['operations'] == null && old['operations'] != null) {
          obj['operations'] = old['operations']
          warnings.push(`节点「${nodeName}」未提及操作权限，已保留原配置`)
          touched = true
        }
        if (obj['form'] == null && old['form'] != null) {
          obj['form'] = old['form']
          touched = true
        }
        if (touched) {
          newConfigs[id] = JSON.stringify(obj)
        }
      }
    } catch {
      // 新配置解析失败时保留原样
    }
  }

  // 流程级表单：新计划未给（formId=null）时保留旧 __PROCESS__ 的表单绑定
  const oldProcJson = oldConfigs['__PROCESS__']
  if (oldProcJson && newConfigs['__PROCESS__'] === undefined) {
    try {
      const oldProc = JSON.parse(oldProcJson) as Record<string, unknown>
      if (oldProc['form'] != null) {
        newConfigs['__PROCESS__'] = JSON.stringify({ form: oldProc['form'] })
        warnings.push('流程级表单绑定已保留')
      }
    } catch {
      // 忽略
    }
  }

  return warnings
}

/** 检测 BPMN XML 是否包含 AI 线性重建不支持的结构（网关/子流程/调用活动）。 */
export function containsNonLinearStructure(bpmnXml: string): boolean {
  if (!bpmnXml) return false
  return /<(?:[a-zA-Z0-9]+:)?(exclusiveGateway|parallelGateway|inclusiveGateway|eventBasedGateway|complexGateway|subProcess|callActivity)[\s/>]/.test(
    bpmnXml,
  )
}

/** 从 BPMN XML 按序提取 userTask 摘要（id/name/是否发起节点）。 */
export function extractUserTasks(bpmnXml: string): { id: string; name: string; initiator: boolean }[] {
  const tasks: { id: string; name: string; initiator: boolean }[] = []
  if (!bpmnXml) return tasks
  const pattern = /<(?:[a-zA-Z0-9]+:)?userTask\b([^>]*)>/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(bpmnXml)) !== null) {
    const attrs = match[1]
    const id = /(?:\b|:)id="([^"]*)"/.exec(attrs)?.[1] ?? ''
    const name = /(?:\b|:)name="([^"]*)"/.exec(attrs)?.[1] ?? ''
    const initiator = /(?:\b|:)nodeRole="initiator"/.test(attrs) || /wf:nodeRole="initiator"/.test(attrs)
    tasks.push({ id, name, initiator })
  }
  return tasks
}
