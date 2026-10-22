/**
 * 出码验证台的取数层（只被 dev-only 的验证台用到）。
 *
 * 两本 glob：
 *  · 仓库语料 `__tests__/fixtures/corpus/*.json` —— 体检测试用的那 12 页，不依赖后端就能出报告；
 *  · 磁盘产物 `probe/**` —— 真机探测用的产物（生成物，不进 git）。产物键与 `generatePage` 返回的
 *    `files` 键同一坐标系（去掉 `./probe/` 前缀，如 `CardlistTest.vue`、`api/cardlist-test.ts`），
 *    所以「磁盘这份和本次生成的是不是同一份」能逐字节比出来，不用另起一套命名。
 *
 * 磁盘那本必须容错：probe/ 目录可能是空的（新克隆、或还没跑过落盘脚本），这时答案是「没有」，
 * 而不是抛异常——验证台要能把这个事实讲给人听。
 */

import type { RouteComponent } from 'vue-router'

const PROBE_PREFIX = './probe/'

const corpusModules = import.meta.glob<any>('./__tests__/fixtures/corpus/*.json', { eager: true, import: 'default' })
const probeComponents = import.meta.glob<RouteComponent>('./probe/*.vue')
const probeRaw = import.meta.glob<string>('./probe/**/*.{vue,ts}', { query: '?raw', import: 'default' })

/** 语料页名清单（去掉目录与 .json），下拉候选就来自这里 */
export const CORPUS_KEYS = Object.keys(corpusModules)
  .map((p) => p.split('/').pop()!.replace(/\.json$/, ''))
  .sort()

/** 取语料 schema；页名不在语料里就返回 undefined，由调用方报错 */
export function corpusSchemaOf(pageKey: string): any {
  return corpusModules[`./__tests__/fixtures/corpus/${pageKey}.json`]
}

const componentLoaders: Record<string, () => Promise<RouteComponent>> = {}
for (const [path, load] of Object.entries(probeComponents)) componentLoaders[path.slice(PROBE_PREFIX.length)] = load

const textLoaders: Record<string, () => Promise<string>> = {}
for (const [path, load] of Object.entries(probeRaw)) {
  if (path.startsWith(PROBE_PREFIX)) textLoaders[path.slice(PROBE_PREFIX.length)] = load
}

/** 按 generatePage 的文件名读磁盘上那份文本；没落盘的返回 undefined */
export async function probeTextsOf(names: string[]): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {}
  await Promise.all(
    names.map(async (name) => {
      const load = textLoaders[name]
      out[name] = load ? await load() : undefined
    }),
  )
  return out
}

/** 挂到对照面板里的产物组件：磁盘上没有这个文件就给 undefined（面板会说明怎么落盘） */
export async function probeComponentOf(name: string): Promise<RouteComponent | undefined> {
  const load = componentLoaders[name]
  if (!load) return undefined
  const mod = await load()
  return ((mod as any)?.default ?? mod) as RouteComponent
}

/**
 * 磁盘与本次生成的差异文件名：缺文件与内容不同都算差异（缺文件更要说，那是根本没落盘）。
 * 磁盘上多出来的文件不点名——对照只比这一页的产物。
 */
export function mismatchedFiles(
  generated: Record<string, string>,
  disk: Record<string, string | undefined>,
): string[] {
  return Object.keys(generated).filter((name) => disk[name] !== generated[name])
}
