// ----- TDD: QueryColumnsConfig 查询条件 + 展示列 合并单表配置 -----
// npx vitest run src/views/page/components/__tests__/QueryColumnsConfig.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import QueryColumnsConfig from '../QueryColumnsConfig.vue'
import ColumnAdvancedConfig from '../ColumnAdvancedConfig.vue'

const candidates = [
  { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 50, indexed: true, hidden: false },
  { key: 'age', label: '年龄', columnType: 'INT', length: null, indexed: true, hidden: false },
  { key: 'content', label: '内容', columnType: 'TEXT', length: null, indexed: false, hidden: false },
  { key: 'remark_hidden', label: '隐藏备注', columnType: 'VARCHAR', length: 50, indexed: false, hidden: true },
]

// 父组件（ViewDesigner）已过滤隐藏列/不可筛选列，此处模拟过滤后的候选
const visibleCandidates = candidates.filter((c) => !c.hidden)

function createWrapper(searchFields: any[] = [], columns: any[] = []) {
  return mount(QueryColumnsConfig, {
    props: { candidates: visibleCandidates, searchFields, columns },
    global: { plugins: [ElementPlus] },
  })
}

describe('QueryColumnsConfig — 单表同时配置查询条件与展示列', () => {
  it('表格渲染所有候选列（每行一个字段）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const rows = wrapper.findAll('.el-table__row')
    expect(rows.length).toBe(visibleCandidates.length)
    // 表格含查询/展示列头
    expect(wrapper.find('.el-table').exists()).toBe(true)
    wrapper.unmount()
  })

  it('勾选查询条件 → update:searchFields 收到 {key,label,matchType}', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.toggleSearch(candidates[0], true)
    await nextTick()
    const emitted = wrapper.emitted('update:searchFields') as any[]
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0]).toEqual([
      { key: 'name', label: '姓名', matchType: 'eq' },
    ])
    wrapper.unmount()
  })

  it('勾选展示列 → update:columns 收到 {key,label,width,align}', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.toggleColumn(candidates[0], true)
    await nextTick()
    const emitted = wrapper.emitted('update:columns') as any[]
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0]).toEqual([
      { key: 'name', label: '姓名', width: 130, align: 'left' },
    ])
    wrapper.unmount()
  })

  it('查询条件修改匹配方式 → 更新 searchFields 对应项', async () => {
    const wrapper = createWrapper([{ key: 'name', label: '姓名', matchType: 'eq' }], [])
    await nextTick()
    const vm = wrapper.vm as any
    vm.setSearchMatchType('name', 'like')
    await nextTick()
    const emitted = wrapper.emitted('update:searchFields') as any[]
    expect(emitted[emitted.length - 1][0]).toEqual([
      { key: 'name', label: '姓名', matchType: 'like' },
    ])
    wrapper.unmount()
  })

  it('展示列修改宽度/对齐 → 更新 columns 对应项（逐次 emit）', async () => {
    const wrapper = createWrapper(
      [],
      [{ key: 'name', label: '姓名', width: 130, align: 'left' }],
    )
    await nextTick()
    const vm = wrapper.vm as any
    vm.setColumnProp('name', 'width', 200)
    await nextTick()
    let emitted = wrapper.emitted('update:columns') as any[]
    expect(emitted[emitted.length - 1][0]).toEqual([
      { key: 'name', label: '姓名', width: 200, align: 'left' },
    ])

    vm.setColumnProp('name', 'align', 'center')
    await nextTick()
    emitted = wrapper.emitted('update:columns') as any[]
    expect(emitted[emitted.length - 1][0][0].align).toBe('center')
    expect(emitted[emitted.length - 1][0][0].width).toBe(130)
    wrapper.unmount()
  })

  it('取消查询勾选 → 从 searchFields 移除', async () => {
    const wrapper = createWrapper([{ key: 'name', label: '姓名', matchType: 'eq' }], [])
    await nextTick()
    const vm = wrapper.vm as any
    vm.toggleSearch(candidates[0], false)
    await nextTick()
    const emitted = wrapper.emitted('update:searchFields') as any[]
    expect(emitted[emitted.length - 1][0]).toEqual([])
    wrapper.unmount()
  })

  it('同字段可同时勾选查询与展示（互不干扰）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.toggleSearch(candidates[0], true)
    vm.toggleColumn(candidates[0], true)
    await nextTick()
    const searchEmit = (wrapper.emitted('update:searchFields') as any[]).slice(-1)[0][0]
    const colEmit = (wrapper.emitted('update:columns') as any[]).slice(-1)[0][0]
    expect(searchEmit).toHaveLength(1)
    expect(colEmit).toHaveLength(1)
    expect(searchEmit[0].key).toBe('name')
    expect(colEmit[0].key).toBe('name')
    wrapper.unmount()
  })

  it('filterableKeys 之外的列：查询勾选禁用（isFilterable=false），展示不受限', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [],
        filterableKeys: new Set(['name']),
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    // name 可筛选；content（TEXT）不可筛选
    expect(vm.isFilterable('name')).toBe(true)
    expect(vm.isFilterable('content')).toBe(false)
    // 不可筛选字段即使调用 toggleSearch 也不加入 searchFields
    vm.toggleSearch(candidates[2], true) // content
    await nextTick()
    expect(wrapper.emitted('update:searchFields')).toBeUndefined()
    // 但展示列不受限制
    vm.toggleColumn(candidates[2], true)
    await nextTick()
    const colEmit = (wrapper.emitted('update:columns') as any[]).slice(-1)[0][0]
    expect(colEmit[0].key).toBe('content')
    wrapper.unmount()
  })

  it('filterableKeys 未配置时全部可筛选（默认行为）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.isFilterable('content')).toBe(true)
    wrapper.unmount()
  })
})

