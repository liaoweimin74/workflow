// ----- Task 3.1: emitUniApp 骨架（M2）-----
// 交付「编排 + 工程文件」：复用 parse→IR，产出相对 uni-shell 路径的四类产物
// （src/pages/gen/<key>.vue、src/pages.json、src/manifest.json、src/App.vue）；
// 组件级模板出码由 Task 5.x/7.x 按 component-map 逐族落地（design G3/D5）。
// npx vitest run src/views/page/codegen/__tests__/uni/

import { describe, expect, it } from 'vitest'

import { generatePageUni } from '../../uni/emit-uni'
import cardlist from '../fixtures/corpus/cardlist_test.json'
import fcTablePlain from '../fixtures/fc-table/plain.json'
import fcTableRich from '../fixtures/fc-table/rich.json'
import detailSteps from '../fixtures/corpus/page_detail_steps_demo.json'
import tmpSizeAlignVerify from '../fixtures/corpus/tmp_size_align_verify.json'
import testPage from '../fixtures/test_page.schema.json'
import { CLIENT } from './client-fixture'

const clone = (v: unknown) => JSON.parse(JSON.stringify(v))

describe('generatePageUni — 编排与四类产物（Task 3.1）', () => {
  it('语料页 schema → files 含四类产物（相对 uni-shell 路径）', () => {
    const { files } = generatePageUni(testPage as any, {
      pageKey: 'test_page',
      pageName: '测试页面',
      client: CLIENT,
    })
    expect(Object.keys(files)).toContain('src/pages/gen/test_page.vue')
    expect(Object.keys(files)).toContain('src/pages.json')
    expect(Object.keys(files)).toContain('src/manifest.json')
    expect(Object.keys(files)).toContain('src/App.vue')

    // 页面 SFC（Task 5.1 装配）：view 根容器 + 逐顶层节点分派；页面名不再注入 SFC
    // （标题由 pages.json navigationBarTitleText 承担）。未装配组件族以 lc:todo 挂点。
    const sfc = files['src/pages/gen/test_page.vue']
    expect(sfc).toContain('<template>')
    expect(sfc).toContain('<view class="lc-page">')
    // 6.2 起 test_page 的 page-table 出 uni-table 简表：页面全装配，无 lc:todo 挂点残留
    expect(sfc).toContain('<uni-table :data="table1789468745852Rows"')
    expect(sfc).not.toContain('lc:todo node=')
    expect(sfc).not.toContain('测试页面')
  })

  it('报告为 uniapp 维度（复用 Task 2.4 per-target）：web-only 组件登记 unsupported、可出码率按端分母', () => {
    const schema = {
      rule: [
        { type: 'page-iframe', field: 'f1', props: {} },
        { type: 'input', field: 'f2', props: {} },
      ],
      option: {},
      dataSources: [],
      actions: [],
    }
    const { report } = generatePageUni(schema as any, {
      pageKey: 'uni_report',
      pageName: 'uni_report',
      client: CLIENT,
    })
    expect(report.unsupported.some((u) => u.type === 'page-iframe' && u.message.includes('仅 Web'))).toBe(true)
    expect(report.codegenRateByTarget.uniapp.totalNodes).toBe(2)
    expect(report.codegenRateByTarget.uniapp.emittableNodes).toBe(1)
  })
})

