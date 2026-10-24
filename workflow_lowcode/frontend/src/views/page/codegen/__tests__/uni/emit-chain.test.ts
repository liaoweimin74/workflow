// ----- Task 5.3: 动作出口按端适配（容器族链 op / export 债 / script 普通函数 / list-ref gate 放开）-----
// golden 即规格。5.3 四块口径：
//  · 容器族（open-container/load-record/close-container/save-container）：镜像 web
//    containerCall/stepStatements——open/load 出 openContainer(recordId, readonly, mode)
//    （recordId 走链参数 exprOf，无参数出 ''；mode/readonly 生成期定死），close/save 直调
//    容器段函数。页面无容器时 parse 的 container gate 已拒，到不了 emit（防御 todo 保留）；
//  · export：整支 unsupported——web 复刻的是浏览器 Blob/ObjectURL 下载，uni（小程序）无
//    对位能力，不出假下载（no-eval 同纪律：宁缺勿假）；
//  · set-sort/clear-selection：useUniList 未提供服务端排序/多选清理，todo + unsupported，
//    绝不静默；
//  · script：parse 白名单（form/row/page/message/http）已把关，出普通 async function
//    （正文照搬，运行期 new Function 沙箱不复制——与 web 同纪律）；调用语句按形参带不带
//    row 定（script.params 首段）。材料注入在装配侧（emit-uni）：message→uni.showToast
//    包装、page→{ pageKey }、http→uniHttpShim（get/post/put/delete 薄壳走 uniRequest）。
// parse list-ref gate 按端放开：uniapp 端 page-list-cards 走 useUniList（实例方法等价面），
// refableOf 对 uniapp 放行 → refresh/set-filter/set-page 族从真实链到达 emit 出口表。
// npx vitest run src/views/page/codegen/__tests__/uni/emit-chain.test.ts

import { describe, expect, it } from 'vitest'

import type { IrChain, IrChainStep, Unsupported } from '../../ir'
import { parseIr } from '../../parse'
import { scriptFunction } from '../../chain-emit'
import { stepStatementsUni, type UniStepCtx } from '../../uni/emit-list'

const sink = () => ({ unsupported: [] as Unsupported[] })
const ctx: UniStepCtx = { list: 'tasksList', type: 'page-list-cards' }
const ctxWith = (chain: Partial<IrChain>): UniStepCtx => ({ ...ctx, chain: chain as IrChain })

const step = (op: string, extra: Partial<IrChainStep> = {}): IrChainStep =>
  ({ op, args: [], path: `a[0].steps[0]`, ...extra }) as IrChainStep

describe('stepStatementsUni — 容器族出口（5.3 真实现）', () => {
  it('open-container：镜像 web containerCall（recordId 走 exprOf，mode/readonly 生成期定死）', () => {
    const s = sink()
    const st = step('open-container', {
      args: [{ name: 'recordId', parts: [{ kind: 'row', field: 'id' } as any] }],
    })
    expect(stepStatementsUni(st, ctxWith({ mode: 'edit', readonly: false }), '  ', s)).toEqual([
      "  void openContainer(String(row?.id ?? ''), false, 'edit')",
    ])
    expect(s.unsupported).toEqual([])
  })

  it('open-container 无 recordId 参数 → 实参出空串（toolbar 新增）', () => {
    const s = sink()
    expect(stepStatementsUni(step('open-container'), ctxWith({ mode: 'create' }), '  ', s)).toEqual([
      "  void openContainer('', false, 'create')",
    ])
  })

  it('load-record 与 open-container 同形状；close-container/save-container 直调容器段函数', () => {
    const s1 = sink()
    const lr = step('load-record', {
      args: [{ name: 'recordId', parts: [{ kind: 'row', field: 'id' } as any] }],
    })
    expect(stepStatementsUni(lr, ctxWith({ mode: 'view', readonly: true }), '  ', s1)).toEqual([
      "  void openContainer(String(row?.id ?? ''), true, 'view')",
    ])
    expect(stepStatementsUni(step('close-container'), ctx, '  ', sink())).toEqual(['  closeContainer()'])
    expect(stepStatementsUni(step('save-container'), ctx, '  ', sink())).toEqual(['  void confirmSave()'])
  })

  it('chain 未传（防御路径）→ mode 按 recordId 兜底（有 id edit / 无 id create）', () => {
    const s1 = sink()
    const withId = step('open-container', {
      args: [{ name: 'recordId', parts: [{ kind: 'row', field: 'id' } as any] }],
    })
    expect(stepStatementsUni(withId, ctx, '  ', s1)).toEqual([
      "  void openContainer(String(row?.id ?? ''), false, 'edit')",
    ])
    const s2 = sink()
    expect(stepStatementsUni(step('open-container'), ctx, '  ', s2)).toEqual([
      "  void openContainer('', false, 'create')",
    ])
  })
})

