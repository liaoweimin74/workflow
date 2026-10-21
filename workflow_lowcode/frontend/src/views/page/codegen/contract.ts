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
  /** 落元素属性（容器/表单控件）；on 缺省为本类型 tag */
  | { emit: 'attr'; as?: string; by?: AttrBy; on?: string }
  /** 子规则（容器的 props.rule），交给容器递归出码 */
  | { emit: 'children' }
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
export type DerivedBy = 'dsRefId' | 'containerDisplayMode' | 'containerHasForm' | 'footerConfirmButton' | 'footerCancelButton'

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
   */
  list?: { events: Array<{ on: string; handler: string }>; expose?: 'refresh' | 'none' }
  /** 容器类：标签与尺寸属性名由展示方式决定（数据表格的 viewDetail.formMode） */
  displayModeDriven?: boolean
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
}

export const TYPE_CONTRACTS: Record<string, TypeContract> = {

  'page-table': {
    tag: 'page-table',
    runtime: true,
    list: {
      events: [
        { on: 'row-click', handler: 'onRowClick' },
        { on: 'button-click', handler: 'onButtonClick' },
        { on: 'selection-change', handler: 'onSelectionChange' },
      ],
      expose: 'refresh',
    },
    self: {
      type: { emit: 'anchor', key: 'type' },
      field: { emit: 'anchor', key: 'field' },
      title: { emit: 'drop', kind: 'not-in-artifact', note: 'PageDataTable 无 title prop：写进模板只会落到组件根 DOM 变成浏览器原生 title 悬停提示。现网这个标题其实看得见 —— form-create 把每个节点包在 el-form-item 里当 label（真机 /page/cardlist_test?preview=true 量到 el-form-item--label-right + el-col-24.fc-form-col），产物还没有「页面主体 el-form + 列表节点 label 载体」这层，先丢弃止血' },
    },
    props: {
      dataSourceId: { emit: 'derived', by: 'dsRefId', evidence: 'props.dsRefId' },
      columns: { emit: 'prop' },
      // 列点击链首版不出码：整列数组照常出，链在里面 → 必须登记，不能随数组一起静默带走
      'columns[].onCellClick': { emit: 'drop', kind: 'not-in-artifact', note: '列点击链首版不出码，需人工在产物里补 handler' },
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
     * 产物接管按钮语义的开关：为真时组件把 action/toolbar 按钮只 emit `button-click`，
     * 不再派发 pageActionBus、也不再弹组件自带的兜底表单（那份表单按数据源业务表单生成，
     * 跟页面配的容器不是同一个）。必须与 list.events 里的 button-click 成对出现。
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
      // 选择器只认页面级数据源绑定 id，refId 由运行期从 activeDsBindings 解析
      dataSourceId: { emit: 'prop' },
      displayField: { emit: 'prop' },
      searchColumns: { emit: 'prop' },
      columns: { emit: 'prop' },
      maxCount: { emit: 'prop' },
      clearOnCascadeChange: { emit: 'default', value: false },
      allowCreate: { emit: 'default', value: false },
      detailReadonly: { emit: 'default', value: true },
    },
    requires: [
      {
        key: 'dataSourceId',
        note: 'DataPicker 取 refId 走 activeDsBindings 模块级存储（DataPicker.vue:261-265），产物里没有页面绑定表；globalDataSourceId 才是可直接内联的入口，需把 dataSourceId 换算成 refId 后改出 global-data-source-id',
      },
    ],
  },
  LookupPicker: {
    tag: 'LookupPicker',
    runtime: true,
    field: true,
    self: FIELD_SELF,
    props: {
      dataSourceId: { emit: 'prop' },
      displayField: { emit: 'prop' },
      idField: { emit: 'prop' },
      returnFields: { emit: 'prop' },
      searchColumns: { emit: 'prop' },
      columns: { emit: 'prop' },
    },
    requires: [
      {
        key: 'dataSourceId',
        note: 'LookupPicker 只有 dataSourceId 一条入口，refId 全靠 activeDsBindings（LookupPicker.vue:111-117），无 globalDataSourceId 可用；产物要跑得先给组件加 refId prop 或在页面里注册绑定',
      },
      {
        key: 'returnFields',
        note: '带回靠 formCreateInject.api.setValue 写别的字段（含 idField），出码产物是裸 v-model 表单，没有 form-create 实例；需把带回写成 handler 里的显式赋值',
      },
    ],
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
    requires: [
      {
        key: 'expression',
        note: '求值逐依赖走 formCreateInject.api.getValue（FormulaField.vue:79-89）并 watchEffect 回写自身字段；产物是裸 v-model 表单没有 form-create 实例，需改成对 form 的 computed（formulaEval.parseFormula 可直接复用），否则该字段恒为空',
      },
    ],
  },
  'page-list-cards': {
    tag: 'page-list-cards',
    runtime: true,
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
      title: { emit: 'drop', kind: 'not-in-artifact', note: 'PageDataCards 无 title prop（同 PageDataTable）：写进模板只会落到组件根 DOM 变成原生 title 悬停提示；现网的可见标题走 form-create 的 el-form-item label，产物缺该载体（见 page-table.self.title 注）' },
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
}

/** 字段控件判定：以前靠并行的 FIELD_TAGS 表登记，漏一张就出码丢 v-model —— 现在从能力表反推 */
export const isFieldType = (type: string): boolean => !!TYPE_CONTRACTS[type]?.field

/** 列表类组件（页面主体不是表单字段） */
export const listOf = (type: string): TypeContract['list'] | undefined => TYPE_CONTRACTS[type]?.list

/** 页面 option 的落点（宿主渲染项，不是 rule 节点） */
export const OPTION_CONTRACT: Record<string, PropEmit> = {
  'form.labelPosition': { emit: 'attr', as: 'label-position' },
  'form.size': { emit: 'attr', as: 'size' },
  'form.inline': { emit: 'attr', as: 'inline' },
  'form.hideRequiredAsterisk': { emit: 'attr', as: 'hide-required-asterisk' },
  'form.labelWidth': {
    emit: 'drop',
    kind: 'overridden-at-runtime',
    note: '容器场景 labelWidth 由 measureFormLabelWidth 运行期测量覆盖（PageRendererPage.vue:704），产物改用 CSS 变量不做 DOM 测量',
  },
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
