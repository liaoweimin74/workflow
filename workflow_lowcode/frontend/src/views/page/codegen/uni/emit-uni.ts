/**
 * emitUniApp：uniapp 目标出码编排入口。
 *
 * design G3/D5：parse → IR 与 web 出码完全同源复用，本模块只做编排与工程文件组装：
 *  · 页面 SFC 装配（Task 5.1 起）：view 根容器 + 逐顶层节点分派——page-list-cards 走
 *    emitListNode、formContainer 走 emitContainerNode（容器段，Task 5.2）、展示组件族
 *    （page-steps/page-detail/page-data-container）走 emitWidgetNode（Task 5.2），片段
 *    模板缩 2 格、script/import/unsupported 并入页面；其余组件族以 lc:todo 注释挂点
 *    占位，族装配按任务落地（6.x 表格族、7.x 字段族）；
 *  · pages.json / manifest.json / App.vue（project-files，清单即真相）；
 *  · 脚本链装配（Task 5.3）：script 函数体照搬（scriptFunction 复用 web 同款）+ 材料
 *    注入（message→uniMessage、page→pageKey 常量、http→uniHttpShim）；
 *  · 报告（Task 2.4 per-target，uniapp 维度）：uni 片段的 unsupported 合并进 manifest
 *    后喂报告——「按端不支持」与「共享 parse 拒绝」在同一份清单里可见。
 */

import { emitManifest } from '../emit'
import { materialsOf, scriptFunction } from '../chain-emit'
import type { GenerateResult, IrPage, Unsupported } from '../ir'
import { parseIr } from '../parse'
import { buildReport } from '../report'
import { PROFILES } from '../target-profile'
import { emitContainerNode } from './emit-container'
import { emitListNode } from './emit-list'
import { emitWidgetNode } from './emit-widget'
import { buildAppVue, buildManifestJson, buildPagesJson, type UniClientConfig } from './project-files'

export function generatePageUni(
  schema: { rule: any[]; option: any; dataSources: any[]; actions: any[] },
  meta: { pageKey: string; pageName: string; client: UniClientConfig },
): GenerateResult {
  // target=uniapp：parse 按端放开 list-ref gate（page-list-cards 走 useUniList 实例方法等价面，
  // Task 5.3）；web 路径不传 target，行为不变
  const ir = parseIr(schema, {
    pageKey: meta.pageKey,
    pageName: meta.pageName,
    exportedAt: 'emit-uni',
    target: 'uniapp',
  })
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
 * import 行按源合并（Task 5.2）：多片段各自出 `import { x } from 'vue'` 这类同源行，
 * 全行去重会留双行（同名字段重复声明），按 source 合并 brace 名单（首现序、名单保序
 * union）；非 brace 行（无默认 import 现状）原样保序去重。
 */
function mergeImports(lines: string[]): string[] {
  const namesBySource = new Map<string, string[]>()
  const rawPending = new Set<string>()
  for (const line of lines) {
    const m = /^import \{([^}]*)\} from '([^']+)'$/.exec(line)
    if (!m) {
      rawPending.add(line)
      continue
    }
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean)
    const hit = namesBySource.get(m[2])
    if (hit) {
      for (const n of names) if (!hit.includes(n)) hit.push(n)
    } else {
      namesBySource.set(m[2], names)
    }
  }
  const out: string[] = []
  const doneSource = new Set<string>()
  for (const line of lines) {
    const m = /^import \{([^}]*)\} from '([^']+)'$/.exec(line)
    if (!m) {
      if (rawPending.has(line)) {
        rawPending.delete(line)
        out.push(line)
      }
      continue
    }
    if (doneSource.has(m[2])) continue
    doneSource.add(m[2])
    out.push(`import { ${namesBySource.get(m[2])!.join(', ')} } from '${m[2]}'`)
  }
  return out
}

/**
 * 页面 SFC 装配：模板 = view 根容器 + 逐顶层节点分派（page-list-cards / formContainer /
 * 展示组件族 → 对应片段；其余 lc:todo 挂点）；script = 片段 imports（按源合并）+ 数据源
 * 常量 + 容器段脚本（对位 web 容器段位置）+ 其余片段脚本。页面名不再注入 SFC——标题由
 * pages.json navigationBarTitleText 承担（Task 3.1 的骨架注入随之移除）。
 */
