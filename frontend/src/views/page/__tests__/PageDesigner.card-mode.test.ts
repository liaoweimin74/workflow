import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('PageDesigner card data-source entry', () => {
  it('passes the active list mode instead of forcing table mode', () => {
    const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

    expect(source).toContain(':list-mode="currentPageListMode"')
    expect(source).toContain("designerRef.value?.activeRule?.type === 'page-list-cards' ? 'card' : 'table'")
    expect(source).not.toContain(':table-mode="true"')
  })

  it('writes the page dataSources into the module binding store on load and on update', () => {
    const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

    // 设计态必须主动填充 activeDsBindings，否则卡片/数据组件依赖运行态残留才解析出 refId
    // （"先开运行页再开设计页才有数据"），与 PageRendererPage.load 的写入对称。
    expect(source).toContain("import { setActiveDsBindings } from '@/utils/formDsBindingsStore'")
    // load() 解析 schema 后立即写入本页 dataSources
    expect(source).toContain('setActiveDsBindings(schema.dataSources as any)')
    // 数据源配置变更时同步写入，reactive 生效触发组件重新取数
    expect(source).toContain('setActiveDsBindings(newDataSources as any)')
  })
})
