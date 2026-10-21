// ----- 页面主体 el-form 与列表节点的 label 载体 -----
// 真机量出来的事实（/page/cardlist_test?preview=true）：现网页面主体是一棵 form-create 渲染的 el-form，
// 每个顶层节点被包在 el-col-24 + el-form-item 里，节点的 title 成为可见 label，
// option.form.{labelPosition,size,inline,hideRequiredAsterisk,labelWidth} 全部挂在这棵根 form 上。
// 产物此前没有这一层：option 的 4 个 attr 只在页面有容器时才落到「容器内层 form」上（现网容器内层
// 其实不吃页面 option），无容器的 5 页干脆没有 el-form → 体检 B 桶 20 条 option.* 全是这么来的；
// 列表节点的 title 则被登记成丢弃（写进组件标签只会变成浏览器原生悬停提示）。
// npx vitest run src/views/page/codegen/__tests__/page-root-form.test.ts

import { describe, expect, it } from 'vitest'
import { parse as parseSfc } from '@vue/compiler-sfc'

import { OPTION_CONTRACT, TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import testPageSchema from './fixtures/test_page.schema.json'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>

const pages = Object.entries(corpus)
  .map(([p, schema]) => ({ key: p.split('/').pop()!.replace('.json', ''), schema }))
  .sort((a, b) => a.key.localeCompare(b.key))

const page = (key: string) => pages.find((p) => p.key === key)!

function run(schema: Record<string, any>, key: string) {
  const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'page-root-form' })
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  return { gen, source: gen.files[vue], rev: reverseToSchema(schema as any, gen.files[vue], gen.manifest) }
}

// ==================== 产物模板的祖先关系（字符串断言查不出嵌套错位） ====================

interface El {
  tag: string
  /** 静态属性原样存，绑定属性存表达式；键名保留模板上的写法 */
  attrs: Record<string, string>
  /** 从模板根到本元素的标签链（含自身） */
  chain: string[]
}

function templateTree(source: string): El[] {
  const { descriptor } = parseSfc(source, { filename: 'Page.vue' })
  const out: El[] = []
  const walk = (n: any, parents: string[]) => {
    if (n.type === 1) {
      const attrs: Record<string, string> = {}
      for (const p of n.props || []) {
        if (p.type === 6) attrs[p.name] = p.value?.content ?? ''
        else {
          const arg = p.arg?.content ?? p.arg?.name ?? (p.name === 'model' ? 'model' : undefined)
          if (arg) attrs[`:${arg}`] = String(p.exp?.content ?? '').trim()
        }
      }
      out.push({ tag: n.tag, attrs, chain: [...parents, n.tag] })
      for (const c of n.children || []) walk(c, [...parents, n.tag])
      return
    }
    for (const c of n.children || []) walk(c, parents)
  }
  walk((descriptor as any).template.ast, [])
  return out
}

const els = (source: string, tag: string) => templateTree(source).filter((e) => e.tag === tag)
/** 页面根 form：模板里第一棵 el-form，且不在任何弹层里 */
const rootForm = (source: string) => els(source, 'el-form').find((e) => !e.chain.includes('el-dialog') && !e.chain.includes('el-drawer'))
/** 容器内层 form：挂在弹层里的那棵 */
const containerForm = (source: string) => els(source, 'el-form').find((e) => e.chain.includes('el-dialog') || e.chain.includes('el-drawer'))

/** option.form.<键> → 契约登记的 attr 名 */
function optionAttrOf(schemaKey: string): string {
  const entry = OPTION_CONTRACT[schemaKey]
  expect(entry, `option 键 ${schemaKey} 无落点登记`).toBeTruthy()
  expect(entry!.emit, `option 键 ${schemaKey} 必须落 attr`).toBe('attr')
  return (entry as any).as!
}

