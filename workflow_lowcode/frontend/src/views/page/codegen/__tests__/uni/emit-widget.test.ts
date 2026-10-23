// ----- Task 5.2: page-detail 堆叠详情 / page-steps / page-data-container（uni-popup 弹层）-----
// golden 即规格。三类展示组件 uni 首版口径（spec「组件映射保真口径」：page-detail→堆叠详情、
// page-steps→uni-steps、page-data-container→uni-popup 弹层）：
//  · page-steps → uni-steps：items 常量按 `${p}Items` 重出并做 description→desc 形状映射
//    （uni-steps 的 options 吃 {title,desc}，web el-steps 是 {title,description}）；
//    direction 非 horizontal 登记 unsupported（uni-steps 无方向 prop，vertical 无对位）；
//  · page-detail → 堆叠 KV 详情：列静态展开（列形状 {key,label}，取 key），数据 ref 恒出
//    但产物无写入方——记录来源由行点击联动灌入（web 同债 requires.recordLinkage），
//    unsupported 登记，绝不静默；
//  · page-data-container → uni-popup 弹层：压缩卡片头（title + total）+ 查看入口 + 弹层
//    记录展示。纯展示——web PDC「只做展示，不含提交/重置按钮」，uni 不自加 confirmSave
//    （语义纪律：绝不静默增语义）；子规则按字段名摊平为 KV 行（可提取 = 有 field 且非
//    native / 非 dash-* 聚合件，web 由内嵌 form-create 解释 {row.x} 作用域插值，摊平降级
//    unsupported 登记）；自查询复用 useUniList（reload 即 page=1/size=N，形状吻合）+
//    onMounted 首载，不出触底（onReachBottom）；queryMode=single → size 1。
// npx vitest run src/views/page/codegen/__tests__/uni/emit-widget.test.ts

import { describe, expect, it } from 'vitest'

import type { IrNode, IrPage } from '../../ir'
import { parseIr } from '../../parse'
import { emitWidgetNode, extractPdcFields } from '../../uni/emit-widget'
import dataContainer from '../fixtures/corpus/tmp_data_container_verify.json'
import detailSteps from '../fixtures/corpus/page_detail_steps_demo.json'

const clone = (v: unknown) => JSON.parse(JSON.stringify(v))