describe('stepStatementsUni — export / 排序 / 多选（uni 端无对位，整支登记）', () => {
  it('export：todo 注释 + unsupported（浏览器 Blob 下载在小程序无对位）', () => {
    const s = sink()
    expect(stepStatementsUni(step('export'), ctx, '  ', s)).toEqual([
      '  // lc:todo op=export ← a[0].steps[0]：浏览器 Blob/ObjectURL 下载在小程序无对位能力，该步不执行',
    ])
    expect(s.unsupported).toEqual([
      {
        path: 'a[0].steps[0]',
        type: 'page-list-cards',
        key: 'export',
        message: 'export 依赖浏览器 Blob/ObjectURL 下载，uni 端（小程序）无对位能力，该步不执行',
      },
    ])
  })

  it('set-sort/clear-selection：useUniList 无对位方法，todo + unsupported 绝不静默', () => {
    const s1 = sink()
    expect(stepStatementsUni(step('set-sort'), ctx, '  ', s1)).toEqual([
      '  // lc:todo op=set-sort ← a[0].steps[0]：useUniList 无对位方法，该步不执行',
    ])
    expect(s1.unsupported[0].key).toBe('set-sort')
    const s2 = sink()
    expect(stepStatementsUni(step('clear-selection'), ctx, '  ', s2)).toEqual([
      '  // lc:todo op=clear-selection ← a[0].steps[0]：useUniList 无对位方法，该步不执行',
    ])
    expect(s2.unsupported[0].key).toBe('clear-selection')
  })
})

describe('stepStatementsUni — script 普通函数（调用语句）', () => {
  it('ctx.hasRow=true → 调用传 row；hasRow=false → 空实参（web chain.hasRow 同构）', () => {
    const s1 = sink()
    expect(
      stepStatementsUni(
        step('script', { script: { fn: 'scriptAudit', body: "message({ message: 'x' })", params: '_row?: any' } }),
        { ...ctx, hasRow: true },
        '  ',
        s1,
      ),
    ).toEqual(['  void scriptAudit(row)'])
    const s2 = sink()
    expect(
      stepStatementsUni(
        step('script', { script: { fn: 'scriptCreate', body: 'page.pageKey', params: '_row?: any' } }),
        { ...ctx, hasRow: false },
        '  ',
        s2,
      ),
    ).toEqual(['  void scriptCreate()'])
    expect(s1.unsupported).toEqual([])
    expect(s2.unsupported).toEqual([])
  })
})

describe('stepStatementsUni — open-link 参数含 $param（页面路由 query）→ 债登记', () => {
  it('纯字面量 url 正常出 navigateTo；$param 段登记 unsupported（uni 产物无 route 上下文）', () => {
    const s1 = sink()
    const literal = step('open-link', { args: [{ name: 'url', parts: [{ kind: 'text', text: '/pages/gen/x' } as any] }] })
    expect(stepStatementsUni(literal, ctx, '  ', s1)).toEqual(["  uni.navigateTo({ url: '/pages/gen/x' })"])
    expect(s1.unsupported).toEqual([])
    const s2 = sink()
    const param = step('open-link', { args: [{ name: 'url', parts: [{ kind: 'param', key: 'back' } as any] }] })
    expect(stepStatementsUni(param, ctx, '  ', s2)).toEqual([
      '  // lc:todo op=open-link ← a[0].steps[0]：参数引用 $param（页面路由 query），uni 产物无 route 上下文',
    ])
    expect(s2.unsupported).toEqual([
      {
        path: 'a[0].steps[0]',
        type: 'page-list-cards',
        key: 'open-link',
        message: 'open-link 的 url 参数引用 $param（页面路由 query）：web 走 useRoute，uni 产物无 route 上下文（onLoad query 需人工接线），该步不执行',
      },
    ])
  })
})

describe('scriptFunction（chain-emit 复用）— 脚本函数体展开形状', () => {
  it('正文照搬 + 缩进 + doc 注释（与 web 产物同形）', () => {
    const chain = { kind: 'button', trigger: 'click' } as IrChain
    const st = step('script', {
      path: 'rule[0].props.viewActions.buttons[0].events[0].actions[0]',
      script: { fn: 'scriptAudit', body: "const name = row['name']\nmessage({ message: name, type: 'success' })", params: 'row: any' },
    })
    expect(scriptFunction(chain, st)).toEqual([
      '/** lc:behavior ← rule[0].props.viewActions.buttons[0].events[0].actions[0]（button 链 / click）：正文照搬 schema，白名单在出码期把关 */',
      'async function scriptAudit(row: any) {',
      "  const name = row['name']",
      "  message({ message: name, type: 'success' })",
      '}',
    ])
  })
})

