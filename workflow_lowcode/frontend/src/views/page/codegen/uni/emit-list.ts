/**
 * uni 列表族出码（Task 5.1）：page-list-cards → uni-card 卡片列表片段。
 *
 * 对位 web ListCards 语义（列角色渲染 / searchFields 搜索 / set-filter 注入），差异点：
 *  · 分页条 → 触底加载（onReachBottom + useUniList.loadMore），pagination=false → 全量；
 *  · 卡片列静态展开（emit 期逐列出 label/value 行，无运行时渲染函数）——web ListCards
 *    的 role 取法原样镜像（title/subtitle/tag/metric 只按 role，其余列都是字段行）；
 *  · 卡片动作按钮 payload 与 web 组件一致（{ key, label, row }），toolbar 按钮在列表
 *    上方、其余按钮在卡底（actionsPlacement 视觉降级为卡底，不做右侧栏）。
 * 链出口（stepStatementsUni）：message/open-link → uni API（$param 段债登记）；refresh/
 * set-filter/set-page/delete → 页面本地 useUniList 函数；容器族（open-container/load-record/
 * close-container/save-container）→ 容器段函数（5.3，镜像 web containerCall）；script →
 * 调用语句（函数体装配侧照搬）。web 契约 list.expose=none 使 cards 的 list-ref 步骤在
 * parse 被拒（web 端不变），uniapp 端 5.3 按端放开 gate（refableOf target 分支）后这些
 * op 从链里到达。export/set-sort/clear-selection 端语义 uni 首版无对位：lc:todo 注释 +
 * unsupported 登记，绝不静默。
 * 首行无缩进、嵌套行相对缩进，页面装配（emit-uni.ts）统一加页内缩进。
 */
import { argOf, exprOf, keyText, literalOf, needsBlock } from '../chain-emit'
import { camelField } from '../ir'
import type { IrChain, IrChainStep, IrNode, IrPage, Unsupported } from '../ir'
import type { TargetProfile } from '../target-profile'

export interface UniListFragment {
  /** 模板片段（单串，\n 分行；页面装配统一加缩进） */
  template: string
  /** 产物 script 追加行：useUniList 接线 + 搜索/筛选函数组 + handler */
  script: string[]
  /** 产物 script import 行（vue ref / onReachBottom / useUniList，按序去重在装配侧） */
  imports: string[]
  /** uni 侧适配不了的列/动作（manifest.unsupported 追加面，5.2/5.3 续建） */
  unsupported: Unsupported[]
}

/** 链步骤出口的上下文：页面本地列表实例名 + 载体类型（unsupported.type）。
 * chain：容器族 op 的 mode/readonly 生成期定死（5.3，缺省按 recordId 兜底）；
 * hasRow：script 调用是否传 row（按钮链/行链 true，view 链 false——web chain.hasRow 同构）。 */
export interface UniStepCtx {
  list: string
  type: string
  chain?: Pick<IrChain, 'mode' | 'readonly'>
  hasRow?: boolean
}

interface CardColumn {
  prop?: string
  label?: string
  role?: string
  hidden?: boolean
  contentType?: string
  contentValue?: string
}

interface ViewButton {
  key: string
  label?: string
  placement?: string
}

interface SearchField {
  key?: string
  prop?: string
  label?: string
}

/** 单引号字面量：产物语句里的字符串实参（label/url 等可能带引号） */
const sq = (v: string): string => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** 行字段访问：统一下标 + 引号（业务字段大量带短横线，不赌合法标识符） */
export const rowOf = (prop: string | undefined): string => `row[${sq(String(prop ?? ''))}]`

/** web emitHandlers 的同名判定：case 体读 row 才声明形参（noUnusedLocals） */
export const usesRow = (lines: string[]): boolean => lines.some((l) => /\brow\b/.test(l))

/**
 * 链步骤 → uni 产物语句。返回的 todo 注释也是体（缺口在产物里可见，绝不静默跳步）；
 * unsupported 同步登记。5.3 按端放开 parse 的 list-ref gate 后 refresh/set-filter/
 * set-page 才会从真实链里到达，语句形状由单测先行锁定。
 */
