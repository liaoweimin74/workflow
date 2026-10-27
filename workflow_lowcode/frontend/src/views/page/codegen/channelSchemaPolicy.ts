/**
 * E-0 语义/表现分拣策略表（channel-schema-policy）。
 *
 * 台账 `docs/designs/2026-10-26-schema语义表现分拣台账.md` 的机器可读固化，
 * E-0 扩面（2026-10-27）补入：页面 rule 树深入键、column_config 面、先验模式键。
 * 架构文档 §5.1：分端出码前，桌面表现键要么迁 channelProfiles、要么在端契约表
 * 显式 drop 登记原因——本表是 uni-app 契约表（批 E）与保存拦截（P2）的共用输入。
 *
 * 三条查表规则（与 contract.ts「表外键即 error」同一铁律）：
 * 1. 表内无条目 = 未分拣（auditInventoryCoverage 报 uncovered，批 E 直接失败）；
 * 2. 表现键禁 `keep`（validatePolicyIntegrity 把矛盾结论挡在表内）；
 * 3. rule 面按 `组精确条目 → '*' 通用条目` 顺序回退，组名 = form-create 节点 type。
 */

/** 分拣分类：语义（跨端共用）/ 表现（端相关摆法）/ 待议（双面性）/ 结构（载体与扫描标记）/ 设计器内部 */
export type KeyClass = 'semantic' | 'presentation' | 'pending' | 'structural' | 'designer'
/** 处置：留在主 schema / 移动端渲染与出码忽略 / 迁端覆盖层 channelProfiles / 设计器管理不参与分拣 */
export type KeyDisposition = 'keep' | 'drop-on-mobile' | 'migrate-to-channel-profile' | 'designer-skip'

export interface PolicyEntry {
  class: KeyClass
  disposition: KeyDisposition
  /** 判定依据（台账行号 / 现网代码证据），批 E 契约表 drop note 直接引用 */
  note?: string
}

export type PolicySurface = 'page' | 'rule' | 'columnConfig'

/** rule 面的通用组：任意组件类型的共有键都落这里 */
export const RULE_COMMON_GROUP = '*'

/**
 * rule 节点的设计器身份键——与出码契约表 contract.ts IDENTITY_KEYS 必须同集
 * （有测试锁漂移）。台账 §3：既非语义也非表现，跳过不参与分拣。
 */
export const DESIGNER_SKIP_KEYS: string[] = ['_fc_id', '_fc_drag_tag', 'name']

const sem = (note?: string): PolicyEntry => ({ class: 'semantic', disposition: 'keep', note })
const drop = (note: string): PolicyEntry => ({ class: 'presentation', disposition: 'drop-on-mobile', note })
const mig = (note: string): PolicyEntry => ({ class: 'pending', disposition: 'migrate-to-channel-profile', note })
const car = (note?: string): PolicyEntry => ({ class: 'structural', disposition: 'keep', note })
const dsg = (): PolicyEntry => ({ class: 'designer', disposition: 'designer-skip', note: '台账 §3：设计器管理、运行时忽略' })

/**
 * 面一：平铺 VIEW 配置（`wf_page_def.schema` 顶层区块 × 键）。
 * 台账 §1 逐行转写；`@section` 为扫描器的区块存在标记，`@scalar` 为
 * 标量区块的值条目（display 的 card/table 形态本身）。
 * 注：平铺 VIEW 不在出码输入面（parse.ts 只吃新式 {rule,option,dataSources,actions}），
 * 入表是为了服务端复查口（台账 §4）与存量迁移判定有统一清单。
 */
