// ----- LookupPicker 带回写回：idField/returnFields 靠 api.setValue，产物里没有 form-create 实例 -----
// 组件在 form-create 宿主里的带回链（LookupPicker.vue:267-277）：
//   emit select(整行) → writeIdField(row.id) → fillReturnFields(row)，全部经 formCreateInject.api.setValue
//   落到表单其他字段；产物是裸 v-model 表单，api 不存在，点行后只有显示文本进来，id/联系人都丢。
//   真机证据（2026-10-21 /codegen-probe）：点「华信科技」后 选择客户=华信科技 更新，客户记录ID/联系人/联系电话 保持旧值。
// 组件同时 emit select/clear（LookupPicker.vue:271、:312），产物可以直接接住自己写回 ——
// 这与列表组件 externalActions 是同一个原则：产物不用组件的隐式兜底，显式接线。
// 方向钉死：returnFields 的 key 是被查表的源字段、value 是表单目标字段（LookupPicker.vue:295-299）；
// 行值读取必须走 readCellValue（BizDataVO 内层 data[key] 优先，lookupFetch.ts:18-22），裸 row[key] 会把
// 内层业务字段读成 undefined 静默写 null。
// 写回目标并进 form 声明：容器只回填声明过的字段（对齐 DsBindingEngine.ts:79-82），idField 目标
// （如 customer_id）在卡片语料页里没有可见 input，不声明就等于编辑态回填不回来、保存丢 id。
// 跑：npx vitest run src/views/page/codegen/__tests__/lookup-writeback.test.ts

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import LookupPicker from '@lc/runtime/LookupPicker'

import { TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import page from './fixtures/corpus/cardlist_test.json'
import cardlistpage from './fixtures/corpus/cardlistpage.json'

const clone = (p: Record<string, any>) => JSON.parse(JSON.stringify(p)) as Record<string, any>

function run(schema: Record<string, any>, pageKey = 'cardlist_test') {
  const gen = generatePage(schema as any, {
    pageKey,
    pageName: pageKey,
    exportedAt: 'lookup-writeback',
  })
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  const source = gen.files[vue]
  const rev = reverseToSchema(schema as any, source, gen.manifest)
  return { gen, source, holes: rev.holes }
}

/** 容器里那个绑客户的 LookupPicker（cardlist_test 的 rule[1].props.rule[3]） */
const LP_PATH = 'rule[1].props.rule[3]'

describe('LookupPicker 带回写回', () => {
  it('组件面站得住：select/clear 是真 emit，returnFields 方向是 key=源字段 value=表单目标', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/business/LookupPicker.vue'), 'utf8')
    expect(src).toMatch(/emit\('select', row\)/)
    expect(src).toMatch(/emit\('clear'\)/)
    // 方向：for (const [sourceField, targetField] of Object.entries(props.returnFields))
    expect(src).toMatch(/Object\.entries\(props\.returnFields\)/)
    // 行值读取走 BizDataVO 兼容取值，不是裸 row[key]
    expect(src).toMatch(/readCellValue\(row, sourceField\)/)
    // 契约面同步表态：写回声明挂在类型契约上，键名是承载目标字段名的 props 键
    const writes = TYPE_CONTRACTS.LookupPicker!.writes
    expect(writes, 'LookupPicker 没有写回声明，产物不会接 @select').toBeTruthy()
    expect(writes).toMatchObject({ on: 'select', clearOn: 'clear', idKey: 'idField', mapKey: 'returnFields' })
  })

  it('产物接住 select/clear，handler 按字段命名', () => {
    const { source } = run(clone(page))
    expect(source).toMatch(/<LookupPicker[^>]*@select="onCustomerSelect"/)
    expect(source).toMatch(/<LookupPicker[^>]*@clear="onCustomerClear"/)
    expect(source).toContain("import { readCellValue } from '@lc/runtime/lookupFetch'")
  })

  it('handler 是显式赋值：idField 取 row.id，returnFields 逐条经 readCellValue 写回目标字段', () => {
    const { source } = run(clone(page))
    expect(source).toContain("function onCustomerSelect(row: Record<string, unknown>) {")
    expect(source).toContain("form['customer_id'] = row.id ?? null")
    // key=contact(源) → contact_name(目标)；key=phone → contact_phone
    expect(source).toContain("form['contact_name'] = readCellValue(row, 'contact') ?? null")
    expect(source).toContain("form['contact_phone'] = readCellValue(row, 'phone') ?? null")
    // 清空：组件 handleClear 全置 null，产物对齐
    expect(source).toContain('function onCustomerClear() {')
    expect(source).toContain("form['customer_id'] = null")
    expect(source).toContain("form['contact_name'] = null")
    expect(source).toContain("form['contact_phone'] = null")
  })

  it('写回目标进 form 声明：cardlistpage 的 idField 目标没有可见 input，不声明就编辑态回填不回来', () => {
    const { source } = run(clone(cardlistpage), 'cardlistpage')
    const form = source.match(/const form = reactive<Record<string, any>>\(\{([\s\S]*?)\}\)/)?.[1] ?? ''
    expect(form).toContain("customer_id")
    // 同页 returnFields 目标（contact_name / contact_phone 有可见 input）保持单份
    expect(form.match(/contact_name/g)?.length).toBe(1)
  })

  it('登记面：LookupPicker 的 returnFields 语义债销账，事件接线进 wireOnly，回读不报多造', () => {
    const { gen, source, holes } = run(clone(page))
    expect(gen.manifest.unsupported.filter((u) => u.type === 'LookupPicker'), '带回已显式接线，不许再挂死债').toEqual([])
    expect(TYPE_CONTRACTS.LookupPicker!.requires?.find((r) => r.key === 'returnFields')).toBeUndefined()
    const node = gen.manifest.nodes.find((n) => n.rulePath === LP_PATH)!
    expect(node.wireOnly).toEqual(expect.arrayContaining(['on.select', 'on.clear']))
    // 回读：@select/@clear 被 wireOnly 剥离，LookupPicker 子树零空洞
    const mine = holes.filter((h) => String(h.path).startsWith(LP_PATH))
    expect(mine, JSON.stringify(mine)).toEqual([])
  })

  it('容器外的 LookupPicker 不假接线：没有 form 可写，保持 unsupported 记债', () => {
    const schema = clone(page)
    // 把 LookupPicker 从容器里挪到页面顶层，容器清掉对应子节点
    const lp = schema.rule[1].props.rule[3]
    schema.rule[1].props.rule.splice(3, 1)
    schema.rule.push(lp)
    const { gen, source } = run(schema, 'writeback_orphan')
    expect(source).not.toMatch(/@select=/)
    const debt = gen.manifest.unsupported.filter((u) => u.type === 'LookupPicker')
    expect(debt.length, JSON.stringify(gen.manifest.unsupported)).toBeGreaterThan(0)
    expect(debt[0].message).toContain('容器')
  })
})
