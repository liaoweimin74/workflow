/**
 * 数据容器（page-data-container）的规则形态契约。
 *
 * 一个组件三种形状，必须各自明确：
 *   画布态 fcRow —— 借 form-create 的行容器形态获得「拖入子组件」能力
 *     （设计器的可拖入判定读的是节点 children 数组，见 @form-create/designer 的 FcTree
 *      canDropInner 与 _menu.inside 分支；formContainer 走的就是这条路）。
 *   保存态 page-data-container + props.rule —— 落到页面 schema 里的稳定形状，
 *     子规则收在 props.rule，不裸挂 children。
 *   运行态 page-data-container + props.childRules + children 空 —— 子级改由容器自己
 *     起内嵌 form-create 渲染，主树不再递归进来。这是作用域插值能生效的前提：
 *     数据到达后只有容器自己能决定重渲染自己的子树，主树整棵重建会把其他组件重新取数。
 */
import { describe, it, expect } from 'vitest'
import {
  PAGE_DATA_CONTAINER_NAME,
  collectDataContainerTargets,
  loadDataContainerRule,
  normalizeDataContainerForRender,
  pageDataContainerRule,
  saveDataContainerRule,
} from '../dataContainer'

describe('pageDataContainerRule：画布态', () => {
  it('是 fcRow 行容器，children 为空数组（拖入判定看的就是这个数组）', () => {
    const rule = pageDataContainerRule()
    expect(rule.type).toBe('fcRow')
    expect(rule.children).toEqual([])
  })

  it('props 默认齐备：列表形态、20 条、未绑数据源', () => {
    const props = pageDataContainerRule().props
    expect(props).toMatchObject({
      title: '数据容器',
      dataSourceId: '',
      queryMode: 'list',
      pageSize: 20,
      span: 24,
      height: '',
      designMode: true,
    })
  })

  it('每次产出独立 field，两个容器不会撞地址', () => {
    expect(pageDataContainerRule().field).not.toBe(pageDataContainerRule().field)
  })
})

describe('保存态 ↔ 画布态往返', () => {
  it('saveDataContainerRule：fcRow + children 收进 props.rule，类型落到自有类型', () => {
    const canvas = pageDataContainerRule()
    canvas.children = [{ type: 'el-text', title: '共 {rows.length} 条' }]
    canvas.props.dataSourceId = 'ds-1'

    saveDataContainerRule(canvas)
    expect(canvas.type).toBe(PAGE_DATA_CONTAINER_NAME)
    expect(canvas.props.rule).toEqual([{ type: 'el-text', title: '共 {rows.length} 条' }])
    expect(canvas.children).toBeUndefined()
    expect(canvas.props.dataSourceId).toBe('ds-1')
  })

  it('loadDataContainerRule：保存态还原成可拖入的行容器', () => {
    const saved = {
      type: PAGE_DATA_CONTAINER_NAME,
      field: 'dc1',
      props: { dataSourceId: 'ds-1', rule: [{ type: 'el-text', title: '{row.amount}' }] },
    }
    loadDataContainerRule(saved)
    expect(saved.type).toBe('fcRow')
    expect(saved.children).toEqual([{ type: 'el-text', title: '{row.amount}' }])
    expect(saved.props.rule).toBeUndefined()
    expect(saved.field).toBe('dc1')
  })

  it('往返保真：子规则与容器配置都不丢', () => {
    const original = pageDataContainerRule()
    const childRules = [
      { type: 'dash-todo', field: 't1', props: { title: '待办' } },
      { type: 'el-text', title: '{rows[0].name}' },
    ]
    original.children = childRules
    original.props.dataSourceId = 'ds-9'
    original.props.queryMode = 'single'

    saveDataContainerRule(original)
    const reloaded = JSON.parse(JSON.stringify(original))
    loadDataContainerRule(reloaded)
    expect(reloaded.children).toEqual(childRules)
    expect(reloaded.props.dataSourceId).toBe('ds-9')
    expect(reloaded.props.queryMode).toBe('single')
  })

  it('空容器与缺 props.rule 的历史数据不炸', () => {
    const empty = pageDataContainerRule()
    saveDataContainerRule(empty)
    expect(empty.props.rule).toEqual([])
    const legacy = { type: PAGE_DATA_CONTAINER_NAME, props: {} }
    loadDataContainerRule(legacy)
    expect(legacy.children).toEqual([])
  })

  it('钩子原地改写：设计器只用副作用、不看返回值（返回副本会让保存态停在 fcRow）', () => {
    const canvas = pageDataContainerRule()
    canvas.children = [{ type: 'el-text', title: 'a' }]
    expect(saveDataContainerRule(canvas) as unknown).toBeUndefined()
    expect(canvas.type).toBe(PAGE_DATA_CONTAINER_NAME)
    expect(canvas.props.rule).toHaveLength(1)

    expect(loadDataContainerRule(canvas) as unknown).toBeUndefined()
    expect(canvas.type).toBe('fcRow')
    expect(canvas.children).toHaveLength(1)
  })
})