export function stepStatementsUni(
  step: IrChainStep,
  ctx: UniStepCtx,
  indent: string,
  sink: { unsupported: Unsupported[] },
): string[] {
  const line = (s: string) => `${indent}${s}`
  const L = ctx.list
  // 未适配 op：todo 注释也是产物体（缺口在产物里可见，绝不静默跳步）+ unsupported 登记
  const todo = (message: string, tail: string): string[] => {
    sink.unsupported.push({ path: step.path, type: ctx.type, key: step.op, message })
    return [line(`// lc:todo op=${step.op} ← ${step.path}：${tail}`)]
  }
  switch (step.op) {
    case 'message': {
      // 字面量 type 映射 uni icon（success/error 之外一律 none）；动态值留运行期表达式，图标保守取 none
      const typeLit = literalOf(argOf(step, 'type'))
      const icon = typeLit === 'success' ? "'success'" : typeLit === 'error' ? "'error'" : "'none'"
      return [line(`uni.showToast({ title: ${exprOf(argOf(step, 'message'))}, icon: ${icon} })`)]
    }
    case 'open-link': {
      const url = argOf(step, 'url')
      if (url.some((p) => p.kind === 'param')) {
        // $param 段在 web 产物里展开成 route.query（useRoute），uni 产物没有 route 上下文——
        // 不投机 onLoad shim（需要人工接线的页面级改造），整支登记债
        return todo(
          'open-link 的 url 参数引用 $param（页面路由 query）：web 走 useRoute，uni 产物无 route 上下文（onLoad query 需人工接线），该步不执行',
          '参数引用 $param（页面路由 query），uni 产物无 route 上下文',
        )
      }
      return [line(`uni.navigateTo({ url: ${exprOf(url)} })`)]
    }
    case 'refresh':
      return [line(`void ${L}.reload()`)]
    case 'set-filter':
      return [
        line(
          `void ${L}.applyFilter({ ${step.args.map((a) => `${keyText(a.name)}: ${exprOf(a.parts)}`).join(', ')} })`,
        ),
      ]
    case 'set-page': {
      const parts = argOf(step, 'page')
      const literal = literalOf(parts)
      const n = literal === undefined ? NaN : Number(literal)
      if (Number.isInteger(n) && n > 0) return [line(`void ${L}.gotoPage(${n})`)]
      // 运行期是 parseInt + 正数守卫：值来自模板/参数时产物也得判（与 web 同口径）
      return [
        line(`const target = parseInt(${exprOf(parts)}, 10)`),
        line(`if (!isNaN(target) && target > 0) ${L}.gotoPage(target)`),
      ]
    }
    case 'delete':
      return [line(`if (row?.id != null) void ${L}.removeRow(String(row.id))`)]
    case 'open-container':
    case 'load-record': {
      // 镜像 web containerCall：recordId 走链参数（exprOf 已把 $row.id 展开成 String(row?.id ?? '')），
      // 无参数出 ''；mode/readonly 生成期定死，缺省按 recordId 兜底（有 id edit / 无 id create）
      const recordId = argOf(step, 'recordId')
      const hasId = recordId.length > 0
      const mode = ctx.chain?.mode ?? (hasId ? 'edit' : 'create')
      const readonly = ctx.chain?.readonly ?? false
      return [line(`void openContainer(${hasId ? exprOf(recordId) : "''"}, ${readonly}, '${mode}')`)]
    }
    case 'close-container':
      return [line('closeContainer()')]
    case 'save-container':
      return [line('void confirmSave()')]
    case 'set-sort':
    case 'clear-selection':
      return todo(
        `${step.op} 的对位方法 useUniList 未提供（服务端排序/多选清理 uni 首版无），产物该步不执行`,
        'useUniList 无对位方法，该步不执行',
      )
    case 'export':
      return todo(
        'export 依赖浏览器 Blob/ObjectURL 下载，uni 端（小程序）无对位能力，该步不执行',
        '浏览器 Blob/ObjectURL 下载在小程序无对位能力，该步不执行',
      )
    case 'script': {
      // 调用语句（hasRow 同 web chain.hasRow）；函数体由装配侧照搬展开（scriptFunction），材料由装配注入
      return [line(`void ${step.script!.fn}(${ctx.hasRow === false ? '' : 'row'})`)]
    }
    default:
      return todo(`${step.op} 的 uni 出口适配未落地（Task 5.3），产物该步不执行`, 'uni 出口适配 Task 5.3 落地')
  }
}

/** 解 IR prop 值：const 具名常量回查 ir.consts，字面量直取（dsRef 由 ds 寻址单独处理） */
function valueOf(node: IrNode, ir: IrPage, name: string): unknown {
  const prop = node.props.find((x) => x.name === name)
  if (!prop) return undefined
  const v = prop.value
  if (v.kind === 'const') return ir.consts.find(([n]) => n === v.constName)?.[1]
  if (v.kind === 'literal') return v.value
  return undefined
}

