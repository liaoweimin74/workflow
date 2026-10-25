/**
 * uni 展示组件族出码（Task 5.2）：page-steps / page-detail / page-data-container。
 * Task 6.2：page-table → uni-table 简表（数据组件，接 useUniList）。
 * Task 6.3：fcTable → 纵向堆叠降级（放弃合并单元格语义，非空 home 格按 (row,col) 纵排）。
 * Task 7.2：dash-kpi / dash-notice / dash-todo → 自绘 uni 组件（@lc/runtime-uni/dash 取数）。
 * Task 7.3：dash-chart / page-chart → uni-echarts 图表片段（@lc/runtime-uni/charts option + dash/list 取数）。
 *
 * chart 通道（7.3）：
 *  · dash-chart → .lc-dchart：aggregate 通道走 useUniChart（对位 web DashChart.fetchData，
 *    失败静默 rows 清空），option 走 buildUniAggregateOption（computed 包装，空 rows → null
 *    由模板 v-if 走空态）；seriesName 对位 DashChart.render（title || (count → 数量 |
 *    `${agg}(${metric})`)）。bar/line/pie 直出；scatter/heatmap/funnel 回退 bar、area 回退
 *    line 并登记 chart-type（绝不静默）。
 *  · page-chart → .lc-pchart：config（PageChartConfigDialog 形态 {type, dimension,
 *    measures:[{key,agg,label?}]}）emit 期归一为 UniChartViewConfig 常量（measure.label 融为
 *    yFields[].name，运行期零解释），数据走 useUniList(pagination: false)（size=-1 全量 +
 *    uniListRowsOf 扁平化，对位 web PageDataChartPage flattenRecords），option 走
 *    buildUniDatasetOption（前端按维度聚合）。
 *  · 两类都出 `<uni-echarts>` + echarts/core 按需注册（echarts.use 清单沿用 web
 *    useEcharts.ts 图表子集 Bar/Line/Pie + Grid/Tooltip/Legend + Canvas；uni-echarts vite
 *    插件见模板含 `<uni-echarts` 时自动注入 provideEcharts，SFC 已有 echarts/core import
 *    则复用——imports 与 echarts.use 不冲突）。归一 config/option 全静态对象字面量
 *    （no-eval：产物运行期零解释）；span/height 尺寸镜像 → size-mirror（7.2 同口径）。
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
import { camelField, kebab, type IrNode, type IrPage, type Unsupported } from '../ir'
import { needsBlock } from '../chain-emit'
import { rowOf, stepStatementsUni, usesRow } from './emit-list'
import { refIdExprOf, sq } from './emit-shared'

export interface UniWidgetFragment {
  template: string
  /** 产物 script 追加行（数据 ref / useUniList 接线） */
  script: string[]
  /** 产物 script import 行（页面装配按源合并去重） */
  imports: string[]
  unsupported: Unsupported[]
}

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
    case 'fcTable':
      return emitFcTable(node, ir)
    case 'dash-kpi':
      return emitKpi(node, ir)
    case 'dash-notice':
      return emitNotice(node, ir)
    case 'dash-todo':
      return emitTodo(node, ir)
    case 'dash-chart':
      return emitDashChart(node, ir)
    case 'page-chart':
      return emitPageChart(node, ir)
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

  // 数据源寻址（与 emit-list/emit-field 同规则：首源走 ds.refId，其余查登记表）
  const refIdExpr = refIdExprOf(node, ir)

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

// ==================== dash-kpi / dash-notice / dash-todo → 自绘组件（Task 7.2） ====================

/** 文本字面量进模板（title/subtitle 类静态配置；未配置回退，对位 web withDefaults） */
const textOr = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback)

/** 尺寸镜像（span/height）节点级一条 unsupported（6.3 table-geometry 同口径：节点级决策不逐键散报） */
function sizeMirrorUnsupported(node: IrNode): Unsupported {
  return {
    path: node.artifact.rulePath,
    type: node.artifact.type,
    key: 'size-mirror',
    message: 'span/height 尺寸镜像（web 栅格留白/固定高）uni 布局无对位：卡片恒满宽、高度自适应内容',
  }
}

