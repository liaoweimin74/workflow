import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

import { PROBE_DIR, restoreProbe, snapshotProbe } from './probe-fs'

/**
 * 出码验证台的人工入口（/codegen-lab/<pageKey>，dev-only 路由）。
 * 这条规格不是产品设计，是「人工验证」这一步的自动化替身：证明同一屏上
 * 报告、宿主渲染、产物渲染、产物源码四块都真出得来，并且比 dual-render.spec.ts 多守一件事——
 * 磁盘产物必须就是本次生成的那份（不一致时界面要警示，人不能看着旧产物读新报告）。
 *
 * 前置：后端 8080 + 活库在跑；产物已落盘
 *   PROBE_PAGES=cardlist_test,dashboard,tmp_dash_todo_verify npx vitest run src/views/page/codegen/__tests__/runtime-probe.test.ts
 */

const LIST_PAGE = 'cardlist_test'
// 语料里有、但不在 e2e 落盘清单里的页：用来验「没有产物」这条路走得通、说得清
const NO_ARTIFACT_PAGE = 'cardlistpage'

async function openLab(page: Page, key: string) {
  await page.goto(`/codegen-lab/${key}`, { waitUntil: 'domcontentloaded' })
  // 报告出来了才算生成成；出不来要么是没跑起来，要么是取定义失败（那种情况 .codegen-lab__error 会在下面出现）
  await expect(page.locator('.codegen-report__rate')).toBeVisible({ timeout: 30_000 })
}

test.describe('出码验证台', () => {
  test('语料来源一屏出齐：报告、两侧渲染、产物源码', async ({ page }) => {
    await openLab(page, LIST_PAGE)
    await expect(page.locator('.codegen-lab__error')).toHaveCount(0)

    // 可出码率连着分子分母显示（只有百分比看不出节点数变了）
    await expect(page.locator('.codegen-report__rate')).toHaveText(/\d+\/\d+/)
    // C 桶（已登记组件不忠实出码）非零就该看到红色告警，这里守的是「这一页没有 C 桶」
    await expect(page.locator('.codegen-report__alert-c')).toHaveCount(0)
    // 明细默认收起（一屏要先看到双渲染对照），但计数得一直看得见
    await expect(page.locator('.codegen-report__summary')).toContainText('空洞 0')
    await expect(page.locator('.codegen-report__node').first()).toBeHidden()
    await page.locator('.codegen-report__summary').click()
    await expect(page.locator('.codegen-report__node').first()).toBeVisible()

    const hostCards = page.locator('.codegen-compare__side--host .card-item')
    const artifactCards = page.locator('.codegen-compare__side--artifact .card-item')
    await hostCards.first().waitFor()
    await artifactCards.first().waitFor()
    expect(await artifactCards.count(), '两侧卡片行数不同').toEqual(await hostCards.count())
    expect(await hostCards.count(), '列表没出数据').toBeGreaterThan(0)

    // 磁盘产物与本次生成必须同一份：不一致时对照面板会给红色警示
    await expect(page.locator('.codegen-compare__stale')).toHaveCount(0)

    await expect(page.locator('.codegen-lab__source')).toContainText('<template')
  })

  test('右侧没有落盘产物：说明白并给出命令，不出空白格', async ({ page }) => {
    await openLab(page, NO_ARTIFACT_PAGE)
    const missing = page.locator('.codegen-compare__missing')
    await expect(missing).toBeVisible()
    await expect(missing).toContainText(`PROBE_PAGES=${NO_ARTIFACT_PAGE}`)
    await expect(missing).toContainText('runtime-probe.test.ts')
  })

  test('活库定义：切来源后取的是 preview=true 那份，宿主侧照样渲染', async ({ page }) => {
    await openLab(page, LIST_PAGE)
    // 请求先挂监听再点：el-radio-group 的 change 就会发起取定义，晚挂会等下一次才回
    const requested = page.waitForResponse((r) => /\/definition\?preview=true/.test(r.url()))
    await page.locator('.codegen-lab__bar label:has-text("活库定义")').click()

    await page.locator('.codegen-lab__key').fill(LIST_PAGE)
    await page.keyboard.press('Enter')
    expect((await requested).status(), '活库定义请求没发出去或没成功').toBe(200)

    await expect(page.locator('.codegen-lab__error')).toHaveCount(0)
    await expect(page.locator('.codegen-compare__side--host .page-canvas')).toBeVisible()
  })

  test('「落盘产物」按钮：把命令行那一步做进界面，从缺产物到两侧可比', async ({ page }) => {
    const before = snapshotProbe()
    try {
      await openLab(page, NO_ARTIFACT_PAGE)
      await expect(page.locator('.codegen-compare__missing')).toBeVisible()

      await page.locator('.codegen-lab__write').click()
      await expect(page.locator('.codegen-lab__write-error')).toHaveCount(0)
      // 写完必须重读磁盘 glob：警示还在就说明右侧拿的是旧货
      await expect(page.locator('.codegen-compare__missing')).toHaveCount(0)
      await expect(page.locator('.codegen-compare__stale')).toHaveCount(0)

      const written = [...snapshotProbe().keys()].filter((n) => !before.has(n) && n.endsWith('.vue'))
      expect(written.length, '点完按钮磁盘上没多出 .vue 产物').toBeGreaterThan(0)
      // 新文件会让 vite 重跑整个模块图（页面会整页重载），正文要等生成完再读，早一步是空面板
      const sourcePanel = page.locator('.codegen-lab__source')
      await expect(sourcePanel).toContainText('<template', { timeout: 30_000 })
      // 落盘正文与界面展示的本次生成结果逐字节一致（中间件不重排、不加尾换行）
      const disk = fs.readFileSync(path.join(PROBE_DIR, written[0]), 'utf8')
      const shown = (await sourcePanel.textContent()) ?? ''
      const at = [...disk].findIndex((c, i) => c !== shown[i])
      expect(
        disk,
        `磁盘与界面不同源：长度 ${disk.length}/${shown.length}，首个差异 @${at} 磁盘=${JSON.stringify(disk.slice(at, at + 40))} 界面=${JSON.stringify(shown.slice(at, at + 40))}`,
      ).toBe(shown)

      await expect(page.locator('.codegen-compare__side--artifact').first()).toBeVisible()
    } finally {
      restoreProbe(before)
    }
  })
})
