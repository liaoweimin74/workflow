import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * 产物级预览（Task 8.1/8.2）：设计器预览弹窗的「产物预览」页签 → 画布定义 →
 * generatePageUni → dev 中间件落盘 uni-shell/src/ → uni build h5 → 5301 静态服务 →
 * 手机壳 iframe 加载（版本令牌重挂）。
 *
 * 这条用例真跑时依赖：后端 8080 + 活库（页 id 按 key 从接口取）、5301 端口空闲、
 * uni build 能出 h5 产物。构建是贵操作（分钟级），真跑归 10.1 uni-dual-render
 * project（plan Task 10.1），与 designer.spec 的出码落盘用例一样放最后跑——
 * 它会重写 uni-shell/src/ 下的壳文件，快照进退保证退出时还原。
 */

const UNI_SHELL_SRC = path.resolve('uni-shell/src')

type ShellSnapshot = Map<string, string>

function snapshotShell(): ShellSnapshot {
  const out: ShellSnapshot = new Map()
  if (!fs.existsSync(UNI_SHELL_SRC)) return out
  const walk = (dir: string) => {
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

/** 设计器路由只认 ?id=，id 每个库都不同，先按 key 从接口找（与 designer.spec 同款） */
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
    const items: Array<{ key: string; id: string; designType?: string }> = body?.data?.content ?? []
    return items.find((p) => p.key === k && p.designType === 'uniapp')?.id ?? ''
  }, key)
  expect(pageId, `活库里没有这个 uniapp 页面：${key}`).toBeTruthy()

  await page.goto(`/page/designer?id=${pageId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.page-key-input input')).toHaveValue(key, { timeout: 30_000 })
}

test('产物预览：构建后手机壳 iframe 加载产物页，版本令牌随构建递增', async ({ page }) => {
  const before = snapshotShell()
  try {
    // cardlist_test 现网是 web 页；uniapp 演示页按语料页同名惯例取（10.1 落 project 时对齐）
    await openDesigner(page, 'cardlist_test')

    // 打开预览弹窗，产物预览页签只对 uniapp 页面出现
    await page.locator('.designer-body button:has-text("预览")').click()
    const dialog = page.locator('._fd-preview-dialog')
    const artifactTab = dialog.locator('.el-tabs__item:has-text("产物预览")')
    await expect(artifactTab).toBeVisible()
    await artifactTab.click()

    // 构建是分钟级操作：等版本元信息出现（构建成功返回版本令牌）
    await expect(dialog.locator('.uni-artifact-pane__meta')).toContainText('构建版本 v', { timeout: 180_000 })

    // iframe 加载 5301 产物页，src 带版本令牌（preview=true 口径的重挂依据）
    const frame = dialog.locator('iframe.uni-artifact-pane__frame')
    await expect(frame).toBeVisible()
    const src = (await frame.getAttribute('src')) ?? ''
    expect(src).toMatch(/^http:\/\/localhost:5301\/#\/pages\/gen\/.+\?v=\d+$/)

    // 右侧同屏可见出码报告与产物源码（发布前核对口径）
    await expect(dialog.locator('.uni-artifact-pane__report')).toContainText(/可出码 \d+\/\d+/)
    await expect(dialog.locator('.uni-artifact-pane__source')).toContainText('<template')

    // 重新构建一次：版本令牌必须递增（iframe 重挂，不展示陈旧产物）
    const v1 = Number(src.match(/\?v=(\d+)$/)?.[1])
    await dialog.locator('.uni-artifact-pane__build').click()
    await expect(dialog.locator('.uni-artifact-pane__meta')).toContainText(`构建版本 v${v1 + 1}`, { timeout: 180_000 })
    const src2 = (await frame.getAttribute('src')) ?? ''
    expect(src2).toMatch(new RegExp(`\\?v=${v1 + 1}$`))
  } finally {
    restoreShell(before)
  }
})