/** dash-kpi → 自绘统计卡 .lc-kpi：web 契约 aggregate（group=__all__ 单行）→ rows[0].value，
 *  走 useUniKpi（失败静默 value=null）；title/subtitle/unit 出静态文本，value 唯一运行期
 *  绑定（null = 失败/空值，模板统一 -- 占位）；trend 系/sparkline/numberFormat/filter 登记。 */
function emitKpi(node: IrNode, ir: IrPage): UniWidgetFragment {
  const p = camelField(node.artifact.field)
  const unsupported: Unsupported[] = []
  const title = textOr(propOf(node, ir, 'title'), '指标')
  const subtitle = propOf(node, ir, 'subtitle')
  const unit = propOf(node, ir, 'unit')
  const agg = textOr(propOf(node, ir, 'agg'), 'count')
  const metric = propOf(node, ir, 'metric')
  const filter = propOf(node, ir, 'filter')

  if (propOf(node, ir, 'trendEnabled') === true || propOf(node, ir, 'trendField')) {
    unsupported.push({
      path: node.artifact.rulePath,
      type: 'dash-kpi',
      key: 'trend',
      message: '同比/环比（trendEnabled/trendGrain/trendField）uni 首版无对位：上期区间聚合与趋势箭头不渲染',
    })
  }
  if (propOf(node, ir, 'sparkline') === true) {
    unsupported.push({
      path: node.artifact.rulePath,
      type: 'dash-kpi',
      key: 'sparkline',
      message: '迷你趋势图（sparkline，SVG Sparkline）uni 首版无对位：分桶序列不渲染',
    })
  }
  if (typeof propOf(node, ir, 'numberFormat') === 'string' && propOf(node, ir, 'numberFormat')) {
    unsupported.push({
      path: `${node.artifact.rulePath}.props.numberFormat`,
      type: 'dash-kpi',
      key: 'numberFormat',
      message: '数字格式化（numberFormat=thousand 千分位）uni 首版无对位：原值直出',
    })
  }
  if (typeof filter === 'string' && filter) {
    unsupported.push({
      path: `${node.artifact.rulePath}.props.filter`,
      type: 'dash-kpi',
      key: 'kpi-filter',
      message: '组件级固定过滤（filter JSON）随 useUniKpi 请求透传，dash-filter 广播联动产物无实例登记表（web 同债 requires.autoBroadcast）',
    })
  }
  unsupported.push(sizeMirrorUnsupported(node))

  const T = [
    `<!-- ${node.artifact.anchor} -->`,
    '<view class="lc-kpi">',
    '  <view class="lc-kpi__head">',
    `    <text class="lc-kpi__title">${title}</text>`,
    '  </view>',
  ]
  if (typeof subtitle === 'string' && subtitle) T.push(`  <text class="lc-kpi__subtitle">${subtitle}</text>`)
  T.push('  <view class="lc-kpi__value-row">')
  T.push(`    <text v-if="${p}Value === null" class="lc-kpi__value">--</text>`)
  T.push(`    <text v-else class="lc-kpi__value">{{ ${p}Value ?? '--' }}</text>`)
  if (typeof unit === 'string' && unit) {
    T.push(`    <text v-if="${p}Unit" class="lc-kpi__unit">{{ ${p}Unit }}</text>`)
  }
  T.push('  </view>')
  T.push('</view>')

  // options：metric 空值不出（count 不需要度量列）；filter 有值才出（单引号字面量照落）
  const opts = [`refId: ${refIdExprOf(node, ir)}`, `agg: '${agg.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`]
  if (metric !== null && metric !== undefined && metric !== '') opts.push(`metric: ${sq(String(metric))}`)
  if (typeof filter === 'string' && filter) opts.push(`filter: ${sq(filter)}`)
  const unitConst = typeof unit === 'string' && unit ? [`const ${p}Unit = '${unit.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`] : []
  return {
    template: T.join('\n'),
    script: [
      ...unitConst,
      `const ${p} = useUniKpi({ ${opts.join(', ')} })`,
      `const { value: ${p}Value } = ${p}`,
      `onMounted(() => void ${p}.reload())`,
    ],
    imports: [
      typeof unit === 'string' && unit ? `import { onMounted } from 'vue'` : `import { onMounted } from 'vue'`,
      `import { useUniKpi } from '@lc/runtime-uni/dash'`,
    ],
    unsupported,
  }
}

