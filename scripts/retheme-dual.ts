/**
 * Task 17-F 双主题批量替换：青墨硬编码色 → 语义品牌变量
 * 用法: bunx tsx scripts/retheme-dual.ts  （或 bun scripts/retheme-dual.ts）
 * 执行完可删除；style.css / customRenderer.ts / DashboardPage SVG 已手工处理，不在列表内
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '../workflow_lowcode/frontend')

// 语义变量映射（hex → 变量名）
const VAR_MAP: Record<string, string> = {
  '0f766e': 'brand',
  '14a08f': 'brand-mid',
  '0d6a63': 'brand-deeper',
  '118a80': 'brand-mid-hover',
  '0d5f58': 'brand-deep',
  '2dd4bf': 'brand-soft',
  '5eead4': 'brand-glow',
  '22c9d6': 'brand-bright',
  '14201c': 'ink',
  '0e1714': 'ink-border',
}

// rgba 前缀 → rgb 通道变量
const RGBA_MAP: Record<string, string> = {
  'rgba(15, 118, 110,': 'rgb(var(--brand-rgb)/',
  'rgba(15,118,110,': 'rgb(var(--brand-rgb)/',
  'rgba(45, 212, 191,': 'rgb(var(--brand-soft-rgb)/',
  'rgba(45,212,191,': 'rgb(var(--brand-soft-rgb)/',
  'rgba(94, 234, 212,': 'rgb(var(--brand-glow-rgb)/',
  'rgba(94,234,212,': 'rgb(var(--brand-glow-rgb)/',
  'rgba(34, 201, 214,': 'rgb(var(--brand-bright-rgb)/',
  'rgba(34,201,214,': 'rgb(var(--brand-bright-rgb)/',
  'rgba(20, 160, 143,': 'rgb(var(--brand-mid-rgb)/',
  'rgba(20,160,143,': 'rgb(var(--brand-mid-rgb)/',
}

// Tailwind 任意值 + 透明度修饰符（如 bg-[#2dd4bf]/18）→ 完整任意值（需先于普通替换执行）
const ALPHA_TW: Record<string, string> = {
  'bg-[#2dd4bf]/18': 'bg-[rgb(var(--brand-soft-rgb)/0.18)]',
  'bg-[#2dd4bf]/8': 'bg-[rgb(var(--brand-soft-rgb)/0.08)]',
  'bg-[#22c9d6]/14': 'bg-[rgb(var(--brand-bright-rgb)/0.14)]',
  'bg-[#22c9d6]/6': 'bg-[rgb(var(--brand-bright-rgb)/0.06)]',
  'bg-[#0f766e]/40': 'bg-[rgb(var(--brand-rgb)/0.4)]',
  'bg-[#22c9d6]/20': 'bg-[rgb(var(--brand-bright-rgb)/0.2)]',
  'bg-[#14a08f]/30': 'bg-[rgb(var(--brand-mid-rgb)/0.3)]',
  'border-[#2dd4bf]/50': 'border-[rgb(var(--brand-soft-rgb)/0.5)]',
}

// 额外补充：浅青激活底/浅色边（超出任务清单但 classic 下必须换色）
const EXTRA_TW: Record<string, string> = {
  'bg-[#d7f5ee]': 'bg-(--brand-tint)',
  'bg-[#e4f3f0]': 'bg-(--brand-tint)',
  'border-[#c8e7e2]': 'border-(--el-color-primary-light-8)',
}

const FILES = [
  'src/components/business/BpmnViewer.vue',
  'src/components/business/ListCards.vue',
  'src/views/dataSource/DataSourceListPage.vue',
  'src/views/designer/components/NodePalette.vue',
  'src/views/designer/styles/designer-theme.css',
  'src/views/designer/properties/PropertyPanel.vue',
  'src/views/login/LoginPage.vue',
  'src/views/process/ProcessCenterPage.vue',
  'src/views/dashboard/DashboardPage.vue',
  'src/modules/notification/components/TemplatePreview.vue',
  'src/vendor/style/index.css',
  'src/layouts/AdminLayout.vue',
]

let total = 0
for (const f of FILES) {
  const p = resolve(ROOT, f)
  let s = readFileSync(p, 'utf8')
  const before = s
  let count = 0

  const bump = (re: RegExp, to: string | ((...m: string[]) => string)) => {
    s = s.replace(re, (...args) => {
      count++
      return typeof to === 'function' ? (to as any)(...args) : to
    })
  }

  // 1) Tailwind 透明度修饰符（先于普通替换）
  for (const [from, to] of Object.entries(ALPHA_TW)) bump(new RegExp(from.replaceAll('[', '\\['), 'g'), to)
  // 2) Tailwind 普通任意值：bg-[#0f766e] → bg-(--brand)（保留 ! / dark: / hover: 等前缀）
  for (const [hex, name] of Object.entries(VAR_MAP)) {
    bump(new RegExp('([\\w:!-]+)\\[#' + hex + '\\]', 'g'), (_m, prefix: string) => `${prefix}(--${name})`)
  }
  // 3) 额外补充
  for (const [from, to] of Object.entries(EXTRA_TW)) bump(new RegExp(from.replaceAll('[', '\\['), 'g'), to)
  // 4) rgba → rgb(var(--xxx-rgb)/a)（透明度原样保留）
  for (const [from, to] of Object.entries(RGBA_MAP)) bump(new RegExp(from.replaceAll('(', '\\(').replaceAll(')', '\\)'), 'g'), to)
  // 5) vendor css 的 8 位 hex（#0f766e33 → rgb(var(--brand-rgb)/0.2)）
  bump(/#0f766e33/gi, () => 'rgb(var(--brand-rgb)/0.2)')
  // 6) 其余 CSS 上下文 hex（<style> 块 / 纯 css / 内联 style / JS style 绑定值）
  for (const [hex, name] of Object.entries(VAR_MAP)) {
    bump(new RegExp('#' + hex + '\\b', 'gi'), () => `var(--${name})`)
  }

  if (s !== before) {
    writeFileSync(p, s)
    console.log(`${f}: ${count} 处`)
    total += count
  } else {
    console.log(`${f}: 0 处（无变化）`)
  }
}
console.log(`合计 ${total} 处`)
