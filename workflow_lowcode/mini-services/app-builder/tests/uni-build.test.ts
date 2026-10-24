// Task 9.2 Step 3（RED）——app-builder uni-build 单元测试。
// 被测对象：../src/uni-build.ts（vitest 原生 TS 转换）。
// 覆盖 plan 口径：落盘校验（SEGMENT 纪律）/ 参数透传 / 失败态 / 归档。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildApp, planAppBuildWrite, writeBuildFiles } from '../src/uni-build'

function tmpProject() {
  return mkdtempSync(path.join(tmpdir(), 'lc-app-builder-'))
}

describe('planAppBuildWrite 落盘计划（安全口径与 vite.uni-preview 同纪律）', () => {
  it('合法 files 生成 src/ 前缀落盘计划', () => {
    const plan = planAppBuildWrite({
      files: { 'src/pages.json': '{}', 'src/pages/gen/home.vue': '<template />', 'src/api/foo.ts': 'export {}' },
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.writes.map((w) => w.rel)).toEqual([
      'src/pages.json',
      'src/pages/gen/home.vue',
      'src/api/foo.ts',
    ])
  })

  it('拒绝非 src/ 前缀、路径穿越、非法后缀、非字符串正文', () => {
    const bad = [
      { 'pages.json': '{}' },
      { 'src/../evil.json': '{}' },
      { 'src/pages/gen/x.exe': 'MZ' },
      { 'src/ok.json': 42 },
      {},
    ]
    for (const files of bad) {
      const plan = planAppBuildWrite({ files })
      expect(plan.ok, `应拒绝: ${JSON.stringify(files)}`).toBe(false)
    }
  })

  it('拒绝超大正文（512KB 上限）', () => {
    const plan = planAppBuildWrite({ files: { 'src/big.json': 'x'.repeat(513_000) } })
    expect(plan.ok).toBe(false)
  })
})

describe('writeBuildFiles 落盘', () => {
  it('按计划写入且不越出工程 src/', () => {
    const root = tmpProject()
    try {
      const plan = planAppBuildWrite({ files: { 'src/pages/gen/home.vue': '<template><text>hi</text></template>' } })
      expect(plan.ok).toBe(true)
      if (!plan.ok) return
      writeBuildFiles(root, plan.writes)
      const written = readFileSync(path.join(root, 'src/pages/gen/home.vue'), 'utf8')
      expect(written).toContain('hi')
      expect(existsSync(path.join(root, '..', 'evil'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('buildApp 参数透传与失败态（spawn 替身注入）', () => {
  it('透传 -p <platform> 与 --no-install，成功回 {ok:true, artifactUrl}', async () => {
    const root = tmpProject()
    try {
      const calls: Array<{ cmd: string; args: string[]; opts?: unknown }> = []
      const fakeSpawn = async (cmd: string, args: string[]) => {
        calls.push({ cmd, args })
        mkdirSync(path.join(root, 'dist/build/h5'), { recursive: true })
        writeFileSync(path.join(root, 'dist/build/h5/index.html'), '<html>h5</html>', 'utf8')
        return { code: 0, output: 'build ok' }
      }
      const result = await buildApp({
        projectRoot: root,
        platform: 'h5',
        releaseId: 'relX',
        files: { 'src/pages.json': '{}', 'src/pages/gen/home.vue': '<template />', 'src/api/foo.ts': 'export {}' },
        archiveRoot: path.join(root, 'archives'),
        spawnUni: fakeSpawn,
      })
      expect(calls.length).toBe(1)
      expect(calls[0].cmd).toBe('npx')
      expect(calls[0].args).toContain('uni')
      expect(calls[0].args).toContain('--no-install')
      expect(calls[0].args).toContain('build')
      expect(calls[0].args).toContain('-p')
      expect(calls[0].args[calls[0].args.indexOf('-p') + 1]).toBe('h5')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      // V1 目录归档（零依赖；mp-weixin 产物本身是目录），URL 不带 .zip
      expect(result.artifactUrl).toBe('/artifacts/relX/h5')
      expect(result.artifactPath).toBe(path.join(root, 'archives', 'relX', 'h5'))
      // 归档产物落位（目录归档：产物目录整体复制）
      expect(readFileSync(path.join(result.artifactPath, 'index.html'), 'utf8')).toContain('h5')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('mp-weixin 平台透传与归档命名', async () => {
    const root = tmpProject()
    try {
      const calls: Array<{ cmd: string; args: string[] }> = []
      const result = await buildApp({
        projectRoot: root,
        platform: 'mp-weixin',
        releaseId: 'relY',
        files: { 'src/pages.json': '{}' },
        archiveRoot: path.join(root, 'archives'),
        spawnUni: async (cmd, args) => {
          calls.push({ cmd, args })
          mkdirSync(path.join(root, 'dist/build/mp-weixin'), { recursive: true })
          writeFileSync(path.join(root, 'dist/build/mp-weixin/app.json'), '{}', 'utf8')
          return { code: 0, output: 'ok' }
        },
      })
      expect(calls[0].args[calls[0].args.indexOf('-p') + 1]).toBe('mp-weixin')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.artifactUrl).toBe('/artifacts/relY/mp-weixin')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('构建非零退出 → ok:false + 错误可追溯（尾段输出带回）', async () => {
    const root = tmpProject()
    try {
      const result = await buildApp({
        projectRoot: root,
        platform: 'h5',
        releaseId: 'relZ',
        files: { 'src/pages.json': '{}' },
        archiveRoot: path.join(root, 'archives'),
        spawnUni: async () => ({ code: 1, output: '... template syntax error near <' }),
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toContain('uni build 失败')
      expect(result.error).toContain('template syntax error')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('非法平台拒绝（仅 mp-weixin | h5）', async () => {
    const root = tmpProject()
    try {
      const result = await buildApp({
        projectRoot: root,
        platform: 'app',
        releaseId: 'relW',
        files: { 'src/pages.json': '{}' },
        archiveRoot: path.join(root, 'archives'),
        spawnUni: async () => ({ code: 0, output: '' }),
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toContain('platform')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
