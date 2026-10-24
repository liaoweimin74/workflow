/**
 * 出码契约表：页面 schema → 源码产物的逐键落点声明。
 *
 * spike 0 的结论在这里落地 —— 产物模板本身承载不了 schema 的全部语义，
 * 出码器必须同时产出一份登记表（manifest），否则回导时无法区分
 * 「有意丢弃」和「静默丢失」。这份表就是登记表的自动生成源。
 *
 * 一条原则：表外的键不算"不知道怎么办"，而是 error（manifest.unsupported）。
 * 新增配置项若没同步这张表，出码直接失败，不许悄悄丢 —— 列点击链扫旧载体
 * （templateSchema.ts 曾只扫 props.viewColumns）就是同一类洞的现网版本。
 */

/** 丢弃原因分类；进 manifest.warnings，回导对比时据此豁免 */
export type DropKind =
  | 'ignored-by-runtime'
  | 'no-consumer'
  | 'overridden-at-runtime'
  | 'not-in-artifact'
  | 'runtime-derived'
  | 'step-param-dropped'

/** 单个 schema 键的落点 */
export type PropEmit =
  /** 落组件 prop：同名，或改名（如嵌套的 viewActions.buttons 提到根 prop buttons） */
  | { emit: 'prop'; as?: string }
  /**
   * 落元素属性（容器/表单控件）；on 缺省为本类型 tag。skipDefault：契约声明的
   * "缺席形状"——值等于它时载体与登记都不留痕迹（回导按 STRUCT_DEFAULTS 补默认值），
   * 比无差别落 attr 准：$required: false 若留 rename，web 产物核对不了（模板不渲染
   * required=false），回导 rename 校验就会假红。
   */
  | { emit: 'attr'; as?: string; by?: AttrBy; on?: string; skipDefault?: unknown }
  /** 子规则（容器的 props.rule），交给容器递归出码 */
  | { emit: 'children' }
  /**
   * 布局表格的几何载体（fcTable 的 props.rule）：row/col/style/class/layout 不在模板上落地，
   * 由几何算法换算成 td 的 colspan/rowspan 与逐格 style/class，回读从 td 坐标反推。
   */
  | { emit: 'table' }
  /**
   * 落到本节点的行配置常量（嵌套容器的 min/max/button、select 的 options）：
   * 产物的模板与 handler 按这份常量实现，回读核对的是产物里真在使用的那个值。
   * 这类键不能走 'prop' —— 嵌套容器的载体是 div，写上去就是组件没声明的悬空属性。
   */
  | { emit: 'config' }
  /** 只进锚点注释：模板上别处没有这个信息 */
  | { emit: 'anchor'; key: string }
  /** 由产物形态反推（回导侧 computed，不是值搬运） */
  | { emit: 'derived'; by: DerivedBy; evidence?: string }
  /** 丢弃并登记原因 */
  | { emit: 'drop'; kind: DropKind; note: string }
  /** 等于默认值才省略；不等于必须显式出码 */
  | { emit: 'default'; value: unknown; note?: string }

/** 属性落点随展示方式变化（drawer 吃 size，dialog 吃 width） */
export type AttrBy = 'containerSizeAttr'
/** 反推依据 */
export type DerivedBy =
  | 'dsRefId'
  | 'globalDataSourceId'
  | 'containerDisplayMode'
  | 'containerHasForm'
  | 'footerConfirmButton'
  | 'footerCancelButton'
  /** fcTable 几何：行数/列数/合并项/逐格样式与类名，全部从产物 td 坐标反推 */
  | 'tableRows'
  | 'tableCols'
  | 'tableLayout'
  | 'tableStyle'
  | 'tableClass'
  | 'tableBorder'
  | 'tableMini'
  | 'tableFormStyle'
  | 'tableBorderColor'
  | 'tableBorderWidth'

/**
 * 数据源记录（schema.dataSources[]）的落点。
 * 它不是组件节点，进不了 TYPE_CONTRACTS，但同样要逐键登记 —— 只还原 dataSources[0]
 * 就等于承认"其余源的 id/refId 出没出产物没人认领"。
 */
export type DataSourceEmit =
  /** 落产物常量表 `const dataSources = { '<id>': '<refId>' }`，回导按字面量键序还原数组 */
  | { emit: 'binding' }
  /** 丢弃并登记原因 */
  | { emit: 'drop'; kind: DropKind; note: string }