/** dash-notice → 自绘公告卡 .lc-notice：数据来自 /v1/notifications（无数据源键，useUniNotice
 *  不吃 refId）；display=list 纵排行 / carousel=swiper 自动轮播（interval 透传，缺省 4000）。
 *  未读标记 = readStatus !== 'SENT'（PENDING=未读，列表接口回填）；详情弹层/已读标记
 *  （markAsRead）uni 首版不渲染 → notice-detail 一条登记。 */
function emitNotice(node: IrNode, ir: IrPage): UniWidgetFragment {
  const p = camelField(node.artifact.field)
  const title = textOr(propOf(node, ir, 'title'), '公告')
  const display = propOf(node, ir, 'display') === 'carousel' ? 'carousel' : 'list'
  const limit = typeof propOf(node, ir, 'limit') === 'number' ? (propOf(node, ir, 'limit') as number) : 6
  const interval = typeof propOf(node, ir, 'interval') === 'number' ? (propOf(node, ir, 'interval') as number) : 4000

  const T = [
    `<!-- ${node.artifact.anchor} -->`,
    '<view class="lc-notice">',
    '  <view class="lc-notice__head">',
    `    <text class="lc-notice__title">${title}</text>`,
    `    <text v-if="${p}Total" class="lc-notice__count">{{ ${p}Total }}</text>`,
    '  </view>',
  ]
  if (display === 'carousel') {
    T.push(`  <swiper v-if="${p}Rows.length" class="lc-notice__swiper" :interval="${interval}" autoplay circular>`)
    T.push(`    <swiper-item v-for="row in ${p}Rows" :key="row.id" class="lc-notice__item">`)
    T.push('      <view class="lc-notice__item-line">')
    T.push('        <text class="lc-notice__item-title">{{ row.title }}</text>')
    T.push(`        <text v-if="row.readStatus !== 'SENT'" class="lc-notice__tag">未读</text>`)
    T.push('      </view>')
    T.push(`      <text class="lc-notice__item-meta">{{ String(row.createdAt ?? '').replace('T', ' ').slice(0, 16) }}</text>`)
    T.push('    </swiper-item>')
    T.push('  </swiper>')
  } else {
    T.push(`  <view v-if="${p}Rows.length" class="lc-notice__list">`)
    T.push(`    <view v-for="row in ${p}Rows" :key="row.id" class="lc-notice__item">`)
    T.push('      <view class="lc-notice__item-line">')
    T.push('        <text class="lc-notice__item-title">{{ row.title }}</text>')
    T.push(`        <text v-if="row.readStatus !== 'SENT'" class="lc-notice__tag">未读</text>`)
    T.push('      </view>')
    T.push(`      <text class="lc-notice__item-meta">{{ String(row.createdAt ?? '').replace('T', ' ').slice(0, 16) }}</text>`)
    T.push('    </view>')
    T.push('  </view>')
  }
  T.push(`  <text v-else class="lc-notice__empty">{{ ${p}Loading ? '加载中…' : '暂无公告' }}</text>`)
  T.push('</view>')

  return {
    template: T.join('\n'),
    script: [
      `const ${p} = useUniNotice({ limit: ${limit} })`,
      `const { rows: ${p}Rows, total: ${p}Total, loading: ${p}Loading } = ${p}`,
      `onMounted(() => void ${p}.reload())`,
    ],
    imports: [`import { onMounted } from 'vue'`, `import { useUniNotice } from '@lc/runtime-uni/dash'`],
    unsupported: [
      {
        path: node.artifact.rulePath,
        type: 'dash-notice',
        key: 'notice-detail',
        message: '公告详情弹层与未读已读标记（openDetail/markAsRead）uni 首版不渲染：列表仅展示 title/时间/未读',
      },
      sizeMirrorUnsupported(node),
    ],
  }
}

