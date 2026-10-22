import fs from 'node:fs'
import path from 'node:path'

/**
 * 磁盘产物（codegen/probe/）的快照与还原。
 * 出码按钮与「落盘产物」按钮会真往这个目录写：用例若不留还原，跑完磁盘上就多出一页产物，
 * 下一轮「右侧没有落盘产物」那条要看执行顺序的脸色。产物是生成物、不进 git。
 */

export const PROBE_DIR = path.resolve('src/views/page/codegen/probe')

/** 相对路径（posix 分隔，和 import.meta.glob 的口径一致）→ 正文 */
export type ProbeSnapshot = Map<string, string>

export function snapshotProbe(): ProbeSnapshot {
  const out: ProbeSnapshot = new Map()
  if (!fs.existsSync(PROBE_DIR)) return out
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.isFile()) {
        out.set(path.relative(PROBE_DIR, abs).split(path.sep).join('/'), fs.readFileSync(abs, 'utf8'))
      }
    }
  }
  walk(PROBE_DIR)
  return out
}

/** 回到快照那一刻：多出来的删掉，改过正文的写回去 */
export function restoreProbe(before: ProbeSnapshot): void {
  for (const name of snapshotProbe().keys()) {
    if (!before.has(name)) fs.rmSync(path.join(PROBE_DIR, name))
  }
  for (const [name, text] of before) {
    const abs = path.join(PROBE_DIR, name)
    if (fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') === text) continue
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, text)
  }
}