describe('页面主体 el-form：option.form.* 的落点', () => {
  it('契约：五个 form 渲染键都落页面根 form 的属性（labelWidth 在页面级是真生效的，不是容器那种测量覆盖）', () => {
    expect(optionAttrOf('form.labelPosition')).toBe('label-position')
    expect(optionAttrOf('form.size')).toBe('size')
    expect(optionAttrOf('form.inline')).toBe('inline')
    expect(optionAttrOf('form.hideRequiredAsterisk')).toBe('hide-required-asterisk')
    expect(optionAttrOf('form.labelWidth')).toBe('label-width')
  })

  it('无容器的页面也照样包一棵 el-form（B 桶 20 条的形态根因）', () => {
    const { key, schema } = page('page_detail_steps_demo')
    expect(schema.rule.some((n: any) => n.type === 'formContainer'), '夹具得是无容器页').toBe(false)
    const { source, rev } = run(schema, key)
    const form = rootForm(source)
    expect(form, '产物里没有页面根 el-form').toBeTruthy()
    expect(form!.chain, '根 form 应直接挂在页面容器 div 下').toEqual(['div', 'el-form'])
    expect(form!.attrs['class'], '撑满链路靠这个类接进 style，别把它改成裸 el-form').toBe('lc-page-form')
    expect(form!.attrs[':inline']).toBe('false')
    expect(form!.attrs['label-position']).toBe('right')
    expect(form!.attrs['size']).toBe('default')
    expect(form!.attrs['label-width'], '页面级 labelWidth 现网原样吃 schema（PageRendererPage.vue:414 只强制隐藏提交/重置）').toBe('125px')
    expect(rev.holes.filter((h) => h.path.startsWith('option.')), JSON.stringify(rev.holes)).toEqual([])
  })

  it('labelPosition 非默认值必须真落到产物：dashboard 是 top', () => {
    const { key, schema } = page('dashboard')
    expect(schema.option.form.labelPosition).toBe('top')
    const { source, rev } = run(schema, key)
    expect(rootForm(source)!.attrs['label-position']).toBe('top')
    expect(rev.holes.filter((h) => h.path.startsWith('option.'))).toEqual([])
  })

  it('容器内层表单不吃页面 option：容器场景 labelWidth 由运行期测量覆盖', () => {
    const { key, schema } = page('cardlist_test')
    const { source } = run(schema, key)
    const inner = containerForm(source)
    expect(inner, '容器内层应有自己的 el-form').toBeTruthy()
    expect(inner!.attrs['label-position'], '页面 option 不该再落到容器内层 form 上').toBeUndefined()
    expect(inner!.attrs['label-width'], '内层用运行期测量占位（CSS 变量），不是页面的 125px').toBe('var(--lc-label-width)')
    expect(inner!.attrs[':model']).toBe('form')
  })

  it('弹层容器是根 form 的兄弟，不能嵌进页面表单里（对齐现网 form-create 与 el-dialog 平级）', () => {
    const { key, schema } = page('cardlist_test')
    const { source } = run(schema, key)
    const dialog = els(source, 'el-dialog')[0]
    expect(dialog.chain, `el-dialog 的祖先链错位：${JSON.stringify(dialog.chain)}`).toEqual(['div', 'el-dialog'])
  })

  it('语料全量：option.* 空洞归零（B 桶页面骨架债里这一类清完）', () => {
    for (const { key, schema } of pages) {
      const { rev } = run(schema, key)
      const bad = rev.holes.filter((h) => h.path.startsWith('option.'))
      expect(bad, `${key} ${JSON.stringify(bad)}`).toEqual([])
    }
  })
})

describe('列表节点的标题：el-form-item 的 label 载体', () => {
  it('契约：page-table / page-list-cards 的 title 落 el-form-item 的 label，不再是丢弃', () => {
    for (const type of ['page-table', 'page-list-cards']) {
      const entry = TYPE_CONTRACTS[type].self?.title
      expect(entry, type).toEqual({ emit: 'attr', as: 'label', on: 'el-form-item' })
    }
  })

  it('卡片产物：节点被 el-form-item 包住，标题在 label 上而不是组件标签上', () => {
    const { key, schema } = page('cardlist_test')
    const { source, rev } = run(schema, key)
    const cards = els(source, 'page-list-cards')[0]
    expect(cards.chain, `卡片没有被 form-item 包住：${JSON.stringify(cards.chain)}`).toEqual([
      'div',
      'el-form',
      'el-form-item',
      'page-list-cards',
    ])
    const item = templateTree(source).find((e) => e.tag === 'el-form-item' && e.chain.includes('el-form'))!
    expect(item.attrs['label'], '标题得出成 label（现网可见标题就是它）').toBe('卡片列表')
    expect(cards.attrs['label'], 'label 不许写在组件标签上（组件没有这个 prop）').toBeUndefined()

    const titlePath = `rule[${schema.rule.findIndex((n: any) => n.type === 'page-list-cards')}].title`
    expect(rev.holes.filter((h) => h.path === titlePath), JSON.stringify(rev.holes)).toEqual([])
    expect(rev.renameChecks.find((r) => r.path === titlePath)?.ok, '标题回读必须与 schema 一致').toBe(true)
  })

  it('空标题也要有载体：test_page 的 page-table title 是空串，回读得拿回空串而不是靠默认值兜', () => {
    const { source, rev } = run(testPageSchema as any, 'test_page')
    const table = els(source, 'page-table')[0]
    expect(table.chain[table.chain.length - 2]).toBe('el-form-item')
    expect(rev.holes.filter((h) => h.path.startsWith('rule[0].title')), JSON.stringify(rev.holes)).toEqual([])
  })

  it('容器与仪表盘类不在此列：formContainer 的 title 仍是丢弃（可见标题走 props.tabTitle）', () => {
    const entry = TYPE_CONTRACTS.formContainer.self?.title
    expect(entry!.emit).toBe('drop')
  })
})
