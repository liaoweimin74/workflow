// ----- Task 3.2: @lc/runtime-uni 独立包（build.test.ts，独立编译 Gate）-----
// 对位 P2 runtime-package-build Gate：四入口 vitest 内联解析（骨架行为）+
// vite build 独立编译（external 纪律：uni 是宿主全局对象不参与打包，vue 源码
// 不许内联进包）。骨架口径（plan Step 3）：http=uni.request+token+租户头；
// form=字段校验；actions=op→uni.navigateTo/toast 分发；charts=占位（7.3 扩展）。
// npx vitest run packages/lc-runtime-uni/__tests__/build.test.ts

import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { uniRequest, uniHttpShim } from '../src/http'
import { useUniForm } from '../src/form'
import { runAction, uniMessage } from '../src/actions'
import { buildChartOption } from '../src/charts'
import { parseFormula, FormulaParseError } from '../src/formula-eval'
import { LcFormula } from '../src/formula'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'

const ROOT = process.cwd()
const PKG_DIR = resolve(ROOT, 'packages/lc-runtime-uni')
const DIST = join(PKG_DIR, 'dist')
const vitePkgPath = createRequire(import.meta.url).resolve('vite/package.json')
const vitePkg = JSON.parse(readFileSync(vitePkgPath, 'utf8'))
const viteBin = resolve(vitePkgPath, '..', vitePkg.bin.vite)

/** stub 全局 uni（宿主全局对象）：按 API 名记录调用，对象入参触发 success 回调；
 *  request 缺省回 R 信封（HTTP 200 + code:200 + data:{ok:1}，对位后端 R 约定） */
function stubUni() {
  const calls: Record<string, any[]> = {}
  const rec = (api: string) => (opt: any) => {
    ;(calls[api] ??= []).push(opt)
    if (opt && typeof opt === 'object') opt.success?.({ statusCode: 200, data: { code: 200, msg: 'ok', data: { ok: 1 } } })
  }
  ;(globalThis as any).uni = {
    request: rec('request'),
    navigateTo: rec('navigateTo'),
    showToast: rec('showToast'),
    reLaunch: rec('reLaunch'),
    getStorageSync: (key: string) => {
      ;(calls['getStorageSync'] ??= []).push(key)
      return 'tok-123'
    },
    removeStorageSync: (key: string) => {
      ;(calls['removeStorageSync'] ??= []).push(key)
    },
  }
  return calls
}

