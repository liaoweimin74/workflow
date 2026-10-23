// ----- Task 5.1: page-list-cards 出码（uni-card + 触底加载 + 搜索/筛选抽屉 + 链出口）-----
// golden 即规格：语料卡列表页（cardlist_test.json）+ 合成页（角色列/搜索抽屉/按钮链）。
// 链出口 5.1 子集：message/open-link → uni API；refresh/set-filter/set-page → 页面本地
// useUniList 函数——web 契约 list.expose=none 使 cards 的 list-ref 步骤在 parse 被拒
// （IR 是 web 形状），出口表先行直测，5.3 parse 侧按端放开 gate 后这些 op 才从链里到达；
// 容器族（open-container/内置行语义）5.2/5.3 落地，5.1 以 lc:todo 注释 + unsupported 登记。
// npx vitest run src/views/page/codegen/__tests__/uni/emit-list.test.ts

import { describe, expect, it } from 'vitest'

import type { IrNode, IrPage, IrChainStep, Unsupported } from '../../ir'
import { parseIr } from '../../parse'
import { PROFILES } from '../../target-profile'
import { emitListNode, stepStatementsUni } from '../../uni/emit-list'
import cardlist from '../fixtures/corpus/cardlist_test.json'

const clone = (v: unknown) => JSON.parse(JSON.stringify(v))