export interface TypeContract {
  /** 产物标签；runtime 组件（page-table）或 EP 原生（el-drawer / el-input） */
  tag: string
  /** 是否保留 runtime 标签（false = 出成真模板） */
  runtime?: boolean
  /**
   * 字段控件：出 v-model="form.<field>"，产物元素上的属性即 schema props 的证据
   * （回导侧对这些节点按绑定重建 props）。取代此前与 TYPE_CONTRACTS 并行的 FIELD_TAGS 表。
   */
  field?: true
  /**
   * 列表类 runtime 组件：产物要接的事件与容器形态来源。
   * expose=none 表示组件没 defineExpose，产物拿不到 refresh()，保存后的刷新要人工接。
   * exposed 是组件 defineExpose 方法名的事实记录（动作链只能调在册的方法，链要落卡片就得记 unsupported）。
   * events.when='chain' = 只有该节点真有对应动作链才绑定并出 handler（无链还出空 handler 就是假挂点）。
   */
  list?: {
    events: Array<{ on: string; handler: string; when?: 'chain' }>
    expose?: 'refresh' | 'none'
    exposed?: string[]
    /**
     * 该组件在运行期真分发的链载体：view = props.viewEvents（triggerViewEvents），cell = columns[].onCellClick。
     * 只有 page-table 两个都有；卡片组件里没有这两个分发器，配了也只能记 unsupported。
     */
    chainCarriers?: Array<'view' | 'cell'>
  }
  /** 容器类：标签与尺寸属性名由展示方式决定（数据表格的 viewDetail.formMode） */
  displayModeDriven?: boolean
  /**
   * 嵌套容器（group / tableForm / subForm）：子规则在 schema 里的载体与产物的值形态。
   * array = 行对象数组（v-for 行 + 行别名 v-model，组件的 modelValue 就是数组）；
   * object = 单个对象（子字段绑 form.<容器字段>.<子字段>）。
   */
  nested?: { carrier: 'props.rule' | 'props.columns[].rule'; shape: 'array' | 'object' }
  /** 节点自身键（type/field/title/display/... ，不在 props 里） */
  self?: Record<string, PropEmit>
  /** props 内键；路径支持数组下标模式：columns[].onCellClick */
  props: Record<string, PropEmit>
  /**
   * 产物侧固定接线属性：schema 里没有对应键（如 textarea 出 el-input type="textarea"）。
   * 值写进模板，键名进 wireOnly 登记，回导剥离不报多造。
   */
  constAttrs?: Record<string, unknown>
  /**
   * 组件跑起来还缺的接线：出码按节点登记为 unsupported，属语义债（要改运行时/产物形态），
   * 不是补契约能消的广度债 —— 混在一起就会把 emit 缺口的大小又读成零。
   */
  requires?: Array<{ key: string; note: string }>
  /**
   * 字段写回声明：组件在 form-create 宿主里靠 formCreateInject.api.setValue 把选中值写进
   * 其他表单字段（LookupPicker 的 idField/returnFields），产物没有那个实例，改接组件的
   * select/clear emit 由产物 handler 显式赋值。idKey/mapKey 是承载目标字段名/映射的 props 键。
   */
  writes?: { on: string; clearOn: string; idKey?: string; mapKey?: string }
  /**
   * 组件声明过的注入 prop（如 FormulaField 的 formCreateInject）：产物给它接一个
   * 以 form 为后端的具名 adapter，运行期行为留在组件单点里 —— 与"不搬求值逻辑"是同一件事。
   * 只在容器子树内接（adapter 吃 form），容器外保持 unsupported 记债。
   */
  injects?: { prop: string; constName: string; note: string }
  /**
   * 产物要传页面 key：现网由 PageRendererPage.vue:552-553 给数据组件统一注入 props.pageKey，
   * 产物没有这层注入。PageDataTable 把它声明成必填无默认（PageDataTable.vue:185-187），
   * 还拿它拼 Excel 导入导出 URL（:723），漏传就是运行时缺参 + 导出指向空页面。
   * 值来自出码入参，schema 里没有这个键，所以走 wireOnly 归属登记。
   */
  needsPageKey?: true
  /**
   * 展示组件（仪表盘组件族）：不是字段控件、也不是列表组件。
   * 顶层按 rule.col.span 出 el-row > el-col.fc-form-col > el-form-item 栅格（现网这层是 form-create 给的，
   * 「撑满(100%)」高度档靠它传高），元素带 lc:node 锚点属性 —— 同类型多实例必须各回各的元素，
   * 只按标签找第一个就会把 A 卡片的属性套到 B 卡片上还回读零差异。
   */
  widget?: true
  /**
   * 布局表格（fcTable）：子节点在 node.children 且带 slot:"行:列" 地址，按 props.rule 的
   * row/col/layout 摊成静态 <table> 的单元格。几何键走 TABLE_RULE_CONTRACT 逐键登记。
   */
  table?: true
  /**
   * dash-filter 广播接线（PageRendererPage.vue:263-278、505-549）：
   * source = 筛选器，变更时触发广播（autoBroadcast 非 false 才接 filter-change）；
   * target = 挂载后 emit('ready') 上报实例、暴露 setFilter 的组件，收进产物的 dashInstances。
   * 运行期的实例表由渲染器持有，产物自己持一份 —— 不接这个能力位的类型不参与广播。
   */
  dashFilter?: 'source' | 'target'
}

/** form-create 结构键：取默认值时产物省略不写，回导按此补 */
export const STRUCT_DEFAULTS: Record<string, unknown> = {
  display: true,
  hidden: false,
  info: '',
  $required: false,
  title: '',
}

/** 出码丢弃的设计器身份键 */
export const IDENTITY_KEYS = ['_fc_id', 'name', '_fc_drag_tag']

/** 字段控件共有 self：type/field 进锚点，title 落 el-form-item 的 label */
const FIELD_SELF: Record<string, PropEmit> = {
  type: { emit: 'anchor', key: 'type' },
  field: { emit: 'anchor', key: 'field' },
  title: { emit: 'attr', as: 'label', on: 'el-form-item' },
  /**
   * 必填结构键（Task 4.4）：与 title 对称落 el-form-item 载体，skipDefault: false——
   * 缺省（非必填）不留任何痕迹。true 时载体真出 required：web 是 el-form-item 的
   * :required="true"（星标视觉，校验仍在 form-create 运行时），uniapp 是 uni-forms-item
   * 的 required 星标；设计器必填控件写 rule 顶层 $required（vendor utils 的 Required →
   * formCreate$required），契约登记后不再是 unsupported 噪声，rename 供回导还原。
   */
  $required: { emit: 'attr', as: 'required', on: 'el-form-item', skipDefault: false },
  /** fcTable 子节点的格地址（"行:列"），模板上只有锚点能承载 */
  slot: { emit: 'anchor', key: 'slot' },
}

/** 展示组件共有的身份键与栅格：type/field 进锚点，col.span 落栅格列 */
const WIDGET_IDENTITY: Record<string, PropEmit> = {
  type: { emit: 'anchor', key: 'type' },
  field: { emit: 'anchor', key: 'field' },
  /** fcTable 子节点的格地址（"行:列"），模板上只有锚点能承载 */
  slot: { emit: 'anchor', key: 'slot' },
  /** 栅格跨度真身：form-create 用它包 el-col；props.span 只是组件留白镜像（PageDesigner.vue:819-823 双写） */
  'col.span': { emit: 'attr', as: 'span', on: 'el-col' },
}

/**
 * dash 族共有 self：节点的 title/info 被渲染器无条件置空（PageRendererPage.vue:522-523），
 * 可见标题来自 props.title，所以不能像字段控件那样把 title 出成 el-form-item 的 label ——
 * 写上去就是「错位 emit」（dash 组件没声明 title，值落到根 DOM 当悬停提示）。
 * 但 el-form-item 这一层壳照样要出：现网每个节点都被 form-create 套了
 * el-col.fc-form-col > el-form-item > __content，撑满档（props.height='100%'）靠
 * dash-fill-height.css:16-19 的 :has() 沿这条链传高，少一层就静默退化。
 */
const WIDGET_SELF: Record<string, PropEmit> = {
  ...WIDGET_IDENTITY,
  title: { emit: 'drop', kind: 'overridden-at-runtime', note: '渲染器置空节点 title（PageRendererPage.vue:522），可见标题来自 props.title' },
  info: { emit: 'drop', kind: 'overridden-at-runtime', note: '渲染器置空节点 info（PageRendererPage.vue:523）' },
}

/**
 * page-* 展示组件共有 self：置空名单（PageRendererPage.vue:519）只含 dash 族，
 * 这三类的节点 title 照旧由 form-create 当 el-form-item 的 label 渲染；
 * 组件自己的 props.title（图表/详情有，步骤条没有）是卡片内部的标题行，两个载体各出各的。
 */