describe('@lc/runtime-uni — 四入口骨架行为（Task 3.2/3.3）', () => {
  it('http.uniRequest：token/租户头/baseURL 拼接，timeout 缺省 15s（对位 web 请求拦截）', async () => {
    const calls = stubUni()
    const request = uniRequest({ tenantHeader: 'X-Tenant-Id', baseURL: 'http://api.test' })
    const res = await request({ url: '/api/apps', method: 'GET' })
    const opt = calls.request[0]
    expect(opt.url).toBe('http://api.test/api/apps')
    expect(opt.header['Authorization']).toBe('Bearer tok-123')
    expect(opt.header['X-Tenant-Id']).toBe('default')
    expect(opt.timeout).toBe(15000)
    expect(res).toEqual({ code: 200, msg: 'ok', data: { ok: 1 } })
  })

  it('http.uniRequest：baseURL 缺省对齐平台前缀 /api（产物请求落到 /api/v1/**，对位 plan:18 与前端 /api 代理）', async () => {
    const calls = stubUni()
    const request = uniRequest({ tenantHeader: 'X-Tenant-Id' })
    await request({ url: '/v1/data-sources/1/data', method: 'GET' })
    expect(calls.request[0].url).toBe('/api/v1/data-sources/1/data')
  })

  it('http：R 包装 code===200 原样放行整个信封（对位 web 拦截器 return data）', async () => {
    const calls = stubUni()
    const envelope = { code: 200, msg: 'ok', data: { id: 7 } }
    ;(globalThis as any).uni.request = (opt: any) => {
      ;(calls.request ??= []).push(opt)
      opt.success({ statusCode: 200, data: envelope })
    }
    const request = uniRequest({ tenantHeader: 'X-Tenant-Id' })
    await expect(request({ url: '/x' })).resolves.toBe(envelope)
  })

  it('http：R 包装 code!==200 拒绝并携带业务码，自动 toast（silent 对位 X-Skip-Error-Toast）', async () => {
    const calls = stubUni()
    ;(globalThis as any).uni.request = (opt: any) => {
      ;(calls.request ??= []).push(opt)
      opt.success({ statusCode: 200, data: { code: 409, msg: '名称重复' } })
    }
    const request = uniRequest({ tenantHeader: 'X-Tenant-Id' })
    const err = (await request({ url: '/x' }).catch((e: Error & { code?: number }) => e)) as Error & { code?: number }
    expect(err.code).toBe(409)
    expect(err.message).toBe('名称重复')
    expect(calls.showToast).toHaveLength(1)
    expect(calls.showToast[0].title).toBe('名称重复')
    await expect(request({ url: '/x', silent: true })).rejects.toThrow('名称重复')
    expect(calls.showToast).toHaveLength(1)
  })

  it('http：HTTP 401 清 token 并按 loginPath 跳登录，不 toast（对位 web 401 分支）', async () => {
    const calls = stubUni()
    ;(globalThis as any).uni.request = (opt: any) => {
      ;(calls.request ??= []).push(opt)
      opt.success({ statusCode: 401, data: { code: 401, msg: '登录已过期' } })
    }
    const request = uniRequest({ tenantHeader: 'X-Tenant-Id', loginPath: '/pages/login' })
    await expect(request({ url: '/x' })).rejects.toThrow('登录已过期')
    expect(calls.removeStorageSync).toEqual(['access_token', 'refresh_token'])
    expect(calls.reLaunch[0].url).toBe('/pages/login')
    expect(calls.showToast).toBeUndefined()
  })

  it('http：HTTP 非 2xx 非 401 → 优先取 R 包装 msg 拒绝 + toast，不清 token 不跳转', async () => {
    const calls = stubUni()
    ;(globalThis as any).uni.request = (opt: any) => {
      ;(calls.request ??= []).push(opt)
      opt.success({ statusCode: 500, data: { msg: '服务器开小差' } })
    }
    const request = uniRequest({ tenantHeader: 'X-Tenant-Id' })
    await expect(request({ url: '/x' })).rejects.toThrow('服务器开小差')
    expect(calls.showToast).toHaveLength(1)
    expect(calls.removeStorageSync).toBeUndefined()
    expect(calls.reLaunch).toBeUndefined()
  })

  it('form.useUniForm：字段模型（v-model 载体）+ required 校验', () => {
    const { model, errors, validate } = useUniForm([
      { field: 'name', title: '姓名', props: { required: true } },
      { field: 'note', title: '备注' },
    ])
    expect(validate()).toBe(false)
    expect(errors.name).toContain('姓名')
    model.name = '张三'
    expect(validate()).toBe(true)
  })

  it('actions.uniMessage：脚本上下文 message 包装（ElMessage 形状 → uni.showToast 映射）', () => {
    const calls = stubUni()
    uniMessage({ message: '已保存', type: 'success' })
    expect(calls.showToast).toEqual([{ title: '已保存', icon: 'success' }])
    uniMessage({ message: '出错了', type: 'error' })
    uniMessage({ message: '提示' })
    uniMessage({ message: '警告', type: 'warning' })
    expect(calls.showToast).toEqual([
      { title: '已保存', icon: 'success' },
      { title: '出错了', icon: 'error' },
      { title: '提示', icon: 'none' },
      { title: '警告', icon: 'none' },
    ])
  })

  it('http.uniHttpShim：脚本上下文 http 薄壳（get/post/put/delete → uni.request 方法映射）', async () => {
    const calls = stubUni()
    ;(globalThis as any).uni.request = (opt: any) => {
      ;(calls.request ??= []).push(opt)
      opt.success({ statusCode: 200, data: { code: 200, msg: 'ok', data: 1 } })
    }
    const http = uniHttpShim(uniRequest({ tenantHeader: 'X-Tenant-Id' }))
    await http.get('/v1/ping')
    await http.post('/v1/things', { name: 'x' })
    await http.put('/v1/things/1', { name: 'y' })
    await http.delete('/v1/things/1')
    expect(calls.request.map((c: any) => [c.url, c.method, c.data])).toEqual([
      ['/api/v1/ping', 'GET', undefined],
      ['/api/v1/things', 'POST', { name: 'x' }],
      ['/api/v1/things/1', 'PUT', { name: 'y' }],
      ['/api/v1/things/1', 'DELETE', undefined],
    ])
  })

  it('form.useUniForm：init 初值预填 model（嵌套按形态 []/{}）+ reset 复位（Task 5.2 容器段）', () => {    const form = useUniForm([
      { field: 'name', title: '姓名', props: { required: true } },
      { field: 'amount', title: '金额', init: 0 },
      { field: 'items', title: '明细', init: [] },
      { field: 'invoice', title: '发票', init: {} },
    ])
    // model 预填：字段片段的 v-model 与 openContainer 的整表复位都依赖键存在
    expect(form.model.name).toBe('')
    expect(form.model.amount).toBe(0)
    expect(form.model.items).toEqual([])
    expect(form.model.invoice).toEqual({})
    form.model.name = '张三'
    ;(form.model.items as unknown[]).push({ sku: 'x' })
    form.reset()
    expect(form.model.name).toBe('')
    expect(form.model.items).toEqual([])
    // 复位后校验回到必填失败态
    expect(form.validate()).toBe(false)
  })

  it('actions.runAction：open-link→uni.navigateTo、message→uni.showToast、未适配 op 拒绝', async () => {
    const calls = stubUni()
    await expect(runAction({ op: 'open-link', url: '/pages/gen/orders' }, {})).resolves.toBe(true)
    expect(calls.navigateTo[0].url).toBe('/pages/gen/orders')
    await expect(runAction({ op: 'message', text: '已保存' }, {})).resolves.toBe(true)
    expect(calls.showToast[0].title).toBe('已保存')
    await expect(runAction({ op: 'export' }, {})).resolves.toBe(false)
  })

  it('charts.buildChartOption：rows 归整 categories/series（Task 7.3 图表适配的占位）', () => {
    const option = buildChartOption({ dimension: 'month', metrics: ['amount'] }, [
      { month: '1月', amount: 10 },
      { month: '2月', amount: 20 },
    ])
    expect(option.categories).toEqual(['1月', '2月'])
    expect(option.series).toEqual([{ name: 'amount', data: [10, 20] }])
  })
})

