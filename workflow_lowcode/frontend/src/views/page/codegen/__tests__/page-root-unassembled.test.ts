// ----- 页面根级未装配族：web 不许静默丢弃（静默丢弃补丁的 web 侧）-----
// 现象（实测，见 tasks.md §10 的登记）：把字段族（input / radio / LookupPicker）放在**页面根**
// 而不是 formContainer 里时，web 出码器既不出码、也不留挂点注释、也不进 manifest ——
// 产物里只剩一行没人用的 import，报告却把有契约的节点算成「可出码」。
//
// 本次范围：只补「不静默丢弃」——已登记契约的根级节点留挂点注释并逐节点登记 unsupported，
// 让产物/manifest/报告三者一致。「页面根字段族未装配」本身是越界形态（产品页面模型 =
// 列表 + 容器弹层，V1 闭环里没有根级表单页），登记在案、不在此实现装配。
//
// npx vitest run src/views/page/codegen/__tests__/page-root-unassembled.test.ts

import { describe, expect, it } from 'vitest'

import { generatePage } from '../generate'
import cardlist from './fixtures/corpus/cardlist_test.json'

const META = (key: string) => ({ pageKey: key, pageName: key, exportedAt: 'page-root-unassembled' })

/** 越界形态：三个字段族节点直接挂在页面根（等价活库 uni_page 的 rule = [input, radio, LookupPicker]） */
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

const vueOf = (files: Record<string, string>) => files[Object.keys(files).find((f) => f.endsWith('.vue'))!]

describe('页面根级未装配族：web 侧不静默丢弃', () => {
  it('已登记契约的根级节点：产物留挂点注释（不再整节点消失）', () => {
    const src = vueOf(generatePage(rootFields as any, META('root_unassembled')).files)
    // 修复前：只有未登记的 radio 有注释，input / LookupPicker 连注释都没有 —— 就是静默丢弃
    expect(src).toContain('<!-- lc:todo node=n1 type=input field=title1')
    expect(src).toContain('<!-- lc:todo node=n3 type=LookupPicker field=owner1')
    // 未登记类型走原来的注释口径（parse 已登记，不重复）
    expect(src).toContain('<!-- lc:todo node=n2 type=radio field=kind1 组件类型无出码契约')
    // 注释里必须点明原因，别让「页面根级」与「类型未登记」两种债混成同一句话
    expect(src).toContain('页面根级无装配分派')
  })

  it('manifest 逐节点登记（与产物同一份真相）：path 落在节点自身地址，不借 props 键的债顶替', () => {
    const gen = generatePage(rootFields as any, META('root_unassembled'))
    expect(gen.manifest.unsupported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'rule[0]', type: 'input', key: 'not-assembled' }),
        expect.objectContaining({ path: 'rule[2]', type: 'LookupPicker', key: 'not-assembled' }),
      ]),
    )
    // 报告不另起一套判定：unsupported 与 manifest 同源
    expect(gen.report.unsupported).toEqual(gen.manifest.unsupported)
    // 未登记类型仍旧只登记一条（parse 那条），不许出现同节点两行
    expect(gen.manifest.unsupported.filter((u) => u.type === 'radio')).toHaveLength(1)
  })

  it('不变量：页面根的每个节点都要么进产物、要么在自身地址登记 unsupported', () => {
    const gen = generatePage(rootFields as any, META('root_unassembled'))
    const roots = gen.report.nodes.filter((n) => /^rule\[\d+\]$/.test(n.path))
    expect(roots.map((n) => n.path)).toEqual(['rule[0]', 'rule[1]', 'rule[2]'])
    const silent = roots.filter((n) => !gen.manifest.unsupported.some((u) => u.path === n.path))
    expect(silent.map((n) => `${n.path}:${n.type}`), '这些根级节点被静默丢弃').toEqual([])
  })

  it('受支持形态不回归：字段进 formContainer 照常出码，不产生 not-assembled 登记', () => {
    const gen = generatePage(JSON.parse(JSON.stringify(cardlist)) as any, META('cardlist'))
    const src = vueOf(gen.files)
    expect(src).not.toContain('页面根级无装配分派')
    expect(gen.manifest.unsupported.filter((u) => u.key === 'not-assembled')).toEqual([])
  })
})