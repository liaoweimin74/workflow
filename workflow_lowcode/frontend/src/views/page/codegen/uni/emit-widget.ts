/**
 * uni 展示组件族出码（Task 5.2）：page-steps / page-detail / page-data-container。
 * Task 6.2：page-table → uni-table 简表（数据组件，接 useUniList）。
 *
 * spec「组件映射保真口径」：page-detail→堆叠详情、page-steps→uni-steps、
 * page-data-container→uni-popup 弹层；page-table→uni-table 简表（Task 6.1 spike 回填：
 * 横向滚动 ✓ 原生 .uni-table-scroll、固定列 ✗ 收窄为精简列 + 操作「···」弹层、
 * selection ✓ type="selection"）。uni 首版口径（golden 即规格）：
 *  · page-steps：items 常量按 `${p}Items` 重出（emit 期做 description→desc 形状映射，
 *    uni-steps 的 options 吃 {title,desc}）；active 字面量透传；direction 非 horizontal
 *    登记 unsupported（uni-steps 无方向 prop）；
 *  · page-detail：列静态展开成 KV 行（列形状 {key,label}，取 key）；数据 ref 恒出但产物
 *    无写入方——记录来源由行点击联动灌入（web 同债 requires.recordLinkage），unsupported
 *    登记，绝不静默；
 *  · page-data-container：压缩卡片头（title + total）+ 查看入口 + uni-popup 弹层记录展示。
 *    纯展示——web PDC「只做展示，不含提交/重置按钮」，uni 不自加 confirmSave（语义纪律）。
 *    子规则按字段名摊平为 KV 行（extractPdcFields：有 field 且非 native / 非 dash-* 聚合件；
 *    web 由内嵌 form-create 解释 {row.x} 作用域插值，摊平降级 unsupported 登记）；自查询
 *    复用 useUniList（reload 即 page=1/size=N，形状吻合）+ onMounted 首载，不出触底。
 *  · page-table（6.2）：搜索/筛选/toolbar/触底与 cards 同构（emit-list 模式镜像）；列静态
 *    展开 uni-th/uni-td，sortableFields 命中列出 sortable + 模板闭包 sort-change（uni-th
 *    payload 只有 {order} 无列名，prop 由闭包带入）；操作列收「···」底部弹层（More row 暂存
 *    → MoreTap 转发 onButtonClick，内置 open/delete case 与 cards 同实现）；分页条 →
 *    触底加载 + 状态行；onMounted 首载（表格是页面主数据，cards 顺修同款）。
 *    uni-tr/uni-td 无行/单元格点击事件源 → row-click 空挂点 + 登记债（挂点保留供人工接线）；
 *    selectionMode=multiple → uni-table type="selection" + @selection-change（uni payload
 *    {detail:{value,index}}，handler 形参 unknown 不投机解包）；sort-change 链 op（set-sort）
 *    useUniList 无对位，链里到达时按 stepStatementsUni todo 口径登记。
 * 其余组件类型返回 null（调用方落 lc:todo 挂点）。首行无缩进，页面装配统一加页内缩进。
 */
import { jsonToTs } from '../emit'
import { camelField, type IrNode, type IrPage, type Unsupported } from '../ir'
import { needsBlock } from '../chain-emit'
import { rowOf, stepStatementsUni, usesRow } from './emit-list'

export interface UniWidgetFragment {
  template: string
  /** 产物 script 追加行（数据 ref / useUniList 接线） */
  script: string[]
  /** 产物 script import 行（页面装配按源合并去重） */
  imports: string[]
  unsupported: Unsupported[]
}

/** 单引号字面量：模板表达式里的字段键（业务字段大量带短横线，不赌合法标识符） */
const sq = (v: string): string => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** 解 IR prop 值：const 具名常量回查 ir.consts，字面量直取（dsRef 由 ds 寻址单独处理） */
function propOf(node: IrNode, ir: IrPage, name: string): unknown {
  const prop = node.props.find((x) => x.name === name)
  if (!prop) return undefined
  const v = prop.value
  if (v.kind === 'const') return ir.consts.find(([n]) => n === v.constName)?.[1]
  if (v.kind === 'literal') return v.value
  return undefined
}

/** 解 IR prop 值（emitTable 用，与 emit-list 的 valueOf 同语义） */
const valueOf = propOf

/** childRules 可提取字段（纯函数）：有 field 且非 native / 非 dash-* 聚合件的规则视为
 * 展示字段（web 由内嵌 form-create 解释，uni 摊平为 KV 行）；布局 children 递归。 */
