/**
 * 业务表单（type=BUSINESS）发布时的组件 type 白名单。
 *
 * 唯一事实来源 = 前端设计器真实注册的组件（frontend/src/vendor/config/rule/*.js
 * 的 `name` / `rule.type`）∪ 项目自定义组件（FormDesigner.vue addComponent）∪
 * form-create 内部布局名。
 *
 * ⚠️ 黑名单制已被证明不设防：AI formgen 曾生成不存在的 `date` / `inputTextarea`
 * 类型（设计器渲染为「不支持」占位）却照常通过校验、发布建表。
 * 因此这里改为**白名单制**：不在集合内的 type 一律 400 拒绝发布。
 *
 * 校验入口：`collectUnknownBusinessComponentTypes`（form-definition-write.service
 * 的 `validateBusinessSchema` 调用）；递归覆盖 children / props.rule / props.columns[].rule。
 */
export const BUSINESS_FORM_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  // ===== 业务字段（可渲染、可映射列） =====
  'input', // 单行/多行文本（多行 = input + props.type=textarea，同设计器「多行输入框」产物）
  'textarea', // form-create 注册的 input 别名，容错放行
  'inputNumber',
  'select',
  'radio',
  'checkbox',
  'datePicker', // 日期/日期时间/区间（props.type = date/datetime/daterange/...）
  'timePicker',
  'switch',
  'rate',
  'slider',
  'cascader',
  'colorPicker',
  'upload',
  'tree',
  'fcEditor', // 富文本（vendor editor.js）
  'signaturePad',
  // ===== 外部数据展示（合法、不生成业务列） =====
  'dataPicker',
  'page-list-cards',
  'page-table',
  'LookupPicker',
  // ===== 子表（发布流程建独立物理表） =====
  'group',
  'tableForm',
  'subForm',
  // ===== 布局/辅助（无 field，纯渲染） =====
  'fcRow',
  'fcTable',
  'fcFrame',
  'fcFragment',
  'fcGroup',
  'col',
  'space',
  'div',
  'html',
  'text',
  'elCard',
  'elCollapse',
  'elCollapseItem',
  'elTabs',
  'elTabPane',
  'elDivider',
  'elTag',
  'elAlert',
  'elButton',
  'elImage',
])

/**
 * 递归收集 schema rule 里不在白名单的组件 type（保持出现顺序，去重交给调用方）。
 *
 * 与 `collectExternalDisplayFields` 同款遍历：children、props.rule、props.columns[].rule。
 * type 缺省/空串的节点不视为未知（与「type 为空也算有效列」的既有语义一致）。
 */
export function collectUnknownBusinessComponentTypes(
  rules: Array<Record<string, unknown>>,
): string[] {
  const out: string[] = []
  walk(rules, out)
  return out
}

function walk(rules: unknown[], out: string[]): void {
  for (const entry of rules) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const rule = entry as Record<string, unknown>
    const type = typeof rule.type === 'string' ? rule.type.trim() : ''
    if (type !== '' && !BUSINESS_FORM_ALLOWED_TYPES.has(type)) out.push(type)

    const children = rule.children
    if (Array.isArray(children)) walk(children, out)

    const props = rule.props
    if (props !== null && typeof props === 'object' && !Array.isArray(props)) {
      const propsRecord = props as Record<string, unknown>
      const propsRule = propsRecord.rule
      if (Array.isArray(propsRule)) walk(propsRule, out)
      const propsColumns = propsRecord.columns
      if (Array.isArray(propsColumns)) {
        for (const column of propsColumns) {
          if (column === null || typeof column !== 'object' || Array.isArray(column)) continue
          const columnRule = (column as Record<string, unknown>).rule
          if (Array.isArray(columnRule)) walk(columnRule, out)
        }
      }
    }
  }
}
