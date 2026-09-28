import type { ProcessPolicy } from './process-model'

/**
 * 流程级策略解析与模板渲染。
 *
 * ⚠️ 独立成文件的原因：task.service 与 process-instance.service 存在相互 import
 *    （后者要用 parseProcessPolicy/renderProcessTemplate）——ESM 循环加载会让
 *    Nest 反射到的类变成 undefined（DI 装配当场报 "argument at index [N] is
 *    undefined"）。放到无依赖的叶子文件里双方安全引用。
 */

/** 流程级总控配置的伪节点 ID（Java `WorkflowTaskService` 里的字面量）。 */
export const PROCESS_LEVEL_NODE_ID = '__PROCESS__'

/** 宽松布尔（仅 true 为真；策略默认全关，与 operations 的 Boolean() 口径区分）。 */
function strictTrue(value: unknown): boolean {
  return value === true
}

/**
 * 解析流程级策略（designerStore ProcessConfigData 的服务端镜像；宽松解析，缺省安全）。
 *
 * 读的是 `__PROCESS__` 行 config_json 顶层 + approvalPolicy 子树：
 *   approvalPolicy.{deduplication,commentPolicy,signaturePolicy,comment,approveRecall,retakeSkipApproved}
 *   顶层 {timeoutRules,titleRule,summaryRule,dynamicProcess}
 * 缺省值 = 全关（策略默认不改变既有行为）。
 */
export function parseProcessPolicy(configJson: string | null): ProcessPolicy {
  const out: ProcessPolicy = {
    dedup: { enabled: false, mode: 'FIRST', skipSameAsInitiator: false },
    commentPolicy: { enabled: false, scope: 'REJECT_RETURN' },
    signaturePolicy: { enabled: false, useLast: false, allowUpload: false, required: false },
    comment: { disabled: false, disallowDelete: false, disallowAttachment: false },
    approveRecall: false,
    retakeSkipApproved: false,
    timeoutRules: [],
    titlePattern: null,
    summaryFields: [],
    summaryShowInSms: false,
  }
  if (configJson === null) return out
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(configJson) as Record<string, unknown>
  } catch {
    return out
  }

  const policy = parsed.approvalPolicy
  if (policy !== null && typeof policy === 'object' && !Array.isArray(policy)) {
    const p = policy as Record<string, unknown>

    const dedup = p.deduplication
    if (dedup !== null && typeof dedup === 'object' && !Array.isArray(dedup)) {
      const d = dedup as Record<string, unknown>
      out.dedup.enabled = strictTrue(d.enabled)
      if (d.mode === 'CONSECUTIVE' || d.mode === 'FIRST' || d.mode === 'LAST') {
        out.dedup.mode = d.mode
      }
      out.dedup.skipSameAsInitiator = strictTrue(d.skipSameAsInitiator)
    }

    const commentPolicy = p.commentPolicy
    if (commentPolicy !== null && typeof commentPolicy === 'object' && !Array.isArray(commentPolicy)) {
      const c = commentPolicy as Record<string, unknown>
      out.commentPolicy.enabled = strictTrue(c.enabled)
      if (c.scope === 'REJECT_RETURN' || c.scope === 'ALL') out.commentPolicy.scope = c.scope
    }

    const signaturePolicy = p.signaturePolicy
    if (signaturePolicy !== null && typeof signaturePolicy === 'object' && !Array.isArray(signaturePolicy)) {
      const s = signaturePolicy as Record<string, unknown>
      out.signaturePolicy = {
        enabled: strictTrue(s.enabled),
        useLast: strictTrue(s.useLast),
        allowUpload: strictTrue(s.allowUpload),
        required: strictTrue(s.required),
      }
    }

    const comment = p.comment
    if (comment !== null && typeof comment === 'object' && !Array.isArray(comment)) {
      const c = comment as Record<string, unknown>
      out.comment = {
        disabled: strictTrue(c.disabled),
        disallowDelete: strictTrue(c.disallowDelete),
        disallowAttachment: strictTrue(c.disallowAttachment),
      }
    }

    out.approveRecall = strictTrue(p.approveRecall)
    out.retakeSkipApproved = strictTrue(p.retakeSkipApproved)
  }

  // 流程级超时规则组（顶层）：仅保留合法 action/duration 的规则
  const rules = parsed.timeoutRules
  if (Array.isArray(rules)) {
    for (const raw of rules) {
      if (raw === null || typeof raw !== 'object') continue
      const r = raw as Record<string, unknown>
      if (r.action !== 'remind' && r.action !== 'transfer' && r.action !== 'pass' && r.action !== 'refuse') {
        continue
      }
      const duration = Number(r.duration)
      if (!Number.isFinite(duration) || duration <= 0) continue
      const unit = r.unit === 'minute' || r.unit === 'day' ? r.unit : 'hour'
      out.timeoutRules.push({
        id: typeof r.id === 'string' && r.id !== '' ? r.id : `rule-${out.timeoutRules.length}`,
        action: r.action,
        duration: Math.floor(duration),
        unit,
        repeat: strictTrue(r.repeat),
        notifyAssignee: r.notifyAssignee !== false,
        notifyAdmin: strictTrue(r.notifyAdmin),
        notifyUserIds: Array.isArray(r.notifyUserIds)
          ? (r.notifyUserIds as unknown[]).filter((u): u is string => typeof u === 'string')
          : [],
        sms: r.sms !== false,
      })
    }
  }

  // 自定义标题模板（顶层 titleRule）
  const titleRule = parsed.titleRule
  if (titleRule !== null && typeof titleRule === 'object' && !Array.isArray(titleRule)) {
    const t = titleRule as Record<string, unknown>
    if (strictTrue(t.enabled) && typeof t.pattern === 'string' && t.pattern.trim() !== '') {
      out.titlePattern = t.pattern.trim()
    }
  }

  // 自定义摘要（顶层 summaryRule）：字段 ≤5；showInSms 仅在摘要启用时有意义
  const summaryRule = parsed.summaryRule
  if (summaryRule !== null && typeof summaryRule === 'object' && !Array.isArray(summaryRule)) {
    const s = summaryRule as Record<string, unknown>
    if (strictTrue(s.enabled) && Array.isArray(s.fields)) {
      out.summaryFields = (s.fields as unknown[])
        .filter((f): f is string => typeof f === 'string' && f.trim() !== '')
        .map((f) => f.trim())
        .slice(0, 5)
      out.summaryShowInSms = strictTrue(s.showInSms)
    }
  }

  return out
}

/**
 * 渲染流程模板（自定义审批标题）：{{processName}}/{{initiator}}/{{date}}/{{表单字段}}。
 * 未知变量渲染为空串；日期格式 yyyy-MM-dd。
 */
export function renderProcessTemplate(
  pattern: string,
  ctx: { processName: string; initiator: string | null; variables: Record<string, unknown> },
): string {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return pattern.replace(/\{\{\s*([\w\u4e00-\u9fa5]+)\s*\}\}/g, (_m: string, key: string) => {
    if (key === 'processName') return ctx.processName
    if (key === 'initiator') return ctx.initiator ?? ''
    if (key === 'date') return date
    const value = ctx.variables[key]
    if (value === undefined || value === null) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  })
}