export const PAGE_VIEW_POLICY: Record<string, Record<string, PolicyEntry>> = {
  searchFields: {
    key: sem('台账 §1：检索字段跨端一致'),
    label: sem(),
    matchType: sem('匹配方式属数据能力'),
  },
  columns: {
    key: sem(),
    label: sem(),
    custom: sem('取值/模板渲染方式影响显示内容本身'),
    contentType: sem(),
    width: drop('台账 §1：WEB 表格列宽，移动端无列概念'),
    align: drop('台账 §1：WEB 表格列对齐'),
    hidden: drop('台账 §1：「WEB 上不显示该列」属默认展示方案，移动端自有布局裁决'),
    actionColumnWidth: drop('台账 §1：粗筛漏网复核，同 width'),
  },
  actions: {
    view: sem('行动作跨端一致'),
    permissions: sem(),
    buttons: sem(),
    trigger: sem(),
    source: sem(),
    steps: sem('流程编排'),
    actionColumnWidth: drop('同 columns[].actionColumnWidth'),
  },
  display: {
    '@scalar': mig('台账 §1：呈现形态（card/table）影响交互范式，移动端强制卡片/宫格'),
  },
  sortableFields: {},
  pagination: {
    show: drop('分页条可见性属 WEB 表现；移动端列表恒有滚动取数'),
    pageSize: mig('取数窗口，小屏合理差异'),
    pageSizes: mig('同 pageSize：取数窗口选项，按端差异'),
  },
  filter: {
    logic: sem(),
    conditions: sem(),
  },
  detail: {
    width: drop('WEB 弹窗尺寸；移动端详情全屏页'),
    height: drop('同 detail.width：WEB 弹窗高度'),
    formMode: mig('popup/inline 交互形式；移动端恒全屏页'),
  },
  events: {
    on: sem('事件动作流'),
    steps: sem(),
  },
  option: {
    form: car('form-create 表单全局配置载体；内部 labelWidth 等按表现（走 rule 面先验键）'),
    resetBtn: mig('移动端可合并为单提交'),
    submitBtn: mig('同 resetBtn：移动端可合并为单提交'),
  },
  dataSources: {
    id: sem('数据源绑定与引用关系'),
    refId: sem(),
    name: sem(),
    searchFields: sem(),
    label: sem('先验：模板骨架槽位名（templateSchema.ts PageDataSource.label）'),
  },
}

/**
 * 面二：form-create rule 节点键（页面 rule[] 树 + 表单资产共用；组 = 节点 type）。
 * 路径记法与 contract.ts 同构：`props.<k>`、`props.columns[].<k>`、`validate.<k>`。
 */
export const RULE_NODE_POLICY: Record<string, Record<string, PolicyEntry>> = {
  [RULE_COMMON_GROUP]: {
    type: sem('语义组件类型：出码按端选落点'),
    field: sem('字段本体'),
    title: sem('标题文案跨端一致'),
    value: sem('默认值'),
    $required: sem('校验跨端一致（台账 §2）'),
    matchType: sem('匹配方式'),
    events: sem('事件动作流'),
    on: sem('先验：form-create 事件挂点'),
    display: sem('节点显隐属业务/联动裁决，跨端默认一致（与 columns[].hidden 的列展示不同源）'),
    hidden: sem('同上'),
    info: sem('说明文案'),
    validate: car('校验数组载体'),
    props: car('组件属性载体（平铺面出现时走 rule 面判）'),
    children: car('布局容器子规则载体'),
    rule: car('嵌套规则载体（props.rule 同名键在节点顶层出现）'),
    columns: car('列/几何数组载体'),
    'validate.required': sem('台账 §2：校验跨端一致'),
    'validate.pattern': sem(),
    'validate.message': sem(),
    'validate.trigger': sem(),
    col: { class: 'presentation', disposition: 'migrate-to-channel-profile', note: '先验：栅格布局（台账 §2 判表现），移动端单列覆盖' },
    'col.span': { class: 'presentation', disposition: 'migrate-to-channel-profile', note: '先验：栅格跨度真身（contract WIDGET_IDENTITY 注），移动端单列覆盖' },
    _fc_id: dsg(),
    _fc_drag_tag: dsg(),
    name: dsg(),
  },
  input: {
    'props.placeholder': sem('交互能力属性（台账 §2 props.*）'),
    'props.clearable': sem(),
    'props.multiple': sem(),
    'props.style': drop('内联样式属 WEB 表现；台账 §2 先验 style'),
    'props.width': drop('先验：台账 §2「props.width 出现时按表现处理」'),
  },
  textarea: {},
  datePicker: {
    'props.type': sem('date/datetime 决定取值形态'),
    'props.valueFormat': sem('数据格式'),
    'props.placeholder': sem(),
    'props.startPlaceholder': sem(),
    'props.endPlaceholder': sem(),
    'props.style': drop('内联样式属 WEB 表现（同 input 组）'),
  },
  /** fcTable 布局表格：几何载体（出码 EP 面走 emit:'table' 换算），移动端节点线性化 */
  table: {
    'props.columns': drop('布局表格几何（行列合并/逐格 style/class）不誊进移动端，按 rule 顺序线性化'),
  },
  __page_actions: {
    'props.buttons': sem('按钮动作清单'),
    'props.permissions': sem(),
    'props.actionColumnWidth': drop('同平铺面'),
  },
  __page_detail: {
    'props.enabled': sem('详情能力开关'),
    'props.formMode': mig('同平铺 detail.formMode：移动端恒全屏页'),
    'props.type': mig('容器形态（dialog/drawer）属 WEB；移动端全屏页'),
    'props.width': drop('WEB 弹窗尺寸'),
    'props.height': drop('同 props.width：WEB 弹窗尺寸'),
  },
  'page-table': {
    'props.dataSourceId': sem('取数绑定'),
    'props.selectionMode': sem('选择能力=动作链输入'),
    'props.searchFields': sem(),
    'props.sortableFields': sem(),
    'props.filterable': sem('筛选能力'),
    'props.showSearch': sem(),
    'props.sortable': sem(),
    'props.viewActions': sem('行动作链载体'),
    'props.viewEvents': sem('列点击链载体'),
    'props.viewDetail': car('详情配置载体；深层键按 __page_detail 条目语义'),
    'props.columns': car('列数组载体；元素键按下方 props.columns[].<k> 模式'),
    'props.columns[].key': sem(),
    'props.columns[].label': sem(),
    'props.columns[].custom': sem(),
    'props.columns[].contentType': sem(),
    'props.columns[].matchType': sem(),
    'props.columns[].width': drop('同平铺 columns[].width'),
    'props.columns[].align': drop('同平铺 columns[].align'),
    'props.columns[].hidden': drop('同平铺 columns[].hidden'),
    'props.columns[].actionColumnWidth': drop('同平铺 columns[].actionColumnWidth'),
    'props.pagination': drop('分页条开关，同平铺 pagination.show'),
    'props.pageSize': mig('同平铺 pagination.pageSize'),
    'props.pageSizes': mig('同平铺 pagination.pageSizes'),
    'props.border': drop('EP 表格皮肤'),
    'props.stripe': drop('EP 表格皮肤'),
    'props.stretch': drop('EP 表格皮肤'),
    'props.actionColumnWidth': drop('同平铺'),
    'props.designMode': dsg(),
  },
  formContainer: {
    'props.dataSourceId': sem(),
    'props.recordLocator': sem('记录定位属数据能力'),
    'props.rule': car('子规则载体'),
    'props.displayMode': mig('弹窗/抽屉/页内形态，移动端恒全屏页'),
    'props.dialogWidth': drop('WEB 弹窗尺寸'),
    'props.dialogHeight': drop('同 props.dialogWidth：WEB 弹窗尺寸'),
    'props.inlineHeight': drop('WEB 内联容器高度'),
    'props.customButtons': sem('按钮文案定制'),
    'props.showNewButton': sem('按钮能力开关'),
    'props.showDeleteButton': sem(),
    'props.showCopyButton': sem(),
    'props.showConfirmButton': sem(),
    'props.showCancelButton': sem(),
    'props.tabTitle': sem('文案'),
  },
}

