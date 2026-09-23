import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../markdown'
import type { MenuPage } from '../menuIndex'

const pages: MenuPage[] = [{ path: '/system/user', label: '用户管理' }]

describe('renderMarkdown', () => {
  it('渲染基础 markdown', () => {
    const html = renderMarkdown('## 标题\n\n**加粗**')

    expect(html).toContain('<h2>')
    expect(html).toContain('<strong>加粗</strong>')
  })

  it('消毒：原始 HTML 被转义，javascript: 链接被拒', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))')

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
  })

  it('白名单链接转为站内跳转 data-nav', () => {
    const html = renderMarkdown('[用户管理](/system/user)', pages)

    expect(html).toContain('data-nav="/system/user"')
    expect(html).toContain('href="/system/user"')
  })

  it('非白名单链接按外链新窗口打开', () => {
    const html = renderMarkdown('[外部站点](https://example.com)', pages)

    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('data-nav')
  })
})
