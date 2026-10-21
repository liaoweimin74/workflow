// ----- dash-filter 广播 setFilter 联动（spike 10）-----
// 运行期事实（PageRendererPage.vue）：
//   · dash 数据组件与 page-data-container 挂载后 emit('ready', { setFilter, refresh })，
//     渲染器把实例收进 dashInstances（:263-278、:505-549）；
//   · dash-filter 变更时遍历 dashInstances 调 setFilter({ [field]: value === null ? null : {op, value} })
//     （:530-540 的 filterChange 处理器 + :267-278 的广播函数）。
// 产物没有渲染器这层，过去整类只登记得出配置、登记不出联动（autoBroadcast 记语义债）。
// 这里把实例表与广播函数出进产物，编译期按契约接线；autoBroadcast=false 不接监听。
// 跑：npx vitest run src/views/page/codegen/__tests__/dash-filter-broadcast.test.ts

import { describe, expect, it } from 'vitest'

import { TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import dcPage from './fixtures/corpus/tmp_data_container_verify.json'
import todoPage from './fixtures/corpus/tmp_dash_todo_verify.json'
import noticePage from './fixtures/corpus/tmp_notice_verify.json'

function run(schema: Record<string, any>, key: string) {
  const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'dash-filter-broadcast' })
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  const rev = reverseToSchema(schema as any, gen.files[vue], gen.manifest)
  return {
    source: gen.files[vue],
    manifest: gen.manifest,
    holes: rev.holes,
    badRenames: rev.renameChecks.filter((r) => !r.ok),
  }
}

describe('dash-filter 广播联动出码', () => {
  it('filter + dash 数据组件：实例表与广播函数进产物，两处接线各就各位', () => {
    const { source, manifest, holes, badRenames } = run(todoPage, 'tmp_dash_todo_verify')
    expect(source).toContain('const dashInstances = new Set<any>()')
    expect(source).toContain('function onDashReady(instance: any)')
    expect(source).toContain('function onFilterChange(payload: { field: string; op: string; value: unknown })')
    expect(source).toContain('@filter-change="onFilterChange"')
    expect(source).toContain('@ready="onDashReady"')
    // 值语义与渲染器一致：null = 清除该字段条件，其余包成 { op, value }
    expect(source).toContain(
      '{ [payload.field]: payload.value === null ? null : { op: payload.op, value: payload.value } }',
    )
    // 这条债本来记在 unsupported 上，接线出码后必须清零
    expect(manifest.unsupported, JSON.stringify(manifest.unsupported)).toEqual([])
    expect(holes, JSON.stringify(holes)).toEqual([])
    expect(badRenames, JSON.stringify(badRenames)).toEqual([])
  })

  it('事件绑定进归属登记：回读剥离，不报多造', () => {
    const { manifest } = run(todoPage, 'tmp_dash_todo_verify')
    const filter = manifest.nodes.find((n) => n.type === 'dash-filter')!
    expect(filter.wireOnly).toContain('on.filterChange')
    const todo = manifest.nodes.find((n) => n.type === 'dash-todo')!
    expect(todo.wireOnly).toContain('on.ready')
  })

  it('数据容器同样是广播目标（暴露 ready/setFilter）：两个容器都接 ready', () => {
    const { source, holes } = run(dcPage, 'tmp_data_container_verify')
    expect(source.match(/@ready="onDashReady"/g)).toHaveLength(2)
    expect(source).toContain('@filter-change="onFilterChange"')
    expect(holes, JSON.stringify(holes)).toEqual([])
  })

  it('autoBroadcast=false 不接 filter-change：开关真能关掉广播，回读仍还原 false', () => {
    const schema = JSON.parse(JSON.stringify(todoPage))
    schema.rule[0].props.autoBroadcast = false
    const { source, holes, badRenames } = run(schema, 'tmp_dash_todo_verify')
    expect(source).not.toContain('@filter-change=')
    expect(source).not.toContain('function onFilterChange')
    expect(source).not.toContain('const dashInstances')
    expect(source).toContain(':auto-broadcast="false"')
    expect(holes, JSON.stringify(holes)).toEqual([])
    expect(badRenames, JSON.stringify(badRenames)).toEqual([])
  })

  it('无 filter 的页面不产广播死代码', () => {
    const schema = JSON.parse(JSON.stringify(noticePage))
    schema.rule = schema.rule.filter((n: any) => n.type !== 'dash-filter')
    const { source } = run(schema, 'tmp_notice_verify')
    expect(source).not.toContain('dashInstances')
    expect(source).not.toContain('onDashReady')
  })

  it('契约按组件能力表态：filter 是 source，数据组件与数据容器是 target', () => {
    expect(TYPE_CONTRACTS['dash-filter'].dashFilter).toBe('source')
    for (const t of ['dash-kpi', 'dash-chart', 'dash-notice', 'dash-todo', 'page-data-container']) {
      expect(TYPE_CONTRACTS[t].dashFilter, `${t} 不参与广播`).toBe('target')
    }
  })
})
