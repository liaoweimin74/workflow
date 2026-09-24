import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import type { MenuPage } from './menuIndex'

/**
 * AI 助手 Markdown 渲染。
 *
 * - 关闭原始 HTML（html:false）+ DOMPurify 消毒，杜绝 AI 输出注入
 * - 链接拦截：命中菜单白名单的路径转为站内跳转（data-nav），其余按外链新窗口打开
 */

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

/** 站内路由链接（如 /form/designer?id=xxx）：以单个 / 开头（排除协议相对的 //）。 */
function isInternalPath(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//')
}

const defaultLinkOpen = md.renderer.rules.link_open

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href') ?? ''
  const pages = (env as { pages?: MenuPage[] }).pages ?? []

  if (pages.some((page) => page.path === href)) {
    // 白名单站内链接：保留 href 作为无 JS 兜底，附带 data-nav 供点击拦截走前端路由
    token.attrSet('data-nav', href)
    token.attrSet('class', 'ai-md-nav')
  } else if (isInternalPath(href)) {
    // 站内路由链接（含 query，如 AI 话术里的 /form/designer?id=xxx）：
    // 同样打 data-nav 走前端路由跳转——vue-router 会自动补 vite base（/lowcode/）。
    // 若不拦截整页跳转，浏览器会请求 :3000/form/designer（无 /lowcode 前缀）→ 404。
    // 不设 target=_blank，保证普通点击、Ctrl+点击均走拦截逻辑。
    token.attrSet('data-nav', href)
  } else {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
  }

  return defaultLinkOpen
    ? defaultLinkOpen(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

/**
 * 渲染 Markdown 为消毒后的 HTML。
 *
 * @param text  Markdown 文本
 * @param pages 站内可跳转页面白名单（命中者转为 data-nav）
 */
export function renderMarkdown(text: string, pages: MenuPage[] = []): string {
  const rendered = md.render(text ?? '', { pages })
  return DOMPurify.sanitize(rendered, { ADD_ATTR: ['data-nav', 'target', 'rel'] })
}