const WIDGET_SELF_LABELED: Record<string, PropEmit> = {
  ...WIDGET_IDENTITY,
  title: { emit: 'attr', as: 'label', on: 'el-form-item' },
}

/** 只有运行期才有的注入键：产物侧的值来自出码入参或数据源表，按丢弃登记，不落组件标签 */
const RUNTIME_INJECTED: Record<string, PropEmit> = {
  designMode: { emit: 'drop', kind: 'ignored-by-runtime', note: '设计器画布态标记，产物恒为运行态' },
  dsRefId: { emit: 'drop', kind: 'overridden-at-runtime', note: '运行期由渲染器按 dataSourceId 注入（PageRendererPage.vue:524-528、555-559），产物侧的值来自 dataSources 常量表' },
}

/** 组件侧尺寸镜像（dashSpanGapStyle 与各组件根样式），与 col.span 各自独立出码 */
const SIZE_MIRROR: Record<string, PropEmit> = {
  span: { emit: 'prop' },
  height: { emit: 'prop' },
}

/** 展示组件共有 props：宽高镜像 + 运行期注入键 */
const WIDGET_SHARED_PROPS: Record<string, PropEmit> = { ...SIZE_MIRROR, ...RUNTIME_INJECTED }

export const TYPE_CONTRACTS: Record<string, TypeContract> = {

  'page-table': {
    tag: 'page-table',
    runtime: true,
    needsPageKey: true,
    list: {
      events: [
        { on: 'row-click', handler: 'onRowClick' },
        { on: 'button-click', handler: 'onButtonClick' },
        { on: 'selection-change', handler: 'onSelectionChange' },
        // 列链与排序链的出口：无链时不绑定，避免产物里挂一个没人调的空 handler
        { on: 'cell-click', handler: 'onCellClick', when: 'chain' },
        { on: 'sort-change', handler: 'onSortChange', when: 'chain' },
      ],
      expose: 'refresh',
      // PageDataTable.vue 的 defineExpose 面（externalActions.test.ts 逐名核对，别凭记忆加）
      exposed: ['refresh', 'setFilter', 'resetFilter', 'setPage', 'setSort', 'clearSelection', 'records'],
      // handleCellClick 与 triggerViewEvents 都在 PageDataTable 里，卡片组件没有这两个分发器
      chainCarriers: ['view', 'cell'],
    },
    self: {
      type: { emit: 'anchor', key: 'type' },
      field: { emit: 'anchor', key: 'field' },
      /**
       * 标题落 el-form-item 的 label，不落组件标签：PageDataTable 没有 title prop，
       * 写上去只会变成根 DOM 的原生悬停提示。现网这个标题本来就是 form-create 给每个顶层
       * 节点套的 el-form-item label（真机 /page/cardlist_test?preview=true 量到
       * el-col-24.fc-form-col + el-form-item--label-right），产物侧同一层载体。
       */
      title: { emit: 'attr', as: 'label', on: 'el-form-item' },
    },
    props: {
      dataSourceId: { emit: 'derived', by: 'dsRefId', evidence: 'props.dsRefId' },
      columns: { emit: 'prop' },
      // 列点击链：page-table 有 cell-click 出口，parse phase 4 按链改判（真出 handler 时不再是丢弃）
      'columns[].onCellClick': {
        emit: 'drop',
        kind: 'not-in-artifact',
        note: '列点击链：该列真配了动作时产物出 onCellClick 分支，否则按丢弃登记（卡片无 cell-click 出口，链只能记 unsupported）',
      },
      searchFields: { emit: 'prop' },
      sortableFields: { emit: 'prop' },
      pageSize: { emit: 'prop' },
      pageSizes: { emit: 'prop' },
      pagination: { emit: 'prop' },
      showSearch: { emit: 'prop' },
      border: { emit: 'drop', kind: 'overridden-at-runtime', note: 'PageDataTable 未声明 border、也没往 SearchTable 传；SearchTable.vue:138 的 el-table 硬编码 border，配 false 也不会没边框' },
      stripe: { emit: 'drop', kind: 'no-consumer', note: 'PageDataTable 未声明 stripe，SearchTable 也没有 stripe 通道；这键是调色板骨架默认塞进来的（PageDesigner.vue:1051）' },
      stretch: { emit: 'prop' },
      selectionMode: { emit: 'prop' },
      /**
       * 操作与详情配置整块透传：PageDataTable 就吃 viewActions/viewDetail 两个 prop
       * （PageRendererPage.vue:491 把 schema props 原样交给组件），出码拆平反而对不上运行期。
       * 块内深层键靠 scanNested 再登记：formMode/type 与容器形态必须一致。
       */
      viewActions: { emit: 'prop' },
      viewDetail: { emit: 'prop' },
      'viewDetail.formMode': { emit: 'derived', by: 'containerDisplayMode' },
      'viewDetail.type': { emit: 'derived', by: 'containerHasForm' },
      viewEvents: { emit: 'default', value: [], note: '空事件组不落模板' },
      actionColumnWidth: { emit: 'default', value: 0, note: '等于组件默认值' },
      sortable: { emit: 'drop', kind: 'ignored-by-runtime', note: '列排序由数据源 metadata + sortableFields 决定，schemaTypes.ts 已标 deprecated' },
      filterable: { emit: 'drop', kind: 'ignored-by-runtime', note: '无运行时消费者' },
      designMode: { emit: 'drop', kind: 'ignored-by-runtime', note: '设计器态标记' },
    },
    /**
     * 事件语义交给产物的开关：为真时按钮/行/单元格/选择/排序一律只 emit，
     * 组件不再派发 pageActionBus、不再自跑 viewEvents 与列级 onCellClick 链，
     * 也不弹组件自带的兜底表单（那份表单按数据源业务表单生成，跟页面配的容器不是同一个）。
     * 必须与 list.events 成对出现：只绑事件不开接管＝组件和产物各执行一遍（双执行）。
     */
    constAttrs: { externalActions: true },
  },
  formContainer: {
    tag: 'el-drawer',
    runtime: false,
    displayModeDriven: true,
    self: {
      type: { emit: 'anchor', key: 'type' },
      field: { emit: 'anchor', key: 'field' },
      title: { emit: 'drop', kind: 'not-in-artifact', note: '容器可见标题用 props.tabTitle，rule 上的 title 只是设计器节点名' },
    },
    props: {
      dataSourceId: { emit: 'anchor', key: 'ds' },
      tabTitle: { emit: 'attr', as: 'title' },
      dialogWidth: { emit: 'attr', by: 'containerSizeAttr' },
      rule: { emit: 'children' },
      displayMode: { emit: 'drop', kind: 'overridden-at-runtime', note: '展示方式以数据表格 viewDetail.formMode 为准' },
      recordLocator: { emit: 'drop', kind: 'no-consumer', note: '配置存在但运行时无消费者（空槽），出码丢弃以免产物语义看起来比实际强' },
      dialogHeight: { emit: 'drop', kind: 'not-in-artifact', note: '抽屉只吃 size' },
      inlineHeight: { emit: 'drop', kind: 'not-in-artifact', note: '首版不出 inline 形态' },
      showNewButton: { emit: 'drop', kind: 'not-in-artifact', note: '首版容器只出确定/取消/关闭三键' },
      showCopyButton: { emit: 'drop', kind: 'not-in-artifact', note: '首版容器只出确定/取消/关闭三键' },
      showDeleteButton: { emit: 'drop', kind: 'not-in-artifact', note: '首版容器只出确定/取消/关闭三键' },
      customButtons: { emit: 'default', value: [], note: '空自定义按钮不落模板' },
      showConfirmButton: { emit: 'derived', by: 'footerConfirmButton' },
      showCancelButton: { emit: 'derived', by: 'footerCancelButton' },
    },
  },
  /**
   * 布局表格（src/vendor/components/table/Table.vue，form/index.js:14 注册成 FcTable）：
   * 几何在 props.rule（row/col/style/class/layout），子节点在 node.children 且带 slot:"行:列"。
   * 产物出静态 <table> 还原几何（D2），不引 form-create 运行时；子节点按 slot 放进对应格，
   * 被合并覆盖的 slot 由 home 格渲染（与 Table.vue 的 lattice.slot 一致）。
   */
  fcTable: {
    tag: 'table',
    runtime: false,
    table: true,
    self: {
      type: { emit: 'anchor', key: 'type' },
      field: { emit: 'anchor', key: 'field' },
      /**
       * 真机 A/B：现网 fcTable 外层只有 el-col，没有 el-form-item（rule 没有 field，
       * form-create 不给它包壳），节点 title 只是设计器标签。产物若自造一层 el-form-item，
       * 会命中 EP 的 `.el-form-item .el-form-item { margin-bottom: 0 }`，把格内每个组件的
       * 下边距吃掉 18px（dashboard 每行矮 18px 的根因）。
       */
      title: { emit: 'drop', kind: 'not-in-artifact', note: 'fcTable 非表单字段，form-create 不套 el-form-item；节点 title 是设计器标签' },
    },
    props: {
      rule: { emit: 'table' },
      /** Table.vue:35-39 的默认值：true 时出原生 border，false 出无边框类 */
      border: { emit: 'default', value: true, note: '等于组件默认值（Table.vue:37）' },
      mini: { emit: 'default', value: false, note: '等于组件默认值' },
      formStyle: { emit: 'default', value: false, note: '等于组件默认值' },
      borderColor: { emit: 'default', value: '', note: '空 = 不覆盖边框色' },
      borderWidth: { emit: 'default', value: '', note: '空 = 不覆盖边框宽' },
      /** 组件声明了 prop 但模板从不读：出成属性只会落到 table 根节点当摆设 */
      label: { emit: 'drop', kind: 'no-consumer', note: 'Table.vue 声明 label 但模板从不读' },
      width: { emit: 'drop', kind: 'no-consumer', note: 'Table.vue 声明 width 但模板从不读' },
    },
  },
  input: {
    tag: 'el-input',
    runtime: false,
    field: true,
    self: FIELD_SELF,
    props: {
      placeholder: { emit: 'prop' },
    },
  },
  textarea: {
    tag: 'el-input',
    runtime: false,
    field: true,
    self: FIELD_SELF,
    props: {
      rows: { emit: 'prop' },
      placeholder: { emit: 'prop' },
    },
    // form-create 用 el-input + type=textarea 出多行；模板上这个 type 是产物侧接线，不是 schema props
    constAttrs: { type: 'textarea' },
  },
  inputNumber: {
    tag: 'el-input-number',
    runtime: false,
    field: true,
    self: FIELD_SELF,
    props: {
      min: { emit: 'prop' },
      max: { emit: 'prop' },
      precision: { emit: 'prop' },
    },
  },
  datePicker: {
    tag: 'el-date-picker',
    runtime: false,
    field: true,
    self: FIELD_SELF,
    props: {
      // props.type 是选择器形态（date/datetime/month…），与节点 type 同名不同层
      type: { emit: 'prop' },
      valueFormat: { emit: 'prop' },
      placeholder: { emit: 'prop' },
    },
  },
  dataPicker: {
    tag: 'dataPicker',
    runtime: true,
    field: true,
    self: FIELD_SELF,
    props: {
      // schema 里存的是页面绑定 id，组件运行期靠 activeDsBindings 换 refId；产物是独立页没这张表，
      // 透传就是死接线。换算成 refId 递进组件的逃生口（DataPicker.vue:265），逐节点查常量表。
      dataSourceId: { emit: 'derived', by: 'globalDataSourceId', evidence: 'props.globalDataSourceId' },
      displayField: { emit: 'prop' },
      searchColumns: { emit: 'prop' },
      columns: { emit: 'prop' },
      maxCount: { emit: 'prop' },
      clearOnCascadeChange: { emit: 'default', value: false },
      allowCreate: { emit: 'default', value: false },
      detailReadonly: { emit: 'default', value: true },
    },
  },
  LookupPicker: {
    tag: 'LookupPicker',
    runtime: true,
    field: true,
    self: FIELD_SELF,
    props: {
      // 与 dataPicker 同口径：绑定 id 在独立页换不出 refId（activeDsBindings 恒空），
      // 组件已补 globalDataSourceId 入口（LookupPicker.vue:117 的回退式），产物递 refId。
      dataSourceId: { emit: 'derived', by: 'globalDataSourceId', evidence: 'props.globalDataSourceId' },
      displayField: { emit: 'prop' },
      idField: { emit: 'prop' },
      returnFields: { emit: 'prop' },
      searchColumns: { emit: 'prop' },
      columns: { emit: 'prop' },
    },
    requires: [],
    // 带回链的显式化：组件宿主里走 formCreateInject.api.setValue（LookupPicker.vue:267-277、:295-299），
    // 产物没有 form-create 实例，改接组件自己的 select/clear emit（:271、:312）由 handler 显式赋值
    writes: { on: 'select', clearOn: 'clear', idKey: 'idField', mapKey: 'returnFields' },
  },
  /**
   * 计算字段：保留 runtime 标签（求值器 formulaEval 是纯函数，但依赖取值仍走 form-create 实例）。
   * 语料里 expression 用 `${字段}` 引用同页其他字段，是真语义，不能当字符串透传就算完。
   */
  FormulaField: {
    tag: 'FormulaField',
    runtime: true,
    field: true,
    self: FIELD_SELF,
    props: {
      expression: { emit: 'prop' },
      precision: { emit: 'default', value: 2, note: '等于组件默认值（FormulaField.vue:51）' },
      prefix: { emit: 'default', value: '', note: '空前缀不落模板' },
      suffix: { emit: 'default', value: '', note: '空后缀不落模板' },
      placeholder: { emit: 'default', value: '—', note: '等于组件默认值' },
      disabled: { emit: 'default', value: false, note: '等于组件默认值' },
    },
    injects: {
      prop: 'formCreateInject',
      constName: 'formulaApi',
      note: '求值逐依赖走 formCreateInject.api.getValue（FormulaField.vue:79-89）并 watchEffect 回写自身字段；spike 8 起产物把声明过的 formCreateInject prop 接上 form 后端（const formulaApi），求值/舍入/显示留在组件里',
    },
  },

  // ===== 嵌套容器：子表（group / tableForm）与子表单（subForm） =====

  /**
   * 分组 = 行对象数组。组件面 @form-create/component-elm-group/src/component.jsx:13-64
   * （button :18、max :22、min :26、sortBtn :35、title :47、type :51）。
   * 配置键一律 config：产物把行壳、按钮显隐、上下限都按这份常量生成，回读核对的是常量里的值；
   * 登记成 prop 会把它们写成包裹 div 的悬空属性（div 没有这些 prop，只落到根 DOM 当摆设）。
   * expand / defaultValue / onBeforeAdd 等组件面剩余键语料未配置，留白即 unsupported 噪声。
   */
  group: {
    tag: 'div',
    runtime: false,
    self: FIELD_SELF,
    nested: { carrier: 'props.rule', shape: 'array' },
    props: {
      rule: { emit: 'children' },
      /** 'card' → 出行卡片，其余出普通块（component.jsx:334 isCardType） */
      type: { emit: 'config' },
      /** 行标题模板，{index} 由产物按行号展开（component.jsx:313） */
      title: { emit: 'config' },
      min: { emit: 'config' },
      max: { emit: 'config' },
      button: { emit: 'config' },
      sortBtn: { emit: 'config' },
    },
  },
  /**
   * 子表格 = 行对象数组，子规则在 props.columns[].rule（每列一条），
   * 运行期组件是本项目 vendor 的 src/vendor/components/tableForm/TableForm.vue
   * （由 src/vendor/form/index.js:12 注册成 TableForm）。
   * columns 必须登记成 children：整块透传就是「列既出模板又当数据带走」的双份真相。
   */
  tableForm: {
    tag: 'div',
    runtime: false,
    self: FIELD_SELF,
    nested: { carrier: 'props.columns[].rule', shape: 'array' },
    props: {
      columns: { emit: 'children' },
      addable: { emit: 'config' },
      deletable: { emit: 'config' },
      showIndex: { emit: 'config' },
      /** 只影响回填写入的行过滤（TableForm.vue:146），产物按原样回填 —— 值进常量供人工接管 */
      filterEmptyColumn: { emit: 'config' },
      min: { emit: 'config' },
      max: { emit: 'config' },
    },
  },
  /**
   * 子表单 = 单个对象（@form-create/component-subform/src/component.jsx:17-21 modelValue 是 Object）。
   * 子字段写进这个对象，所以产物的 v-model 前缀是 form.<容器字段>，与行容器的行别名不同形。
   */
  subForm: {
    tag: 'div',
    runtime: false,
    self: FIELD_SELF,
    nested: { carrier: 'props.rule', shape: 'object' },
    props: {
      rule: { emit: 'children' },
    },
  },
  /**
   * 下拉：form-create 把候选项挂在 rule 顶层（options，不在 props 里 —— PageDataTable.vue:427
   * 造的 rule 就是这个形状），el-select 没有 options prop，所以 options 走 config 常量、
   * 由产物里的 el-option v-for 消费；写成 :options= 就是错位 emit。
   */
  select: {
    tag: 'el-select',
    runtime: false,
    field: true,
    self: { ...FIELD_SELF, options: { emit: 'config' } },
    props: {
      placeholder: { emit: 'prop' },
      multiple: { emit: 'prop' },
      clearable: { emit: 'prop' },
      filterable: { emit: 'prop' },
      disabled: { emit: 'prop' },
    },
  },
  'page-list-cards': {
    tag: 'page-list-cards',
    runtime: true,
    needsPageKey: true,
    list: {
      events: [
        { on: 'row-click', handler: 'onRowClick' },
        { on: 'button-click', handler: 'onButtonClick' },
      ],
      // 组件没有 defineExpose，产物拿不到 refresh()
      expose: 'none',
    },
    self: {
      type: { emit: 'anchor', key: 'type' },
      field: { emit: 'anchor', key: 'field' },
      /** 同 page-table：标题走页面根 form 的 el-form-item label，PageDataCards 没有 title prop */
      title: { emit: 'attr', as: 'label', on: 'el-form-item' },
    },
    props: {
      dataSourceId: { emit: 'derived', by: 'dsRefId', evidence: 'props.dsRefId' },
      columns: { emit: 'prop' },
      searchFields: { emit: 'default', value: [], note: '空搜索字段不落模板' },
      /** 卡片没有列头，PageDataCards 全文无排序消费者（这键是查询/列配置面板跟 page-table 共用时带进来的） */
      sortableFields: { emit: 'drop', kind: 'no-consumer', note: 'PageDataCards 不读 sortableFields，卡片无列头可排；出成 prop 只会落到根 DOM 当摆设' },
      pageSize: { emit: 'default', value: 20, note: '等于组件默认值' },
      pageSizes: { emit: 'default', value: [10, 20, 50], note: '等于组件默认值' },
      pagination: { emit: 'default', value: true, note: '等于组件默认值' },
      showSearch: { emit: 'default', value: false, note: '等于组件默认值' },
      stretch: { emit: 'default', value: false, note: '等于组件默认值' },
      cardMinWidth: { emit: 'default', value: 280, note: '等于组件默认值' },
      collapsibleGroups: { emit: 'default', value: false, note: '等于组件默认值' },
      groupBy: { emit: 'default', value: '', note: '空分组不落模板' },
      actionsPlacement: { emit: 'prop' },
      cardStyle: { emit: 'prop' },
      viewActions: { emit: 'prop' },
      viewDetail: { emit: 'prop' },
      'viewDetail.formMode': { emit: 'derived', by: 'containerDisplayMode' },
      'viewDetail.type': { emit: 'derived', by: 'containerHasForm' },
      viewEvents: { emit: 'default', value: [], note: '空事件组不落模板' },
      designMode: { emit: 'drop', kind: 'ignored-by-runtime', note: '设计器态标记' },
    },
    constAttrs: { externalActions: true },
  },

  // ===== 仪表盘组件族：展示组件，非字段控件、非列表组件 =====

  /**
   * 筛选器：自身不取数（无 dataSourceId），只在改动时向同页广播 setFilter。
   * 广播是渲染器干的活（PageRendererPage.vue:530-540 → broadcastDashFilter :267-278，
   * 靠各组件 ready 上报的实例），产物里没有这层，所以整类只登记得出配置、登记不出联动。
   */
  'dash-filter': {
    tag: 'dash-filter',
    runtime: true,
    widget: true,
    dashFilter: 'source',
    self: WIDGET_SELF,
    props: {
      ...WIDGET_SHARED_PROPS,
      filterType: { emit: 'prop' },
      /** 目标列名；与节点自身 field（容器地址）同名不同层 */
      field: { emit: 'prop' },
      label: { emit: 'default', value: '', note: '空标签等于组件默认值（DashFilter.vue withDefaults）' },
      placeholder: { emit: 'default', value: '', note: '等于组件默认值' },
      options: { emit: 'default', value: '', note: '逗号分隔枚举，空 = select 无候选' },
      /** 编译期开关：false 时产物不接 filter-change（运行期渲染器当前无条件广播，见旁路缺陷记录） */
      autoBroadcast: { emit: 'prop' },
    },
  },
  'dash-kpi': {
    tag: 'dash-kpi',
    runtime: true,
    widget: true,
    dashFilter: 'target',
    self: WIDGET_SELF,
    props: {
      ...WIDGET_SHARED_PROPS,
      title: { emit: 'default', value: '', note: '空标题不落模板（组件回退显示「指标」）' },
      subtitle: { emit: 'default', value: '', note: '等于组件默认值' },
      unit: { emit: 'prop' },
      agg: { emit: 'prop' },
      metric: { emit: 'default', value: null, note: 'count 聚合不需要度量列，null = 组件默认' },
      dataSourceId: { emit: 'derived', by: 'dsRefId', evidence: 'props.dsRefId' },
      /** 组件级固定过滤：JSON 文本，含双引号，出码必须走具名常量而不是裸属性 */
      filter: { emit: 'prop' },
      numberFormat: { emit: 'default', value: '', note: '等于组件默认值（不格式化）' },
      trendEnabled: { emit: 'default', value: false, note: '关闭环比 = 组件默认' },
      trendGrain: { emit: 'default', value: 'day', note: '等于组件默认值' },
      trendField: { emit: 'default', value: '', note: '空时间字段 = 不算上期' },
      sparkline: { emit: 'default', value: false, note: '不开迷你图 = 组件默认' },
      sparkRange: { emit: 'default', value: 12, note: '等于组件默认值' },
    },
  },
  'dash-chart': {
    tag: 'dash-chart',
    runtime: true,
    widget: true,
    dashFilter: 'target',
    self: WIDGET_SELF,
    props: {
      ...WIDGET_SHARED_PROPS,
      title: { emit: 'default', value: '', note: '空标题不落模板' },
      chartType: { emit: 'prop' },
      group: { emit: 'prop' },
      timeGrain: { emit: 'default', value: null, note: 'null = 不分时间桶（组件默认）' },
      agg: { emit: 'prop' },
      metric: { emit: 'default', value: null, note: 'count 聚合不需要度量列' },
      sort: { emit: 'prop' },
      order: { emit: 'prop' },
      limit: { emit: 'prop' },
      dataSourceId: { emit: 'derived', by: 'dsRefId', evidence: 'props.dsRefId' },
      filter: { emit: 'prop' },
    },
  },
  /**
   * 公告栏：数据来自用户端消息接口，压根没有数据源键（register.ts 的 dashNoticeRule 也不带），
   * 可见范围由后端按登录态判定 —— 契约里出现 dataSourceId 之类就是虚报能力。
   */
  'dash-notice': {
    tag: 'dash-notice',
    runtime: true,
    widget: true,
    dashFilter: 'target',
    self: WIDGET_SELF,
    props: {
      ...WIDGET_SHARED_PROPS,
      title: { emit: 'default', value: '', note: '空标题不落模板（组件回退「公告」）' },
      limit: { emit: 'prop' },
      display: { emit: 'prop' },
      interval: { emit: 'prop' },
    },
  },
  /** 待办清单：取工作流任务接口，查询身份（assignee/userId）由组件内部取当前登录用户，配置面没有身份槽位 */
  'dash-todo': {
    tag: 'dash-todo',
    runtime: true,
    widget: true,
    dashFilter: 'target',
    self: WIDGET_SELF,
    props: {
      ...WIDGET_SHARED_PROPS,
      title: { emit: 'default', value: '', note: '空标题不落模板（组件回退「我的待办/已办」）' },
      view: { emit: 'prop' },
      limit: { emit: 'prop' },
      orderBy: { emit: 'prop' },
    },
  },

  // ===== 页面展示组件（page-*）：也走栅格，但节点标题不被渲染器置空，且要自己传 page-key =====

  /**
   * 图表页组件（渲染器把 'page-chart' 注册到 PageDataChartPage，PageRendererPage.vue:126）。
   * 与 dash-chart 是两套东西：配置由 PageChartConfigDialog 整体产出一个 config 对象，
   * 而 dash-chart 是一堆平铺键；两者各自的标题载体也不同（见 WIDGET_SELF_LABELED 注释）。
   */
  'page-chart': {
    tag: 'page-chart',
    runtime: true,
    widget: true,
    needsPageKey: true,
    self: WIDGET_SELF_LABELED,
    props: {
      ...SIZE_MIRROR,
      ...RUNTIME_INJECTED,
      height: { emit: 'default', value: '', note: '空 = 自适应（PageDataChartPage withDefaults height: ""）' },
      title: { emit: 'default', value: '', note: '空标题不落模板（组件标题行缺省不渲染）' },
      dataSourceId: { emit: 'derived', by: 'dsRefId', evidence: 'props.dsRefId' },
      /** 图表配置整块（{type, dimension, measures:[{key,agg}]}）：对象走顶层常量 */
      config: { emit: 'prop' },
    },
  },
  /**
   * KV 详情：数据不是自己取的，是表格行点击后由渲染器拿 detailRefs 调 load(record) 灌进来的
   * （PageRendererPage.vue:245-257、567-571）。产物没有实例登记表，这一段是语义债，必须记账。
   */
  'page-detail': {
    tag: 'page-detail',
    runtime: true,
    widget: true,
    needsPageKey: true,
    self: WIDGET_SELF_LABELED,
    props: {
      ...RUNTIME_INJECTED,
      title: { emit: 'prop' },
      columns: { emit: 'prop' },
      dataSourceId: { emit: 'derived', by: 'dsRefId', evidence: 'props.dsRefId' },
    },
    requires: [
      {
        key: 'recordLinkage',
        note: '记录来源由表格行点击联动，现网靠 PageRendererPage.vue:245-257 的 detailRefs 调 load(record)；产物没有实例登记表：需在产物 onRowClick 里改调本组件 ref 的 load(row)（组件没声明 expose 面，先补 defineExpose 再接）',
      },
    ],
  },
  /** 步骤条：纯展示，不取数（渲染器的数据组件名单 552/592 都不含它），所以没有取数身份槽位 */
  'page-steps': {
    tag: 'page-steps',
    runtime: true,
    widget: true,
    self: WIDGET_SELF_LABELED,
    props: {
      items: { emit: 'prop' },
      active: { emit: 'prop' },
      direction: { emit: 'prop' },
    },
  },

  /**
   * 数据容器：一个组件三种形状（dataContainer.ts:1-14），schema 落盘的是保存态 `props.rule`，
   * 渲染吃的是运行态 `props.childRules`（宿主 normalizeDataContainerForRender 改名，
   * PageRendererPage.vue:496-517）。产物出运行态那一面，改名进重命名登记。
   *
   * 子树**不摊成模板**：容器内部另起一棵 form-create（PageDataContainer.vue:9），
   * `{rows}` / `{row}` 作用域插值是数据到达后由 applyScopeToRules 现场改写子规则的（:89）。
   * 摊平了就是把「运行期取值」提前成「出码期取值」，容器注释里明写这条会让联动失效。
   */
  'page-data-container': {
    tag: 'page-data-container',
    runtime: true,
    widget: true,
    dashFilter: 'target',
    self: WIDGET_SELF,
    props: {
      ...SIZE_MIRROR,
      ...RUNTIME_INJECTED,
      /** 容器自己的标题行（pdc-head），与节点 title 无关 —— 后者被宿主置空 */
      title: { emit: 'prop' },
      queryMode: { emit: 'prop' },
      pageSize: { emit: 'prop' },
      filter: { emit: 'prop' },
      dataSourceId: { emit: 'derived', by: 'dsRefId', evidence: 'props.dsRefId' },
      rule: { emit: 'prop', as: 'childRules' },
    },
    requires: [
      {
        key: 'childRules',
        note: '子树原样交给组件内嵌的 form-create 解释（PageDataContainer.vue:9、applyScopeToRules :89），产物不摊成真模板；{rows}/{row} 作用域插值要靠运行期改写子规则，摊平要先解决「第 i 份怎么寻址」（dataContainer.ts:20-26 的边界）',
      },
    ],
  },
}