describe('generatePageUni — 列表页装配（Task 5.1）', () => {
  it('语料卡列表页：数据源常量 + useUniList 接线 + uni-card 模板进 SFC；容器段真实现（Task 5.2）', () => {
    const schema = JSON.parse(JSON.stringify(cardlist))
    const { files, manifest } = generatePageUni(schema as any, {
      pageKey: 'cardlist',
      pageName: '卡片列表',
      client: CLIENT,
    })
    const sfc = files['src/pages/gen/cardlist.vue']
    // 数据源（Task 3.1 对位 web emit.ts 227-233）：首个源 + 逐源登记表
    expect(sfc).toContain("const ds = { id: 'ds_mvck4gv9', refId: '25e8df2b1f1241d0a79ef33d819d0f54' }")
    expect(sfc).toContain("const dataSources = {\n  'ds_mvck4gv9': '25e8df2b1f1241d0a79ef33d819d0f54',")
    // 列表片段：useUniList 接线 + 触底 + uni-card
    expect(sfc).toContain(`import { onReachBottom } from '@dcloudio/uni-app'`)
    expect(sfc).toContain(`import { useUniList } from '@lc/runtime-uni/list'`)
    expect(sfc).toContain('<uni-card v-for="row in cards1792036403314Rows"')
    expect(sfc).toContain('onReachBottom(() => cards1792036403314List.loadMore())')
    // 容器段（Task 5.2）：uni-popup 弹层 + 三键 + 三函数真实现（不再是 lc:todo 挂点）
    expect(sfc).toContain('<uni-popup ref="formPopup" type="bottom" class="lc-form-popup" background-color="#fff">')
    expect(sfc).toContain('<view class="lc-form-popup__head">编辑记录</view>')
    expect(sfc).toContain("<button v-if=\"!containerReadonly\" type=\"primary\" @click=\"confirmSave\">确定</button>")
    expect(sfc).toContain("async function openContainer(recordId: string, readonly: boolean, mode: 'create' | 'edit' | 'view') {")
    expect(sfc).toContain('function closeContainer() {')
    expect(sfc).toContain('async function confirmSave() {')
    expect(sfc).toContain('void cards1792036403314List.reload()')
    expect(sfc).toContain(`import { useUniForm } from '@lc/runtime-uni/form'`)
    expect(sfc).toContain(`import { uniDataApi } from '@lc/runtime-uni/data'`)
    expect(sfc).not.toMatch(/<!-- lc:todo node=n\d+ type=formContainer/)
    // 6.4 起 tableForm 出卡片式子列表编辑器（进 SFC + 行函数进 script，不再 todo/field-component 登记）
    expect(sfc).toContain('<!-- lc:node=n2.f10 type=tableForm field=delivery_plan -->')
    expect(sfc).toContain('function addDeliveryPlanRow()')
    // 内置 edit case 走容器函数（容器存在），open-container 不再登记 unsupported；
    // 无映射容器子字段（LookupPicker/dataPicker）走 field-component 登记
    expect(manifest.unsupported.some((u) => u.key === 'open-container' && u.type === 'page-list-cards')).toBe(false)
    expect(manifest.unsupported.some((u) => u.key === 'field-component' && u.type === 'LookupPicker')).toBe(true)
    expect(manifest.unsupported.some((u) => u.key === 'field-component' && u.type === 'tableForm')).toBe(false)
    expect(manifest.unsupported.some((u) => u.key === 'viewDetail')).toBe(true)
  })

  it('页装配声明 ir 常量（config 族 <field>Config）：模板引用前必须先声明，否则整页运行期中断', () => {
    const { files } = generatePageUni(JSON.parse(JSON.stringify(cardlist)) as any, {
      pageKey: 'cardlist',
      pageName: '卡片列表',
      client: CLIENT,
    })
    const sfc = files['src/pages/gen/cardlist.vue']
    // 嵌套 tableForm/group 的 config 常量：模板按名引用（itemsConfig.min / deliveryPlanConfig.addable …），
    // 由 parse 登记进 ir.consts、页面装配统一声明（对位 web emit.ts:244）；漏声明则运行期
    // ReferenceError 直接中断整页渲染（背后是「片段只引用、装配忘记声明」这一类缺陷）
    expect(sfc).toContain('const itemsConfig = {')
    expect(sfc).toContain('const deliveryPlanConfig = {')
    // 不变量：SFC 里出现的每个 <name>Config. 引用都要有同名 const 声明
    const refs = [...sfc.matchAll(/(\w+Config)\./g)].map((m) => m[1])
    const decls = [...sfc.matchAll(/const (\w+Config) = /g)].map((m) => m[1])
    expect([...new Set(refs)].filter((r) => !decls.includes(r))).toEqual([])
  })

  it('容器段装配（Task 5.2）：import 按源合并（vue 单行）+ 容器脚本先于列表片段脚本', () => {
    const schema = {
      rule: [
        {
          type: 'page-list-cards',
          field: 'tasks',
          props: {
            dataSourceId: 'ds_task',
            showSearch: true,
            searchFields: [{ key: 'title', label: '标题' }],
            columns: [{ prop: 'title', label: '标题' }],
          },
        },
        {
          type: 'formContainer',
          field: 'Fedit1',
          props: {
            displayMode: 'dialog',
            tabTitle: '编辑记录',
            dataSourceId: 'ds_task',
            rule: [{ type: 'input', field: 'name', title: '姓名' }],
          },
        },
      ],
      option: {},
      dataSources: [{ id: 'ds_task', refId: 'ref_task_1' }],
      actions: [],
    }
    const { files } = generatePageUni(schema as any, {
      pageKey: 'merge',
      pageName: 'merge',
      client: CLIENT,
    })
    const sfc = files['src/pages/gen/merge.vue']
    // import 按源合并：列表片段的 onMounted 首载 + 容器段的 ref 各出一份 vue import → 单行
    expect(sfc.match(/import \{[^}]*\} from 'vue'/g)).toEqual(["import { onMounted, ref } from 'vue'"])
    // 脚本顺序 LOCK：ds 常量 → 容器段（formRules）→ 列表片段（tasksSearchFields）
    const dsAt = sfc.indexOf("const ds = { id: 'ds_task'")
    const containerAt = sfc.indexOf('const formRules = [')
    const listAt = sfc.indexOf('const tasksSearchFields = [')
    expect(dsAt).toBeGreaterThan(-1)
    expect(containerAt).toBeGreaterThan(dsAt)
    expect(listAt).toBeGreaterThan(containerAt)
  })

  it('detail+steps 语料：page-steps → uni-steps、page-detail → 堆叠详情；page-table 仍 todo（6.x）', () => {
    const schema = JSON.parse(JSON.stringify(detailSteps))
    const { files } = generatePageUni(schema as any, {
      pageKey: 'detail_steps',
      pageName: '详情步骤',
      client: CLIENT,
    })
    const sfc = files['src/pages/gen/detail_steps.vue']
    expect(sfc).toContain('<uni-steps :options="stepsDemo1Items" :active="1" />')
    expect(sfc).toContain('const stepsDemo1Items = [')
    expect(sfc).toContain('<view class="lc-detail__title">客户档案详情（点击上方列表行联动）</view>')
    expect(sfc).toContain("{{ custDetail1Data['Fyczmv3ks22dabc'] }}")
    // 6.2 起 page-table 出 uni-table 简表（emit-widget 装配），不再 todo 挂点
    expect(sfc).toContain('<uni-table :data="custTable1Rows" :loading="custTable1Loading">')
    expect(sfc).not.toMatch(/<!-- lc:todo node=n\d+ type=page-table/)
  })

  it('fc-table 语料：fcTable → 纵向堆叠块装配（Task 6.3）；rich 语料几何合并语义不出、格序 (row,col)', () => {
    const { files, report } = generatePageUni(clone(fcTablePlain) as any, {
      pageKey: 'fc_plain',
      pageName: '布局表格',
      client: CLIENT,
    })
    const sfc = files['src/pages/gen/fc_plain.vue']
    expect(sfc).toContain('<view class="lc-ftable">')
    expect(sfc).toContain('<view class="lc-ftable__cell">')
    // 7.2 起格内 dash-kpi 出 .lc-kpi 统计卡片段（不再 todo 挂点）
    expect(sfc).toContain('<view class="lc-kpi">')
    expect(sfc).toContain("const kpiA = useUniKpi({ refId: ds.refId, agg: 'count' })")
    expect(sfc).not.toMatch(/<!-- lc:todo node=n1\.f1 type=dash-kpi field=kpiA /)
    expect(sfc).not.toMatch(/<!-- lc:todo node=n1 type=fcTable/)

    const rich = generatePageUni(clone(fcTableRich) as any, {
      pageKey: 'fc_rich',
      pageName: '布局表格rich',
      client: CLIENT,
    })
    const richSfc = rich.files['src/pages/gen/fc_rich.vue']
    // 7.3 起格内 dash-chart 出 .lc-dchart 片段（uni-echarts 载体），dash 四件全片段化；
    // 合并覆盖格（notice1 slot=2:2）归 home 2:0 块
    expect(richSfc).toContain('style="width: 200px; height: 120px"')
    expect(richSfc).toContain('class="lc-ftable__cell hero-cell"')
    expect(richSfc).toContain('<view class="lc-kpi">')
    expect(richSfc).toContain('<view class="lc-todo">')
    expect(richSfc).toContain('<view class="lc-notice">')
    expect(richSfc).toContain('<view class="lc-dchart">')
    expect(richSfc).not.toMatch(/<!-- lc:todo node=n\d+\.\w+ type=dash-(chart|kpi|notice|todo) /)
    expect(richSfc).not.toContain('rowspan')
    // 几何视觉键节点级登记进报告（unsupported 有消费者：报告与产物同一份真相）
    expect(report.unsupported.some((u) => u.key === 'table-geometry')).toBe(true)
  })

  it('chart 语料装配（tmp_size_align_verify）：dash-chart 出 .lc-dchart、page-chart 出 .lc-pchart 与 config 常量', () => {
    const corpus = clone(tmpSizeAlignVerify) as any
    const { files, report } = generatePageUni(corpus, {
      pageKey: 'chart_demo',
      pageName: '图表演示',
      client: CLIENT,
    })
    const sfc = files['src/pages/gen/chart_demo.vue']
    // dash-chart（bar/count）：uni-echarts 载体 + useUniChart 接线
    expect(sfc).toContain('<view class="lc-dchart">')
    expect(sfc).toContain(`useUniChart({ refId: ds.refId, group: 'customer', agg: 'count' })`)
    // page-chart（line）：config 常量（IR 顶层 consts 提名）+ useUniList 全量
    expect(sfc).toContain('const pcChart = {')
    expect(sfc).toContain("xField: 'customer'")
    expect(sfc).toContain(`useUniList({ refId: ds.refId, pagination: false })`)
    // echarts 按需注册只并一行（import 按源合并）；uni-echarts 组件 import 在册
    expect((sfc.match(/echarts\.use\(/g) ?? []).length).toBe(1)
    expect(sfc).toContain(`import UniEcharts from 'uni-echarts'`)
    // 全部 chart 节点片段化，无 todo 挂点
    expect(sfc).not.toMatch(/<!-- lc:todo node=n\d+\.\w+ type=(dash|page)-chart /)
    // 图表节点 unsupported 汇入报告（size-mirror ×4）
    const chartNodes = report.unsupported.filter((u) => u.type === 'dash-chart' || u.type === 'page-chart')
    expect(chartNodes.filter((u) => u.key === 'size-mirror').length).toBe(4)
  })

  it('script 链装配（5.3）：函数体照搬普通函数 + 材料注入（message→uniMessage、page 常量）', () => {
    const schema = {
      rule: [
        {
          type: 'page-list-cards',
          field: 'tasks',
          props: {
            dataSourceId: 'ds_task',
            columns: [{ prop: 'title', label: '标题' }],
            viewActions: {
              buttons: [
                {
                  key: 'audit',
                  label: '提交',
                  placement: 'toolbar',
                  style: 'button',
                  events: [
                    {
                      trigger: 'click',
                      actions: [
                        {
                          type: 'script',
                          params: [{ key: 'source', value: "message({ message: page.pageKey, type: 'success' })" }],
                        },
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
    }
    const { files, manifest } = generatePageUni(schema as any, {
      pageKey: 'uni_script',
      pageName: 'uni_script',
      client: CLIENT,
    })
    const sfc = files['src/pages/gen/uni_script.vue']
    // 材料注入：message → uniMessage 包装（uni.showToast 映射）；page → pageKey 常量
    expect(sfc).toContain(`import { uniMessage } from '@lc/runtime-uni/actions'`)
    expect(sfc).toContain('const message = uniMessage')
    expect(sfc).toContain("const page = { pageKey: 'uni_script' }")
    // 函数体照搬（普通 async function；no-eval Gate：产物无 new Function/eval）
    expect(sfc).toContain('async function scriptAudit(_row?: any) {')
    expect(sfc).toContain("  message({ message: page.pageKey, type: 'success' })")
    // case 里调用（按钮链 hasRow=true → 传 row；uses 不含 row → 形参 _row?: any）
    expect(sfc).toContain('      void scriptAudit(row)')
    expect(sfc).not.toContain('new Function')
    expect(sfc).not.toContain('eval(')
    // script 步骤真执行，不再登记 unsupported
    expect(manifest.unsupported.some((u) => u.key === 'script')).toBe(false)
  })

  it('script 用 http → uniHttpShim 薄壳接线（get/post 对位 axios 实例方法）', () => {
    const schema = {
      rule: [
        {
          type: 'page-list-cards',
          field: 'tasks',
          props: {
            dataSourceId: 'ds_task',
            columns: [{ prop: 'title', label: '标题' }],
            viewActions: {
              buttons: [
                {
                  key: 'sync',
                  label: '同步',
                  placement: 'toolbar',
                  style: 'button',
                  events: [
                    {
                      trigger: 'click',
                      actions: [
                        {
                          type: 'script',
                          params: [{ key: 'source', value: "const res = await http.get('/v1/ping')" }],
                        },
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
    }
    const { files } = generatePageUni(schema as any, {
      pageKey: 'uni_http',
      pageName: 'uni_http',
      client: CLIENT,
    })
    const sfc = files['src/pages/gen/uni_http.vue']
    expect(sfc).toContain(`import { uniRequest, uniHttpShim } from '@lc/runtime-uni/http'`)
    expect(sfc).toContain("const http = uniHttpShim(uniRequest({ tenantHeader: 'X-Tenant-Id' }))")
    expect(sfc).toContain("  const res = await http.get('/v1/ping')")
  })
})

// ----- 页面根级未装配族：uni 兜底分派逐节点登记（静默丢弃补丁的 uni 侧）-----
// 活库 uni_page 实测：rule = [input, radio, LookupPicker] 三个节点全落 emitPage 的 lc:todo 兜底，
// 注释只挂在产物里，manifest 一条不记；报告还把它们算作「可出码」（产物是空壳）。
// 本次只补「不静默丢弃」：兜底分派对**已登记契约**的节点逐节点 push unsupported
// （未登记类型由 parse 的「无出码契约」承担，不重复记两行）。
// 装配本身属越界形态（V1 页面模型 = 列表 + 容器表单，字段族在容器内出码），登记在案、不在此实现。
describe('页面根级未装配族：uni 兜底分派逐节点登记', () => {
  const rootFields = {
    rule: [
      { type: 'input', field: 'title1', props: {} },
      { type: 'radio', field: 'kind1', props: {} },
      { type: 'LookupPicker', field: 'owner1', props: { dataSourceId: 'ds_x' } },
    ],
    option: {},
    dataSources: [],
    actions: [],
  }
  const uni = () =>
    generatePageUni(rootFields as any, { pageKey: 'uni_root_unassembled', pageName: 'uni_root_unassembled', client: CLIENT })

  it('产物留挂点注释，且已登记契约的节点逐节点进 manifest（不再只有注释）', () => {
    const { files, manifest } = uni()
    const sfc = files['src/pages/gen/uni_root_unassembled.vue']
    for (const t of ['input', 'radio', 'LookupPicker']) expect(sfc).toContain(`type=${t} field=`)
    expect(manifest.unsupported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'rule[0]', type: 'input', key: 'not-assembled' }),
        expect.objectContaining({ path: 'rule[2]', type: 'LookupPicker', key: 'not-assembled' }),
      ]),
    )
    // 未登记类型（radio）只保留 parse 那一条，同一节点不许记两行
    expect(manifest.unsupported.filter((u) => u.type === 'radio')).toHaveLength(1)
  })

  it('不变量：页面根的每个节点要么被装配、要么在自身地址登记（报告口径不许掩盖空产物）', () => {
    const { report } = uni()
    const roots = report.nodes.filter((n) => /^rule\[\d+\]$/.test(n.path))
    expect(roots.map((n) => n.path)).toEqual(['rule[0]', 'rule[1]', 'rule[2]'])
    const silent = roots.filter((n) => !report.unsupported.some((u) => u.path === n.path))
    expect(silent.map((n) => `${n.path}:${n.type}`), 'uni 侧根级节点被静默丢弃').toEqual([])
  })

  it('受支持形态不回归：字段进容器照常出码，不产生 not-assembled 登记', () => {
    const { manifest } = generatePageUni(JSON.parse(JSON.stringify(cardlist)) as any, {
      pageKey: 'cardlist',
      pageName: '卡片列表',
      client: CLIENT,
    })
    expect(manifest.unsupported.filter((u) => u.key === 'not-assembled')).toEqual([])
  })
})