export interface PdcField {
  field: string
  title: string
}

export function extractPdcFields(childRules: unknown): PdcField[] {
  const out: PdcField[] = []
  const walk = (rules: unknown): void => {
    if (!Array.isArray(rules)) return
    for (const r of rules as Array<Record<string, unknown>>) {
      const type = typeof r?.type === 'string' ? r.type : ''
      if (r?.native === true || type.startsWith('dash-')) continue
      if (typeof r?.field === 'string' && r.field) {
        out.push({ field: r.field, title: typeof r.title === 'string' && r.title ? r.title : r.field })
        continue
      }
      if (Array.isArray(r?.children)) walk(r.children)
    }
  }
  walk(childRules)
  return out
}

export function emitWidgetNode(node: IrNode, ir: IrPage): UniWidgetFragment | null {
  switch (node.artifact.type) {
    case 'page-steps':
      return emitSteps(node, ir)
    case 'page-detail':
      return emitDetail(node, ir)
    case 'page-data-container':
      return emitPdc(node, ir)
    case 'page-table':
      return emitTable(node, ir)
    default:
      return null
  }
}

/** page-steps → uni-steps（纯展示，不取数） */
function emitSteps(node: IrNode, ir: IrPage): UniWidgetFragment {
  const p = camelField(node.artifact.field)
  const unsupported: Unsupported[] = []
  const items = propOf(node, ir, 'items')
  // uni-steps options 吃 {title, desc}：web 侧 items 是 {title, description}，emit 期形状映射
  const options = Array.isArray(items)
    ? (items as Array<Record<string, unknown>>).map((it) => ({ title: it.title, desc: it.desc ?? it.description }))
    : []
  const attrs: string[] = [`:options="${p}Items"`]
  const active = propOf(node, ir, 'active')
  if (active !== undefined) attrs.push(`:active="${JSON.stringify(active)}"`)
  const T = [
    `<!-- ${node.artifact.anchor} -->`,
    '<view class="lc-steps">',
    `  <uni-steps ${attrs.join(' ')} />`,
    '</view>',
  ]
  // direction：uni-steps 无方向 prop；horizontal 无损，其余（vertical）登记
  const direction = propOf(node, ir, 'direction')
  if (typeof direction === 'string' && direction !== 'horizontal') {
    unsupported.push({
      path: `${node.artifact.rulePath}.props.direction`,
      type: node.artifact.type,
      key: 'direction',
      message: `direction=${direction}：uni-steps 无方向 prop，仅横向步骤条，纵向无对位`,
    })
  }
  return {
    template: T.join('\n'),
    script: [`const ${p}Items = ${jsonToTs(options)}`],
    imports: [],
    unsupported,
  }
}

/** page-detail → 堆叠 KV 详情（列静态展开；数据 ref 恒出，写入方是行点击联动债） */
function emitDetail(node: IrNode, ir: IrPage): UniWidgetFragment {
  const p = camelField(node.artifact.field)
  const columns = (propOf(node, ir, 'columns') as Array<Record<string, unknown>> | undefined) ?? []
  const title = propOf(node, ir, 'title')
  const T = [`<!-- ${node.artifact.anchor} -->`, '<view class="lc-detail">']
  if (typeof title === 'string' && title) T.push(`  <view class="lc-detail__title">${title}</view>`)
  for (const c of columns) {
    const key = String(c.key ?? c.prop ?? '')
    const label = String(c.label ?? key)
    T.push('  <view class="lc-detail__row">')
    T.push(`    <text class="lc-detail__label">${label}</text>`)
    T.push(`    <text class="lc-detail__value">{{ ${p}Data[${sq(key)}] }}</text>`)
    T.push('  </view>')
  }
  T.push('</view>')
  return {
    template: T.join('\n'),
    script: [`const ${p}Data = ref<Record<string, unknown>>({})`],
    imports: [`import { ref } from 'vue'`],
    unsupported: [
      {
        path: node.artifact.rulePath,
        type: node.artifact.type,
        key: 'detail-recordLinkage',
        message:
          '记录来源由行点击联动灌入（web 同债 requires.recordLinkage）：uni 产物该组件数据 ref 无写入方，需人工在行点击处接线',
      },
    ],
  }
}

