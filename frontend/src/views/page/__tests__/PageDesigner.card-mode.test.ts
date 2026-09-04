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

  it('registers page-list-cards on the designer form-create so the card renders in canvas', () => {
    const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

    // 缺 this registration 时 fc-designer 画布会把 page-list-cards 渲染为空壳自定义标签
    // （无 PageDataCards DOM），既不发 getMetadata 也不发 queryData，卡片永不显示。
    // 与 page-table/page-tree 的 FcDesigner.component 注册对称。
    expect(source).toContain("import PageDataCards from './components/PageDataCards.vue'")
    expect(source).toContain("FcDesigner.component('page-list-cards', PageDataCards)")
  })

  it('FormDesigner exposes the same data-source configuration entry for page-list-cards', () => {
    const source = readFileSync(resolve(__dirname, '../../form/FormDesigner.vue'), 'utf8')

    expect(source).toContain("setComponentRuleConfig(\n    'page-list-cards'")
    expect(source).toContain("on: { click: () => openTableDsConfig() }")
  })

  it('business-form column mapping ignores page-list-cards instead of marking it unsupported', () => {
    const source = readFileSync(resolve(__dirname, '../../form/components/ColumnConfigDialog.vue'), 'utf8')

    expect(source).toContain("type === 'formContainer' || type === 'page-table' || type === 'page-list-cards'")
  })

  it('marks page-table as design mode so it clamps to ≤10 rows and refetches on switch', () => {
    const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

    // enableCardDesignMode 需对 page-table 也注入 designMode:true，
    // 否则 PageDataTable 收不到标记，设计态取数不受 ≤10 限制、且无法区分运行态分页。
    expect(source).toContain("if (next.type === 'page-list-cards' || next.type === 'page-table')")
    expect(source).toContain('designMode: true')
  })

  it('keeps an empty groupBy value in the card confirmation payload so clearing persists', () => {
    const source = readFileSync(resolve(__dirname, '../../form/components/DsBindingConfigDialog.vue'), 'utf8')

    expect(source).toContain("result.groupBy = tableData.groupBy")
    expect(source).not.toContain("if (effectiveListMode.value === 'card' && tableData.groupBy) result.groupBy")
  })
})
