import fs from 'node:fs'
import path from 'node:path'
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'

import { generatePageUni } from '../../src/views/page/codegen/uni/emit-uni'
import { PREVIEW_BUILD_PATH, UNI_PREVIEW_BASE } from '../../vite.uni-preview'

/**
 * 双渲染·多端（Task 10.1，design D5 延伸到 uniapp 端）：同一份页面定义，宿主渲染器与
 * uni H5 产物各渲染一次，比真机读数。
 *
 *  - 宿主：/page/<key>?preview=true —— PageRenderer 吃活库里的最新定义（含 DRAFT）
 *  - 产物：仓库语料 fixture → generatePageUni 算 files → POST 给 dev 中间件（落盘
 *    uni-shell/src/ + uni build h5）→ 产物在 /__lc-codegen/uni-static/ 同源托管 →
 *    直接 page.goto 产物 URL（同源＝宿主的 /api 代理与 localStorage 登录态天然可用）
 *
 * 不驱动设计器 UI、不依赖后端 designType：产物侧定义取仓库语料（与活库逐字节等价，
 * 2026-10-22 核对），宿主侧按 key 解析（与 designType 无关）。两侧同 context（同一份
 * 登录态）、同时加载，读数取自同一刻；业务表可能被别的会话插数据，所以只比「两侧是否
 * 一致」，不比绝对值。列表/表单/数字格式化差异（产物 199 / 宿主 199.00）不参与相等比较。
 *
 * 身份：产物 dashboard 的待办按 lc_user_id 取登录用户（10.3 产物侧登录接线负责写入）；
 * 宿主与产物同源，这里按宿主登录用户 id 注入 localStorage 即等价。
 *
 * 构建是分钟级贵操作，且 uni build 的 dist 每次只装「本次 POST 的那一页」（产物 pages.json
 * 只列该页），所以三用例各自构建自己那页（建一页探一页），不共享产物。跑法：
 *   E2E_PORT=5300 npx playwright test --project=uni-dual-render
 */

const LIST_PAGE = 'cardlist_test'
const DASH_PAGE = 'dashboard'
const USERNAME = process.env.E2E_USER || 'admin'
const PASSWORD = process.env.E2E_PASS || 'admin123'

const UNI_SHELL_SRC = path.resolve('uni-shell/src')
const CORPUS_DIR = path.resolve('src/views/page/codegen/__tests__/fixtures/corpus')

/**
 * 容器字段的比较口径：数字类字段（单价/金额/总额/折扣率）两侧格式化不同（产物 199 / 0.9，
 * 宿主 199.00 / 0.90），比相等会假失败；这里比的是同一记录带出的字符串字段（P2 5.5 同款）。
 */
const CONTAINER_FIELDS = ['客户记录ID', '联系人', '联系电话']

// ---- uni-shell/src 快照：uni build 会重写壳文件（产物页 + pages.json/manifest.json/App.vue），
// 快照进退保证退出时还原（与 uni-preview.spec.ts 同款，各自持有 helper，不做跨 spec 依赖）。

type ShellSnapshot = Map<string, string>

function snapshotShell(): ShellSnapshot {
  const out: ShellSnapshot = new Map()
  if (!fs.existsSync(UNI_SHELL_SRC)) return out
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.isFile()) {
        out.set(path.relative(UNI_SHELL_SRC, abs).split(path.sep).join('/'), fs.readFileSync(abs, 'utf8'))
      }
    }
  }
  walk(UNI_SHELL_SRC)
  return out
}

function restoreShell(before: ShellSnapshot): void {
  for (const name of snapshotShell().keys()) {
    if (!before.has(name)) fs.rmSync(path.join(UNI_SHELL_SRC, name))
  }
  for (const [name, text] of before) {
    const abs = path.join(UNI_SHELL_SRC, name)
    if (fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') === text) continue
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, text)
  }
}