// ============================================================
// 可排序字段配置（B1：视图级收窄，候选受数据源 metadata 上限约束）
// ============================================================

describe('QueryColumnsConfig — 可排序字段配置', () => {
  const sortableCandidates = [
    { key: 'name', label: '姓名' },
    { key: 'age', label: '年龄' },
  ]

  it('渲染可排序字段多选，候选仅含数据源可排字段', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [],
        sortableFields: ['name'],
        sortableCandidates,
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()

    // 候选区渲染（数据源不可排字段 content 不在候选中；选项由 ViewDesigner 侧过滤保证）
    expect(wrapper.find('.sortable-config').exists()).toBe(true)
    expect(wrapper.find('.sortable-config .el-select').exists()).toBe(true)
    wrapper.unmount()
  })

  it('修改选择 → emit update:sortableFields', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [],
        sortableFields: ['name'],
        sortableCandidates,
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    // sortable-config 内的 ElSelect 触发 change（等价于多选变更）
    const select = wrapper.find('.sortable-config').findComponent({ name: 'ElSelect' })
    expect(select.exists()).toBe(true)
    ;(select.vm as any).$emit('change', ['age'])
    await nextTick()
    const emitted = wrapper.emitted('update:sortableFields') as any[]
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0]).toEqual(['age'])
    wrapper.unmount()
  })

  it('无候选时不渲染可排序字段配置区', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [],
        sortableCandidates: [],
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    expect(wrapper.find('.sortable-config').exists()).toBe(false)
    wrapper.unmount()
  })
})

// ============================================================
// 列高级配置子面板（Task 7：template/expression/className/styleExpr/onCellClick）
// ============================================================

