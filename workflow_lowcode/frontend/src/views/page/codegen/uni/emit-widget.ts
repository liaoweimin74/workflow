/**
 * uni 展示组件族出码（Task 5.2）：page-steps / page-detail / page-data-container。
 *
 * spec「组件映射保真口径」：page-detail→堆叠详情、page-steps→uni-steps、
 * page-data-container→uni-popup 弹层。uni 首版口径（golden 即规格）：
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
 * 其余组件类型返回 null（调用方落 lc:todo 挂点）。首行无缩进，页面装配统一加页内缩进。
 */
import { jsonToTs } from '../emit'
import { camelField, type IrNode, type IrPage, type Unsupported } from '../ir'

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