/**
 * 产物构建：Node 侧按语料 fixture 算出 files → 中间件落盘 + uni build + 同源托管，回 previewUrl。
 * 只挂这一页、按主包出（previewUrl 的主包路径 pages/gen/<key> 与 uniPreviewUrl 同口径；
 * 分包落点由 7.3 的用例守，不在 10.1 的渲染一致性口径内）。
 */
async function buildArtifact(request: APIRequestContext, key: string): Promise<string> {
  const schema = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, `${key}.json`), 'utf8'))
  const client = { key: 'member', name: key, pages: [{ key, title: key }] }
  const meta = { pageKey: key, pageName: key, client }
  const { files } = generatePageUni(schema, meta)

  const res = await request.post(PREVIEW_BUILD_PATH, {
    data: { ...meta, files },
    timeout: 240_000, // uni build 冷启动是分钟级
  })
  const failText = res.ok() ? '' : await res.text()
  expect(res.ok(), `产物构建失败（${res.status()}）：${failText}`).toBeTruthy()

  const body = (await res.json()) as { previewUrl: string; pageKey: string }
  expect(body.previewUrl).toMatch(new RegExp(`^${UNI_PREVIEW_BASE}/#/pages/gen/${key}\\?v=\\d+$`))
  return body.previewUrl
}

/** 宿主登录用户 id：产物待办的身份（lc_user_id）取同值注入（10.3 产物侧接线口径） */
async function loginUserId(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/login', {
    data: { username: USERNAME, password: PASSWORD },
  })
  const failText = res.ok() ? '' : await res.text()
  expect(res.ok(), `登录接口没通（${res.status()}）：${failText}`).toBeTruthy()
  const body = (await res.json()) as { data?: { user?: { id?: unknown } } }
  const id = body.data?.user?.id
  expect(id, '登录响应里没有 user.id —— 产物待办身份取不到').toBeTruthy()
  return String(id)
}

/** 两侧各开一个页面、共用同一 context（同一份登录态），同时加载；产物侧错误读数随包带回 */
async function bothSides(
  context: BrowserContext,
  key: string,
  previewUrl: string,
  userId: string,
): Promise<{ host: Page; artifact: Page; errors: string[] }> {
  const host = await context.newPage()
  const artifact = await context.newPage()
  const errors: string[] = []
  artifact.on('pageerror', (e) => errors.push(e.message))
  await artifact.addInitScript((uid) => {
    try {
      localStorage.setItem('lc_user_id', uid)
    } catch {
      // 读不到身份时产物待办会自己说明原因，注入失败不该静默成「无人待办」
    }
  }, userId)
  await Promise.all([
    host.goto(`/page/${key}?preview=true`, { waitUntil: 'domcontentloaded' }),
    artifact.goto(previewUrl, { waitUntil: 'domcontentloaded' }),
  ])
  await Promise.all([
    host.waitForSelector('.page-renderer', { timeout: 60_000 }),
    artifact.waitForSelector('.lc-page', { timeout: 120_000 }),
  ])
  return { host, artifact, errors }
}

/** 产物卡片首列「订单编号」：label + value 拼成串（宿主同字段同形，两侧可直接比） */
async function artifactOrderNos(page: Page): Promise<string[]> {
  const cards = await page.locator('.lc-cards__card').all()
  return Promise.all(
    cards.map(async (card) => {
      const field = card
        .locator('.lc-cards__field')
        .filter({ has: page.locator('.lc-cards__label', { hasText: /^订单编号$/ }) })
        .first()
      const label = await field.locator('.lc-cards__label').innerText()
      const value = await field.locator('.lc-cards__value').innerText()
      return `${label}${value}`.replace(/\s+/g, '')
    }),
  )
}

/** 宿主卡片「订单编号」字段全文（label 与 value 同元素里，无分隔） */
async function hostOrderNos(page: Page): Promise<string[]> {
  const cards = await page.locator('.card-item').all()
  return Promise.all(
    cards.map(async (card) => (await card.locator('.card-field-order_no').innerText()).replace(/\s+/g, '')),
  )
}

