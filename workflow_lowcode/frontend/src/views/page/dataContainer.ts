/**
 * 数据容器（page-data-container）的规则形态。
 *
 * 一个组件三种形状，各自明确：
 *   画布态 `fcRow` —— 借 form-create 行容器的形态获得「拖入子组件」能力。
 *     设计器的可拖入判定读的是节点 children 数组（@form-create/designer 的 FcTree
 *     canDropInner 走 `Array.isArray(getChildren(node))`，粘贴分支再按 `_menu.inside`
 *     决定插到 children 还是 children[0].children[0].children），formContainer 走的就是这条路。
 *   保存态 `page-data-container` + `props.rule` —— 落到页面 schema 的稳定形状，
 *     子规则收在 props.rule，不裸挂 children。
 *   运行态 `page-data-container` + `props.childRules` + `children: []` —— 子级改由容器自己
 *     起内嵌 form-create 渲染，主树不再递归进来。这是作用域插值生效的前提：数据到达后
 *     只需要容器重渲染自己的子树，主树整棵重建会把同页其他组件的取数一起打掉。
 */

export const PAGE_DATA_CONTAINER_NAME = 'page-data-container'

/** 画布形态在 form-create 里的类型（行容器） */
const CANVAS_ROW_TYPE = 'fcRow'

let fieldSeq = 0

/** 容器地址：与设计器/寻址约定一致，落在 rule.field，且每次拖入都独立 */
function containerField(): string {
  fieldSeq += 1
  return `dc${Date.now()}${fieldSeq}`
}

export interface DataContainerProps {
  title: string
  dataSourceId: string
  /** list = 取一页记录（子规则用 {rows[i].x}）；single = 只取一条（{row.x}） */
  queryMode: 'list' | 'single'
  pageSize: number
  span: number
  height: string
  designMode: boolean
  [key: string]: unknown
}

export function pageDataContainerRule(): Record<string, unknown> {
  const title = '数据容器'
  return {
    type: CANVAS_ROW_TYPE,
    field: containerField(),
    title,
    info: '',
    children: [],
    props: {
      title,
      dataSourceId: '',
      queryMode: 'list',
      pageSize: 20,
      span: 24,
      height: '',
      designMode: true,
    } satisfies DataContainerProps,
  }
}

/**
 * 画布态 → 保存态（设计器 parseRule 钩子）。
 * 钩子契约是**原地改写**：@form-create/designer 走 `rule._menu.parseRule(rule)` 后继续用同一个
 * 对象，返回值一律被忽略（vendor 的 group / formContainer / subForm 都这么写）。
 * 写成返回副本会让保存态类型停在画布态的 fcRow，容器落盘就不是自己了。
 */
export function saveDataContainerRule(rule: Record<string, any>): void {
  const props: Record<string, any> = rule.props || (rule.props = {})
  props.rule = Array.isArray(rule.children) ? rule.children : []
  delete rule.children
  rule.type = PAGE_DATA_CONTAINER_NAME
}

/** 保存态 → 画布态（设计器 loadRule 钩子）：props.rule 还原成 children，类型换回行容器。同样原地改写。 */
export function loadDataContainerRule(rule: Record<string, any>): void {
  const props: Record<string, any> = rule.props || (rule.props = {})
  rule.children = Array.isArray(props.rule) ? props.rule : []
  delete props.rule
  rule.type = CANVAS_ROW_TYPE
}

/**
 * 保存态 → 运行态：子规则改由容器自己渲染，主树递归到此为止。
 * 入参是页面 schema 解析出来的共享对象，一律产出副本。
 */
export function normalizeDataContainerForRender(saved: Record<string, any>): Record<string, any> {
  const next: Record<string, any> = { ...saved }
  const props: Record<string, any> = { ...(saved.props || {}) }
  const childRules = Array.isArray(props.rule) ? props.rule : []
  delete props.rule
  props.childRules = childRules
  next.props = props
  next.children = []
  return next
}

/**
 * 画布内的数据容器地址候选（供动作总线 target 下拉）。
 *
 * 为什么不复用 dataSourceId 寻址：一个数据源常被表格、KPI 和多个容器同时绑着，
 * 而实例注册表是按数据源一个槽位，谁最后挂载谁占位——refresh 就会打到别人身上。
 * field 是每个容器独有的地址，沿用联动容器已落地的口径（地址=field，数据源只管取数）。
 * 未绑数据源的容器不进候选：它没有可刷新的数据，列出来只会配出一条静默无效的动作。
 */
export function collectDataContainerTargets(
  rules: Record<string, any>[] | undefined,
): { field: string; title: string; dataSourceId: string }[] {
  const out: { field: string; title: string; dataSourceId: string }[] = []
  const visit = (list: Record<string, any>[] | undefined): void => {
    if (!Array.isArray(list)) return
    for (const rule of list) {
      if (!rule || typeof rule !== 'object') continue
      if (rule.type === PAGE_DATA_CONTAINER_NAME) {
        if (rule.field && rule.props?.dataSourceId) {
          out.push({ field: rule.field, title: rule.title || '数据容器', dataSourceId: rule.props.dataSourceId })
        }
      }
      visit(rule.children as Record<string, any>[] | undefined)
      visit(rule.props?.rule as Record<string, any>[] | undefined)
    }
  }
  visit(rules)
  return out
}