function widgetOf(schema: any, type: string): { node: IrNode; ir: IrPage } {
  const ir = parseIr(schema, { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-widget' })
  const node = ir.nodes.find((n) => n.artifact.type === type)
  if (!node) throw new Error(`页面应含 ${type} 节点`)
  return { node, ir }
}

function widgetOfField(schema: any, field: string): { node: IrNode; ir: IrPage } {
  const ir = parseIr(schema, { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-widget' })
  const node = ir.nodes.find((n) => n.artifact.field === field)
  if (!node) throw new Error(`页面应含 field=${field} 节点`)
  return { node, ir }
}

const stepsOf = () => widgetOf(clone(detailSteps), 'page-steps')
const detailOf = () => widgetOf(clone(detailSteps), 'page-detail')
const pdcListOf = () => widgetOfField(clone(dataContainer), 'dcList')
const pdcSingleOf = () => widgetOfField(clone(dataContainer), 'dcSingle')

describe('emitWidgetNode — page-steps → uni-steps', () => {
  it('模板：uni-steps :options/:active；脚本：items 常量重出（description→desc 映射）', () => {
    const { node, ir } = stepsOf()
    const frag = emitWidgetNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.template).toBe(
      [
        `<!-- ${node.artifact.anchor} -->`,
        '<view class="lc-steps">',
        '  <uni-steps :options="stepsDemo1Items" :active="1" />',
        '</view>',
      ].join('\n'),
    )
    expect(frag!.script.join('\n')).toBe(
      [
        'const stepsDemo1Items = [',
        '  {',
        "    title: '登记受理',",
        "    desc: '创建客户档案'",
        '  },',
        '  {',
        "    title: '需求确认',",
        "    desc: '确认服务方案'",
        '  },',
        '  {',
        "    title: '现场实施',",
        "    desc: '工程师上门服务'",
        '  },',
        '  {',
        "    title: '验收归档',",
        "    desc: '客户签收归档'",
        '  }',
        ']',
      ].join('\n'),
    )
    expect(frag!.imports).toEqual([])
    expect(frag!.unsupported).toEqual([])
  })

  it('direction=vertical 无 uni 对位 → unsupported 登记（horizontal 无损不登记）', () => {
    const schema = clone(detailSteps) as any
    const stepsRule = schema.rule.find((r: any) => r.type === 'page-steps')
    stepsRule.props.direction = 'vertical'
    const { node, ir } = widgetOf(schema, 'page-steps')
    const frag = emitWidgetNode(node, ir)
    expect(frag!.unsupported).toEqual([
      {
        path: 'rule[0].props.direction',
        type: 'page-steps',
        key: 'direction',
        message: 'direction=vertical：uni-steps 无方向 prop，仅横向步骤条，纵向无对位',
      },
    ])
  })
})

describe('emitWidgetNode — page-detail → 堆叠 KV 详情', () => {
  it('模板：title + 逐列 KV 行（{key,label} 取 key）；脚本：数据 ref；recordLinkage 债登记', () => {
    const { node, ir } = detailOf()
    const frag = emitWidgetNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.template).toBe(
      [
        `<!-- ${node.artifact.anchor} -->`,
        '<view class="lc-detail">',
        '  <view class="lc-detail__title">客户档案详情（点击上方列表行联动）</view>',
        '  <view class="lc-detail__row">',
        '    <text class="lc-detail__label">客户名称</text>',
        "    <text class=\"lc-detail__value\">{{ custDetail1Data['Fyczmv3ks22dabc'] }}</text>",
        '  </view>',
        '  <view class="lc-detail__row">',
        '    <text class="lc-detail__label">客户状态</text>',
        "    <text class=\"lc-detail__value\">{{ custDetail1Data['Ffxemv3ksch9aec_text'] }}</text>",
        '  </view>',
        '  <view class="lc-detail__row">',
        '    <text class="lc-detail__label">负责人</text>',
        "    <text class=\"lc-detail__value\">{{ custDetail1Data['Fzgimv3kskiaahc'] }}</text>",
        '  </view>',
        '  <view class="lc-detail__row">',
        '    <text class="lc-detail__label">联系电话</text>',
        "    <text class=\"lc-detail__value\">{{ custDetail1Data['Fqgomv3ksnqrakc'] }}</text>",
        '  </view>',
        '</view>',
      ].join('\n'),
    )
    expect(frag!.script).toEqual(['const custDetail1Data = ref<Record<string, unknown>>({})'])
    expect(frag!.imports).toEqual([`import { ref } from 'vue'`])
    expect(frag!.unsupported).toEqual([
      {
        path: 'rule[2]',
        type: 'page-detail',
        key: 'detail-recordLinkage',
        message:
          '记录来源由行点击联动灌入（web 同债 requires.recordLinkage）：uni 产物该组件数据 ref 无写入方，需人工在行点击处接线',
      },
    ])
  })
})

describe('emitWidgetNode — page-data-container → uni-popup 弹层（纯展示）', () => {
  it('list 模式：卡片头 + 查看入口 + 弹层空态（语料 childRules 无可提取字段）；不自加 confirmSave', () => {
    const { node, ir } = pdcListOf()
    const frag = emitWidgetNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.template).toBe(
      [
        `<!-- ${node.artifact.anchor} -->`,
        '<view class="lc-dc">',
        '  <view class="lc-dc__head">',
        '    <text class="lc-dc__title">客户概览（list）</text>',
        '    <text v-if="dcListTotal" class="lc-dc__count">{{ dcListTotal }}</text>',
        '  </view>',
        '  <button class="lc-dc__open" size="mini" @click="dcListPopup?.open()">查看数据</button>',
        '  <uni-popup ref="dcListPopup" type="bottom" class="lc-dc__popup" background-color="#fff">',
        '    <view class="lc-dc__popup-head">客户概览（list）</view>',
        '    <view class="lc-dc__popup-body">',
        "      <view v-if=\"!dcListRows.length\" class=\"lc-dc__empty\">{{ dcListLoading ? '加载中…' : '暂无数据' }}</view>",
        '    </view>',
        '  </uni-popup>',
        '</view>',
      ].join('\n'),
    )
    expect(frag!.script).toEqual([
      'const dcListPopup = ref<{ open: () => void; close: () => void } | null>(null)',
      'const { rows: dcListRows, loading: dcListLoading, total: dcListTotal, reload: dcListReload } = useUniList({ refId: ds.refId, pageSize: 5 })',
      'onMounted(() => void dcListReload())',
    ])
    expect(frag!.imports).toEqual([
      `import { onMounted, ref } from 'vue'`,
      `import { useUniList } from '@lc/runtime-uni/list'`,
    ])
    expect(frag!.unsupported).toEqual([
      {
        path: 'rule[1]',
        type: 'page-data-container',
        key: 'pdc-childRules',
        message:
          '子规则按字段名摊平为 KV 行展示（web 由内嵌 form-create 解释 {row.x} 作用域插值与复杂控件）；非字段规则（native 文本/dash-* 聚合件）不渲染',
      },
    ])
    // 语义纪律：web PDC 纯展示，uni 不得自加 confirmSave
    expect(frag!.template).not.toContain('confirmSave')
    expect(frag!.script.join('\n')).not.toContain('confirmSave')
  })

  it('single 模式：size 1（web 取数口径 queryMode=single → size=1）', () => {
    const { node, ir } = pdcSingleOf()
    const frag = emitWidgetNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.script.join('\n')).toContain('pageSize: 1')
  })

  it('无 title prop → 头部只出计数行，不出标题行', () => {
    const schema = clone(dataContainer) as any
    const pdc = schema.rule.find((r: any) => r.type === 'page-data-container')
    delete pdc.props.title
    const { node, ir } = widgetOfField(schema, 'dcList')
    const frag = emitWidgetNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.template).not.toContain('lc-dc__title')
  })
})

describe('extractPdcFields — childRules 可提取字段（纯函数）', () => {
  it('字段规则提取 {field,title}；native 文本与 dash-* 聚合件跳过；布局 children 递归', () => {
    const fields = extractPdcFields([
      { type: 'div', native: true, children: ['共 {rows.length} 条，首条 {row.name}'] },
      { type: 'dash-kpi', field: 'kpiInDc', title: 'KPI 指标卡' },
      { type: 'row', children: [{ type: 'input', field: 'name', title: '姓名' }] },
      { type: 'input', field: 'phone', title: '电话' },
    ])
    expect(fields).toEqual([
      { field: 'name', title: '姓名' },
      { field: 'phone', title: '电话' },
    ])
  })

  it('非数组/空 → 空数组（弹层走空态）', () => {
    expect(extractPdcFields(undefined)).toEqual([])
    expect(extractPdcFields('x')).toEqual([])
    expect(extractPdcFields([])).toEqual([])
  })
})