function emitPage(ir: IrPage): { source: string; unsupported: Unsupported[] } {
  const unsupported: Unsupported[] = []
  const imports: string[] = []
  const scripts: string[] = []
  // 容器预扫描（Task 5.2）：容器段模板在节点原位出（弹层为浮层，位置无关），脚本段
  // 插到数据源常量之后、其余片段脚本之前（对位 web 容器段位置）
  const containerNode = ir.nodes.find((n) => n.artifact.type === 'formContainer')
  const containerFrag = containerNode ? emitContainerNode(containerNode, ir) : null

  // 模板主体（相对缩进 0，SFC 组装时统一缩 2 格）
  const T: string[] = ['<view class="lc-page">']
  const pad = (l: string) => (l ? `  ${l}` : l)
  for (const n of ir.nodes) {
    if (n.artifact.type === 'page-list-cards') {
      const frag = emitListNode(n, ir, PROFILES.uniapp)
      T.push(...frag.template.split('\n').map(pad))
      imports.push(...frag.imports)
      scripts.push(...frag.script)
      unsupported.push(...frag.unsupported)
    } else if (n === containerNode && containerFrag) {
      T.push(...containerFrag.template.split('\n').map(pad))
      imports.push(...containerFrag.imports)
      unsupported.push(...containerFrag.unsupported)
    } else {
      // 展示组件族（page-steps/page-detail/page-data-container）走 widget 片段；其余族
      // 未装配：锚点挂点保留（回读侧按地址回节点），族装配按任务落地
      const frag = emitWidgetNode(n, ir)
      if (frag) {
        T.push(...frag.template.split('\n').map(pad))
        imports.push(...frag.imports)
        scripts.push(...frag.script)
        unsupported.push(...frag.unsupported)
      } else {
        T.push(
          `  <!-- lc:todo node=${n.artifact.id} type=${n.artifact.type} field=${n.artifact.field} 组件族 uniapp 装配按任务落地 -->`,
        )
      }
    }
  }
  T.push('</view>')

  // 脚本材料（Task 5.3，对位 web emit.ts 464-465 consts + 213-220 imports）：script 链步骤
  // 的白名单上下文在 uni 产物里的对位——message → uniMessage（uni.showToast 包装）、
  // page → pageKey 常量、http → uniHttpShim 薄壳走 uniRequest（租户头与 data.ts 装配同口径）。
  // import 行先并入 imports（随 mergeImports 按源合并），常量在容器段后、片段脚本前插入
  const materials = materialsOf(ir.chains)
  if (materials.scripts.has('message')) imports.push(`import { uniMessage } from '@lc/runtime-uni/actions'`)
  if (materials.scripts.has('http')) imports.push(`import { uniRequest, uniHttpShim } from '@lc/runtime-uni/http'`)

  // script：imports 按源合并（多片段共享同一组 import）→ 数据源常量 → 容器段 → 片段脚本
  const S: string[] = [...mergeImports(imports)]
  // 数据源常量：对位 web emit.ts 227-233（ds 恒出，登记表有源才出）
  const ds = ir.dataSources[0] ?? { id: '', refId: '' }
  S.push(`const ds = { id: '${ds.id}', refId: '${ds.refId}' }`)
  if (ir.dataSources.length) {
    S.push('// 逐源登记表：页面声明的几个源都在册（含未绑到组件的），人工补接线时按 id 取 refId')
    S.push('const dataSources = {')
    ir.dataSources.forEach((d) => S.push(`  '${d.id}': '${d.refId}',`))
    S.push('}')
  }
  if (containerFrag) S.push(...containerFrag.script)
  // 材料常量（script 白名单上下文的 uni 对位，运行期事件触发时求值，声明顺序无关）
  if (materials.scripts.has('message')) S.push('const message = uniMessage')
  if (materials.scripts.has('page')) S.push(`const page = { pageKey: '${ir.pageKey}' }`)
  if (materials.scripts.has('http')) S.push(`const http = uniHttpShim(uniRequest({ tenantHeader: 'X-Tenant-Id' }))`)
  S.push(...scripts)
  // 脚本函数体（Task 5.3，对位 web emit.ts scripts 段）：正文照搬 schema 普通函数
  // （parse 白名单已把关），调用语句在片段脚本里（函数声明提升，位置无关）
  const seenFns = new Set<string>()
  for (const c of ir.chains) {
    for (const s of c.steps) {
      if (!s.script || seenFns.has(s.script.fn)) continue
      seenFns.add(s.script.fn)
      S.push(...scriptFunction(c, s))
    }
  }

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
