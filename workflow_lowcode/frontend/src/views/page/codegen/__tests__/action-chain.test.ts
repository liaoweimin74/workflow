// ----- P2 阶段 4：动作链与事件脚本出码（合成样本）-----
// 现网口径（2026-10-22 语料 12 页 + 活库 16 页）：按钮链/列链/组件链 0 样本，总线只有 row-edit→open-container。
// 所以本文件全部用合成样本，且必须满足两条硬约束：
//   1. 语料页产物字节不变（无链 ⇒ 不绑 when='chain' 的出口，golden 快照不动）
//   2. 产物只 emit 不双执行（externalActions 接管，产物里不出现 pageActionBus / 组件内部派发）
// npx vitest run src/views/page/codegen/__tests__/action-chain.test.ts

import { describe, expect, it } from 'vitest'

import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import testPageSchema from './fixtures/test_page.schema.json'
import cardlist from './fixtures/corpus/cardlist_test.json'

const META = (key: string) => ({ pageKey: key, pageName: key, exportedAt: 'action_chain' })
const clone = (v: unknown) => JSON.parse(JSON.stringify(v)) as any

function run(schema: any, key = 'action_chain') {
  const gen = generatePage(schema, META(key))
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  return {
    gen,
    source: gen.files[vue],
    rev: reverseToSchema(schema, gen.files[vue], gen.manifest),
  }
}

/** 只取某个函数体：跨函数的断言会被别的 handler 里的同名语句骗过去 */
function fnBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  if (start < 0) return ''
  const end = source.indexOf('\n}', start)
  return source.slice(start, end < 0 ? source.length : end)
}

// schema 载体（与组件 handleActionClick / dispatchButtonAction 的读法一致）
const tableNode = (s: any) => s.rule.find((r: any) => r.type === 'page-table')
const cardsNode = (s: any) => s.rule.find((r: any) => r.type === 'page-list-cards')
const withButton = (s: any, key: string, actions: any[], node = tableNode(s)) => {
  node.props.viewActions.buttons.push({ key, label: key, placement: 'toolbar', style: 'button', events: [{ trigger: 'click', actions }] })
  return node.props.viewActions.buttons
}
const act = (type: string, params: Array<[string, string]> = []) => ({
  type,
  params: params.map(([key, value]) => ({ key, value })),
})