/**
 * 容器字段输入框：按 label 元素全文精确匹配项再取输入控件（P2 fieldInput 同款口径 —— 两侧
 * 唯一同形的判据是「label 全文 === 标题」）。产物侧 label 在 .uni-forms-item__label、
 * 输入在 uni-easyinput 内部的 input；宿主侧是 el-form-item__label + input/textarea。
 */
function artifactFieldInput(page: Page, label: string) {
  return page
    .locator('.lc-form-popup .uni-forms-item')
    .filter({ has: page.locator('.uni-forms-item__label', { hasText: new RegExp(`^${label}$`) }) })
    .first()
    .locator('input, textarea')
    .first()
}

function hostFieldInput(page: Page, label: string) {
  return page
    .locator('.el-dialog .el-form-item')
    .filter({ has: page.locator('.el-form-item__label', { hasText: new RegExp(`^${label}$`) }) })
    .first()
    .locator('input, textarea')
    .first()
}

/** 元素全文数组（去掉首尾空白），数值/文本集合比对共用 */
async function texts(locator: Locator): Promise<string[]> {
  return (await locator.allInnerTexts()).map((t) => t.trim())
}

test.describe('10.1 列表页：卡片行数与订单编号两侧同刻一致', () => {
  test('两侧行数相等、逐行订单编号同值', async ({ context, request }) => {
    test.setTimeout(300_000)
    const before = snapshotShell()
    try {
      const previewUrl = await buildArtifact(request, LIST_PAGE)
      const userId = await loginUserId(request)
      const { host, artifact, errors } = await bothSides(context, LIST_PAGE, previewUrl, userId)

      // 活数据要等取到：恒 0 行正是这一层要抓的失效（列表脚本没首载 / 前缀不对都会是 0）。
      // 两侧都等首行——下面读的是全量行数组（all() 不带自动等待），不等就会读到空
      await Promise.all([
        expect(artifact.locator('.lc-cards__card').first()).toBeVisible({ timeout: 60_000 }),
        expect(host.locator('.card-item').first()).toBeVisible({ timeout: 60_000 }),
      ])

      const hostNos = await hostOrderNos(host)
      expect(hostNos.length, '宿主列表没出数据，比不出东西').toBeGreaterThan(0)
      expect(hostNos.some((t) => t === ''), '订单编号列渲染成空').toBeFalsy()
      expect(await artifactOrderNos(artifact), '两侧卡片行数或订单编号不同').toEqual(hostNos)

      expect(errors, '产物侧运行时报错（pageerror）').toEqual([])
    } finally {
      restoreShell(before)
    }
  })
})