function cardsOf(schema: any): { node: IrNode; ir: IrPage } {
  const ir = parseIr(schema, { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-list' })
  const node = ir.nodes.find((n) => n.artifact.type === 'page-list-cards')
  if (!node) throw new Error('页面应含 page-list-cards 节点')
  return { node, ir }
}

/** 语料页（真实卡片列表）：5 个无 role 列、edit 内置行语义、delete 内置删除、无搜索 */
const corpus = () => cardsOf(clone(cardlist))

/** 合成页：角色列（title/subtitle/tag/metric/field）+ 搜索抽屉 + toolbar/行按钮 + 按钮链 */
const synthetic = () =>
  cardsOf({
    rule: [
      {
        type: 'page-list-cards',
        field: 'tasks',
        title: '任务列表',
        props: {
          dataSourceId: 'ds_task',
          showSearch: true,
          searchFields: [
            { key: 'title', label: '标题', matchType: 'like' },
            { key: 'owner', label: '负责人', matchType: 'eq' },
          ],
          columns: [
            { prop: 'title', label: '标题', role: 'title' },
            { prop: 'owner', label: '负责人', role: 'subtitle' },
            { prop: 'status', label: '状态', role: 'tag' },
            { prop: 'estimate', label: '预估', role: 'metric' },
            { prop: 'desc', label: '描述', role: 'field' },
            { prop: 'calc', label: '计算', role: 'field', contentType: 'expression', contentValue: 'row.a + row.b' },
          ],
          pageSize: 10,
          viewActions: {
            buttons: [
              { key: 'create', label: '新增', placement: 'toolbar', style: 'button' },
              {
                key: 'audit',
                label: '提交',
                placement: 'row',
                style: 'button',
                events: [
                  {
                    trigger: 'click',
                    actions: [
                      { type: 'message', params: [{ key: 'text', value: '已提交审核' }, { key: 'type', value: 'success' }] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    ],
    option: {},
    dataSources: [{ id: 'ds_task', refId: 'ref_task_1' }],
    actions: [],
  })

describe('emitListNode — 语料卡列表（cardlist_test.json）', () => {
  it('模板：uni-card 行渲染 + 卡底按钮 + 触底状态行（无搜索/无筛选抽屉）', () => {
    const { node, ir } = corpus()
    const frag = emitListNode(node, ir, PROFILES.uniapp)
    expect(frag.template).toBe(
      [
        `<!-- ${node.artifact.anchor} -->`,
        '<view class="lc-cards">',
        '  <uni-card v-for="row in cards1792036403314Rows" :key="row.id" class="lc-cards__card" @click="onRowClick(row)">',
        '    <view class="lc-cards__field">',
        '      <text class="lc-cards__label">订单编号</text>',
        "      <text class=\"lc-cards__value\">{{ row['order_no'] }}</text>",
        '    </view>',
        '    <view class="lc-cards__field">',
        '      <text class="lc-cards__label">下单日期</text>',
        "      <text class=\"lc-cards__value\">{{ row['order_date'] }}</text>",
        '    </view>',
        '    <view class="lc-cards__field">',
        '      <text class="lc-cards__label">选择客户</text>',
        "      <text class=\"lc-cards__value\">{{ row['customer'] }}</text>",
        '    </view>',
        '    <view class="lc-cards__field">',
        '      <text class="lc-cards__label">联系人</text>',
        "      <text class=\"lc-cards__value\">{{ row['contact_name'] }}</text>",
        '    </view>',
        '    <view class="lc-cards__field">',
        '      <text class="lc-cards__label">联系电话</text>',
        "      <text class=\"lc-cards__value\">{{ row['contact_phone'] }}</text>",
        '    </view>',
        '    <view class="lc-cards__actions">',
        "      <button class=\"lc-cards__btn\" size=\"mini\" @click.stop=\"onButtonClick({ key: 'edit', label: '编辑', row })\">编辑</button>",
        "      <button class=\"lc-cards__btn\" size=\"mini\" @click.stop=\"onButtonClick({ key: 'delete', label: '删除', row })\">删除</button>",
        '    </view>',
        '  </uni-card>',
        "  <view class=\"lc-cards__status\">{{ cards1792036403314Loading ? '加载中…' : cards1792036403314Finished ? '没有更多了' : '' }}</view>",
        '</view>',
      ].join('\n'),
    )
  })

  it('脚本：useUniList 接线 + 触底 + 空行点击挂点 + 内置 delete 真实现 / open-container todo', () => {
    const { node, ir } = corpus()
    const frag = emitListNode(node, ir, PROFILES.uniapp)
    expect(frag.script).toEqual([
      `const cards1792036403314List = useUniList({ refId: ds.refId })`,
      `const { rows: cards1792036403314Rows, loading: cards1792036403314Loading, finished: cards1792036403314Finished } = cards1792036403314List`,
      `onReachBottom(() => cards1792036403314List.loadMore())`,
      `function onRowClick(_row: Record<string, unknown>) {`,
      `  // schema.actions 无 row-click 触发的动作链 → 空实现，保留挂点供人工接管`,
      `}`,
      `function onButtonClick(payload: { key: string; label: string; row: Record<string, unknown> | null }) {`,
      `  const row = payload.row`,
      `  switch (payload.key) {`,
      `    case 'edit':`,
      `      // lc:todo op=open-container(mode=edit) ← 内置行语义：uni 容器适配 Task 5.2/5.3 落地`,
      `      return`,
      `    case 'delete':`,
      `      if (row?.id != null) void cards1792036403314List.removeRow(String(row.id))`,
      `      return`,
      `  }`,
      `}`,
    ])
  })

  it('imports 与 unsupported 登记：容器族/详情弹窗 uni 首版不出码', () => {
    const { node, ir } = corpus()
    const frag = emitListNode(node, ir, PROFILES.uniapp)
    expect(frag.imports).toEqual([
      `import { onReachBottom } from '@dcloudio/uni-app'`,
      `import { useUniList } from '@lc/runtime-uni/list'`,
    ])
    expect(frag.unsupported).toEqual([
      {
        path: 'rule[0].props.viewDetail',
        type: 'page-list-cards',
        key: 'viewDetail',
        message: '详情弹窗（viewDetail）uni 首版未出码',
      },
      {
        path: 'rule[0]',
        type: 'page-list-cards',
        key: 'open-container',
        message: '按钮 edit 的内置行语义（mode=edit）需容器：uni 容器适配 Task 5.2/5.3 落地',
      },
    ])
  })
})

describe('emitListNode — 合成页（角色列 + 搜索抽屉 + 按钮链）', () => {
  it('模板：搜索条 + 工具行（toolbar 按钮/筛选入口）+ 角色列渲染 + 筛选抽屉', () => {
    const { node, ir } = synthetic()
    const frag = emitListNode(node, ir, PROFILES.uniapp)
    expect(frag.template).toBe(
      [
        `<!-- ${node.artifact.anchor} -->`,
        '<view class="lc-cards">',
        '  <uni-search-bar v-model="tasksSearch" class="lc-cards__search" placeholder="搜索" @confirm="tasksOnSearch" @clear="tasksOnSearch" />',
        '  <view class="lc-cards__toolbar">',
        "    <button class=\"lc-cards__toolbar-btn\" size=\"mini\" @click=\"onButtonClick({ key: 'create', label: '新增', row: null })\">新增</button>",
        '    <button class="lc-cards__filter-open" size="mini" @click="tasksFilterOpen">筛选</button>',
        '  </view>',
        '  <uni-card v-for="row in tasksRows" :key="row.id" class="lc-cards__card" :title="row[\'title\']" :sub-title="row[\'owner\']" @click="onRowClick(row)">',
        "    <view v-if=\"row['status'] != null && row['status'] !== ''\" class=\"lc-cards__tags\">",
        "      <uni-tag :text=\"String(row['status'] ?? '')\" />",
        '    </view>',
        '    <view class="lc-cards__metric">',
        "      <text class=\"lc-cards__value\">{{ row['estimate'] }}</text>",
        '    </view>',
        '    <view class="lc-cards__field">',
        '      <text class="lc-cards__label">描述</text>',
        "      <text class=\"lc-cards__value\">{{ row['desc'] }}</text>",
        '    </view>',
        '    <view class="lc-cards__actions">',
        "      <button class=\"lc-cards__btn\" size=\"mini\" @click.stop=\"onButtonClick({ key: 'audit', label: '提交', row })\">提交</button>",
        '    </view>',
        '  </uni-card>',
        "  <view class=\"lc-cards__status\">{{ tasksLoading ? '加载中…' : tasksFinished ? '没有更多了' : '' }}</view>",
        '  <uni-popup ref="tasksFilterPopup" type="bottom" class="lc-cards__filter" background-color="#fff">',
        '    <view class="lc-cards__filter-body">',
        '      <view v-for="f in tasksSearchFields" :key="f.prop" class="lc-cards__filter-field">',
        '        <text class="lc-cards__filter-label">{{ f.label }}</text>',
        '        <input v-model="tasksFieldValues[f.prop]" class="lc-cards__filter-input" :placeholder="f.label" />',
        '      </view>',
        '      <button class="lc-cards__filter-btn" @click="tasksFilterConfirm">查询</button>',
        '      <button class="lc-cards__filter-btn" plain @click="tasksFilterReset">重置</button>',
        '    </view>',
        '  </uni-popup>',
        '</view>',
      ].join('\n'),
    )
  })

  it('脚本：搜索/筛选函数组 + 按钮链 case（message → uni.showToast）+ 内置 create todo', () => {
    const { node, ir } = synthetic()
    const frag = emitListNode(node, ir, PROFILES.uniapp)
    expect(frag.script).toEqual([
      `const tasksSearchFields = [{ prop: 'title', label: '标题' }, { prop: 'owner', label: '负责人' }]`,
      `const tasksList = useUniList({ refId: ds.refId, pageSize: 10, searchFields: tasksSearchFields })`,
      `const { rows: tasksRows, loading: tasksLoading, finished: tasksFinished, keyword: tasksSearch, fieldValues: tasksFieldValues } = tasksList`,
      `const tasksFilterPopup = ref<{ open: () => void; close: () => void } | null>(null)`,
      `onReachBottom(() => tasksList.loadMore())`,
      `function tasksOnSearch() {`,
      `  tasksList.onSearch()`,
      `}`,
      `function tasksFilterOpen() {`,
      `  tasksFilterPopup.value?.open()`,
      `}`,
      `function tasksFilterConfirm() {`,
      `  tasksList.onSearch()`,
      `  tasksFilterPopup.value?.close()`,
      `}`,
      `function tasksFilterReset() {`,
      `  tasksList.resetSearch()`,
      `  tasksFilterPopup.value?.close()`,
      `}`,
      `function onRowClick(_row: Record<string, unknown>) {`,
      `  // schema.actions 无 row-click 触发的动作链 → 空实现，保留挂点供人工接管`,
      `}`,
      `function onButtonClick(payload: { key: string; label: string; row: Record<string, unknown> | null }) {`,
      `  switch (payload.key) {`,
      `    case 'create':`,
      `      // lc:todo op=open-container(mode=create) ← 内置行语义：uni 容器适配 Task 5.2/5.3 落地`,
      `      return`,
      `    case 'audit':`,
      `      uni.showToast({ title: '已提交审核', icon: 'success' })`,
      `      return`,
      `  }`,
      `}`,
    ])
  })

  it('imports 含 vue ref（抽屉弹层）；expression 列登记 unsupported 不渲染', () => {
    const { node, ir } = synthetic()
    const frag = emitListNode(node, ir, PROFILES.uniapp)
    expect(frag.imports).toEqual([
      `import { ref } from 'vue'`,
      `import { onReachBottom } from '@dcloudio/uni-app'`,
      `import { useUniList } from '@lc/runtime-uni/list'`,
    ])
    expect(frag.unsupported).toEqual([
      {
        path: 'rule[0].props.columns[5]',
        type: 'page-list-cards',
        key: 'column-contentType',
        message: '列 calc 的 contentType=expression uni 首版不渲染（产物运行期零解释，禁 eval）',
      },
      {
        path: 'rule[0]',
        type: 'page-list-cards',
        key: 'open-container',
        message: '按钮 create 的内置行语义（mode=create）需容器：uni 容器适配 Task 5.2/5.3 落地',
      },
    ])
  })
})

describe('stepStatementsUni — 链步骤出口表（5.1 子集，直测语句形状）', () => {
  const sink = () => ({ unsupported: [] as Unsupported[] })
  const ctx = { list: 'tasksList', type: 'page-list-cards' }

  it('refresh → 页面本地 reload；set-filter → applyFilter 对象', () => {
    const s1 = sink()
    expect(stepStatementsUni({ op: 'refresh', args: [], path: 'a[0].steps[0]' } as IrChainStep, ctx, '  ', s1)).toEqual([
      '  void tasksList.reload()',
    ])
    expect(s1.unsupported).toEqual([])
    const s2 = sink()
    const step: IrChainStep = {
      op: 'set-filter',
      args: [{ name: 'status', parts: [{ kind: 'row', field: 'status' } as any] }],
      path: 'a[0].steps[1]',
    } as IrChainStep
    expect(stepStatementsUni(step, ctx, '  ', s2)).toEqual([
      "  void tasksList.applyFilter({ status: String(row?.status ?? '') })",
    ])
  })

  it('set-page：正整数字面量快速路径；动态值 parseInt 守卫', () => {
    const s1 = sink()
    const literal = { op: 'set-page', args: [{ name: 'page', parts: [{ kind: 'text', text: '2' } as any] }], path: 'p1' } as IrChainStep
    expect(stepStatementsUni(literal, ctx, '  ', s1)).toEqual(['  void tasksList.gotoPage(2)'])
    const s2 = sink()
    const dynamic = { op: 'set-page', args: [{ name: 'page', parts: [{ kind: 'row', field: 'page_no' } as any] }], path: 'p2' } as IrChainStep
    expect(stepStatementsUni(dynamic, ctx, '  ', s2)).toEqual([
      "  const target = parseInt(String(row?.page_no ?? ''), 10)",
      '  if (!isNaN(target) && target > 0) tasksList.gotoPage(target)',
    ])
  })

  it('message：字面量 type 映射 uni icon（success/error 之外 none）；open-link → navigateTo', () => {
    const s = sink()
    const info = {
      op: 'message',
      args: [
        { name: 'message', parts: [{ kind: 'text', text: '已保存' } as any] },
        { name: 'type', parts: [{ kind: 'text', text: 'info' } as any] },
      ],
      path: 'm1',
    } as IrChainStep
    expect(stepStatementsUni(info, ctx, '  ', s)).toEqual(["  uni.showToast({ title: '已保存', icon: 'none' })"])
    const link = { op: 'open-link', args: [{ name: 'url', parts: [{ kind: 'text', text: '/pages/gen/x' } as any] }], path: 'm2' } as IrChainStep
    expect(stepStatementsUni(link, ctx, '  ', sink())).toEqual(["  uni.navigateTo({ url: '/pages/gen/x' })"])
  })

  it('未适配 op：行内 todo 注释 + unsupported 登记（容器族/导出/脚本）', () => {
    const s1 = sink()
    const oc = { op: 'open-container', args: [], path: 'a[0].steps[0]' } as IrChainStep
    expect(stepStatementsUni(oc, ctx, '  ', s1)).toEqual([
      '  // lc:todo op=open-container ← a[0].steps[0]：uni 容器适配 Task 5.2/5.3 落地',
    ])
    expect(s1.unsupported).toEqual([
      {
        path: 'a[0].steps[0]',
        type: 'page-list-cards',
        key: 'open-container',
        message: 'open-container 要容器语义：uni 容器适配 Task 5.2/5.3 落地，该步暂不执行',
      },
    ])
    const s2 = sink()
    const exp = { op: 'export', args: [], path: 'a[0].steps[1]' } as IrChainStep
    expect(stepStatementsUni(exp, ctx, '  ', s2)).toEqual([
      '  // lc:todo op=export ← a[0].steps[1]：uni 出口适配 Task 5.3 落地',
    ])
    expect(s2.unsupported[0].key).toBe('export')
  })
})
