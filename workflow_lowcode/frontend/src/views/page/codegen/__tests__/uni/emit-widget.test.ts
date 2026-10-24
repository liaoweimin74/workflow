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
import fcTablePlain from '../fixtures/fc-table/plain.json'
import fcTableRich from '../fixtures/fc-table/rich.json'
import detailSteps from '../fixtures/corpus/page_detail_steps_demo.json'
import testPage from '../fixtures/test_page.schema.json'

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

describe('emitWidgetNode — page-table → uni-table 简表（Task 6.2）', () => {
  /** 语料 test_page 的 page-table：3 列（code/name/dept，前两列可排序）、搜索 ×3、
   *  border/stripe、toolbar 新建 + 行按钮 edit/delete/view、selectionMode=none、
   *  row-edit 动作已编译为内置 open case（探针实测：switchCases 4 个、chains 空） */
  const tableOf = () => {
    const ir = parseIr(clone(testPage), { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-widget', target: 'uniapp' })
    const node = ir.nodes.find((n) => n.artifact.type === 'page-table')
    if (!node) throw new Error('页面应含 page-table 节点')
    return { node, ir }
  }

  it('模板：uni-table 简表（搜索条 + toolbar + 列静态展开 + sortable 列 + 操作列收「···」弹层）', () => {
    const { node, ir } = tableOf()
    const frag = emitWidgetNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.template).toBe(
      [
        `<!-- ${node.artifact.anchor} -->`,
        '<view class="lc-table">',
        `  <uni-search-bar v-model="table1789468745852Search" class="lc-table__search" placeholder="搜索" @confirm="table1789468745852OnSearch" @clear="table1789468745852OnSearch" />`,
        '  <view class="lc-table__toolbar">',
        `    <button class="lc-table__toolbar-btn" size="mini" @click="onButtonClick({ key: 'create', label: '新增', row: null })">新增</button>`,
        `    <button class="lc-table__filter-open" size="mini" @click="table1789468745852FilterOpen">筛选</button>`,
        '  </view>',
        '  <uni-table :data="table1789468745852Rows" :loading="table1789468745852Loading">',
        '    <uni-tr>',
        '      <uni-th>人员编码</uni-th>',
        '      <uni-th>人员姓名</uni-th>',
        '      <uni-th>所属部门</uni-th>',
        '      <uni-th class="lc-table__th-actions">操作</uni-th>',
        '    </uni-tr>',
        '    <uni-tr v-for="row in table1789468745852Rows" :key="row.id">',
        "      <uni-td>{{ row['code'] }}</uni-td>",
        "      <uni-td>{{ row['name'] }}</uni-td>",
        "      <uni-td>{{ row['dept'] }}</uni-td>",
        '      <uni-td class="lc-table__td-actions">',
        `        <button class="lc-table__more" size="mini" @click="table1789468745852MoreOpen(row)">···</button>`,
        '      </uni-td>',
        '    </uni-tr>',
        '  </uni-table>',
        `  <view class="lc-table__status">{{ table1789468745852Loading ? '加载中…' : table1789468745852Finished ? '没有更多了' : '' }}</view>`,
        `  <uni-popup ref="table1789468745852MorePopup" type="bottom" class="lc-table__more-popup" background-color="#fff">`,
        '    <view class="lc-table__more-body">',
        `      <button class="lc-table__more-btn" @click="table1789468745852MoreTap('edit', '编辑')">编辑</button>`,
        `      <button class="lc-table__more-btn" @click="table1789468745852MoreTap('delete', '删除')">删除</button>`,
        `      <button class="lc-table__more-btn" @click="table1789468745852MoreTap('view', '查看')">查看</button>`,
        '    </view>',
        '  </uni-popup>',
        `  <uni-popup ref="table1789468745852FilterPopup" type="bottom" class="lc-table__filter" background-color="#fff">`,
        '    <view class="lc-table__filter-body">',
        '      <view v-for="f in table1789468745852SearchFields" :key="f.prop" class="lc-table__filter-field">',
        '        <text class="lc-table__filter-label">{{ f.label }}</text>',
        `        <input v-model="table1789468745852FieldValues[f.prop]" class="lc-table__filter-input" :placeholder="f.label" />`,
        '      </view>',
        `      <button class="lc-table__filter-btn" @click="table1789468745852FilterConfirm">查询</button>`,
        `      <button class="lc-table__filter-btn" plain @click="table1789468745852FilterReset">重置</button>`,
        '    </view>',
        '  </uni-popup>',
        '</view>',
      ].join('\n'),
    )
  })

  it('脚本：useUniList + onMounted 首载 + onReachBottom + 搜索/More 函数组 + 内置 4 case 真实现（页面有容器）', () => {
    const { node, ir } = tableOf()
    const frag = emitWidgetNode(node, ir)
    expect(frag!.script).toEqual([
      `const table1789468745852SearchFields = [{ prop: 'code', label: '人员编码' }, { prop: 'name', label: '人员姓名' }, { prop: 'dept', label: '所属部门' }]`,
      `const table1789468745852List = useUniList({ refId: ds.refId, pageSize: 20, searchFields: table1789468745852SearchFields })`,
      `const { rows: table1789468745852Rows, loading: table1789468745852Loading, finished: table1789468745852Finished, keyword: table1789468745852Search, fieldValues: table1789468745852FieldValues } = table1789468745852List`,
      `const table1789468745852MoreRow = ref<Record<string, unknown> | null>(null)`,
      `const table1789468745852MorePopup = ref<{ open: () => void; close: () => void } | null>(null)`,
      `const table1789468745852FilterPopup = ref<{ open: () => void; close: () => void } | null>(null)`,
      `onMounted(() => void table1789468745852List.reload())`,
      `onReachBottom(() => table1789468745852List.loadMore())`,
      `function table1789468745852OnSearch() {`,
      `  table1789468745852List.onSearch()`,
      `}`,
      `function table1789468745852FilterOpen() {`,
      `  table1789468745852FilterPopup.value?.open()`,
      `}`,
      `function table1789468745852FilterConfirm() {`,
      `  table1789468745852List.onSearch()`,
      `  table1789468745852FilterPopup.value?.close()`,
      `}`,
      `function table1789468745852FilterReset() {`,
      `  table1789468745852List.resetSearch()`,
      `  table1789468745852FilterPopup.value?.close()`,
      `}`,
      `function table1789468745852MoreOpen(row: Record<string, unknown>) {`,
      `  table1789468745852MoreRow.value = row`,
      `  table1789468745852MorePopup.value?.open()`,
      `}`,
      `function table1789468745852MoreTap(key: string, label: string) {`,
      `  onButtonClick({ key, label, row: table1789468745852MoreRow.value })`,
      `  table1789468745852MorePopup.value?.close()`,
      `}`,
      `function onRowClick(_row: Record<string, unknown>) {`,
      `  // uni-tr 无行点击事件源：挂点保留供人工接管（可在模板自行接触发）`,
      `}`,
      `function onButtonClick(payload: { key: string; label: string; row: Record<string, unknown> | null }) {`,
      `  const row = payload.row`,
      `  switch (payload.key) {`,
      `    case 'edit':`,
      `      void openContainer(String(row?.id ?? ''), false, 'edit')`,
      `      return`,
      `    case 'delete':`,
      `      if (row?.id != null) void table1789468745852List.removeRow(String(row.id))`,
      `      return`,
      `    case 'create':`,
      `      void openContainer(String(row?.id ?? ''), false, 'create')`,
      `      return`,
      `    case 'view':`,
      `      void openContainer(String(row?.id ?? ''), true, 'view')`,
      `      return`,
      `  }`,
      `}`,
      `function onSelectionChange(_rows: unknown) {`,
      `  // selectionMode=none 无 selection 列：挂点保留（uni payload 形状 { detail: { value, index } }）`,
      `}`,
    ])
  })

  it('imports/unsupported：vue(onMounted,ref) + onReachBottom + useUniList；viewDetail/row-click/pageSizes 登记', () => {
    const { node, ir } = tableOf()
    const frag = emitWidgetNode(node, ir)
    expect(frag!.imports).toEqual([
      `import { onMounted, ref } from 'vue'`,
      `import { onReachBottom } from '@dcloudio/uni-app'`,
      `import { useUniList } from '@lc/runtime-uni/list'`,
    ])
    expect(frag!.unsupported.map((u) => [u.key, u.path])).toEqual([
      ['viewDetail', 'rule[0].props.viewDetail'],
      ['row-click', 'rule[0]'],
      ['pageSizes', 'rule[0].props.pageSizes'],
    ])
  })

  it('selectionMode=multiple → uni-table type="selection" + @selection-change 绑定（handler 形参 uni payload 口径）', () => {
    const schema = clone(testPage) as any
    const table = schema.rule.find((r: any) => r.type === 'page-table')
    table.props.selectionMode = 'multiple'
    const ir = parseIr(schema, { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-widget', target: 'uniapp' })
    const node = ir.nodes.find((n) => n.artifact.type === 'page-table')!
    const frag = emitWidgetNode(node, ir)
    expect(frag!.template).toContain('<uni-table :data="table1789468745852Rows" type="selection"')
    expect(frag!.template).toContain('@selection-change="onSelectionChange"')
    expect(frag!.script.join('\n')).toContain('function onSelectionChange(_rows: unknown) {')
  })

  it('最小配置（detail_steps 语料）：无搜索/无按钮/无排序时模板收敛为纯表格；onButtonClick 空 switch 保留挂点', () => {
    const ir = parseIr(clone(detailSteps), { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-widget', target: 'uniapp' })
    const node = ir.nodes.find((n) => n.artifact.type === 'page-table')!
    const frag = emitWidgetNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.template).toBe(
      [
        `<!-- ${node.artifact.anchor} -->`,
        '<view class="lc-table">',
        '  <uni-table :data="custTable1Rows" :loading="custTable1Loading">',
        '    <uni-tr>',
        '      <uni-th>客户名称</uni-th>',
        '      <uni-th>客户状态</uni-th>',
        '      <uni-th>负责人</uni-th>',
        '      <uni-th>联系电话</uni-th>',
        '    </uni-tr>',
        '    <uni-tr v-for="row in custTable1Rows" :key="row.id">',
        "      <uni-td>{{ row['Fyczmv3ks22dabc'] }}</uni-td>",
        "      <uni-td>{{ row['Ffxemv3ksch9aec_text'] }}</uni-td>",
        "      <uni-td>{{ row['Fzgimv3kskiaahc'] }}</uni-td>",
        "      <uni-td>{{ row['Fqgomv3ksnqrakc'] }}</uni-td>",
        '    </uni-tr>',
        '  </uni-table>',
        `  <view class="lc-table__status">{{ custTable1Loading ? '加载中…' : custTable1Finished ? '没有更多了' : '' }}</view>`,
        '</view>',
      ].join('\n'),
    )
    expect(frag!.script.join('\n')).toContain('function onButtonClick(payload: { key: string; label: string; row: Record<string, unknown> | null }) {')
    expect(frag!.script.join('\n')).toContain('  switch (payload.key) {')
  })

  it('contentType=template/expression 列不渲染并登记（no-eval 纪律，同 cards 口径）', () => {
    const schema = clone(testPage) as any
    const table = schema.rule.find((r: any) => r.type === 'page-table')
    table.props.columns.push({ prop: 'calc', label: '计算', contentType: 'expression', contentValue: 'row.a + row.b' })
    const ir = parseIr(schema, { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-widget', target: 'uniapp' })
    const node = ir.nodes.find((n) => n.artifact.type === 'page-table')!
    const frag = emitWidgetNode(node, ir)
    expect(frag!.template).not.toContain("row['calc']")
    expect(frag!.unsupported.some((u) => u.key === 'column-contentType' && u.path === 'rule[0].props.columns[3]')).toBe(true)
  })
})

describe('emitWidgetNode — fcTable → 纵向堆叠降级（Task 6.3）', () => {
  /** plain：1×2 无合并，格 0:0 dash-kpi A、格 0:1 dash-kpi B；rich：3×4 带合并
   *  （0:0 合 2×2 覆盖 0:1/1:0/1:1 → todo1+kpi1 归 home，0:3 dash-chart，2:2 dash-notice，
   *  2:0..2:1 被 2×4 合并覆盖）+ 逐格 style/class */
  const fcOf = (schema: unknown) => {
    const ir = parseIr(clone(schema), { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-widget', target: 'uniapp' })
    const node = ir.nodes.find((n) => n.artifact.type === 'fcTable')
    if (!node) throw new Error('页面应含 fcTable 节点')
    return { node, ir }
  }

  it('plain：非空格按 (row,col) 纵排成块；空格不出块；子节点走 emitWidgetNode 分派', () => {
    const { node, ir } = fcOf(fcTablePlain)
    const frag = emitWidgetNode(node, ir)
    expect(frag).not.toBeNull()
    const [cellA, cellB] = node.table!.cells
    const childA = cellA.children[0]
    const childB = cellB.children[0]
    // dash-* 无 uni 装配（7.x）→ emitWidgetNode 返回 null → lc:todo 挂点（同 5.2 顶层口径：
    // 锚点寻址信息进 todo 注释，不另出独立锚点行）
    expect(frag!.template).toBe(
      [
        `<!-- ${node.artifact.anchor} -->`,
        '<view class="lc-ftable">',
        '  <view class="lc-ftable__cell">',
        `    <!-- lc:todo node=${childA.artifact.id} type=dash-kpi field=kpiA 组件族 uniapp 装配按任务落地（dash-* 归 7.x） -->`,
        '  </view>',
        '  <view class="lc-ftable__cell">',
        `    <!-- lc:todo node=${childB.artifact.id} type=dash-kpi field=kpiB 组件族 uniapp 装配按任务落地（dash-* 归 7.x） -->`,
        '  </view>',
        '</view>',
      ].join('\n'),
    )
    expect(frag!.script).toEqual([])
    expect(frag!.imports).toEqual([])
  })

  it('rich：合并格的子节点归 home 格出块（覆盖格无独立块）；逐格 style/class 落格 view', () => {
    const { node, ir } = fcOf(fcTableRich)
    const frag = emitWidgetNode(node, ir)
    expect(frag).not.toBeNull()
    // 可见 home 格 8 个，非空 3 个：0:0（todo1+kpi1，2×2 合并 home）、0:3（chart1）、
    // 2:0（notice1 slot=2:2 被 {top:2,left:0,col:4} 覆盖 → home 2:0 渲染，同 web renderTable）
    const cells = node.table!.cells.filter((c) => c.children.length)
    expect(cells.map((c) => c.slot)).toEqual(['0:0', '0:3', '2:0'])
    expect(cells[0].children.map((c) => c.artifact.field)).toEqual(['todo1', 'kpi1'])
    expect(frag!.template).toContain('lc-ftable__cell')
    // 逐格 style/class：home 格地址取值落 style/class 属性
    expect(frag!.template).toContain('style="width: 200px; height: 120px"')
    expect(frag!.template).toContain('class="lc-ftable__cell hero-cell"')
    // 合并几何不出：rowspan/colspan/layout 语义在 uni 产物中不存在
    expect(frag!.template).not.toContain('rowspan')
    expect(frag!.template).not.toContain('colspan')
    expect(frag!.template).not.toContain('lc-fc-table')
  })

  it('rich：几何视觉键（border/mini/formStyle/borderWidth/borderColor/layout/合并语义）→ 节点级 unsupported 一条', () => {
    const { node, ir } = fcOf(fcTableRich)
    const frag = emitWidgetNode(node, ir)
    const geo = frag!.unsupported.filter((u) => u.key === 'table-geometry')
    expect(geo).toHaveLength(1)
    expect(geo[0].path).toBe(node.artifact.rulePath)
    expect(geo[0].type).toBe('fcTable')
  })

  it('脚本/导入透传：格内 list 族片段的 script/imports 并入（无则空数组）', () => {
    const { node, ir } = fcOf(fcTablePlain)
    const frag = emitWidgetNode(node, ir)
    expect(frag!.script).toEqual([])
    expect(frag!.imports).toEqual([])
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