describe('QueryColumnsConfig — 列高级配置子面板', () => {
  it('对话框组件已挂载，且初始不可见', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: { candidates: visibleCandidates, searchFields: [], columns: [{ key: 'name', label: '姓名', width: 130, align: 'left' }] },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    expect((wrapper.vm as any).advancedVisible).toBe(false)
    // 子面板组件存在（el-dialog 包裹于其中）
    expect(wrapper.findComponent({ name: 'ElDialog' }).exists()).toBe(true)
    wrapper.unmount()
  })

  it('openAdvanced 打开对话框并填充列副本', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [{ key: 'name', label: '姓名', width: 130, align: 'left', template: '${name}' }],
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.openAdvanced('name')
    await nextTick()
    expect(vm.advancedVisible).toBe(true)
    expect(vm.advancedColumn.key).toBe('name')
    expect(vm.advancedColumn.template).toBe('${name}')
    wrapper.unmount()
  })

  it('saveAdvanced 写回高级字段且不覆盖基础字段（width/align）', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [
          { key: 'name', label: '姓名', width: 200, align: 'center', template: '${name}' },
          { key: 'age', label: '年龄', width: 130, align: 'left' },
        ],
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.saveAdvanced({
      key: 'name',
      template: '${name} (${age})',
      expression: '$row.age > 18 ? "成年" : "未成年"',
      className: 'col-red',
      styleExpr: "$row.age > 30 ? 'color:red' : ''",
      onCellClick: { actions: [{ type: 'script', params: [] }] },
    })
    await nextTick()
    const emitted = wrapper.emitted('update:columns') as any[]
    const cols = emitted[emitted.length - 1][0]
    const name = cols.find((c: any) => c.key === 'name')
    expect(name.template).toBe('${name} (${age})')
    expect(name.expression).toBe('$row.age > 18 ? "成年" : "未成年"')
    expect(name.className).toBe('col-red')
    expect(name.styleExpr).toBe("$row.age > 30 ? 'color:red' : ''")
    expect(name.onCellClick).toEqual({ actions: [{ type: 'script', params: [] }] })
    // 基础字段不受影响
    expect(name.width).toBe(200)
    expect(name.align).toBe('center')
    wrapper.unmount()
  })
})

// ============================================================
// 添加自定义列（Task 7 补充：key 不必是数据源字段，可生成计算列）
// ============================================================