describe('按钮链：编译进 onButtonClick 的 case', () => {
  const schema = () => {
    const s = clone(testPageSchema)
    withButton(s, 'audit', [
      act('message', [
        ['text', '已提交审核'],
        ['type', 'success'],
      ]),
      act('set-filter', [['status', '$row.status']]),
      act('refresh'),
    ])
    return s
  }

  it('参数在生成期解成表达式：产物不留 $row 字符串模板', () => {
    const { source } = run(schema())
    const body = fnBody(source, 'onButtonClick')
    expect(body).toContain("case 'audit':")
    expect(body).toContain("ElMessage({ message: '已提交审核', type: 'success' })")
    expect(body).toContain("n1Ref.value?.setFilter({ status: String(row?.status ?? '') })")
    expect(body).toContain('n1Ref.value?.refresh()')
    expect(source).not.toContain('$row.status')
  })

  it('按需引入：有 message 动作才 import ElMessage', () => {
    const { source } = run(schema())
    expect(source).toContain("import { ElMessage } from 'element-plus'")
    // 没有链的语料页不该多这行
    expect(run(clone(cardlist), 'cardlist').source).not.toContain("from 'element-plus'")
  })

  it('manifest 指认实现落点，回读零空洞', () => {
    const { gen, rev } = run(schema())
    const b = gen.manifest.behaviors.find((x) => x.origin.includes('buttons(audit).events'))!
    expect(b.trigger).toBe('click')
    expect(b.steps.map((s) => s.op)).toEqual(['message', 'set-filter', 'refresh'])
    expect(b.implementedBy).toEqual({ file: 'ActionChain.vue', function: 'onButtonClick', case: 'audit' })
    expect(rev.holes).toEqual([])
  })

  it('链消费点击：内建按钮配链后不再兜底打开容器，总线动作退回 not-wired', () => {
    const s = clone(testPageSchema)
    const edit = tableNode(s).props.viewActions.buttons.find((b: any) => b.key === 'edit')
    edit.events = [{ trigger: 'click', actions: [act('message', [['text', '只提示，不开容器']])] }]
    const { gen, source } = run(s)
    const body = fnBody(source, 'onButtonClick')
    expect(body).toMatch(/case 'edit':\s*\n\s*ElMessage\(/)
    expect(body).not.toMatch(/case 'edit':\s*\n\s*void openContainer/)
    const bus = gen.manifest.behaviors.find((x) => x.origin === 'actions[0]')!
    expect(bus.implementedBy, '链把点击消费掉了，总线 row-edit 不再由这个 case 执行').toBeUndefined()
    expect(bus.warnings.some((w) => w.kind === 'not-wired')).toBe(true)
  })

  it('链里不可执行的步骤逐步登记，不整条静默丢弃', () => {
    const s = clone(testPageSchema)
    withButton(s, 'mixed', [act('message', [['text', 'ok']]), act('open-detail')])
    const { gen, source } = run(s)
    expect(fnBody(source, 'onButtonClick')).toContain("ElMessage({ message: 'ok', type: 'info' })")
    const u = gen.manifest.unsupported.find((x) => x.path.includes('buttons(mixed).events') && x.key === 'open-detail')!
    expect(u.message).toContain('详情')
    expect(gen.manifest.unsupported.some((x) => x.key === 'message')).toBe(false)
  })

  it('整条链都执行不了时不出假 case', () => {
    const s = clone(testPageSchema)
    withButton(s, 'dead', [act('open-detail'), act('edit')])
    const { gen, source } = run(s)
    expect(source).not.toMatch(/case 'dead':/)
    expect(gen.manifest.behaviors.some((x) => x.origin.includes('buttons(dead)'))).toBe(false)
    expect(gen.manifest.unsupported.filter((x) => x.path.includes('buttons(dead)'))).toHaveLength(2)
  })
})

describe('列链：@cell-click 与按 column.property 分派', () => {
  const schema = () => {
    const s = clone(testPageSchema)
    tableNode(s).props.columns[0].onCellClick = { actions: [act('open-link', [['url', '/detail/$row.id']])] }
    return s
  }

  it('真出分支时才绑 @cell-click，并带上 useRouter', () => {
    const { source } = run(schema())
    expect(source).toContain('@cell-click="onCellClick"')
    expect(source).toContain("import { useRouter } from 'vue-router'")
    expect(source).toContain('const router = useRouter()')
    const body = fnBody(source, 'onCellClick')
    expect(body).toContain("case 'code':")
    expect(body).toContain("void router.push('/detail/' + String(row?.id ?? ''))")
  })

  it('链配置跟着 columns 出码：改判后不再当丢弃处理', () => {
    const { gen, source, rev } = run(schema())
    expect(source).toContain('onCellClick: {')
    const node = gen.manifest.nodes.find((n) => n.rulePath === 'rule[0]')!
    expect(node.warnings.some((w) => w.path === 'props.columns[0].onCellClick')).toBe(false)
    expect(rev.holes).toEqual([])
  })

  it('没配链的列不绑事件、不写 handler：语料与现网产物字节不变', () => {
    const s = clone(testPageSchema)
    // 面板保存过的空链：配置在，但没人执行 —— 仍按丢弃登记，常量里也不留这份摆设
    s.rule.find((r: any) => r.type === 'page-table').props.columns[0].onCellClick = { actions: [] }
    const { gen, source } = run(s, 'test_page')
    expect(source).not.toContain('@cell-click')
    expect(source).not.toContain('function onCellClick')
    expect(gen.manifest.nodes.find((n) => n.rulePath === 'rule[0]')!.warnings.some((w) => w.path === 'props.columns[0].onCellClick')).toBe(true)
  })

  it('列链与整表 cell-click 组件链同时存在时，列链短路在后', () => {
    const s = schema()
    tableNode(s).props.viewEvents = [{ trigger: 'cell-click', target: 'table', actions: [act('message', [['text', '整表']])] }]
    const { source } = run(s)
    const body = fnBody(source, 'onCellClick')
    expect(body.indexOf("case 'code':")).toBeLessThan(body.indexOf("ElMessage({ message: '整表', type: 'info' })"))
  })
})

describe('组件链（props.viewEvents）：行/选择/排序出口', () => {
  it('row-click 链编译进 onRowClick，不再是空实现注释', () => {
    const s = clone(testPageSchema)
    tableNode(s).props.viewEvents = [{ trigger: 'row-click', target: 'table', actions: [act('refresh'), act('message', [['text', '已选中该行']])] }]
    const { source, rev } = run(s)
    const body = fnBody(source, 'onRowClick')
    expect(body).toContain('n1Ref.value?.refresh()')
    expect(body).toContain("ElMessage({ message: '已选中该行', type: 'info' })")
    expect(body).not.toContain('空实现')
    expect(rev.holes).toEqual([])
  })

  it('sort-change 出口按需绑定，set-sort 走暴露面', () => {
    const s = clone(testPageSchema)
    tableNode(s).props.viewEvents = [{ trigger: 'sort-change', target: 'table', actions: [act('set-sort', [['field', 'name'], ['order', 'descending']])] }]
    const { source } = run(s)
    expect(source).toContain('@sort-change="onSortChange"')
    expect(fnBody(source, 'onSortChange')).toContain("n1Ref.value?.setSort('name', 'descending')")
    // 这个出口没有行对象：handler 里不接受 $row 取值（内建按钮的 openContainer 在另一个函数里，不算）
    expect(fnBody(source, 'onSortChange')).not.toContain('String(row?.')
  })

  it('target 指不到产物里的组件时不接线', () => {
    const s = clone(testPageSchema)
    tableNode(s).props.viewEvents = [{ trigger: 'row-click', target: 'someOtherNode', actions: [act('refresh')] }]
    const { gen, source } = run(s)
    expect(fnBody(source, 'onRowClick')).toContain('空实现')
    const u = gen.manifest.unsupported.find((x) => x.path.includes('viewEvents[0]'))!
    expect(u.message).toContain('寻址')
  })

  it('面板触发器清单里没有的出口（current-change 等）不生成假 handler', () => {
    const s = clone(testPageSchema)
    tableNode(s).props.viewEvents = [{ trigger: 'current-change', target: 'table', actions: [act('refresh')] }]
    const { gen, source } = run(s)
    expect(source).not.toContain('onCurrentChange')
    expect(gen.manifest.unsupported.some((x) => x.key === 'current-change')).toBe(true)
  })
})

describe('总线动作：有 emit 出口的触发器才接管', () => {
  it('row-click + set-filter 编译进 onRowClick，模板占位符 {row.x} 生成期解析', () => {
    const s = clone(testPageSchema)
    s.actions.push({ trigger: 'row-click', source: 'ds_mu2jhb3n', steps: [{ op: 'set-filter', target: 'ds_mu2jhb3n', field: 'dept', value: '{row.dept}' }] })
    const { gen, source, rev } = run(s)
    expect(fnBody(source, 'onRowClick')).toContain("n1Ref.value?.setFilter({ dept: String(row?.dept ?? '') })")
    const b = gen.manifest.behaviors.find((x) => x.origin === 'actions[1]')!
    expect(b.implementedBy).toEqual({ file: 'ActionChain.vue', function: 'onRowClick' })
    expect(rev.holes).toEqual([])
  })

  it('总线在前、组件链在后：与组件 handleRowClick 的执行顺序一致', () => {
    const s = clone(testPageSchema)
    s.actions.push({ trigger: 'row-click', steps: [{ op: 'refresh', target: 'ds_mu2jhb3n' }] })
    tableNode(s).props.viewEvents = [{ trigger: 'row-click', target: 'table', actions: [act('message', [['text', '组件链']])] }]
    const body = fnBody(run(s).source, 'onRowClick')
    expect(body.indexOf('n1Ref.value?.refresh()')).toBeLessThan(body.indexOf("ElMessage({ message: '组件链'"))
  })

  it('target 解不到组件、或触发器没有 emit 出口时登记不接线', () => {
    const s = clone(testPageSchema)
    s.actions.push({ trigger: 'row-click', steps: [{ op: 'refresh', target: 'ds_not_exist' }] })
    s.actions.push({ trigger: 'field-change', steps: [{ op: 'set-value', target: 'ds_mu2jhb3n', field: 'a', value: '1' }] })
    const { gen, source } = run(s)
    expect(gen.manifest.unsupported.some((x) => x.path === 'actions[1]' && x.key === 'refresh')).toBe(true)
    expect(gen.manifest.unsupported.some((x) => x.path === 'actions[2]' && x.key === 'field-change')).toBe(true)
    expect(fnBody(source, 'onRowClick')).toContain('空实现')
  })
})

describe('事件脚本：正文出成普通函数，白名单在生成期把关', () => {
  const withScript = (body: string, key = 'audit') => {
    const s = clone(testPageSchema)
    withButton(s, key, [act('script', [['source', body]])])
    return s
  }

  it('读写字段：form / message 都是产物里真拿得到的上下文', () => {
    const { gen, source, rev } = run(withScript("form.status = 'audited'\nmessage.success('已标记')"))
    expect(source).toContain('async function scriptAudit(')
    expect(source).toContain("form.status = 'audited'")
    expect(source).toContain("message.success('已标记')")
    expect(source).toContain('const message = ElMessage')
    expect(source).toContain("import { ElMessage } from 'element-plus'")
    expect(fnBody(source, 'onButtonClick')).toContain('void scriptAudit(row)')
    expect(source).not.toMatch(/new Function|eval\(/)
    expect(gen.manifest.unsupported.some((x) => x.key === 'script')).toBe(false)
    expect(rev.holes).toEqual([])
  })

  it('白名单外的标识符：整条链不接线，也不留半个 handler', () => {
    const cases: Array<[string, string]> = [
      ['window.alert(1)', 'window'],
      ['fetch("/api/x")', 'fetch'],
      ['document.title = row.id', 'document'],
      ['localStorage.setItem("k", "v")', 'localStorage'],
    ]
    for (const [body, ident] of cases) {
      const { gen, source } = run(withScript(body, 'risk'))
      expect(source, body).not.toMatch(/case 'risk':/)
      expect(source, body).not.toContain('function scriptRisk')
      const u = gen.manifest.unsupported.find((x) => x.path.includes('buttons(risk).events'))!
      expect(u.message, body).toContain(ident)
    }
  })

  it('形参里声明的局部变量不算越界', () => {
    const { source } = run(withScript('const n = Number(row?.qty ?? 0)\nform.total = n * 2'))
    expect(source).toContain('function scriptAudit(row: any) {')
  })

  it('产物没有的上下文按出口拒绝：rowIndex 与没有容器时的 form', () => {
    const noContainer = clone(testPageSchema)
    noContainer.rule = noContainer.rule.filter((r: any) => r.type !== 'formContainer')
    const a = run(withScript('rowIndex')).gen
    expect(a.manifest.unsupported.find((x) => x.path.includes('buttons(audit).events'))!.message).toContain('rowIndex')
    withButton(noContainer, 'noform', [act('script', [['source', "form.status = 'x'"]])])
    const b = run(noContainer, 'no_container_chain')
    expect(b.gen.manifest.unsupported.find((x) => x.path.includes('buttons(noform).events'))!.message).toContain('form')
    expect(b.source).not.toMatch(/case 'noform':/)
  })

  it('http / page 用到才引入，脚本正文不被沙箱包住', () => {
    const { source } = run(withScript('const r = await http.get("/v1/ping")\nform.note = String(r.data ?? "") + page.pageKey'))
    expect(source).toContain("import http from '@lc/runtime/http'")
    expect(source).toContain("const page = { pageKey: 'action_chain' }")
    expect(source).not.toContain('with(__sandbox')
  })

  it('脚本链在卡片载体上照样出码（不依赖实例）', () => {
    const s = clone(cardlist)
    const btns = withButton(s, 'mark', [act('script', [['source', "message.info('点了卡片')"]])], cardsNode(s))
    expect(btns).toHaveLength(3)
    const { source, rev } = run(s, 'cardlist')
    expect(fnBody(source, 'onButtonClick')).toContain("case 'mark':")
    expect(source).toContain("message.info('点了卡片')")
    expect(rev.holes).toEqual([])
  })
})

describe('载体能力差异：卡片与无容器页面只能记 unsupported', () => {
  it('卡片配 message 链出码；配 refresh 链记 unsupported（expose=none 拿不到实例）', () => {
    const s = clone(cardlist)
    withButton(s, 'ping', [act('message', [['text', '提示']])], cardsNode(s))
    withButton(s, 'reload', [act('refresh')], cardsNode(s))
    const { gen, source } = run(s, 'cardlist')
    expect(fnBody(source, 'onButtonClick')).toContain("case 'ping':")
    expect(source).not.toMatch(/case 'reload':/)
    const u = gen.manifest.unsupported.find((x) => x.path.includes('buttons(reload).events'))!
    expect(u.message).toContain('defineExpose')
  })

  it('卡片没有 cell-click / sort-change 出口：列链与排序链只能记账', () => {
    const s = clone(cardlist)
    const cards = cardsNode(s)
    cards.props.columns = [{ prop: 'customer_name', label: '客户', onCellClick: { actions: [act('open-link', [['url', '/x']])] } }]
    cards.props.viewEvents = [{ trigger: 'sort-change', target: 'cards', actions: [act('set-page', [['page', '1']])] }]
    const { gen, source } = run(s, 'cardlist')
    expect(source).not.toContain('@cell-click')
    expect(source).not.toContain('@sort-change')
    expect(gen.manifest.unsupported.filter((x) => x.type === 'page-list-cards').length).toBeGreaterThanOrEqual(2)
  })

  it('容器动作要容器：页面没有 formContainer 时 open-container 不接线', () => {
    const s = clone(testPageSchema)
    s.rule = s.rule.filter((r: any) => r.type !== 'formContainer')
    withButton(s, 'open', [act('open-container')])
    const { gen, source } = run(s, 'no_container_chain')
    expect(source).not.toMatch(/case 'open':/)
    expect(gen.manifest.unsupported.some((x) => x.key === 'open-container' && x.message.includes('容器'))).toBe(true)
  })

  it('close-container / save-container 走产物已有的容器函数', () => {
    const s = clone(testPageSchema)
    withButton(s, 'finish', [act('save-container'), act('close-container')])
    const body = fnBody(run(s).source, 'onButtonClick')
    expect(body).toContain('void confirmSave()')
    expect(body).toContain('closeContainer()')
  })

  it('new-record 没有任何渲染器消费：出码直接记账', () => {
    const s = clone(testPageSchema)
    tableNode(s).props.viewEvents = [{ trigger: 'row-click', target: 'table', actions: [act('new-record')] }]
    const { gen, source } = run(s)
    expect(fnBody(source, 'onRowClick')).toContain('空实现')
    expect(gen.manifest.unsupported.some((x) => x.key === 'new-record')).toBe(true)
  })
})

describe('防双执行（4.9）', () => {
  const all = [
    () => {
      const s = clone(testPageSchema)
      withButton(s, 'audit', [act('refresh'), act('set-filter', [['status', '$row.status']])])
      tableNode(s).props.columns[0].onCellClick = { actions: [act('open-link', [['url', '/x/$row.id']])] }
      tableNode(s).props.viewEvents = [{ trigger: 'row-click', target: 'table', actions: [act('clear-selection')] }]
      return s
    },
    () => {
      const s = clone(cardlist)
      withButton(s, 'mark', [act('message', [['text', '卡片']])], cardsNode(s))
      return s
    },
  ]

  it('产物里不出现总线与组件内部派发路径', () => {
    for (const make of all) {
      const { source } = run(make())
      expect(source).not.toMatch(/pageActionBus|actionBus|dispatch\(|triggerViewEvents/)
    }
  })

  it('每个链出口都配 external-actions 接管开关', () => {
    for (const make of all) {
      const { source } = run(make())
      const outlets = [...source.matchAll(/@(row-click|button-click|selection-change|cell-click|sort-change)="(on[A-Z]\w*)"/g)].map(
        (m) => m[1],
      )
      expect(outlets.length, '至少要真绑到事件').toBeGreaterThan(0)
      for (const tag of source.split('\n').filter((l) => outlets.some((o) => l.includes(`@${o}=`)))) {
        expect(tag).toContain(':external-actions="true"')
      }
    }
  })

  it('链出口进 wireOnly：回读不因多绑事件报差异', () => {
    const s = clone(testPageSchema)
    tableNode(s).props.columns[0].onCellClick = { actions: [act('open-link', [['url', '/x']])] }
    const { gen, rev } = run(s)
    const node = gen.manifest.nodes.find((n) => n.rulePath === 'rule[0]')!
    expect(node.wireOnly).toContain('on.cellClick')
    expect(rev.holes).toEqual([])
  })
})

describe('语料面：链零样本 ⇒ 产物不动', () => {
  const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<string, any>

  it('12 页语料都不绑 when=chain 的出口，chains 恒空', () => {
    for (const [p, schema] of Object.entries(corpus)) {
      const key = p.split('/').pop()!.replace('.json', '')
      const { gen, source } = run(clone(schema), key)
      expect(gen.manifest.nodes.every((n) => !n.wireOnly.includes('on.cellClick')), key).toBe(true)
      expect(source, key).not.toMatch(/@cell-click|@sort-change|function onCellClick|function onSortChange/)
      expect(source, key).not.toMatch(/import \{ ElMessage \}|useRouter/)
    }
  })
})
