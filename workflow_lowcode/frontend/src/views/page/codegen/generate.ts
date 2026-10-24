/**
 * 出码入口：schema → IR → 产物 + manifest + 体检报告。
 *
 * 判定与登记全部在 parse.ts（读 schema 与契约表），模板与 manifest 生成全部在 emit.ts
 * （只读 IR），报告在 report.ts（读契约表 + 当场回读本函数产出的产物）。本文件只做编排，
 * 保持 `generatePage` 的旧签名，外部调用方无需感知分层。
 */

import { emitFiles, emitManifest } from './emit'
import type { GenerateResult } from './ir'
import { parseIr } from './parse'
import { buildReport } from './report'

export { emitFiles, emitManifest, emitTemplate, refreshCall, refreshThen } from './emit'
export { parseIr } from './parse'
export type {
  Behavior,
  GenerateReport,
  GenerateResult,
  GeneratedManifest,
  HoleBucket,
  NodeArtifact,
  NodeHost,
  Rename,
  ReportHole,
  ReportNode,
  ReportRenameFailure,
  Unsupported,
  Warning,
} from './ir'

export function generatePage(
  schema: { rule: any[]; option: any; dataSources: any[]; actions: any[] },
  meta: { pageKey: string; pageName: string; exportedAt: string; target?: 'web' | 'uniapp' },
): GenerateResult {
  const ir = parseIr(schema, meta)
  const files = emitFiles(ir)
  // 本入口只出 web 产物（uniapp 走 uni/emit-uni 的 generatePageUni）：manifest 的
  // 「页面根级未装配」登记随之按 web 口径（见 emitManifest 的 target）。
  const manifest = emitManifest(ir, 'web')
  return { files, manifest, report: buildReport(schema, meta.pageKey, manifest, files, meta.target ?? 'web') }
}