export function emitListNode(node: IrNode, ir: IrPage, _profile: TargetProfile): UniListFragment {
  const p = camelField(node.artifact.field)
  const type = node.artifact.type
  const unsupported: Unsupported[] = []
  const sink = { unsupported }
  // 页面存在 formContainer → 内置 open case 出真实现（openContainer 由容器段装配提供，
  // Task 5.2）；无容器保留 todo + unsupported，绝不静默
  const hasContainer = ir.nodes.some((n) => n.artifact.type === 'formContainer')

  // —— 数据源寻址（对位 web propText 的 dsRef 分支：首源走 ds.refId，其余查登记表）——
  const dsProp = node.props.find((x) => x.name === 'ds-ref-id')
  const sourceId = dsProp && dsProp.value.kind === 'dsRef' ? String(dsProp.value.sourceId ?? '') : ''
  const firstDsId = String(ir.dataSources[0]?.id ?? '')
  const refIdExpr = sourceId && sourceId !== firstDsId ? `dataSources['${sourceId}']` : 'ds.refId'

  // —— 列角色（镜像 ListCards 的 role 取法：title/subtitle/tag/metric 只按 role，其余全字段行）——
  const allColumns = (valueOf(node, ir, 'columns') as CardColumn[] | undefined) ?? []
  // hidden 列不进模板（与 web ListCards 的 hidden 口径一致）；unsupported 的 path 序号按全量列算
  const columns = allColumns.filter((c) => !c.hidden)
  const titleCol = columns.find((c) => c.role === 'title')
  const subtitleCol = columns.find((c) => c.role === 'subtitle')
  const tagCol = columns.find((c) => c.role === 'tag')
  const metricCol = columns.find((c) => c.role === 'metric')
  const fieldCols = columns.filter((c) => !['title', 'subtitle', 'tag', 'metric'].includes(c.role ?? ''))
  const renderableFields = fieldCols.filter((c) => {
    if (c.contentType !== 'template' && c.contentType !== 'expression') return true
    // 产物运行期零解释（no-eval 纪律）：template/expression 列 uni 首版不渲染
    unsupported.push({
      path: `${node.artifact.rulePath}.props.columns[${allColumns.indexOf(c)}]`,
      type,
      key: 'column-contentType',
      message: `列 ${c.prop} 的 contentType=${c.contentType} uni 首版不渲染（产物运行期零解释，禁 eval）`,
    })
    return false
  })

  // —— 搜索/筛选抽屉（showSearch=true 且 searchFields 非空才出，镜像 ListCards showSearch 口径）——
  const searchFields = (valueOf(node, ir, 'searchFields') as SearchField[] | undefined) ?? []
  const searchUi = valueOf(node, ir, 'showSearch') === true && searchFields.length > 0
  const searchFieldLit = (f: SearchField): string => {
    const prop = String(f.key ?? f.prop ?? '')
    return f.label === undefined ? `{ prop: ${sq(prop)} }` : `{ prop: ${sq(prop)}, label: ${sq(String(f.label))} }`
  }

  // —— 动作按钮：toolbar 在列表上方，其余卡底（payload 与 web 组件一致：{ key, label, row }）——
  const viewActions = (valueOf(node, ir, 'viewActions') as { buttons?: ViewButton[] } | undefined) ?? {}
  const buttons = viewActions.buttons ?? []
  const toolbarButtons = buttons.filter((b) => b.placement === 'toolbar')
  const rowButtons = buttons.filter((b) => b.placement !== 'toolbar')

  // 详情弹窗配置：uni 首版无对位载体（5.2 容器落地后再评估），显式登记（props 区登记先于动作区）
  if (valueOf(node, ir, 'viewDetail') !== undefined) {
    unsupported.push({
      path: `${node.artifact.rulePath}.props.viewDetail`,
      type,
      key: 'viewDetail',
      message: '详情弹窗（viewDetail）uni 首版未出码',
    })
  }

  // —— useUniList 选项（缺省项不出：pageSize 20 / pagination true 是运行时缺省）——
  const pageSize = valueOf(node, ir, 'pageSize')
  const pagination = valueOf(node, ir, 'pagination')
  // 抽屉字段面：key→prop、label 直取；matchType 丢弃（web fetchApi 对 searchFields 一律 like）
  const searchConst = searchFields.map(searchFieldLit)
  const opts = [`refId: ${refIdExpr}`]
  if (typeof pageSize === 'number') opts.push(`pageSize: ${pageSize}`)
  if (pagination === false) opts.push('pagination: false')
  if (searchUi) opts.push(`searchFields: ${p}SearchFields`)

  // ==================== 模板 ====================
  const T: string[] = []
  T.push(`<!-- ${node.artifact.anchor} -->`)
  T.push('<view class="lc-cards">')
  if (searchUi)
    T.push(
      `  <uni-search-bar v-model="${p}Search" class="lc-cards__search" placeholder="搜索" @confirm="${p}OnSearch" @clear="${p}OnSearch" />`,
    )
  if (toolbarButtons.length || searchUi) {
    T.push('  <view class="lc-cards__toolbar">')
    for (const b of toolbarButtons) {
      const label = String(b.label ?? b.key)
      T.push(
        `    <button class="lc-cards__toolbar-btn" size="mini" @click="onButtonClick({ key: '${b.key}', label: ${sq(label)}, row: null })">${label}</button>`,
      )
    }
    if (searchUi) T.push(`    <button class="lc-cards__filter-open" size="mini" @click="${p}FilterOpen">筛选</button>`)
    T.push('  </view>')
  }
  const cardAttrs = [`v-for="row in ${p}Rows"`, ':key="row.id"', 'class="lc-cards__card"']
  if (titleCol) cardAttrs.push(`:title="${rowOf(titleCol.prop)}"`)
  if (subtitleCol) cardAttrs.push(`:sub-title="${rowOf(subtitleCol.prop)}"`)
  cardAttrs.push('@click="onRowClick(row)"')
  T.push(`  <uni-card ${cardAttrs.join(' ')}>`)
  if (tagCol) {
    T.push(`    <view v-if="${rowOf(tagCol.prop)} != null && ${rowOf(tagCol.prop)} !== ''" class="lc-cards__tags">`)
    T.push(`      <uni-tag :text="String(${rowOf(tagCol.prop)} ?? '')" />`)
    T.push('    </view>')
  }
  if (metricCol) {
    T.push('    <view class="lc-cards__metric">')
    T.push(`      <text class="lc-cards__value">{{ ${rowOf(metricCol.prop)} }}</text>`)
    T.push('    </view>')
  }
  for (const c of renderableFields) {
    T.push('    <view class="lc-cards__field">')
    T.push(`      <text class="lc-cards__label">${String(c.label ?? c.prop ?? '')}</text>`)
    T.push(`      <text class="lc-cards__value">{{ ${rowOf(c.prop)} }}</text>`)
    T.push('    </view>')
  }
  if (rowButtons.length) {
    T.push('    <view class="lc-cards__actions">')
    for (const b of rowButtons) {
      const label = String(b.label ?? b.key)
      T.push(
        `      <button class="lc-cards__btn" size="mini" @click.stop="onButtonClick({ key: '${b.key}', label: ${sq(label)}, row })">${label}</button>`,
      )
    }
    T.push('    </view>')
  }
  T.push('  </uni-card>')
  T.push(`  <view class="lc-cards__status">{{ ${p}Loading ? '加载中…' : ${p}Finished ? '没有更多了' : '' }}</view>`)
  if (searchUi) {
    T.push(`  <uni-popup ref="${p}FilterPopup" type="bottom" class="lc-cards__filter" background-color="#fff">`)
    T.push('    <view class="lc-cards__filter-body">')
    T.push(`      <view v-for="f in ${p}SearchFields" :key="f.prop" class="lc-cards__filter-field">`)
    T.push('        <text class="lc-cards__filter-label">{{ f.label }}</text>')
    T.push(`        <input v-model="${p}FieldValues[f.prop]" class="lc-cards__filter-input" :placeholder="f.label" />`)
    T.push('      </view>')
    T.push(`      <button class="lc-cards__filter-btn" @click="${p}FilterConfirm">查询</button>`)
    T.push(`      <button class="lc-cards__filter-btn" plain @click="${p}FilterReset">重置</button>`)
    T.push('    </view>')
    T.push('  </uni-popup>')
  }
  T.push('</view>')

  // ==================== 脚本 ====================
  const S: string[] = []
  if (searchUi) S.push(`const ${p}SearchFields = [${searchConst.join(', ')}]`)
  S.push(`const ${p}List = useUniList({ ${opts.join(', ')} })`)
  const destructure = [`rows: ${p}Rows`, `loading: ${p}Loading`, `finished: ${p}Finished`]
  if (searchUi) destructure.push(`keyword: ${p}Search`, `fieldValues: ${p}FieldValues`)
  S.push(`const { ${destructure.join(', ')} } = ${p}List`)
  if (searchUi) S.push(`const ${p}FilterPopup = ref<{ open: () => void; close: () => void } | null>(null)`)
  S.push(`onReachBottom(() => ${p}List.loadMore())`)
  if (searchUi) {
    S.push(`function ${p}OnSearch() {`)
    S.push(`  ${p}List.onSearch()`)
    S.push(`}`)
    S.push(`function ${p}FilterOpen() {`)
    S.push(`  ${p}FilterPopup.value?.open()`)
    S.push(`}`)
    S.push(`function ${p}FilterConfirm() {`)
    S.push(`  ${p}List.onSearch()`)
    S.push(`  ${p}FilterPopup.value?.close()`)
    S.push(`}`)
    S.push(`function ${p}FilterReset() {`)
    S.push(`  ${p}List.resetSearch()`)
    S.push(`  ${p}FilterPopup.value?.close()`)
    S.push(`}`)
  }

  // 行点击：总线链 + 组件链（与 web chainsOf 的 kinds 序一致：bus 在前 view 在后）
  const rowHandler = node.outlets?.find((o) => o.on === 'row-click')?.handler
  if (rowHandler) {
    const rowChains = ir.chains.filter(
      (c) => c.nodeId === node.artifact.id && c.outlet === rowHandler && (c.kind === 'bus' || c.kind === 'view'),
    )
    const body = rowChains.flatMap((c) =>
      c.steps.flatMap((s) => stepStatementsUni(s, { list: `${p}List`, type, chain: c, hasRow: true }, '  ', sink)),
    )
    if (body.length) {
      S.push(`function ${rowHandler}(${usesRow(body) ? 'row' : '_row'}: Record<string, unknown>) {`)
      S.push(...body)
    } else {
      S.push(`function ${rowHandler}(_row: Record<string, unknown>) {`)
      S.push('  // schema.actions 无 row-click 触发的动作链 → 空实现，保留挂点供人工接管')
    }
    S.push('}')
  }

  // 按钮点击：内置 case（delete 真实现 / 容器行语义 todo）+ 链 case，装配结构与 web emitButtonClick 同构
  const btnHandler = node.outlets?.find((o) => o.on === 'button-click')?.handler
  if (btnHandler) {
    const caseLines: string[] = []
    for (const sc of ir.switchCases) {
      if (sc.nodeId !== node.artifact.id) continue
      if (sc.kind === 'chain') {
        const chain = ir.chains.find((c) => c.kind === 'button' && c.nodeId === sc.nodeId && c.key === sc.key)
        if (!chain) continue
        const body = chain.steps.flatMap((s) =>
          stepStatementsUni(s, { list: `${p}List`, type, chain, hasRow: true }, '      ', sink),
        )
        if (!body.length) continue
        // case 体里有 const/let 要包块（set-page 的守卫变量）：switch 各 case 共享函数作用域
        caseLines.push(
          ...(needsBlock(body)
            ? [`    case '${sc.key}': {`, ...body, '      return', '    }']
            : [`    case '${sc.key}':`, ...body, '      return']),
        )
      } else if (sc.kind === 'delete') {
        caseLines.push(`    case 'delete':`, `      if (row?.id != null) void ${p}List.removeRow(String(row.id))`, '      return')
      } else if (hasContainer) {
        // 内置 open case 真实现（镜像 web emitSwitchCase 636）：容器函数由容器段装配提供
        caseLines.push(
          `    case '${sc.key}':`,
          `      void openContainer(String(row?.id ?? ''), ${sc.readonly}, '${sc.mode}')`,
          '      return',
        )
      } else {
        caseLines.push(
          `    case '${sc.key}':`,
          `      // lc:todo op=open-container(mode=${sc.mode}) ← 内置行语义：页面无 formContainer，uni 侧无对位载体`,
          '      return',
        )
        unsupported.push({
          path: node.artifact.rulePath,
          type,
          key: 'open-container',
          message: `按钮 ${sc.key} 的内置行语义（mode=${sc.mode}）需容器：页面无 formContainer，uni 侧无对位载体`,
        })
      }
    }
    S.push(`function ${btnHandler}(payload: { key: string; label: string; row: Record<string, unknown> | null }) {`)
    if (usesRow(caseLines)) S.push('  const row = payload.row')
    S.push('  switch (payload.key) {')
    S.push(...caseLines)
    S.push('  }')
    S.push('}')
  }

  // —— imports：vue ref（抽屉弹层）→ onReachBottom（触底）→ useUniList（数据层），顺序确定 ——
  const imports = [
    ...(searchUi ? [`import { ref } from 'vue'`] : []),
    `import { onReachBottom } from '@dcloudio/uni-app'`,
    `import { useUniList } from '@lc/runtime-uni/list'`,
  ]

  return { template: T.join('\n'), script: S, imports, unsupported }
}
