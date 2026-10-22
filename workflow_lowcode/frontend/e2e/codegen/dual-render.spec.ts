import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'

/**
 * 双渲染（design D5）：同一份页面定义，宿主渲染器与出码产物各渲染一次，比真机表现。
 * 两侧各开一个 page、共用同一 context（同一份登录态）同时加载，读数取自同一时刻的同一份活库；
 * 业务表可能被别的会话插数据，所以只比「两侧是否一致」，不比绝对值。
 *
 *  - 宿主：/page/<key>?preview=true   （PageRenderer → .page-renderer，吃活库最新定义含 DRAFT）
 *  - 产物：/codegen-probe/<key>       （CodegenProbeShell → .lc-page，吃仓库语料 fixture 的出码产物）
 *
 * 选页：cardlist_test 一页同时有 page-list-cards + formContainer（含 LookupPicker / FormulaField /
 * group / tableForm / subForm），5.4 与 5.5 都用它；dashboard 走 5.6 的组件数量；
 * dashboard 里没有 dash-filter，筛选广播改用 tmp_dash_todo_verify（dash-filter + dash-todo）。
 * 三页现网 schema 与语料 fixture 逐字节相同（2026-10-22 核对），比对差异只可能来自渲染路径。
 */

const LIST_PAGE = 'cardlist_test'
const DASH_PAGE = 'dashboard'
const FILTER_PAGE = 'tmp_dash_todo_verify'

type Side = 'host' | 'artifact'

function pathOf(side: Side, key: string) {
  return side === 'host' ? `/page/${key}?preview=true` : `/codegen-probe/${key}`
}

function rootOf(side: Side) {
  return side === 'host' ? '.page-renderer' : '.lc-page'
}

/**
 * 打开一侧并等它自己的挂载标记。产物侧的探针壳在 glob 里找不到同名产物时会渲染
 * 「探测产物不存在」，所以两侧统一断言没落到 el-result 上，避免拿空壳比出假绿。
 */