/** page-data-container → uni-popup 弹层（纯展示；自查询复用 useUniList） */
function emitPdc(node: IrNode, ir: IrPage): UniWidgetFragment {
  const p = camelField(node.artifact.field)
  const title = propOf(node, ir, 'title')
  const queryMode = propOf(node, ir, 'queryMode')
  const pageSize = propOf(node, ir, 'pageSize')
  const fields = extractPdcFields(propOf(node, ir, 'childRules'))

  // 数据源寻址（与 emit-list 同规则：首源走 ds.refId，其余查登记表）
  const dsProp = node.props.find((x) => x.name === 'ds-ref-id')
  const sourceId = dsProp && dsProp.value.kind === 'dsRef' ? String(dsProp.value.sourceId ?? '') : ''
  const firstDsId = String(ir.dataSources[0]?.id ?? '')
  const refIdExpr = sourceId && sourceId !== firstDsId ? `dataSources['${sourceId}']` : 'ds.refId'

  const T: string[] = [
    `<!-- ${node.artifact.anchor} -->`,
    '<view class="lc-dc">',
    '  <view class="lc-dc__head">',
  ]
  if (typeof title === 'string' && title) T.push(`    <text class="lc-dc__title">${title}</text>`)
  T.push(`    <text v-if="${p}Total" class="lc-dc__count">{{ ${p}Total }}</text>`)
  T.push('  </view>')
  T.push(`  <button class="lc-dc__open" size="mini" @click="${p}Popup?.open()">查看数据</button>`)
  T.push(`  <uni-popup ref="${p}Popup" type="bottom" class="lc-dc__popup" background-color="#fff">`)
  if (typeof title === 'string' && title) T.push(`    <view class="lc-dc__popup-head">${title}</view>`)
  T.push('    <view class="lc-dc__popup-body">')
  if (fields.length) {
    T.push(`      <view v-for="row in ${p}Rows" :key="row.id" class="lc-dc__card">`)
    for (const f of fields) {
      T.push('        <view class="lc-dc__field">')
      T.push(`          <text class="lc-dc__label">${f.title}</text>`)
      T.push(`          <text class="lc-dc__value">{{ row[${sq(f.field)}] }}</text>`)
      T.push('        </view>')
    }
    T.push('      </view>')
  }
  T.push(`      <view v-if="!${p}Rows.length" class="lc-dc__empty">{{ ${p}Loading ? '加载中…' : '暂无数据' }}</view>`)
  T.push('    </view>')
  T.push('  </uni-popup>')
  T.push('</view>')

  // 取数窗口（web PageDataContainer：page=1，size= queryMode single ? 1 : pageSize）
  const size = queryMode === 'single' ? 1 : typeof pageSize === 'number' ? pageSize : undefined
  const opts = [`refId: ${refIdExpr}`]
  if (size !== undefined) opts.push(`pageSize: ${size}`)
  return {
    template: T.join('\n'),
    script: [
      `const ${p}Popup = ref<{ open: () => void; close: () => void } | null>(null)`,
      `const { rows: ${p}Rows, loading: ${p}Loading, total: ${p}Total, reload: ${p}Reload } = useUniList({ ${opts.join(', ')} })`,
      `onMounted(() => void ${p}Reload())`,
    ],
    imports: [`import { onMounted, ref } from 'vue'`, `import { useUniList } from '@lc/runtime-uni/list'`],
    unsupported: [
      {
        path: node.artifact.rulePath,
        type: node.artifact.type,
        key: 'pdc-childRules',
        message:
          '子规则按字段名摊平为 KV 行展示（web 由内嵌 form-create 解释 {row.x} 作用域插值与复杂控件）；非字段规则（native 文本/dash-* 聚合件）不渲染',
      },
    ],
  }
}

// ==================== page-table → uni-table 简表（Task 6.2） ====================

interface TableColumn {
  prop?: string
  label?: string
  hidden?: boolean
  contentType?: string
  contentValue?: string
}

interface TableSearchField {
  key?: string
  prop?: string
  label?: string
}

interface TableButton {
  key: string
  label?: string
  placement?: string
}

/** page-table → uni-table 简表：数据组件（useUniList 取数），非纯展示——
 *  与 emitListNode（cards）同一套数据/搜索/按钮语义，模板载体换成 uni-table。 */