/** dash-todo → 待办清单卡 .lc-todo：待办 /v1/tasks（assignee）、已办 /v1/tasks/historic
 *  （userId，端点在 useUniTodo 内按 view 分派）；身份硬约束——产物从本地存储 lc_user_id
 *  取（Task 10.3 登录接线写入），未登录走 empty 文案不发请求。优先级 ≥100 加急/≥75 重要
 *  标签与 meta 行对位 web priorityLabel/metaText；行点击进任务详情 uni 无对位（登记）。 */
function emitTodo(node: IrNode, ir: IrPage): UniWidgetFragment {
  const p = camelField(node.artifact.field)
  const view = propOf(node, ir, 'view') === 'done' ? 'done' : 'todo'
  const title = textOr(propOf(node, ir, 'title'), view === 'done' ? '我的已办' : '我的待办')
  const limit = typeof propOf(node, ir, 'limit') === 'number' ? (propOf(node, ir, 'limit') as number) : 8
  const orderBy = propOf(node, ir, 'orderBy')
  const timeKey = view === 'done' ? 'row.endTime' : 'row.createTime'

  const T = [
    `<!-- ${node.artifact.anchor} -->`,
    '<view class="lc-todo">',
    '  <view class="lc-todo__head">',
    `    <text class="lc-todo__title">${title}</text>`,
    `    <text v-if="${p}Total" class="lc-todo__count">{{ ${p}Total }}</text>`,
    '  </view>',
    `  <view v-if="${p}Rows.length" class="lc-todo__list">`,
    `    <view v-for="row in ${p}Rows" :key="row.taskId" class="lc-todo__item">`,
    '      <view class="lc-todo__item-main">',
    '        <text class="lc-todo__item-title">{{ row.processName }}</text>',
    '        <text v-if="(row.priority ?? 0) >= 100" class="lc-todo__tag lc-todo__tag--urgent">加急</text>',
    '        <text v-else-if="(row.priority ?? 0) >= 75" class="lc-todo__tag">重要</text>',
    '        <text v-if="row.reminded" class="lc-todo__tag">已催办</text>',
    '      </view>',
  ]
  // meta 行：发起人/节点名/时间（已办取 endTime，待办取 createTime）——对位 web metaText
  T.push(
    `      <text class="lc-todo__item-meta">{{ [row.initiatorName ? \`发起人\${row.initiatorName}\` : '', row.currentNodeName ? \`节点\${row.currentNodeName}\` : '', ${timeKey} ? String(${timeKey}).replace('T', ' ').slice(0, 16) : ''].filter(Boolean).join(' · ') }}</text>`,
  )
  T.push('    </view>')
  T.push('  </view>')
  T.push(`  <text v-else class="lc-todo__empty">{{ ${p}Empty || (${p}Loading ? '加载中…' : '') }}</text>`)
  T.push('</view>')

  const opts = [`view: '${view}'`, `limit: ${limit}`]
  if (view === 'todo' && typeof orderBy === 'string' && orderBy) opts.push(`orderBy: '${orderBy.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
  opts.push(`userId: String(${p}UserId ?? '')`)
  return {
    template: T.join('\n'),
    script: [
      `const ${p}UserId = uni.getStorageSync('lc_user_id')`,
      `const ${p} = useUniTodo({ ${opts.join(', ')} })`,
      `const { rows: ${p}Rows, total: ${p}Total, empty: ${p}Empty } = ${p}`,
      `onMounted(() => void ${p}.reload())`,
    ],
    imports: [`import { onMounted } from 'vue'`, `import { useUniTodo } from '@lc/runtime-uni/dash'`],
    unsupported: [
      {
        path: node.artifact.rulePath,
        type: 'dash-todo',
        key: 'todo-row-click',
        message: '行点击进任务详情（web router.push /process/todo/:taskId）uni 首版无任务详情页：行点击不接线',
      },
      sizeMirrorUnsupported(node),
    ],
  }
}

// ==================== dash-chart / page-chart → uni-echarts 图表片段（Task 7.3） ====================

/** uni-echarts 按需注册（web useEcharts.ts 图表子集同款；多片段同页重复 use 幂等无害） */
export const UNI_ECHARTS_IMPORTS = [
  `import { BarChart, LineChart, PieChart } from 'echarts/charts'`,
  `import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'`,
  `import * as echarts from 'echarts/core'`,
  `import { CanvasRenderer } from 'echarts/renderers'`,
  `import UniEcharts from 'uni-echarts'`,
]

const UNI_ECHARTS_USE_LINE =
  'echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])'

/**
 * echarts.use 行装配级去重（首现保留）：多图表片段同页各带一行 use（重复注册因
 * echarts.use set 语义本无害），装配层收敛为一行——产物更干净且避免阅读噪音。
 * 只滤该行，其余 script 行原样（不同片段同名行即命名冲突 bug，不该在这里吞）。
 */
export function dedupeUniEchartsUse(scripts: string[]): string[] {
  let seen = false
  return scripts.filter((l) => {
    if (l !== UNI_ECHARTS_USE_LINE) return true
    if (seen) return false
    seen = true
    return true
  })
}

/** bar/line/pie 直出；scatter/heatmap/funnel → bar、area → line（uni 首版子集） */
function uniChartTypeOf(chartType: string): 'bar' | 'line' | 'pie' {
  if (chartType === 'pie') return 'pie'
  if (chartType === 'line' || chartType === 'area') return 'line'
  return 'bar'
}

/** 画布高度：组件 height 非空照用（web 契约的 css 值），空 = 自适应缺省 480rpx */
function uniChartHeight(height: unknown): string {
  return typeof height === 'string' && height ? height : '480rpx'
}

/**
 * dash-chart → .lc-dchart：uni-echarts 载体 + useUniChart aggregate 通道。
 * 空数据/失败（rows=[]）→ option computed 为 null → 模板 v-else 空态（对位 web hasData 门）。
 */
function emitDashChart(node: IrNode, ir: IrPage): UniWidgetFragment {
  const p = camelField(node.artifact.field)
  const unsupported: Unsupported[] = []
  const title = textOr(propOf(node, ir, 'title'), '')
  const rawType = textOr(propOf(node, ir, 'chartType'), 'bar')
  const chartType = uniChartTypeOf(rawType)
  if (rawType !== chartType) {
    unsupported.push({
      path: `${node.artifact.rulePath}.props.chartType`,
      type: node.artifact.type,
      key: 'chart-type',
      message: `chartType=${rawType}：uni 首版仅 bar/line/pie，回退 ${chartType}（scatter/heatmap/funnel/area 语义不渲染）`,
    })
  }
  const group = textOr(propOf(node, ir, 'group'), '')
  const agg = textOr(propOf(node, ir, 'agg'), 'count')
  const metric = propOf(node, ir, 'metric')
  const timeGrain = propOf(node, ir, 'timeGrain')
  const sort = propOf(node, ir, 'sort')
  const order = propOf(node, ir, 'order')
  const limit = propOf(node, ir, 'limit')
  const filter = propOf(node, ir, 'filter')

  // 系列名对位 DashChart.render seriesName：title || (count → 数量 | `${agg}(${metric})`)
  const seriesName =
    title || (agg === 'count' ? '数量' : `${agg}(${typeof metric === 'string' ? metric : ''})`)

  // options：缺省项不出（sort=key/order=asc 是 useUniChart 缺省；count 不带 metric）
  const opts = [`refId: ${refIdExprOf(node, ir)}`]
  if (group) opts.push(`group: ${sq(group)}`)
  opts.push(`agg: ${sq(agg)}`)
  if (metric !== null && metric !== undefined && metric !== '') opts.push(`metric: ${sq(String(metric))}`)
  if (typeof timeGrain === 'string' && timeGrain) opts.push(`timeGrain: ${sq(timeGrain)}`)
  if (typeof sort === 'string' && sort && sort !== 'key') opts.push(`sort: ${sq(sort)}`)
  if (typeof order === 'string' && order && order !== 'asc') opts.push(`order: ${sq(order)}`)
  if (typeof limit === 'number' && limit > 0) opts.push(`limit: ${limit}`)
  if (typeof filter === 'string' && filter) opts.push(`filter: ${sq(filter)}`)

  const T = [
    `<!-- ${node.artifact.anchor} -->`,
    '<view class="lc-dchart">',
  ]
  if (title) T.push(`  <text class="lc-dchart__title">${title}</text>`)
  T.push(
    `  <uni-echarts v-if="${p}Option" custom-style="width: 100%; height: ${uniChartHeight(propOf(node, ir, 'height'))}" :option="${p}Option" />`,
    `  <text v-else class="lc-dchart__empty">{{ ${p}Loading ? '加载中…' : '暂无数据' }}</text>`,
    '</view>',
  )

  return {
    template: T.join('\n'),
    script: [
      UNI_ECHARTS_USE_LINE,
      `const ${p} = useUniChart({ ${opts.join(', ')} })`,
      `const { rows: ${p}Rows, loading: ${p}Loading } = ${p}`,
      `const ${p}Option = computed(() => buildUniAggregateOption('${chartType}', ${p}Rows, ${sq(seriesName)}))`,
      `onMounted(() => void ${p}.reload())`,
    ],
    imports: [
      `import { computed, onMounted } from 'vue'`,
      ...UNI_ECHARTS_IMPORTS,
      `import { useUniChart } from '@lc/runtime-uni/dash'`,
      `import { buildUniAggregateOption } from '@lc/runtime-uni/charts'`,
    ],
    unsupported: [...unsupported, sizeMirrorUnsupported(node)],
  }
}

/**
 * page-chart → .lc-pchart：config（PAGE 轨形态）emit 期归一为 UniChartViewConfig 常量，
 * 数据走 useUniList(pagination: false) 全量（对位 web PageDataChartPage size=-1 前端聚合）。
 */
function emitPageChart(node: IrNode, ir: IrPage): UniWidgetFragment {
  const p = camelField(node.artifact.field)
  const raw = (propOf(node, ir, 'config') ?? {}) as {
    type?: unknown
    dimension?: unknown
    measures?: unknown
  }
  const rawType = typeof raw.type === 'string' ? raw.type : 'bar'
  const chartType = uniChartTypeOf(rawType)
  const dimension = typeof raw.dimension === 'string' ? raw.dimension : ''
  const measures = Array.isArray(raw.measures) ? raw.measures : []
  // 归一（web PageDataChartPage.normalizeMeasures 同口径）：剔空 key、非法 agg 回退 sum；
  // measure.label 融为 yFields[].name（emit 期静态化，运行期零解释）
  const yFields = measures
    .map((m) => m as { key?: unknown; agg?: unknown; label?: unknown })
    .filter((m) => typeof m.key === 'string' && m.key)
    .map((m) => {
      const agg = m.agg === 'avg' || m.agg === 'count' || m.agg === 'max' || m.agg === 'min' ? m.agg : 'sum'
      return typeof m.label === 'string' && m.label ? { key: m.key, agg, name: m.label } : { key: m.key, agg }
    })
  const chartConstName = `${p}Chart`
  const chartConst: Record<string, unknown> = {
    type: chartType,
    xField: dimension,
    yFields,
    limit: 20,
  }

  const T = [
    `<!-- ${node.artifact.anchor} -->`,
    '<view class="lc-pchart">',
    `  <uni-echarts v-if="${p}Option" custom-style="width: 100%; height: ${uniChartHeight(propOf(node, ir, 'height'))}" :option="${p}Option" />`,
    `  <text v-else class="lc-pchart__empty">{{ ${p}Loading ? '加载中…' : '暂无数据' }}</text>`,
    '</view>',
  ]

  return {
    template: T.join('\n'),
    script: [
      UNI_ECHARTS_USE_LINE,
      `const ${chartConstName} = ${jsonToTs(chartConst)}`,
      `const ${p} = useUniList({ refId: ${refIdExprOf(node, ir)}, pagination: false })`,
      `const { rows: ${p}Rows, loading: ${p}Loading } = ${p}`,
      `const ${p}Option = computed(() => buildUniDatasetOption(${chartConstName}.type, ${p}Rows, ${chartConstName}))`,
      `onMounted(() => void ${p}.reload())`,
    ],
    imports: [
      `import { computed, onMounted } from 'vue'`,
      ...UNI_ECHARTS_IMPORTS,
      `import { useUniList } from '@lc/runtime-uni/list'`,
      `import { buildUniDatasetOption } from '@lc/runtime-uni/charts'`,
    ],
    unsupported: [sizeMirrorUnsupported(node)],
  }
}

/**
 * fcTable → 纵向堆叠降级（Task 6.3，design 决策 2）：web 静态 <table> 还原 row/col/合并
 * 几何（IrTable.cells 只含可见 home 格，被合并覆盖格的子归 home），uni 放弃合并单元格
 * 语义 —— 非空 home 格按 (row,col) 字典序纵排成块（.lc-ftable__cell），逐格 style/class
 * 照落（键在 TABLE_RULE_CONTRACT 已登记 derived，不静默消失）；几何视觉键（border/mini/
 * formStyle/borderWidth/borderColor + layout 合并）无纵排对位，节点级一条 unsupported
 * 登记（不是逐键散报 —— 降级是节点级决策）。parse 侧格内字段控件已整字段降级（静态
 * 表格不是表单），格内只剩 widget/list 族与嵌套 fcTable：复用 emitWidgetNode 分派
 * （嵌套 fcTable 自然递归），null → lc:todo 挂点（同 5.2 纪律）；空格不出块（无内容
 * 块是死 UI，同 5.2「空钩子不出」）。script/imports 收子片段（list 族格内时并入）。
 */
function emitFcTable(node: IrNode, ir: IrPage): UniWidgetFragment {
  const t = node.table!
  const unsupported: Unsupported[] = [
    {
      path: node.artifact.rulePath,
      type: node.artifact.type,
      key: 'table-geometry',
      message: 'fcTable 合并单元格/边框等几何视觉 uni 无纵排对位（design 决策 2 纵向堆叠），逐格内容保留',
    },
  ]
  const T: string[] = [`<!-- ${node.artifact.anchor} -->`, '<view class="lc-ftable">']
  const scripts: string[] = []
  const imports: string[] = []
  for (const cell of t.cells) {
    if (!cell.children.length) continue // 空格不出块：无内容块是死 UI
    const styleText = cellStyleText(cell.style)
    const cls = ['lc-ftable__cell', ...(cell.className ? [cell.className] : [])].join(' ')
    T.push(`  <view class="${cls}"${styleText ? ` style="${styleText}"` : ''}>`)
    for (const c of cell.children) {
      if (c.degraded) {
        T.push(`    <!-- lc:todo node=${c.artifact.id} type=${c.artifact.type} field=${c.artifact.field} ${c.degradeReason ?? 'parse 降级'} -->`)
        continue
      }
      const frag = emitWidgetNode(c, ir)
      if (frag) {
        T.push(...frag.template.split('\n').map((l) => `    ${l}`))
        scripts.push(...frag.script)
        for (const line of frag.imports) if (!imports.includes(line)) imports.push(line)
        unsupported.push(...frag.unsupported)
      } else {
        T.push(`    <!-- lc:todo node=${c.artifact.id} type=${c.artifact.type} field=${c.artifact.field} 组件族 uniapp 装配按任务落地（dash-* 归 7.x） -->`)
      }
    }
    T.push('  </view>')
  }
  T.push('</view>')
  return { template: T.join('\n'), script: scripts, imports, unsupported }
}

/** fcTable 格 style 对象 → 内联串（与 web emit.styleText 同规则：非空值 `kebab: v` 以 `; ` 连接） */
function cellStyleText(style: Record<string, unknown> | undefined): string {
  if (!style) return ''
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${kebab(String(k))}: ${String(v)}`)
    .join('; ')
}