async function openSide(page: Page, side: Side, key: string) {
  await page.goto(pathOf(side, key), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(rootOf(side), { timeout: 30_000 })
  await expect(page.locator('.el-result')).toHaveCount(0)
}

/** 两条渲染路径同时开 */
async function bothSides(context: BrowserContext, key: string) {
  const host = await context.newPage()
  const artifact = await context.newPage()
  await Promise.all([openSide(host, 'host', key), openSide(artifact, 'artifact', key)])
  return { host, artifact }
}

/** 可见弹窗，用弹窗内必然出现的文本区分（EP 的 dialog 关着时也在 DOM 里，必须带 :visible） */
function visibleDialog(page: Page, text: string) {
  return page.locator('.el-dialog:visible').filter({ hasText: text }).first()
}

/**
 * 表单项按标签取。标签文本整段精确匹配才跨侧成立：宿主侧 form-create 把标题包进
 * `<span class="fc-form-title">`，`:text-is()` 命中不到；input-number 与公式框没有可访问名，
 * `getByRole(name)` 也命中不到。剩下唯一两侧同形的判据是「label 元素全文 === 标题」。
 * `filter({ has })` 的内层 locator 必须以 page 为根 —— 以弹窗 locator 为根会一条都匹不到。
 */
function formItem(page: Page, within: Page | Locator, label: string) {
  return within
    .locator('.el-form-item')
    .filter({ has: page.locator('.el-form-item__label', { hasText: new RegExp(`^${label}$`) }) })
    .first()
}

function fieldInput(page: Page, within: Page | Locator, label: string) {
  return formItem(page, within, label).locator('input, textarea').first()
}

/** 打开第一张卡片的编辑容器，返回容器弹窗（5.4 / 5.5 共用同一段前置动作） */
async function openContainer(page: Page) {
  await page.locator('.card-item').first().locator('.card-action-edit').click()
  const dialog = visibleDialog(page, '订单编号')
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('脚手架自检：两条路由都真能渲染', () => {
  for (const key of [LIST_PAGE, DASH_PAGE]) {
    for (const side of ['host', 'artifact'] as const) {
      test(`${side === 'host' ? '宿主' : '产物'}渲染 ${key}：根节点出得来、不是错误态`, async ({ page }) => {
        await openSide(page, side, key)
        const root = page.locator(rootOf(side))
        // 有内容才算渲染成功：白屏 / 只出一个空 div 都算脚手架没通
        await expect
          .poll(async () => (await root.innerText()).trim().length, { message: `${key} 的 ${side} 侧渲染为空` })
          .toBeGreaterThan(20)
      })
    }
  }
})

test.describe('5.4 列表页：行数、关键列文本、编辑按钮打开容器', () => {
  test('卡片列表两侧同刻读数一致', async ({ context }) => {
    const { host, artifact } = await bothSides(context, LIST_PAGE)
    for (const p of [host, artifact]) await p.locator('.card-item').first().waitFor()

    const orderNos = async (page: Page) =>
      Promise.all(
        (await page.locator('.card-item').all()).map((c) => c.locator('.card-field-order_no').innerText()),
      )

    const hostNos = await orderNos(host)
    expect(hostNos.length, '列表没出数据，比不出东西').toBeGreaterThan(0)
    expect(hostNos.some((t) => t.trim() === ''), '订单编号列渲染成空').toBeFalsy()
    expect(await orderNos(artifact), '两侧卡片行数或订单编号不同').toEqual(hostNos)
  })

  test('编辑按钮：两侧都打开容器，且开的是同一条记录', async ({ context }) => {
    const { host, artifact } = await bothSides(context, LIST_PAGE)
    const opened = async (page: Page) => {
      const dialog = await openContainer(page)
      return (await fieldInput(page, dialog, '订单编号').inputValue()).trim()
    }
    const [hostNo, artifactNo] = await Promise.all([opened(host), opened(artifact)])
    expect(hostNo, '宿主容器没回填订单编号').not.toEqual('')
    expect(artifactNo, '产物容器没回填订单编号').not.toEqual('')
    expect(artifactNo).toEqual(hostNo)
  })
})

test.describe('5.5 表单容器页：回填、公式、LookupPicker 写回', () => {
  test('字段回填：同一记录在两侧的容器字段值一致', async ({ context }) => {
    const { host, artifact } = await bothSides(context, LIST_PAGE)
    const [hc, ac] = [await openContainer(host), await openContainer(artifact)]
    // 先证明比的是同一条记录，再比由该记录带出的字段
    expect((await fieldInput(artifact, ac, '订单编号').inputValue()).trim()).toEqual(
      (await fieldInput(host, hc, '订单编号').inputValue()).trim(),
    )
    for (const label of ['客户记录ID', '联系人', '联系电话']) {
      const [h, a] = await Promise.all([
        fieldInput(host, hc, label).inputValue(),
        fieldInput(artifact, ac, label).inputValue(),
      ])
      expect(a.trim(), `字段「${label}」两侧回填值不同`).toEqual(h.trim())
    }
  })

  test('公式计算：改依赖字段后两侧应收金额算出同一个数', async ({ context }) => {
    const { host, artifact } = await bothSides(context, LIST_PAGE)
    const formula = async (page: Page) => {
      const dialog = await openContainer(page)
      // 表达式 ROUND(${order_amount} * (1 - ${discount_rate}), 2) → 100 * 0.9 = 90
      for (const [label, value] of [
        ['订单总金额', '100'],
        ['折扣率', '0.1'],
      ] as const) {
        await fieldInput(page, dialog, label).fill(value)
        await fieldInput(page, dialog, label).press('Tab')
      }
      const box = formItem(page, dialog, '应收金额').locator('.formula-field__value')
      await expect(box).not.toHaveText('')
      return (await box.innerText()).trim()
    }
    const [h, a] = await Promise.all([formula(host), formula(artifact)])
    expect(a, '两侧公式结果不同').toEqual(h)
    expect(Number(h), `公式算出 ${h}，按表达式应为 90`).toBeCloseTo(90, 2)
  })

  test('LookupPicker 写回：选一条候选后两侧都带回 id 与返回字段', async ({ context }) => {
    const { host, artifact } = await bothSides(context, LIST_PAGE)
    const picked = async (page: Page) => {
      const dialog = await openContainer(page)
      const current = (await fieldInput(page, dialog, '联系人').inputValue()).trim()
      await fieldInput(page, dialog, '选择客户').click()
      const picker = visibleDialog(page, '客户编码')
      await expect(picker).toBeVisible()
      const rows = picker.locator('.el-table__row')
      await rows.first().waitFor()
      // 列序 = 节点 columns 配置（客户编码 / 客户名称 / 联系人）
      const cells: { index: number; name: string; contact: string }[] = []
      for (let i = 0; i < (await rows.count()); i++) {
        const t = (await rows.nth(i).locator('td').allInnerTexts()).map((s) => s.trim())
        cells.push({ index: i, name: t[1] ?? '', contact: t[2] ?? '' })
      }
      // 必须挑一条与当前回填值不同的候选：选中同一条记录时，写回坏没坏都看不出差别
      const target = cells.find((c) => c.contact !== '' && c.contact !== current)
      expect(target, `候选表里没有区别于当前值「${current}」的联系人，写回用例比不出东西`).toBeTruthy()
      await rows.nth(target!.index).click()
      await expect(picker).toBeHidden()
      const read = (label: string) => fieldInput(page, dialog, label).inputValue()
      return {
        客户: await read('选择客户'),
        客户记录ID: await read('客户记录ID'),
        联系人: await read('联系人'),
        联系电话: await read('联系电话'),
        期望客户: target!.name,
        期望联系人: target!.contact,
      }
    }
    const [h, a] = await Promise.all([picked(host), picked(artifact)])
    // 宿主靠组件内 api.setValue，产物靠 @select handler —— 两条写回路径必须落到同一组值上
    expect(a, '两侧写回结果不同').toEqual(h)
    // 而且落的必须是选中那一行的值：只比两侧一致会漏掉「两边都没写回」的情况
    expect(h.联系人, '宿主没把联系人写成选中行的值').toEqual(h.期望联系人)
    expect(h.客户, '宿主没把显示名写成选中行的值').toEqual(h.期望客户)
    expect(a.联系人, '产物没把联系人写成选中行的值').toEqual(a.期望联系人)
    expect(a.客户, '产物没把显示名写成选中行的值').toEqual(a.期望客户)
    expect(a.客户记录ID.trim(), '产物没带回 idField').not.toEqual('')
  })
})

test.describe('5.6 dashboard：组件数量与筛选广播', () => {
  test('dashboard 两侧 dash 组件数量一致且都取到数', async ({ context }) => {
    const { host, artifact } = await bothSides(context, DASH_PAGE)
    const counts = async (page: Page) => ({
      kpi: await page.locator('.dash-kpi').count(),
      chart: await page.locator('.page-data-chart').count(),
      todo: await page.locator('.dash-todo').count(),
    })
    const [h, a] = [await counts(host), await counts(artifact)]
    expect(a, '两侧 dash 组件数量不同').toEqual(h)
    expect(h.kpi, 'dashboard 上没有 KPI，比不出取数').toBeGreaterThan(0)
    // 数量对上不等于活了：KPI 真出数才证明产物侧的取数接线是通的
    expect((await host.locator('.dash-kpi').allInnerTexts()).join(''), '宿主 KPI 全空').toMatch(/\d/)
    expect((await artifact.locator('.dash-kpi').allInnerTexts()).join(''), '产物 KPI 全空').toMatch(/\d/)
  })

  test('筛选广播：改日期区间后两侧待办数同样变化', async ({ context }) => {
    const { host, artifact } = await bothSides(context, FILTER_PAGE)
    const broadcast = async (page: Page) => {
      const todo = page.locator('.dash-todo-count')
      await expect(todo).toBeVisible()
      const read = async () => Number((await todo.innerText()).trim())
      // 先等取数落地再取基准值：不然 before 读到的是加载中的 0，广播后必然「没变化」
      await expect.poll(read, { message: '待办列表没数据，广播比不出东西' }).toBeGreaterThan(0)
      const before = await read()
      // 取一个必然没有数据的区间（2000 年），广播生效的话计数应当下降
      const range = page.locator('.dash-filter-control input')
      await range.first().click()
      await range.first().fill('2000-01-01')
      await range.nth(1).fill('2000-01-02')
      await page.keyboard.press('Enter')
      const confirm = page.locator('.el-date-range-picker:visible button:has-text("确定")')
      if (await confirm.count()) await confirm.click()
      await expect.poll(read, { message: '广播后待办数没变' }).toBeLessThan(before)
      return { before, after: await read() }
    }
    const [h, a] = await Promise.all([broadcast(host), broadcast(artifact)])
    expect(a.before, '两侧进入用例时的待办数不同').toEqual(h.before)
    expect(a.after, '两侧广播后的待办数不同').toEqual(h.after)
  })
})
