// ----- Task 3.1: emitUniApp 骨架（M2）-----
// 交付「编排 + 工程文件」：复用 parse→IR，产出相对 uni-shell 路径的四类产物
// （src/pages/gen/<key>.vue、src/pages.json、src/manifest.json、src/App.vue）；
// 组件级模板出码由 Task 5.x/7.x 按 component-map 逐族落地（design G3/D5）。
// npx vitest run src/views/page/codegen/__tests__/uni/

import { describe, expect, it } from 'vitest'

import { generatePageUni } from '../../uni/emit-uni'
import cardlist from '../fixtures/corpus/cardlist_test.json'
import detailSteps from '../fixtures/corpus/page_detail_steps_demo.json'
import testPage from '../fixtures/test_page.schema.json'
import { CLIENT } from './client-fixture'

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
    expect(sfc).toContain('<!-- lc:todo node=n1 type=page-table')
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
    // 内置 edit case 走容器函数（容器存在），open-container 不再登记 unsupported；
    // 无映射容器子字段（LookupPicker/dataPicker/tableForm）走 field-component 登记
    expect(manifest.unsupported.some((u) => u.key === 'open-container' && u.type === 'page-list-cards')).toBe(false)
    expect(manifest.unsupported.some((u) => u.key === 'field-component' && u.type === 'LookupPicker')).toBe(true)
    expect(manifest.unsupported.some((u) => u.key === 'viewDetail')).toBe(true)
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
    // import 按源合并：列表搜索弹层与容器各出一份 `import { ref } from 'vue'` → 单行
    expect(sfc.match(/import \{[^}]*\} from 'vue'/g)).toEqual(["import { ref } from 'vue'"])
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
    expect(sfc).toMatch(/<!-- lc:todo node=n\d+ type=page-table/)
  })
})