/**
 * 面三：`wf_form_def.column_config`（数据模型列定义）。
 * E-0 扩面实扫结论（2026-10-27，7 份资产）：全键为存储约束/字段文案/控件族
 * 一类，无任何 WEB 布局专属键——数据模型面天然端无关，移动出码按 componentType
 * 走语义→端组件映射即可，零迁移零忽略。
 */
export const COLUMN_CONFIG_POLICY: Record<string, PolicyEntry> = {
  key: sem('字段名'),
  label: sem('字段文案'),
  columnType: sem('DB 列类型（存储约束）'),
  length: sem(),
  scale: sem(),
  unique: sem('数据约束'),
  indexed: sem(),
  required: sem(),
  componentType: sem('控件族（input/select/subForm…）：能力声明，跨端控件由各端渲染器映射'),
  hidden: sem('业务可见性（如派生文本列不展示），跨端一致；非列展示方案'),
  pickerConfig: sem('选择器配置，属数据能力'),
  subColumns: car('嵌套行结构'),
}

const SURFACE_TABLES: Record<PolicySurface, Record<string, Record<string, PolicyEntry>>> = {
  page: PAGE_VIEW_POLICY,
  rule: RULE_NODE_POLICY,
  // columnConfig 面单表（组名固定 column），此处包一层与其余面对齐
  columnConfig: { column: COLUMN_CONFIG_POLICY },
}

/** 查一条策略。rule 面回退顺序：组精确 → '*' 通用；其余面精确。未收录返回 null。 */
export function matchPolicy(surface: PolicySurface, group: string, key: string): PolicyEntry | null {
  const tables = SURFACE_TABLES[surface]
  if (surface === 'rule') {
    return tables[group]?.[key] ?? tables[RULE_COMMON_GROUP]?.[key] ?? null
  }
  return tables[group]?.[key] ?? null
}

// ==================== 闭环审计：策略表 × 扫描库存 ====================

