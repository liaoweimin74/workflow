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

export interface TypeContract {
  /** 产物标签；runtime 组件（page-table）或 EP 原生（el-drawer / el-input） */
  tag: string
  /** 是否保留 runtime 标签（false = 出成真模板） */
  runtime?: boolean
  /** 容器类：标签与尺寸属性名由展示方式决定（数据表格的 viewDetail.formMode） */
  displayModeDriven?: boolean
  /** 节点自身键（type/field/title/display/... ，不在 props 里） */
  self?: Record<string, PropEmit>
  /** props 内键；路径支持数组下标模式：columns[].onCellClick */
  props: Record<string, PropEmit>
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

export const TYPE_CONTRACTS: Record<string, TypeContract> = {
  'page-table': {
    tag: 'page-table',
    runtime: true,
    self: {
      type: { emit: 'anchor', key: 'type' },
      field: { emit: 'anchor', key: 'field' },
      title: { emit: 'default', value: '', note: '数据组件无可见标题' },
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
      border: { emit: 'prop' },
      stripe: { emit: 'prop' },
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
    self: {
      type: { emit: 'anchor', key: 'type' },
      field: { emit: 'anchor', key: 'field' },
      title: { emit: 'attr', as: 'label', on: 'el-form-item' },
    },
    props: {},
  },
}

/** 字段控件类型 → EP 标签（首版只认 input，其余进 unsupported 占位） */
export const FIELD_TAGS: Record<string, string> = {
  input: 'el-input',
}

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
