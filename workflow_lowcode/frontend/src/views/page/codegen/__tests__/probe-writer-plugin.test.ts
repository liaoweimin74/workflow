/**
 * dev 中间件的落盘计划校验（RED 先行）。
 *
 * 出码按钮要能把产物写进 `codegen/probe/`，唯一的写盘通道是这个 vite dev 中间件，
 * 所以「浏览器给的文件名」必须在进 `writeFile` 之前就被当成不可信输入处理干净：
 * 只允许 probe/ 目录下的 .vue/.ts，最多一层子目录，任何穿越形态一律拒绝。
 */

import { describe, expect, it } from 'vitest'
import { PROBE_DIR_REL, PROBE_WRITE_PATH, planProbeWrites } from '../../../../../vite.codegen-probe-writer'

const ok = (files: Record<string, unknown>) => planProbeWrites({ pageKey: 'cardlist_test', files })

describe('出码落盘中间件：文件名是不可信输入', () => {
  it('正常两文件：落到 probe/ 下并保留子目录', () => {
    const r = ok({ 'CardlistTest.vue': '<template />', 'api/cardlist-test.ts': 'export const a = 1' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.writes.map((w) => w.rel)).toEqual([
      `${PROBE_DIR_REL}/CardlistTest.vue`,
      `${PROBE_DIR_REL}/api/cardlist-test.ts`,
    ])
  })

  it('拒绝路径穿越与绝对路径', () => {
    for (const bad of ['../evil.vue', '/etc/passwd.ts', './..//x.vue', 'probe/x.vue']) {
      const r = ok({ [bad]: 'x' })
      expect(r.ok, bad).toBe(false)
    }
  })

  it('拒绝隐藏段、空段与反斜杠', () => {
    for (const bad of ['.hidden.vue', 'a//b.vue', 'api\\card.ts', '..vue']) {
      const r = ok({ [bad]: 'x' })
      expect(r.ok, bad).toBe(false)
    }
  })

  it('只认 .vue / .ts：不给写 js、json、sh 或无后缀', () => {
    for (const bad of ['x.js', 'x.mjs', 'manifest.json', 'x.sh', 'X', 'x.vue.ts.txt', 'x.VUEE']) {
      const r = ok({ [bad]: 'x' })
      expect(r.ok, bad).toBe(false)
    }
    expect(ok({ 'x.vue': 'x' }).ok).toBe(true)
    expect(ok({ 'x.ts': 'x' }).ok).toBe(true)
  })

  it('最多一层子目录（api/），再深拒绝', () => {
    expect(ok({ 'a/b/c.vue': 'x' }).ok).toBe(false)
  })

  it('正文必须是字符串且有长度上限', () => {
    expect(ok({ 'x.vue': undefined }).ok).toBe(false)
    expect(ok({ 'x.vue': 123 }).ok).toBe(false)
    expect(ok({ 'x.vue': 'a'.repeat(512_001) }).ok).toBe(false)
    expect(ok({ 'x.vue': 'a'.repeat(512_000) }).ok).toBe(true)
  })

  it('空 files 与畸形请求体一律拒绝', () => {
    expect(planProbeWrites(null).ok).toBe(false)
    expect(planProbeWrites({}).ok).toBe(false)
    expect(planProbeWrites({ files: 'x' }).ok).toBe(false)
    expect(planProbeWrites({ files: [] }).ok).toBe(false)
    expect(planProbeWrites({ files: {} }).ok).toBe(false)
  })

  it('端点路径与客户端写的常量同源，防两侧各写一个', async () => {
    const sink = await import('../codegen-run')
    expect(sink.PROBE_WRITE_URL).toBe(PROBE_WRITE_PATH)
  })
})
