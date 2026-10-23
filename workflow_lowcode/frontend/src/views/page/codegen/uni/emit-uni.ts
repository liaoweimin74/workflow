/**
 * emitUniApp：uniapp 目标出码编排入口。
 *
 * design G3/D5：parse → IR 与 web 出码完全同源复用，本模块只做编排与工程文件组装：
 *  · 页面 SFC 装配（Task 5.1 起）：view 根容器 + 逐顶层节点分派——page-list-cards 走
 *    emitListNode 片段（模板缩 2 格、script/import/unsupported 并入页面），其余组件族
 *    以 lc:todo 注释挂点占位，族装配按任务落地（5.2 容器族、6.x 表格族、7.x 字段族）；
 *  · pages.json / manifest.json / App.vue（project-files，清单即真相）；
 *  · 报告（Task 2.4 per-target，uniapp 维度）：uni 片段的 unsupported 合并进 manifest
 *    后喂报告——「按端不支持」与「共享 parse 拒绝」在同一份清单里可见。
 */

import { emitManifest } from '../emit'
import type { GenerateResult, IrPage, Unsupported } from '../ir'
import { parseIr } from '../parse'
import { buildReport } from '../report'
import { PROFILES } from '../target-profile'
import { emitListNode } from './emit-list'
import { buildAppVue, buildManifestJson, buildPagesJson, type UniClientConfig } from './project-files'

export function generatePageUni(
  schema: { rule: any[]; option: any; dataSources: any[]; actions: any[] },
  meta: { pageKey: string; pageName: string; client: UniClientConfig },
): GenerateResult {
  const ir = parseIr(schema, { pageKey: meta.pageKey, pageName: meta.pageName, exportedAt: 'emit-uni' })
  const base = emitManifest(ir)
  const page = emitPage(ir)
  // uni 侧缺口（容器族语义/详情弹窗/未装配组件族）并入 manifest：报告与后续反读看到同一份真相
  const manifest = { ...base, unsupported: [...base.unsupported, ...page.unsupported] }
  const files: Record<string, string> = {
    [`src/pages/gen/${meta.pageKey}.vue`]: page.source,
    'src/pages.json': buildPagesJson(meta.client),
    'src/manifest.json': buildManifestJson(meta.client),
    'src/App.vue': buildAppVue(),
  }

  // 报告：per-target（Task 2.4）uniapp 维度。空洞反读需要 uniapp 模板反读器
  // （uniapp 模板非 el-* 形态，web reverse 不适用，Task 10.x 语料 Gate 时配套落），
  // 此处不喂产物 → holes 为空是「暂无可反读产物」的诚实值；unsupported（含
  // 三区能力矩阵条目 + uni 侧缺口）与 per-target 可出码率为真值。
  const report = buildReport(schema, meta.pageKey, manifest, {}, 'uniapp')
  return { files, manifest, report }
}

/**
 * 页面 SFC 装配：模板 = view 根容器 + 逐顶层节点分派；script = 片段 imports（去重保序）
 * + 数据源常量 + 片段 script。页面名不再注入 SFC——标题由 pages.json
 * navigationBarTitleText 承担（Task 3.1 的骨架注入随之移除）。
 */
function emitPage(ir: IrPage): { source: string; unsupported: Unsupported[] } {
  const unsupported: Unsupported[] = []
  const imports: string[] = []
  const scripts: string[] = []

  // 模板主体（相对缩进 0，SFC 组装时统一缩 2 格）
  const T: string[] = ['<view class="lc-page">']
  for (const n of ir.nodes) {
    if (n.artifact.type === 'page-list-cards') {
      const frag = emitListNode(n, ir, PROFILES.uniapp)
      T.push(...frag.template.split('\n').map((l) => (l ? `  ${l}` : l)))
      imports.push(...frag.imports)
      scripts.push(...frag.script)
      unsupported.push(...frag.unsupported)
    } else {
      // 未装配组件族：锚点挂点保留（回读侧按地址回节点），族装配按任务落地
      T.push(
        `  <!-- lc:todo node=${n.artifact.id} type=${n.artifact.type} field=${n.artifact.field} 组件族 uniapp 装配按任务落地 -->`,
      )
    }
  }
  T.push('</view>')

  // script：imports 去重保序（多列表节点共享同一组 import）→ 数据源常量 → 片段 script
  const S: string[] = []
  const seen = new Set<string>()
  for (const i of imports) {
    if (seen.has(i)) continue
    seen.add(i)
    S.push(i)
  }
  // 数据源常量：对位 web emit.ts 227-233（ds 恒出，登记表有源才出）
  const ds = ir.dataSources[0] ?? { id: '', refId: '' }
  S.push(`const ds = { id: '${ds.id}', refId: '${ds.refId}' }`)
  if (ir.dataSources.length) {
    S.push('// 逐源登记表：页面声明的几个源都在册（含未绑到组件的），人工补接线时按 id 取 refId')
    S.push('const dataSources = {')
    ir.dataSources.forEach((d) => S.push(`  '${d.id}': '${d.refId}',`))
    S.push('}')
  }
  S.push(...scripts)

  return {
    source: [
      '<template>',
      ...T.map((l) => (l ? `  ${l}` : l)),
      '</template>',
      '',
      '<script setup lang="ts">',
      ...S,
      '</script>',
      '',
      '<style scoped>',
      '.lc-page {',
      '  padding: 24rpx;',
      '}',
      '</style>',
    ].join('\n'),
    unsupported,
  }
}