/** 字段控件判定：以前靠并行的 FIELD_TAGS 表登记，漏一张就出码丢 v-model —— 现在从能力表反推 */
export const isFieldType = (type: string): boolean => !!TYPE_CONTRACTS[type]?.field

/** 列表类组件（页面主体不是表单字段） */
export const listOf = (type: string): TypeContract['list'] | undefined => TYPE_CONTRACTS[type]?.list

/** 展示组件（仪表盘组件族）：出栅格列，不出 v-model 也不挂 ref */
export const widgetOf = (type: string): boolean => !!TYPE_CONTRACTS[type]?.widget

/** 产物能否给该类型挂 ref：没 defineExpose 的组件挂了也取不到方法，那是假接线。
 * uniapp 端（Task 5.3）：page-list-cards 的 useUniList 实例方法（reload/applyFilter/gotoPage…）
 * 等价 web defineExpose 面，ref 名义挂在节点上、实例方法寻址在 emit 侧对位——按端放开
 * list-ref gate；其余 expose=none 类型两端一致不放。 */
export const refableOf = (type: string, target: 'web' | 'uniapp' = 'web'): boolean => {
  const c = TYPE_CONTRACTS[type]
  if (!c?.runtime || c.widget) return false
  if (c.list?.expose === 'none') return target === 'uniapp' && type === 'page-list-cards'
  return true
}