describe('normalizeDataContainerForRender：运行态', () => {
  it('子规则交给容器自己渲染：props.childRules 有值、children 清空、类型不变', () => {
    const saved = {
      type: PAGE_DATA_CONTAINER_NAME,
      field: 'dc1',
      title: '数据容器',
      props: { dataSourceId: 'ds-1', rule: [{ type: 'el-text', title: '{row.amount}' }] },
      children: [{ type: 'ghost' }],
    }
    const out = normalizeDataContainerForRender(saved)
    expect(out.type).toBe(PAGE_DATA_CONTAINER_NAME)
    expect(out.props.childRules).toEqual([{ type: 'el-text', title: '{row.amount}' }])
    expect(out.children).toEqual([])
    expect(out.props.rule).toBeUndefined()
  })

  it('没有子规则时 childRules 是空数组（组件据此出占位提示，不能是 undefined）', () => {
    const out = normalizeDataContainerForRender({ type: PAGE_DATA_CONTAINER_NAME, props: {} })
    expect(out.props.childRules).toEqual([])
  })

  it('不改入参：页面主树的规则对象不能被运行期改写', () => {
    const saved = {
      type: PAGE_DATA_CONTAINER_NAME,
      props: { rule: [{ type: 'el-text', title: 'x' }] },
      children: [],
    }
    normalizeDataContainerForRender(saved)
    expect(saved.props.rule).toBeDefined()
    expect((saved.props as { childRules?: unknown }).childRules).toBeUndefined()
  })
})

describe('collectDataContainerTargets：容器地址候选', () => {
  // 容器实例在运行态只按 dataSourceId 进 componentRefs，而同一个数据源常被表格/KPI 一起绑着，
  // 谁最后挂载谁占位（实测 refresh 打到了内嵌 KPI，两个容器毫无反应）。所以动作总线需要一个
  // 只属于容器的地址——沿用联动容器已落地的口径：地址 = rule.field。
  it('产出 field 地址与显示名，未绑数据源的容器不进候选（它没有可刷新的数据）', () => {
    const rules = [
      { type: PAGE_DATA_CONTAINER_NAME, field: 'dcA', title: '客户概览', props: { dataSourceId: 'ds-1' } },
      { type: PAGE_DATA_CONTAINER_NAME, field: 'dcB', title: '没绑源', props: { dataSourceId: '' } },
    ]
    expect(collectDataContainerTargets(rules)).toEqual([{ field: 'dcA', title: '客户概览', dataSourceId: 'ds-1' }])
  })

  it('穿透布局容器与保存态子规则：嵌在栅格行里、或套在另一个容器里的都要收到', () => {
    const rules = [
      { type: 'fcRow', children: [{ type: PAGE_DATA_CONTAINER_NAME, field: 'dcC', title: '行内', props: { dataSourceId: 'ds-2' } }] },
      {
        type: PAGE_DATA_CONTAINER_NAME,
        field: 'dcOuter',
        title: '外层',
        props: { dataSourceId: 'ds-3', rule: [{ type: PAGE_DATA_CONTAINER_NAME, field: 'dcInner', title: '内层', props: { dataSourceId: 'ds-3' } }] },
      },
    ]
    expect(collectDataContainerTargets(rules).map((c) => c.field)).toEqual(['dcC', 'dcOuter', 'dcInner'])
  })

  it('非容器与缺 field 的脏数据被跳过', () => {
    const rules = [
      { type: 'page-table', field: 't1', props: { dataSourceId: 'ds-1' } },
      { type: PAGE_DATA_CONTAINER_NAME, props: { dataSourceId: 'ds-1' } },
      null,
    ]
    expect(collectDataContainerTargets(rules as any[])).toEqual([])
  })
})