/** schema-audit 输出里 pages.groups 的 rule 区块：平铺未展平，键按 rule 通用面判 */
const PAGE_RULE_SECTION = 'rule'

interface AuditGroups {
  [group: string]: Record<string, { instances: number; assets: number; presentationCandidate: boolean }>
}
interface AuditInventory {
  pages: { groups: AuditGroups; ruleGroups: AuditGroups }
  forms: { groups: AuditGroups }
  columnConfig: { groups: AuditGroups }
}

export interface InventoryCoverageReport {
  total: number
  covered: number
  uncovered: Array<{ surface: string; group: string; key: string }>
  bySurface: Record<'page' | 'pageRule' | 'forms' | 'columnConfig', { total: number; uncovered: number }>
}

/**
 * 用策略表审扫描库存：每个（面×组×键）必须命中条目。
 * 扫描器标记键（@section）与平铺 rule 区块（走 rule 通用面）在此特判。
 */
export function auditInventoryCoverage(inventory: unknown): InventoryCoverageReport {
  const inv = inventory as AuditInventory
  const report: InventoryCoverageReport = {
    total: 0,
    covered: 0,
    uncovered: [],
    bySurface: {
      page: { total: 0, uncovered: 0 },
      pageRule: { total: 0, uncovered: 0 },
      forms: { total: 0, uncovered: 0 },
      columnConfig: { total: 0, uncovered: 0 },
    },
  }
  const check = (surfaceName: keyof InventoryCoverageReport['bySurface'], surface: PolicySurface, group: string, key: string): void => {
    report.total += 1
    report.bySurface[surfaceName].total += 1
    if (isCovered(surface, group, key)) {
      report.covered += 1
    } else {
      report.uncovered.push({ surface: surfaceName, group, key })
      report.bySurface[surfaceName].uncovered += 1
    }
  }
  for (const [group, keys] of Object.entries(inv.pages.groups ?? {})) {
    for (const key of Object.keys(keys)) check('page', 'page', group, key)
  }
  for (const [rawGroup, keys] of Object.entries(inv.pages.ruleGroups ?? {})) {
    const group = rawGroup.replace(/^page-rule:/, '')
    for (const key of Object.keys(keys)) check('pageRule', 'rule', group, key)
  }
  for (const [group, keys] of Object.entries(inv.forms.groups ?? {})) {
    for (const key of Object.keys(keys)) check('forms', 'rule', group, key)
  }
  for (const [group, keys] of Object.entries(inv.columnConfig.groups ?? {})) {
    for (const key of Object.keys(keys)) check('columnConfig', 'columnConfig', group, key)
  }
  return report
}

/** 单键覆盖判定（三种特判都是扫描器输出形状，不是 schema 里的真键） */
function isCovered(surface: PolicySurface, group: string, key: string): boolean {
  // @section = 区块存在标记（出现本身不算待分拣键）；@scalar = 标量区块值条目
  //（display 的 card/table 形态在此查页面对照表判）
  if (key === '@section') return true
  if (key === '@scalar') return matchPolicy('page', group, '@scalar') !== null
  // 平铺面的 rule 区块未展平：节点 self 键按 rule 通用面判
  if (surface === 'page' && group === PAGE_RULE_SECTION) {
    return matchPolicy('rule', RULE_COMMON_GROUP, key) !== null
  }
  return matchPolicy(surface, group, key) !== null
}

/**
 * 表内自洽校验：表现键禁 keep（keep 即留在主 schema 被端产物誊走=§5.1 事故）；
 * 语义/结构键不得被标成 drop/migrate（会静默丢跨端能力）。返回违例路径清单。
 */
export function validatePolicyIntegrity(): string[] {
  const violations: string[] = []
  for (const [surfaceName, table] of Object.entries(SURFACE_TABLES)) {
    for (const [group, entries] of Object.entries(table)) {
      for (const [key, entry] of Object.entries(entries)) {
        if (entry.class === 'presentation' && entry.disposition === 'keep') {
          violations.push(`${surfaceName}.${group}.${key}: presentation+keep`)
        }
        if (entry.class === 'semantic' && entry.disposition !== 'keep') {
          violations.push(`${surfaceName}.${group}.${key}: semantic must keep`)
        }
        if (entry.class === 'structural' && entry.disposition !== 'keep') {
          violations.push(`${surfaceName}.${group}.${key}: structural must keep`)
        }
        if (entry.class === 'designer' && entry.disposition !== 'designer-skip') {
          violations.push(`${surfaceName}.${group}.${key}: designer must skip`)
        }
      }
    }
  }
  return violations
}