/** 列表组件的固定事件出口（when='chain' 的出口要该载体真配了链才绑，由 chains 阶段追加） */
export const fixedOutletsOf = (type: string): Array<{ on: string; handler: string }> =>
  (listOf(type)?.events || []).filter((e) => !e.when)

/**
 * 动线 op（chain 动作类型与总线 op 同名共用一份）在产物侧的能力面。
 * gates 是「产物必须真拿得到」的前置条件，缺一就整步记 unsupported；
 * needs 是产物要备的材料（import / 常量 / helper），由 emit 按出现补齐。
 * 表外 op 一律不接线 —— 新增动作类型必须先在这里表态，避免产物里出现没人执行的语句。
 */
export type ChainGate = 'list-ref' | 'container'
export type ChainMaterial = 'message' | 'router' | 'export'
export const ACTION_OPS: Record<string, { gates: ChainGate[]; needs: ChainMaterial[]; note: string }> = {
  'set-filter': { gates: ['list-ref'], needs: [], note: 'setFilter 是列表实例方法，产物靠 ref 调它' },
  refresh: { gates: ['list-ref'], needs: [], note: '刷新走列表实例暴露的 refresh()' },
  'set-page': { gates: ['list-ref'], needs: [], note: '跳页走暴露的 setPage（内部 SearchTable 的 setQuery 不直接给产物）' },
  'set-sort': { gates: ['list-ref'], needs: [], note: '服务端排序走暴露的 setSort' },
  'clear-selection': { gates: ['list-ref'], needs: [], note: '清空选择走暴露的 clearSelection' },
  export: {
    gates: ['list-ref'],
    needs: ['export'],
    note: '导出取列表实例暴露的 records，产物复刻组件 exportData 的 JSON 下载',
  },
  message: { gates: [], needs: ['message'], note: 'ElMessage 按用引入' },
  'open-link': { gates: [], needs: ['router'], note: 'router.push 按用引入 useRouter' },
  delete: { gates: [], needs: [], note: '产物已有 api 模块的 deleteData，删除后刷新列表' },
  'open-container': { gates: ['container'], needs: [], note: '打开容器复用产物的 openContainer' },
  'load-record': { gates: ['container'], needs: [], note: '加载记录＝带 id 打开容器，与总线 load-record 同语义' },
  'close-container': { gates: ['container'], needs: [], note: 'closeContainer 是产物容器段自带的函数' },
  'save-container': { gates: ['container'], needs: [], note: 'confirmSave 是产物容器段自带的函数' },
  script: { gates: [], needs: [], note: '脚本正文出成普通函数；越界标识符或产物没有的上下文整条链不接线' },
}