describe('@lc/runtime-uni — formula 移植（Task 4.3，formulaEval 纯函数求值断言）', () => {
  it('依赖收集与四则：${price} * ${count} → 30，deps=[price, count]', () => {
    const f = parseFormula('${price} * ${count}')
    expect(f.deps).toEqual(['price', 'count'])
    expect(f.evaluate({ price: 10, count: 3 })).toBe(30)
  })

  it('空值传播与除零：缺失依赖 → NaN、除以 0 → NaN（结果恒有限数值或 NaN）', () => {
    expect(Number.isNaN(parseFormula('${price} * ${count}').evaluate({ price: 10 }))).toBe(true)
    expect(Number.isNaN(parseFormula('${a} / ${b}').evaluate({ a: 1, b: 0 }))).toBe(true)
  })

  it('内置函数语义：ROUND half-up（1.25, 1 → 1.3）、MIN', () => {
    expect(parseFormula('ROUND(${v}, 1)').evaluate({ v: 1.25 })).toBe(1.3)
    expect(parseFormula('MIN(${a}, ${b})').evaluate({ a: 3, b: 2 })).toBe(2)
  })

  it('非法表达式抛 FormulaParseError（安全实现无 eval）', () => {
    expect(() => parseFormula('${a} +* 1')).toThrow(FormulaParseError)
  })
})

describe('@lc/runtime-uni — LcFormula 组件（Task 4.3，form 数据后端 + v-model 回写）', () => {
  it('求值 display（固定小数）并经 update:modelValue 回写自身字段；依赖变化重算', async () => {
    const form = reactive({ price: 10, count: 3 })
    const wrapper = mount(LcFormula, { props: { form, expression: '${price} * ${count}', modelValue: 0 } })
    await nextTick()
    expect(wrapper.text()).toContain('30.00')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe(30)
    form.price = 7
    await nextTick()
    expect(wrapper.text()).toContain('21.00')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe(21)
  })

  it('依赖缺失 → NaN 显示占位符并回写 null（不提交脏值）；空表达式 → 请配置表达式；解析错误 → 表达式错误', async () => {
    const miss = mount(LcFormula, { props: { form: reactive({ a: 1 }), expression: '${a} + ${missing}', modelValue: 0 } })
    await nextTick()
    expect(miss.text()).toContain('—')
    expect(miss.emitted('update:modelValue')?.at(-1)?.[0]).toBeNull()
    const empty = mount(LcFormula, { props: { form: reactive({}), expression: '  ', modelValue: 0 } })
    expect(empty.text()).toContain('请配置表达式')
    const bad = mount(LcFormula, { props: { form: reactive({}), expression: '${a} +* 1', modelValue: 0 } })
    expect(bad.text()).toContain('表达式错误')
  })

  it('precision 舍入 + prefix/suffix 拼接', async () => {
    const w = mount(LcFormula, {
      props: { form: reactive({ v: 1.25 }), expression: '${v}', precision: 1, prefix: '￥', suffix: '元', modelValue: 0 },
    })
    await nextTick()
    expect(w.text()).toContain('￥1.3元')
    expect(w.emitted('update:modelValue')?.at(-1)?.[0]).toBe(1.3)
  })
})

describe('@lc/runtime-uni — 独立编译 Gate', () => {
  it('vite build 产出五入口（含 formula），vue 保持 external 不被内联', () => {
    execFileSync(process.execPath, [viteBin, 'build', '--logLevel', 'silent'], {
      cwd: PKG_DIR,
      stdio: 'pipe',
      timeout: 120_000,
    })
    const files = readdirSync(DIST).filter((f) => f.endsWith('.js'))
    expect(files.sort()).toEqual(['actions.js', 'charts.js', 'form.js', 'formula.js', 'http.js'])
    const form = readFileSync(join(DIST, 'form.js'), 'utf8')
    expect(form).toMatch(/from\s+["']vue["']/)
  }, 120_000)
})