function emitTable(node: IrNode, ir: IrPage): UniWidgetFragment {
  const p = camelField(node.artifact.field)
  const type = node.artifact.type
  const unsupported: Unsupported[] = []
  const sink = { unsupported }
  const hasContainer = ir.nodes.some((n) => n.artifact.type === 'formContainer')

  // —— 数据源寻址（与 emit-list 同规则：首源走 ds.refId，其余查登记表）——
  const dsProp = node.props.find((x) => x.name === 'ds-ref-id')
  const sourceId = dsProp && dsProp.value.kind === 'dsRef' ? String(dsProp.value.sourceId ?? '') : ''
  const firstDsId = String(ir.dataSources[0]?.id ?? '')
  const refIdExpr = sourceId && sourceId !== firstDsId ? `dataSources['${sourceId}']` : 'ds.refId'

  // —— 列：hidden 不进模板；contentType=template/expression 不渲染（no-eval，同 cards 口径）——
  const allColumns = (valueOf(node, ir, 'columns') as TableColumn[] | undefined) ?? []
  const columns = allColumns.filter((c) => {
    if (c.hidden) return false
    if (c.contentType === 'template' || c.contentType === 'expression') {
      unsupported.push({
        path: `${node.artifact.rulePath}.props.columns[${allColumns.indexOf(c)}]`,
        type,
        key: 'column-contentType',
        message: `列 ${c.prop} 的 contentType=${c.contentType} uni 首版不渲染（产物运行期零解释，禁 eval）`,
      })
      return false
    }
    return true
  })
  const sortableFields = (valueOf(node, ir, 'sortableFields') as unknown[] | undefined) ?? []

  // —— 搜索/筛选（showSearch=true 且 searchFields 非空才出，同 cards 口径）——
  const searchFields = (valueOf(node, ir, 'searchFields') as TableSearchField[] | undefined) ?? []
  const searchUi = valueOf(node, ir, 'showSearch') === true && searchFields.length > 0
  const searchFieldLit = (f: TableSearchField): string => {
    const prop = String(f.key ?? f.prop ?? '')
    return f.label === undefined ? `{ prop: ${sq(prop)} }` : `{ prop: ${sq(prop)}, label: ${sq(String(f.label))} }`
  }
  const searchConst = searchFields.map(searchFieldLit)

  // —— 动作按钮：toolbar 在表格上方，行按钮收「···」弹层（spike 预案：精简列 + 操作弹层）——
  const viewActions = (valueOf(node, ir, 'viewActions') as { buttons?: TableButton[] } | undefined) ?? {}
  const buttons = viewActions.buttons ?? []
  const toolbarButtons = buttons.filter((b) => b.placement === 'toolbar')
  const rowButtons = buttons.filter((b) => b.placement !== 'toolbar')

  // selection 列：selectionMode=multiple → uni-table type="selection"（uni-tr 自动出 checkbox 列）
  const selectionMode = valueOf(node, ir, 'selectionMode')
  const selectable = selectionMode === 'multiple'
  // sort-change 是 when='chain' 出口：无链不 bind（outlet 不存在），模板不出 sortable 引用——
  // 否则 @sort-change 指向不存在的函数；有链时 handler 由出口面给，体由链生成（set-sort → todo）
  const sortHandler = node.outlets?.find((o) => o.on === 'sort-change')?.handler
  const selHandler = node.outlets?.find((o) => o.on === 'selection-change')?.handler

  // 登记债（先于模板装配，顺序稳定）：viewDetail（同 cards）→ row-click（无事件源）→ pageSizes
  if (valueOf(node, ir, 'viewDetail') !== undefined) {
    unsupported.push({
      path: `${node.artifact.rulePath}.props.viewDetail`,
      type,
      key: 'viewDetail',
      message: '详情弹窗（viewDetail）uni 首版未出码',
    })
  }
  if (node.outlets?.some((o) => o.on === 'row-click')) {
    unsupported.push({
      path: node.artifact.rulePath,
      type,
      key: 'row-click',
      message:
        '行点击链出口：uni-tr/uni-td 无行点击事件源（uni-ui@1.5.12），uni 产物空挂点保留，需人工在模板自行接触发',
    })
  }
  if (valueOf(node, ir, 'pageSizes') !== undefined) {
    unsupported.push({
      path: `${node.artifact.rulePath}.props.pageSizes`,
      type,
      key: 'pageSizes',
      message: '分页条页长选择（pageSizes）随分页条改触底加载，uni 产物无页长切换载体',
    })
  }

  // —— useUniList 选项（缺省项不出：pageSize 20 / pagination true 是运行时缺省）——
  const pageSize = valueOf(node, ir, 'pageSize')
  const pagination = valueOf(node, ir, 'pagination')
  const opts = [`refId: ${refIdExpr}`]
  if (typeof pageSize === 'number') opts.push(`pageSize: ${pageSize}`)
  if (pagination === false) opts.push('pagination: false')
  if (searchUi) opts.push(`searchFields: ${p}SearchFields`)

  // ==================== 模板 ====================
  const T: string[] = []
  T.push(`<!-- ${node.artifact.anchor} -->`)
  T.push('<view class="lc-table">')
  if (searchUi)
    T.push(
      `  <uni-search-bar v-model="${p}Search" class="lc-table__search" placeholder="搜索" @confirm="${p}OnSearch" @clear="${p}OnSearch" />`,
    )
  if (toolbarButtons.length || searchUi) {
    T.push('  <view class="lc-table__toolbar">')
    for (const b of toolbarButtons) {
      const label = String(b.label ?? b.key)
      T.push(
        `    <button class="lc-table__toolbar-btn" size="mini" @click="onButtonClick({ key: '${b.key}', label: ${sq(label)}, row: null })">${label}</button>`,
      )
    }
    if (searchUi) T.push(`    <button class="lc-table__filter-open" size="mini" @click="${p}FilterOpen">筛选</button>`)
    T.push('  </view>')
  }
  const tableAttrs = [`:data="${p}Rows"`]
  if (selectable && selHandler) {
    tableAttrs.push('type="selection"')
    tableAttrs.push(`@selection-change="${selHandler}"`)
  }
  // border/stripe：web 契约 drop 是 web 组件的事（PageDataTable 无通道），uni-table 真有这两个 prop
  if (valueOf(node, ir, 'border') === true) tableAttrs.push('border')
  if (valueOf(node, ir, 'stripe') === true) tableAttrs.push('stripe')
  if (valueOf(node, ir, 'loading') === true || true) {
    // uni-table loading prop 恒绑（加载掩码，行内三元消费 useUniList 状态）
    tableAttrs.push(`:loading="${p}Loading"`)
  }
  T.push(`  <uni-table ${tableAttrs.join(' ')}>`)
  T.push('    <uni-tr>')
  for (const c of columns) {
    const prop = String(c.prop ?? '')
    const label = String(c.label ?? prop)
    if (sortHandler && sortableFields.includes(prop)) {
      // uni-th sort-change payload 只有 { order } 无列名：prop 由模板闭包带入
      T.push(`      <uni-th sortable @sort-change="${sortHandler}('${prop}', $event)">${label}</uni-th>`)
    } else {
      T.push(`      <uni-th>${label}</uni-th>`)
    }
  }
  if (rowButtons.length) T.push('      <uni-th class="lc-table__th-actions">操作</uni-th>')
  T.push('    </uni-tr>')
  T.push(`    <uni-tr v-for="row in ${p}Rows" :key="row.id">`)
  for (const c of columns) {
    T.push(`      <uni-td>{{ ${rowOf(String(c.prop ?? ''))} }}</uni-td>`)
  }
  if (rowButtons.length) {
    T.push('      <uni-td class="lc-table__td-actions">')
    T.push(`        <button class="lc-table__more" size="mini" @click="${p}MoreOpen(row)">···</button>`)
    T.push('      </uni-td>')
  }
  T.push('    </uni-tr>')
  T.push('  </uni-table>')
  T.push(
    `  <view class="lc-table__status">{{ ${p}Loading ? '加载中…' : ${p}Finished ? '没有更多了' : '' }}</view>`,
  )
  if (rowButtons.length) {
    T.push(`  <uni-popup ref="${p}MorePopup" type="bottom" class="lc-table__more-popup" background-color="#fff">`)
    T.push('    <view class="lc-table__more-body">')
    for (const b of rowButtons) {
      const label = String(b.label ?? b.key)
      T.push(
        `      <button class="lc-table__more-btn" @click="${p}MoreTap('${b.key}', ${sq(label)})">${label}</button>`,
      )
    }
    T.push('    </view>')
    T.push('  </uni-popup>')
  }
  if (searchUi) {
    T.push(`  <uni-popup ref="${p}FilterPopup" type="bottom" class="lc-table__filter" background-color="#fff">`)
    T.push('    <view class="lc-table__filter-body">')
    T.push(`      <view v-for="f in ${p}SearchFields" :key="f.prop" class="lc-table__filter-field">`)
    T.push('        <text class="lc-table__filter-label">{{ f.label }}</text>')
    T.push(`        <input v-model="${p}FieldValues[f.prop]" class="lc-table__filter-input" :placeholder="f.label" />`)
    T.push('      </view>')
    T.push(`      <button class="lc-table__filter-btn" @click="${p}FilterConfirm">查询</button>`)
    T.push(`      <button class="lc-table__filter-btn" plain @click="${p}FilterReset">重置</button>`)
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
  if (rowButtons.length) {
    S.push(`const ${p}MoreRow = ref<Record<string, unknown> | null>(null)`)
    S.push(`const ${p}MorePopup = ref<{ open: () => void; close: () => void } | null>(null)`)
  }
  if (searchUi) S.push(`const ${p}FilterPopup = ref<{ open: () => void; close: () => void } | null>(null)`)
  // 表格是页面主数据：onMounted 首载 + 触底加载（cards 只有触底——5.1 遗留，表格侧先按正确口径出）
  S.push(`onMounted(() => void ${p}List.reload())`)
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
  if (rowButtons.length) {
    S.push(`function ${p}MoreOpen(row: Record<string, unknown>) {`)
    S.push(`  ${p}MoreRow.value = row`)
    S.push(`  ${p}MorePopup.value?.open()`)
    S.push(`}`)
    S.push(`function ${p}MoreTap(key: string, label: string) {`)
    S.push(`  onButtonClick({ key, label, row: ${p}MoreRow.value })`)
    S.push(`  ${p}MorePopup.value?.close()`)
    S.push(`}`)
  }

  // 行点击：uni-tr/uni-td 无事件源（spike 实测），空挂点保留供人工接管（契约出口 still binds）
  const rowHandler = node.outlets?.find((o) => o.on === 'row-click')?.handler
  if (rowHandler) {
    S.push(`function ${rowHandler}(_row: Record<string, unknown>) {`)
    S.push('  // uni-tr 无行点击事件源：挂点保留供人工接管（可在模板自行接触发）')
    S.push('}')
  }

  // 按钮点击：内置 open/delete case 与 cards 同实现（hasContainer 真实现 / 无容器 todo）+ 链 case
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
        caseLines.push(
          ...(needsBlock(body)
            ? [`    case '${sc.key}': {`, ...body, '      return', '    }']
            : [`    case '${sc.key}':`, ...body, '      return']),
        )
      } else if (sc.kind === 'delete') {
        caseLines.push(`    case 'delete':`, `      if (row?.id != null) void ${p}List.removeRow(String(row.id))`, '      return')
      } else if (hasContainer) {
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

  // 选择变化：uni payload 形状 { detail: { value, index } }（uni-table $emit 实测），
  // 形参 unknown 不投机解包——链步骤消费 rows 时需人工按形状取 detail.value
  if (selHandler) {
    S.push(`function ${selHandler}(_rows: unknown) {`)
    if (selectable) {
      S.push('  // uni-table selection-change payload: { detail: { value, index } }，链步骤消费时人工取 detail.value')
    } else {
      S.push(`  // selectionMode=${String(selectionMode ?? 'none')} 无 selection 列：挂点保留（uni payload 形状 { detail: { value, index } }）`)
    }
    S.push('}')
  }

  // 排序变化：uni-th 逐列 sortable + 模板闭包带 prop；set-sort 链 op 在 stepStatementsUni
  // 登记 todo（useUniList 无服务端排序对位），这里只出挂点函数（有链时体由链生成）
  if (sortHandler) {
    const sortChains = ir.chains.filter(
      (c) => c.nodeId === node.artifact.id && c.outlet === sortHandler && (c.kind === 'bus' || c.kind === 'view'),
    )
    const body = sortChains.flatMap((c) =>
      c.steps.flatMap((s) => stepStatementsUni(s, { list: `${p}List`, type, chain: c, hasRow: false }, '  ', sink)),
    )
    S.push(`function ${sortHandler}(_prop: string, _e: { order: string | null }) {`)
    if (body.length) {
      S.push(...body)
    } else {
      S.push(
        '  // 无关联动作（uni-th 逐列 sortable + sort-change，payload 无列名故 prop 由模板闭包带入）',
      )
    }
    S.push('}')
  }

  // —— imports：vue（More/Filter 弹层 ref + onMounted 首载）→ onReachBottom → useUniList ——
  const needsRef = rowButtons.length > 0 || searchUi
  const imports = [
    ...(needsRef ? [`import { onMounted, ref } from 'vue'`] : [`import { onMounted } from 'vue'`]),
    `import { onReachBottom } from '@dcloudio/uni-app'`,
    `import { useUniList } from '@lc/runtime-uni/list'`,
  ]

  return { template: T.join('\n'), script: S, imports, unsupported }
}