/**
 * 产物明确不接线的 op 与原因（登记在册，别让人以为「配了就生效」）。
 * 共同点：执行体在组件内部（本地兜底表单/详情弹窗/新增记录），产物没有那层，
 * 换成页面的 formContainer 就是改语义，所以只记账不出码。
 */
export const ACTION_OPS_REJECTED: Record<string, string> = {
  'open-detail': '详情弹窗是列表组件内置的（openDetail→detailVisible），产物没有那层；页面容器不是同一个载体，替代会改变语义',
  'open-create': '运行期打开组件内置的本地兜底表单（openLocalForm），不是页面的 formContainer，产物不做替换',
  edit: '同上：链里的 edit 走组件内置本地表单，产物只有页面容器，替换会改变语义（内建 edit 按钮的兜底另算）',
  'new-record': 'pageActionCatalog 里 renderers 为空，没有任何渲染器消费这个动作',
  'set-value': '组件没有 setValue 暴露面，总线里 configurable 也是 false',
  'reload-record': '重载记录依赖渲染器的 pageEngine/lastRecord 状态机，产物没有',
  'save-record': '总线 op 走页面引擎保存整条记录，产物的保存路径是容器的 confirmSave',
}

/**
 * tableForm 的列对象（props.columns[i]）落点。列不是 rule 节点，但有真实运行期消费者：
 * TableForm.vue:263-271 只读 label / hidden / required（表头星号）/ style 与 rule，
 * formatter 与 fixed 是设计器列配置带进来的，运行期没人读 —— 登记成 no-consumer，
 * 不许跟着列对象整块透传进产物。
 */
