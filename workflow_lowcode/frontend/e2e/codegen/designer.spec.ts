import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

import { PROBE_DIR, restoreProbe, snapshotProbe } from './probe-fs'

/**
 * 设计器工具栏的「出码」按钮（dev-only）：用户在应用里控制出码，出完直接看 dev server 渲染的产物。
 * 这条用例守的是链路的三段——按钮吃当前画布定义（不是回读接口）、经 dev 中间件落盘、产物路由真挂起来。
 *
 * 第二条守预览弹窗里的「出码」页签：出码前先看这一页会出成什么源码，只看纸面、不落盘。
 *
 * 前置：后端 8080 + 活库在跑（页 id 按 key 从接口取，用例不写死 id）。
 */

const LIST_PAGE = 'cardlist_test'

/** 设计器路由只认 ?id=，而 id 每个库都不同，所以先按 key 从接口找一个真实的 */
async function openDesigner(page: import('@playwright/test').Page, key: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  const pageId: string = await page.evaluate(async (k) => {
    const res = await fetch('/api/v1/pages?page=1&size=200', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        'X-Tenant-Id': 'default',
      },
    })
    const body = await res.json()
    const items: Array<{ key: string; id: string }> = body?.data?.content ?? []
    return items.find((p) => p.key === k)?.id ?? ''
  }, key)
  expect(pageId, `活库里没有这一页：${key}`).toBeTruthy()

  await page.goto(`/page/designer?id=${pageId}`, { waitUntil: 'domcontentloaded' })
  // 等定义真进了画布再点：早一步 getRule() 还是空数组，出码会出一张空页还把它写上盘。
  // pageKey 与 setRule 在同一个加载函数里（pageKey 先、setRule 后），所以它填上了就是画布有了。
  // .page-key-input 是 el-input 的根 div，值在它内部的 input 上
  await expect(page.locator('.page-key-input input')).toHaveValue(key, { timeout: 30_000 })
}

/** 每个产物文件的修改时间：正文一模一样时也留得下「这次确实写过盘」的证据 */
function mtimes(): Map<string, number> {
  const out = new Map<string, number>()
  for (const name of snapshotProbe().keys()) out.set(name, fs.statSync(path.join(PROBE_DIR, name)).mtimeMs)
  return out
}

test('设计器「出码」：画布定义落盘后直接开产物路由', async ({ page, context }) => {
  const before = snapshotProbe()
  try {
    await openDesigner(page, LIST_PAGE)
    const codegenBtn = page.locator('.toolbar-right button:has-text("出码")')
    await expect(codegenBtn).toBeVisible()

    const wroteBefore = mtimes()
    const popupPromise = context.waitForEvent('page')
    await codegenBtn.click()
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')

    expect(popup.url(), '出码后没跳到产物路由').toContain(`/codegen-probe/${LIST_PAGE}`)
    // 产物自己取数：这里等到行出来才算「在开发服务器里渲染出来」
    await expect(popup.locator('.card-item').first()).toBeVisible({ timeout: 30_000 })

    const wroteAfter = mtimes()
    const touched = [...wroteAfter].filter(([name, m]) => (wroteBefore.get(name) ?? 0) < m)
    expect(touched.length, '磁盘上没有文件被重写，出码落盘没生效').toBeGreaterThan(0)

    await popup.close()
  } finally {
    restoreProbe(before)
  }
})

test('预览弹窗的「出码」页签：只看纸面源码，一个字节都不落盘', async ({ page }) => {
  const before = snapshotProbe()

  await openDesigner(page, LIST_PAGE)
  // 设计器画布自己的「预览」按钮（排在「清空元素」前）。工具栏上还有个同名按钮是开全屏宿主路由的，
  // 所以必须限定在 .designer-body 里取，否则点的不是那个会弹页签的弹窗。
  await page.locator('.designer-body button:has-text("预览")').click()

  const dialog = page.locator('._fd-preview-dialog')
  const tabs = dialog.locator('.el-tabs__item')
  await expect(tabs).toHaveText(['表单模式', '生成组件', '生成HTML', '出码'])

  await tabs.nth(3).click()
  await expect(dialog.locator('.codegen-preview-pane__source')).toContainText('<template', {
    timeout: 30_000,
  })
  // 可出码率连着分子分母：只有百分比看不出节点数变了
  const rateText = (await dialog.locator('.codegen-preview-pane__rate').textContent()) ?? ''
  expect(rateText).toMatch(/\d+\/\d+/)

  // 「生成HTML」那段原来是裸 v-else：漏改一次就会让出码页签同时甩出 form-create 模板，
  // 人会把那坨当成出码产物。
  await expect(dialog.locator('._fd-preview-code')).toHaveCount(0)

  const touched = [...mtimesAfter(before)].filter(([name, m]) => (before.get(name) ?? 0) < m)
  expect(touched, `出码页签写盘了：${touched.map(([n]) => n).join('、')}`).toHaveLength(0)
})

/** 只看快照里已有文件的 mtime：页签不该新增文件，新增由上一条断言之外的落盘用例负责 */
function mtimesAfter(before: Map<string, number>): Array<[string, number]> {
  return [...before.keys()].map((name) => [name, fs.statSync(path.join(PROBE_DIR, name)).mtimeMs])
}
