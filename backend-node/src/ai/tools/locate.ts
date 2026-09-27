import { FormDefinitionService, FormDefinitionVO } from '../../engine/form/service/form-definition.service'
import { ProcessDesignService } from '../../engine/process/process-design.service'

/**
 * AI 工具共享的「按名称定位」帮助函数。
 *
 * 名称匹配策略（与 create-process 的 matchWorkflowForm 一致并增强）：
 *   1. name / key 精确命中（唯一才算）；
 *   2. 名称包含式模糊命中——唯一命中直接采用，多个命中返回候选列表
 *      让 LLM 向用户澄清，零命中返回 none。
 */

export type LocateResult<T> =
  | { status: 'unique'; target: T }
  | { status: 'multiple'; candidates: T[] }
  | { status: 'none' }

/** 按名称/标识定位表单（最多扫描 50 条）。 */
export async function locateFormByName(
  formService: FormDefinitionService,
  formName: string,
  type: string | null = null,
): Promise<LocateResult<FormDefinitionVO>> {
  const res = await formService.list(1, 50, null, formName, type)
  if (res.totalElements === 0 || res.content.length === 0) {
    return { status: 'none' }
  }
  const exact = res.content.filter((f) => f.name === formName || f.key === formName)
  if (exact.length === 1) {
    return { status: 'unique', target: exact[0] }
  }
  if (exact.length > 1) {
    return { status: 'multiple', candidates: exact }
  }
  const fuzzy = res.content.filter((f) => f.name.includes(formName) || f.key.includes(formName))
  if (fuzzy.length === 1) {
    return { status: 'unique', target: fuzzy[0] }
  }
  if (fuzzy.length > 1) {
    return { status: 'multiple', candidates: fuzzy }
  }
  return { status: 'none' }
}

/** 按名称/标识定位流程草稿（listDrafts 不支持关键字，内存过滤，最多扫描 50 条）。 */
export async function locateProcessDraftByName(
  processDesignService: ProcessDesignService,
  processName: string,
): Promise<LocateResult<{ id: string; key: string; name: string; status: string }>> {
  const res = await processDesignService.listDrafts(1, 50)
  const rows = res.content.map((d) => ({ id: d.id, key: d.key, name: d.name, status: d.status }))
  if (rows.length === 0) {
    return { status: 'none' }
  }
  const exact = rows.filter((d) => d.name === processName || d.key === processName)
  if (exact.length === 1) {
    return { status: 'unique', target: exact[0] }
  }
  if (exact.length > 1) {
    return { status: 'multiple', candidates: exact }
  }
  const fuzzy = rows.filter((d) => d.name.includes(processName) || d.key.includes(processName))
  if (fuzzy.length === 1) {
    return { status: 'unique', target: fuzzy[0] }
  }
  if (fuzzy.length > 1) {
    return { status: 'multiple', candidates: fuzzy }
  }
  return { status: 'none' }
}

/** 候选列表 → 工具返回体（引导 LLM 向用户澄清）。 */
export function candidatesPayload(kind: string, candidates: { id: string; name: string; key: string; status?: string }[]): string {
  return JSON.stringify({
    error: `找到多个名称包含该关键词的${kind}，请让用户确认具体是哪一个`,
    candidates: candidates.map((c) => ({ id: c.id, name: c.name, key: c.key, status: c.status ?? null })),
    hint: '将候选列表展示给用户，让用户明确名称后重新调用（formName/processName 使用完整名称）',
  })
}