export const TABLE_COLUMN_CONTRACT: Record<string, PropEmit> = {
  label: { emit: 'attr', as: 'label', on: 'el-table-column' },
  rule: { emit: 'children' },
  hidden: { emit: 'drop', kind: 'not-in-artifact', note: '隐藏列首版不出码：产物的列都是显式模板，要隐藏需人工删掉对应 el-table-column' },
  required: { emit: 'drop', kind: 'not-in-artifact', note: '列必填在现网只是表头星号（TableForm.vue:269 的 _fc-tf-head-required），产物的行内校验需人工补' },
  style: { emit: 'drop', kind: 'not-in-artifact', note: '列自定义样式不落产物' },
  formatter: { emit: 'drop', kind: 'no-consumer', note: '运行期 TableForm 不读 formatter（只有设计器列配置用）' },
  fixed: { emit: 'drop', kind: 'no-consumer', note: '运行期 TableForm 不读 fixed' },
}

/**
 * fcTable 的几何载体（props.rule）逐键落点。
 * row/col/style/class/layout 都不在模板上落地：产物按 row/col/layout 算出 td 的 colspan/rowspan，
 * style/class 落逐格 td，回读再从 td 坐标反推 —— 所以五个键都登记成 derived，
 * 表外的键（设计器未来加的）走 unsupported，不许随对象静默带走。
 */
