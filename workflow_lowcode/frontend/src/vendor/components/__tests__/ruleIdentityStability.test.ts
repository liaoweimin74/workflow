import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { designerForm } from '@form-create/designer'

/**
 * 规则标识稳定性回归防护（容器寻址改造的前提契约）。
 *
 * 背景：联动容器曾用 `props.dataSourceId` 当唯一寻址键，同一数据源绑多个容器会静默串台
 * （findContainer 取首个、componentRefs 后者覆盖、引擎闭包按 key 反查写错 formData）。
 * 现已改为用节点自带的 `rule.field` 作容器地址（dataSourceId 退回「绑哪个源」的取数/联动语义），
 * 成立前提是 form-create 设计器满足三条契约：
 *   1. 保存/序列化不丢标识（field / _fc_id / name 进 schema 并原样回来）；
 *   2. 加载与 setRule 重建只在标识「缺失」时补全，已有值不改写；
 *   3. 复制/粘贴会重写标识，否则同页会出现两个同 field 的容器（撞车换个名字重演）。
 *
 * 说明：parseRule/makeRule 定义在 FcDesigner.vue 的 setup 闭包内，无法作为纯函数导入，
 * 故第 2、3 条采用「结构断言」——提取函数体后判定赋值是否被条件包住、剥离白名单是否
 * 扩到了标识字段。任何一条被破坏（含升级 @form-create 后语义变化）都会在这里失败，
 * 与本仓库 PageDesigner.palette-icons.test.ts 的 vendor 契约校验同一套路。
 */

const DESIGNER_DIST = resolve(
  __dirname,
  '../../../../node_modules/@form-create/designer/dist/index.es.js',
)
const VENDORED_SOURCE = readFileSync(resolve(__dirname, '../FcDesigner.vue'), 'utf8')
const DIST_SOURCE = readFileSync(DESIGNER_DIST, 'utf8')

/** 取某个 `key(args) {` 方法体的片段（从签名起向后扫描 n 行，够用且避免嵌套括号解析） */
function methodBody(source: string, signature: string, lines: number): string {
  const at = source.indexOf(signature)
  expect(at, `未在源码中找到 ${signature}，源码结构已变化`).toBeGreaterThanOrEqual(0)
  return source.slice(at, source.slice(at).split('\n').slice(0, lines).join('\n').length + at)
}

/** 真实容器节点形态（字段取自线上已发布 schema，含设计器生成的三个标识） */
function makeContainerRule() {
  return {
    type: 'formContainer',
    field: 'F7n9mu2jn6reabc',
    title: '数据容器',
    _fc_id: 'id_Ffydmu2jn6reacc',
    name: 'ref_Fre6mu2jn6readc',
    props: { dataSourceId: 'dsOrder', displayMode: 'dialog', rule: [] },
  }
}

describe('rule identity must survive form-create designer round-trips', () => {
  it('序列化往返保留 field / _fc_id / name（保存不丢容器地址）', () => {
    const rule = makeContainerRule()
    const json = designerForm.toJson([rule])
    const back = designerForm.parseJson(json)[0]

    for (const key of ['field', '_fc_id', 'name'] as const) {
      expect(json, `toJson 丢失了 ${key}`).toContain(`"${key}":"${rule[key]}"`)
      expect(back[key], `parseJson 丢失了 ${key}`).toBe(rule[key])
    }
    // 地址真正的落点：容器绑定的数据源与子规则也不能被序列化裁掉
    expect(back.props.dataSourceId).toBe('dsOrder')
    expect(Array.isArray(back.props.rule)).toBe(true)
  })

  it('parseRule 的剥离白名单不得包含标识字段', () => {
    const body = methodBody(VENDORED_SOURCE, 'parseRule(children, pSlot) {', 60)
    const deleted = new Set(
      Array.from(body.matchAll(/delete rule\.([A-Za-z_$][\w$]*)/g), (m) => m[1]),
    )
    // 白名单现状：设计器包装物与别名（有人改这段代码时，下面这条先报警「提取失效」）
    expect(deleted.size, '未提取到任何 delete rule.x，剥离逻辑已变化').toBeGreaterThan(0)
    for (const expected of ['key', 'component', '_menu', '_fc_drag_tag']) {
      expect(deleted.has(expected), `剥离名单缺少 ${expected}，请确认逻辑是否变化`).toBe(true)
    }
    // 契约本体：标识字段一旦被加入剥离名单，容器寻址会当场失效
    for (const ident of ['field', '_fc_id', 'name']) {
      expect(deleted.has(ident), `parseRule 开始剥离 ${ident}，容器寻址前提被破坏`).toBe(false)
    }
  })

  it('makeRule 只在标识缺失时补全（setRule 重建不改写已有地址）', () => {
    const body = methodBody(VENDORED_SOURCE, 'makeRule(config, _rule) {', 40)
    expect(
      body,
      'vendored makeRule 不再以「缺失才补」方式赋 _fc_id，重建会改写容器地址',
    ).toMatch(/if \(!rule\._fc_id\) \{\s*rule\._fc_id = 'id_' \+ uniqueId\(\);/)
    expect(
      body,
      'vendored makeRule 不再以「缺失才补」方式赋 name',
    ).toMatch(/if \(!rule\.name\) \{\s*rule\.name = 'ref_' \+ uniqueId\(\);/)

    // 发行包同构逻辑：_fc_id / field 均为「缺了才生成」，field 还额外受 config.input 约束
    // （formContainer 的 field 由设计器创建时生成并随 schema 持久化，非每次加载重算）
    expect(
      DIST_SOURCE,
      '@form-create/designer 升级后 _fc_id 生成语义变化，需重估容器寻址方案',
    ).toContain('H._fc_id || (H._fc_id = "id_" + rt())')
    expect(
      DIST_SOURCE,
      '@form-create/designer 升级后 field 生成语义变化（可能无条件重算），需重估容器寻址方案',
    ).toContain('L.input && !H.field && (H.field = rt())')
  })

  it('复制/粘贴会重写标识（同页不会出现两个同地址容器）', () => {
    const replaceBody = methodBody(VENDORED_SOURCE, 'batchReplaceField(json) {', 12)
    const uniBody = methodBody(VENDORED_SOURCE, 'batchReplaceUni(json) {', 10)
    expect(
      replaceBody,
      'field 重写逻辑已变化（不再按正则批量替换）',
    ).toContain('regex = /"field"')
    expect(replaceBody, 'field 重写未生成新 uniqueId').toContain('uniqueId()')
    expect(replaceBody).toContain('methods.batchReplaceUni(json)')

    expect(uniBody, '_fc_id 重写逻辑已变化').toContain('regex = /"_fc_id"')
    expect(uniBody, '_fc_id 重写未生成新 uniqueId').toContain('id_${uniqueId()}')

    // 两条入口都必须过重写：右键复制替换（replaceField）与 Ctrl+C/V（bindPaste）
    const copyBody = methodBody(VENDORED_SOURCE, 'replaceField(rule) {', 20)
    expect(copyBody).toContain('methods.batchReplaceField(temp)')
    const pasteBody = methodBody(VENDORED_SOURCE, 'bindPaste(event) {', 20)
    expect(pasteBody, '粘贴路径不再重写 field，复制容器会产生重复地址').toContain(
      'methods.batchReplaceField(content)',
    )
  })
})
