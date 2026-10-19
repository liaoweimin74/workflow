import fs from 'node:fs'
import path from 'node:path'

// 构建产物校验 + manifest 生成：<dist>/bundle.js（ESM，宿主依赖保持裸导入）+ <dist>/manifest.json
// 页面型与组件型各一套产物目录：pnpm build（dist/page）/ pnpm build:widget（dist/widget）
const root = path.resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(name)
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback
}
const manifestName = flag('--manifest', 'material.json')
const distRel = flag('--dist', 'dist/page')
const distDir = path.join(root, distRel)
const bundlePath = path.join(distDir, 'bundle.js')
const materialPath = path.join(root, manifestName)

const REQUIRED = ['key', 'name', 'type', 'sdkVersion']
const TYPES = ['PAGE', 'WIDGET']

if (!fs.existsSync(materialPath)) {
  console.error(`缺少物料清单源文件 ${manifestName}`)
  process.exit(1)
}
const manifest = JSON.parse(fs.readFileSync(materialPath, 'utf8'))

const missing = REQUIRED.filter((k) => !manifest[k])
if (missing.length) {
  console.error(`manifest 缺少必填字段: ${missing.join(', ')}`)
  process.exit(1)
}
if (!TYPES.includes(manifest.type)) {
  console.error(`type 非法: ${manifest.type}（允许 ${TYPES.join('/')}）`)
  process.exit(1)
}
if (manifest.type === 'WIDGET') {
  if (!Array.isArray(manifest.meta)) {
    console.error('WIDGET 物料的 meta 必须是数组：[{"field":"title","type":"text"}, ...]，数组顺序即属性面板顺序')
    process.exit(1)
  }
  const bad = manifest.meta.find(
    (m) => !m || typeof m !== 'object' || typeof m.field !== 'string' || !m.field || typeof m.type !== 'string' || !m.type
  )
  if (bad !== undefined) {
    console.error(`meta 每一项都必须含 field 与 type，当前为: ${JSON.stringify(bad)}`)
    process.exit(1)
  }
}

if (!fs.existsSync(bundlePath)) {
  console.error(`构建产物缺失: ${distRel}/bundle.js`)
  process.exit(1)
}
let code = fs.readFileSync(bundlePath, 'utf8')

// SFC 样式内联：物料契约是「单 JS 文件 + manifest」，多文件会把上传/导出复杂化
const cssFiles = fs.readdirSync(distDir).filter((f) => f.endsWith('.css'))
if (cssFiles.length) {
  const css = cssFiles.map((f) => fs.readFileSync(path.join(distDir, f), 'utf8')).join('\n')
  code =
    `(() => { const s = document.createElement('style'); s.setAttribute('data-material', ${JSON.stringify(manifest.key)}); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s) })();\n` +
    code
  for (const f of cssFiles) fs.unlinkSync(path.join(distDir, f))
  fs.writeFileSync(bundlePath, code)
  console.log(`✓ 已内联样式 ${cssFiles.join(', ')} (${(css.length / 1024).toFixed(2)} KB)`)
}

// 宿主依赖必须留在 import 语句里（裸模块名），由宿主 import map 解析；被打进包即双实例
for (const dep of ['vue', 'element-plus', '@platform/sdk']) {
  if (!new RegExp(`from\\s*["']${dep.replace('/', '\\/')}["']`).test(code)) {
    if (new RegExp(`from\\s*["'][^"']*/${dep}["']`).test(code)) {
      console.error(`产物把 ${dep} 打进了包（应 external），检查 vite.config.js`)
      process.exit(1)
    }
  }
}
if (/element-plus\/es|node_modules/.test(code)) {
  console.error('产物包含宿主依赖源码片段（应 external），检查 vite.config.js')
  process.exit(1)
}

fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`✓ ${distRel}/bundle.js (${(code.length / 1024).toFixed(1)} KB) + manifest.json 就绪，物料 key=${manifest.key}`)