export const TABLE_RULE_CONTRACT: Record<string, PropEmit> = {
  row: { emit: 'derived', by: 'tableRows' },
  col: { emit: 'derived', by: 'tableCols' },
  layout: { emit: 'derived', by: 'tableLayout' },
  style: { emit: 'derived', by: 'tableStyle' },
  class: { emit: 'derived', by: 'tableClass' },
}

/**
 * 页面 option 的落点（宿主渲染项，不是 rule 节点）。
 * attr 一律落**页面根 el-form**：现网页面主体就是 form-create 渲染的那棵 form
 * （PageRendererPage.vue:414 只强制隐藏 submitBtn/resetBtn，form.* 原样交给它）。
 * 容器内层 form 不吃这些键 —— 它的 option 由 containerOption 现造，labelWidth 是运行期测量值。
 */
export const OPTION_CONTRACT: Record<string, PropEmit> = {
  'form.labelPosition': { emit: 'attr', as: 'label-position' },
  'form.size': { emit: 'attr', as: 'size' },
  'form.inline': { emit: 'attr', as: 'inline' },
  'form.hideRequiredAsterisk': { emit: 'attr', as: 'hide-required-asterisk' },
  'form.labelWidth': { emit: 'attr', as: 'label-width' },
  'submitBtn.show': { emit: 'drop', kind: 'overridden-at-runtime', note: '运行时无条件强制隐藏提交按钮（PageRendererPage.vue:414）' },
  'submitBtn.innerText': { emit: 'drop', kind: 'not-in-artifact', note: '按钮不出，文案无落点' },
  'resetBtn.show': { emit: 'drop', kind: 'not-in-artifact', note: '运行时同样强制隐藏' },
  'resetBtn.innerText': { emit: 'drop', kind: 'not-in-artifact', note: '按钮不出，文案无落点' },
}

/**
 * 数据源落点表：页面级，逐源逐键。
 * id/refId 进常量表是"refId 必须出成常量表"这条前置决策的落点；
 * 其余三键在本项目里确实没有产物消费者，登记成丢弃而不是不写。
 */
export const DATA_SOURCE_CONTRACT: Record<string, DataSourceEmit> = {
  id: { emit: 'binding' },
  refId: { emit: 'binding' },
  name: { emit: 'drop', kind: 'no-consumer', note: '设计器里的数据源显示名，运行期取数只认 refId' },
  label: { emit: 'drop', kind: 'no-consumer', note: '页内别名，无运行时消费者' },
  searchFields: {
    emit: 'drop',
    kind: 'not-in-artifact',
    note: '唯一消费者是 AI 操作桥注册（PageRendererPage.vue:233），首版产物不接该桥；组件筛选表单吃的是节点级 props.searchFields',
  },
}