describe('QueryColumnsConfig — 添加自定义列', () => {
  it('openCustomColumn 打开弹窗并清空输入', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: { candidates: visibleCandidates, searchFields: [], columns: [] },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.customKey = 'total'
    vm.customLabel = '合计'
    vm.openCustomColumn()
    await nextTick()
    expect(vm.customVisible).toBe(true)
    expect(vm.customKey).toBe('')
    expect(vm.customLabel).toBe('')
    wrapper.unmount()
  })

  it('addCustomColumn 追加自定义列到 columns（key/label/width/align）', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: { candidates: visibleCandidates, searchFields: [], columns: [{ key: 'name', label: '姓名', width: 130, align: 'left' }] },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.customVisible = true
    vm.customKey = 'total'
    vm.customLabel = '合计'
    vm.addCustomColumn()
    await nextTick()
    const emitted = wrapper.emitted('update:columns') as any[]
    const cols = emitted[emitted.length - 1][0]
    expect(cols).toHaveLength(2)
    const total = cols.find((c: any) => c.key === 'total')
    expect(total).toEqual({ key: 'total', label: '合计', width: 130, align: 'left', custom: true })
    expect(vm.customVisible).toBe(false)
    wrapper.unmount()
  })

  it('addCustomColumn key 为空/重复时不 emit 并提示错误', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: { candidates: visibleCandidates, searchFields: [], columns: [{ key: 'name', label: '姓名', width: 130, align: 'left' }] },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    // key 为空
    vm.customKey = '   '
    vm.addCustomColumn()
    await nextTick()
    expect(wrapper.emitted('update:columns')).toBeUndefined()
    expect(vm.customKeyError).toBe('列标识不能为空')
    // key 重复
    vm.customKey = 'name'
    vm.addCustomColumn()
    await nextTick()
    expect(wrapper.emitted('update:columns')).toBeUndefined()
    expect(vm.customKeyError).toContain('已存在')
    wrapper.unmount()
  })

  it('自定义列出现在下方字段列表（displayCandidates 派生自 columns），且查询勾选禁用', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [
          { key: 'name', label: '姓名', width: 130, align: 'left' },
          { key: 'total', label: '合计', width: 130, align: 'left' },
        ],
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    // displayCandidates = 数据源候选 + 自定义列（total）
    expect(vm.displayCandidates.map((c: any) => c.key)).toEqual(['name', 'age', 'content', 'total'])
    // el-table 渲染 4 行（含自定义列 total）
    expect(wrapper.findAll('.el-table__row').length).toBe(4)
    // 自定义列可识别，且不可作为查询条件（计算列）
    expect(vm.isCustomColumn('total')).toBe(true)
    expect(vm.isCustomColumn('age')).toBe(false)
    expect(vm.isFilterable('total')).toBe(false)
    expect(vm.isFilterable('age')).toBe(true)
    wrapper.unmount()
  })

  it('removeCustomColumn 从展示列与查询条件移除自定义列', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [{ key: 'total', label: '合计', matchType: 'eq' }],
        columns: [
          { key: 'name', label: '姓名', width: 130, align: 'left' },
          { key: 'total', label: '合计', width: 130, align: 'left' },
        ],
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.removeCustomColumn('total')
    await nextTick()
    const colEmit = (wrapper.emitted('update:columns') as any[]).slice(-1)[0][0]
    expect(colEmit.map((c: any) => c.key)).toEqual(['name'])
    const searchEmit = (wrapper.emitted('update:searchFields') as any[]).slice(-1)[0][0]
    expect(searchEmit).toEqual([])
    wrapper.unmount()
  })

  it('自定义列取消展示 → 置 hidden 而非从 columns 删除（展示开关与删除隔离）', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [
          { key: 'name', label: '姓名', width: 130, align: 'left' },
          { key: 'total', label: '合计', width: 130, align: 'left', custom: true },
        ],
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.toggleColumn({ key: 'total', label: '合计', columnType: 'VARCHAR' } as any, false)
    await nextTick()
    const cols = (wrapper.emitted('update:columns') as any[]).slice(-1)[0][0]
    // total 仍保留在 columns，仅 hidden:true（未被删除）
    expect(cols.map((c: any) => c.key)).toEqual(['name', 'total'])
    expect(cols.find((c: any) => c.key === 'total').hidden).toBe(true)
    // 父组件回传后：展示未勾选，但仍出现在下方字段列表（可重新勾选或删除）
    await wrapper.setProps({ columns: cols })
    await nextTick()
    expect(vm.isColumnChecked('total')).toBe(false)
    expect(vm.displayCandidates.map((c: any) => c.key)).toContain('total')
    wrapper.unmount()
  })

  it('自定义列重新勾选展示 → hidden 置 false', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [
          { key: 'total', label: '合计', width: 130, align: 'left', custom: true, hidden: true },
        ],
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.isColumnChecked('total')).toBe(false)
    vm.toggleColumn({ key: 'total', label: '合计', columnType: 'VARCHAR' } as any, true)
    await nextTick()
    const cols = (wrapper.emitted('update:columns') as any[]).slice(-1)[0][0]
    expect(cols.find((c: any) => c.key === 'total').hidden).toBe(false)
    // 父组件回传后展示勾选恢复
    await wrapper.setProps({ columns: cols })
    await nextTick()
    expect(vm.isColumnChecked('total')).toBe(true)
    wrapper.unmount()
  })
})