// ==================== parse 按端放开 list-ref gate ====================

/** 合成链页：cards + 按钮链（op 列表），列表实例方法链（refresh/set-filter 族） */
const chainPage = (actions: Array<Record<string, unknown>>) => ({
  rule: [
    {
      type: 'page-list-cards',
      field: 'tasks',
      props: {
        dataSourceId: 'ds_task',
        columns: [{ prop: 'title', label: '标题' }],
        viewActions: {
          buttons: [
            { key: 'ops', label: '操作', placement: 'toolbar', style: 'button', events: [{ trigger: 'click', actions }] },
          ],
        },
      },
    },
  ],
  option: {},
  dataSources: [{ id: 'ds_task', refId: 'ref_task_1' }],
  actions: [],
})

describe('parseIr — list-ref gate 按端放开（uniapp 走 useUniList 实例方法等价面）', () => {
  const refreshFilterActions = [
    { type: 'refresh', params: [] },
    { type: 'set-filter', params: [{ key: 'status', value: 'open' }] },
  ]

  it('uniapp：refresh/set-filter 步骤进链（不再被 list.expose=none 拒）', () => {
    const ir = parseIr(chainPage(refreshFilterActions) as any, {
      pageKey: 'uni_chain',
      pageName: 'uni_chain',
      exportedAt: 'emit-chain',
      target: 'uniapp',
    })
    const ops = ir.chains.flatMap((c) => c.steps.map((s) => s.op))
    expect(ops).toContain('refresh')
    expect(ops).toContain('set-filter')
    // 链的 ref 指到页面本地列表实例（useUniList 实例名在 emit 侧对位）
    expect(ir.chains[0].ref).toBe('n1Ref')
  })

  it('web（缺省 target）：同 schema 的 list-ref 步骤仍被拒（行为不变）', () => {
    const ir = parseIr(chainPage(refreshFilterActions) as any, {
      pageKey: 'web_chain',
      pageName: 'web_chain',
      exportedAt: 'emit-chain',
    })
    expect(ir.chains).toHaveLength(0)
    expect(ir.unsupported.some((u) => u.key === 'refresh' && u.message.includes('list.expose=none'))).toBe(true)
    expect(ir.unsupported.some((u) => u.key === 'set-filter')).toBe(true)
  })
})

describe('parseIr — container gate 双端一致（无容器照拒，与端无关）', () => {
  it('uniapp 端页面无 formContainer → open-container 链步骤仍拒', () => {
    const ir = parseIr(chainPage([{ type: 'open-container', params: [] }]) as any, {
      pageKey: 'uni_no_c',
      pageName: 'uni_no_c',
      exportedAt: 'emit-chain',
      target: 'uniapp',
    })
    expect(ir.chains).toHaveLength(0)
    expect(ir.unsupported.some((u) => u.key === 'open-container')).toBe(true)
  })

  it('uniapp 端有容器 → open-container 进链且 ref 指到列表实例', () => {
    const page = chainPage([{ type: 'open-container', params: [] }]) as any
    page.rule.push({
      type: 'formContainer',
      field: 'Fedit1',
      props: {
        displayMode: 'dialog',
        tabTitle: '编辑记录',
        dataSourceId: 'ds_task',
        rule: [{ type: 'input', field: 'name', title: '姓名' }],
      },
    })
    const ir = parseIr(page, {
      pageKey: 'uni_c',
      pageName: 'uni_c',
      exportedAt: 'emit-chain',
      target: 'uniapp',
    })
    const ops = ir.chains.flatMap((c) => c.steps.map((s) => s.op))
    expect(ops).toContain('open-container')
  })
})

describe('parseIr — script 链白名单（uniapp 与 web 同判定）', () => {
  it('message/page 白名单内 → script 步骤进链；白名单外整链拒', () => {
    const ok = parseIr(
      chainPage([{ type: 'script', params: [{ key: 'source', value: "message({ message: '已保存', type: 'success' })" }] }]) as any,
      { pageKey: 's1', pageName: 's1', exportedAt: 'emit-chain', target: 'uniapp' },
    )
    expect(ok.chains.flatMap((c) => c.steps.map((s) => s.op))).toContain('script')

    const bad = parseIr(
      chainPage([{ type: 'script', params: [{ key: 'source', value: 'window.location' }] }]) as any,
      { pageKey: 's2', pageName: 's2', exportedAt: 'emit-chain', target: 'uniapp' },
    )
    expect(bad.chains).toHaveLength(0)
    expect(bad.unsupported.some((u) => u.key === 'script')).toBe(true)
  })
})