test.describe('10.1 表单容器：同一记录两侧回填一致 + 真输入控件就位', () => {
  test('编辑容器字段值两侧一致，且产物侧是解析后的真控件（缺陷 E 回归闸门）', async ({
    context,
    request,
  }) => {
    test.setTimeout(300_000)
    const before = snapshotShell()
    try {
      const previewUrl = await buildArtifact(request, LIST_PAGE)
      const userId = await loginUserId(request)
      const { host, artifact, errors } = await bothSides(context, LIST_PAGE, previewUrl, userId)

      // 两侧都点第一张卡片的「编辑」：产物是 lc-cards__btn，宿主是 card-action-edit
      await artifact.locator('.lc-cards__card').first().locator('.lc-cards__btn').first().click()
      await host.locator('.card-item').first().locator('.card-action-edit').click()

      // 先证明比的是同一条记录，再比由该记录带出的字段
      const [hostNo, artifactNo] = await Promise.all([
        hostFieldInput(host, '订单编号').inputValue(),
        artifactFieldInput(artifact, '订单编号').inputValue(),
      ])
      expect(hostNo.trim(), '宿主容器没回填订单编号').not.toEqual('')
      expect(artifactNo.trim(), '产物容器没回填订单编号').not.toEqual('')
      expect(artifactNo.trim(), '两侧打开的不是同一条记录').toEqual(hostNo.trim())

      for (const label of CONTAINER_FIELDS) {
        const [h, a] = await Promise.all([
          hostFieldInput(host, label).inputValue(),
          artifactFieldInput(artifact, label).inputValue(),
        ])
        expect(a.trim(), `字段「${label}」两侧回填值不同`).toEqual(h.trim())
      }

      // 缺陷 E 回归闸门：产物 pages.json 不输出 easycom 时，uni-popup / uni-forms-item /
      // uni-easyinput 全是未解析裸标签 —— 输入框根本不存在（input 数 0）、label 不渲染、
      // popup 不是弹层。只比字段文本比不出这一类静默失效，必须数元素。
      expect(await artifact.locator('.lc-form-popup input').count(), '产物容器里没有真输入框').toBeGreaterThanOrEqual(10)
      expect(
        await artifact.locator('.lc-form-popup .uni-forms-item').count(),
        '产物容器表单项太少',
      ).toBeGreaterThanOrEqual(20)
      expect(
        await artifact.locator('.lc-form-popup .uni-forms-item__label').count(),
        '产物容器 label 没渲染',
      ).toBeGreaterThanOrEqual(10)

      expect(errors, '产物侧运行时报错（pageerror）').toEqual([])
    } finally {
      restoreShell(before)
    }
  })
})

test.describe('10.1 dashboard：KPI 数值、图表标题、待办数量两侧同刻一致', () => {
  test('KPI/图表/待办读数一致（待办身份靠注入 lc_user_id）', async ({ context, request }) => {
    test.setTimeout(300_000)
    const before = snapshotShell()
    try {
      const previewUrl = await buildArtifact(request, DASH_PAGE)
      const userId = await loginUserId(request)
      const { host, artifact, errors } = await bothSides(context, DASH_PAGE, previewUrl, userId)

      // KPI 没取到数时产物渲染 '--'（宿主渲染空）：先等到不是占位符，避免把「还没取到数」当真读数
      await expect(artifact.locator('.lc-kpi__value').first()).not.toHaveText('--', { timeout: 60_000 })
      await expect(host.locator('.dash-kpi-value').first()).not.toHaveText(/^\s*$/, { timeout: 60_000 })

      expect(await artifact.locator('.lc-kpi').count(), '产物 KPI 块没出来').toBeGreaterThan(0)
      expect(await texts(artifact.locator('.lc-kpi__value')), 'KPI 数量或数值不一致').toEqual(
        await texts(host.locator('.dash-kpi-value')),
      )

      // 图表：块数与标题一致（产物的标题是 schema 文案，同期由宿主渲染同一份定义）
      expect(await texts(artifact.locator('.lc-dchart__title')), '图表块数或标题不一致').toEqual(
        await texts(host.locator('.dash-chart-title')),
      )

      // 待办：身份＝注入的 lc_user_id；数量两侧一致，且产物侧真出了待办行
      await expect(artifact.locator('.lc-todo__count'), '产物待办没取到数（身份没接上？）').toHaveText(
        /^[1-9]\d*$/,
        { timeout: 60_000 },
      )
      await expect(host.locator('.dash-todo-count').first()).toHaveText(/^\d+$/, { timeout: 60_000 })
      expect(
        (await artifact.locator('.lc-todo__count').innerText()).trim(),
        '待办数量两侧不一致',
      ).toEqual((await host.locator('.dash-todo-count').first().innerText()).trim())
      expect(await artifact.locator('.lc-todo__item').count(), '产物待办没出行').toBeGreaterThan(0)

      expect(errors, '产物侧运行时报错（pageerror）').toEqual([])
    } finally {
      restoreShell(before)
    }
  })
})