describe('QueryColumnsConfig — 卡片模式扩展', () => {
  it('card mode 保留共享查询/展示/排序能力并显示卡片字段入口', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [{ key: 'name', label: '姓名', matchType: 'like' }],
        columns: [{ key: 'name', label: '姓名', width: 200, align: 'center', formatter: 'date' }],
        mode: 'card',
        sortableFields: ['name'],
        sortableCandidates: [{ key: 'name', label: '姓名' }],
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.isSearchChecked('name')).toBe(true)
    expect(vm.isColumnChecked('name')).toBe(true)
    expect(vm.columnWidthOf('name')).toBe(200)
    expect(vm.columnAlignOf('name')).toBe('center')
    expect(wrapper.find('.sortable-config').exists()).toBe(true)
    // 合并组件（含表格与卡片设置）始终挂载，card mode 传 mode='card'
    const adv = wrapper.findComponent(ColumnAdvancedConfig)
    expect(adv.exists()).toBe(true)
    expect(adv.props('mode')).toBe('card')
    wrapper.unmount()
  })

  it('card mode 保存高级字段时写回卡片配置与基础配置且保持基础字段', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [{ key: 'name', label: '姓名', width: 200, align: 'center' }],
        mode: 'card',
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    ;(wrapper.vm as any).saveAdvanced({
      key: 'name',
      role: 'title',
       align: 'right',
       valueType: 'currency',
       fontFamily: 'Microsoft YaHei',
       fontSize: 18,
       fontWeight: 700,
       fontColor: '#409eff',
       showLabel: false,
       labelPosition: 'top',
       style: 'color: #409eff;',
       contentType: 'template',
       contentValue: '${name}',
       className: 'col-red',
       styleExpr: "$row.age > 30 ? 'color:red' : ''",
    })
    await nextTick()
    const emitted = wrapper.emitted('update:columns') as any[]
    const name = emitted[emitted.length - 1][0][0]
     expect(name).toMatchObject({ role: 'title', align: 'right', valueType: 'currency', fontFamily: 'Microsoft YaHei', fontSize: 18, fontWeight: 700, fontColor: '#409eff', showLabel: false, labelPosition: 'top', style: 'color: #409eff;' })
    // 基础设置（表格高级配置）字段一并写回
    expect(name.contentType).toBe('template')
    expect(name.contentValue).toBe('${name}')
    expect(name.className).toBe('col-red')
    expect(name.styleExpr).toBe("$row.age > 30 ? 'color:red' : ''")
    expect(name.width).toBe(200)
    expect(JSON.parse(JSON.stringify(name))).toEqual(name)
    wrapper.unmount()
  })
})

describe('ColumnAdvancedConfig — 合并基础设置 + 卡片配置', () => {
  it('table mode 仅显示「基础设置」页签', async () => {
    const wrapper = mount(ColumnAdvancedConfig, {
      props: {
        visible: true,
        column: { key: 'name', label: '姓名', width: 130, align: 'left' },
        mode: 'table',
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const tabs = wrapper.findAll('.el-tabs__item')
    expect(tabs.map((t) => t.text())).toEqual(['基础设置'])
    expect(wrapper.find('.card-column-advanced-config').exists()).toBe(false)
    wrapper.unmount()
  })

  it('card mode 显示「基础设置」+「卡片配置」双页签且卡片配置项齐全', async () => {
    const wrapper = mount(ColumnAdvancedConfig, {
      props: {
        visible: true,
        column: { key: 'name', label: '姓名', width: 130, align: 'left' },
        mode: 'card',
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const tabs = wrapper.findAll('.el-tabs__item')
    expect(tabs.map((t) => t.text())).toEqual(['基础设置', '卡片配置'])
    // 卡片配置页签内容存在（角色/颜色/显示标签/标签位置/样式语法）
    expect(wrapper.text()).toContain('角色')
    expect(wrapper.text()).toContain('显示标签')
    expect(wrapper.text()).toContain('标签位置')
    expect(wrapper.text()).toContain('样式语法')
    wrapper.unmount()
  })

  it('保存时以可序列化对象同时写回卡片字段', async () => {
    const wrapper = mount(ColumnAdvancedConfig, {
      props: {
        visible: true,
        column: { key: 'name', label: '姓名', width: 130, align: 'left' },
        mode: 'card',
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
     ;(wrapper.vm as any).patch({ role: 'metric', valueType: 'number', align: 'center', fontSize: 20, fontWeight: 700, fontColor: '#67c23a', showLabel: false, labelPosition: 'top', style: 'color: #67c23a;' })
    ;(wrapper.vm as any).handleSave()
    const saved = (wrapper.emitted('save') as any[])[0][0]
     expect(saved).toMatchObject({ role: 'metric', valueType: 'number', align: 'center', fontSize: 20, fontWeight: 700, fontColor: '#67c23a', showLabel: false, labelPosition: 'top', style: 'color: #67c23a;' })
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved)
    wrapper.unmount()
  })
})
