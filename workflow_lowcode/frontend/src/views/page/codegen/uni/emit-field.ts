/**
 * uni 字段族出码（Task 4.1）：IR 字段节点 → uni-ui 模板片段。
 *
 * 与 web emit.fieldBlock 对位（锚点注释 + form 载体 + 控件），差异点：
 *  · form 载体是 uni-forms-item（label 仍读 IR attrs['el-form-item'].label——parse 按
 *    契约 self.title 写入，键名沿用 web 载体名，IR 数据目标无关）；
 *  · v-model 读 artifact.host.vmodel：parse 已按作用域算好前缀（页面级 form.<field> /
 *    行别名 / 子表单对象），本模块不重算（Task 4.3 的嵌套口径由 parse 保证）；
 *  · 属性白名单来自 component-map（单一事实源）：IR prop 未登记即不上模板（uni 侧
 *    丢弃登记），staticProps 恒以字面量出（textarea 的 type=textarea）；
 *  · inputNumber 的 precision 在 uni-number-box 无原生对位 → 封装：:step 派生
 *    （10^-precision）+ @change 取整 handler（script 追加行，供页面 SFC 合并）；
 *  · 无映射的字段类型出 lc:todo 挂点注释（与 web 同纪律：绝不出空标签占位）；
 *  · tableForm 嵌套容器 6.4 起出卡片式子列表编辑器（emitNestedField 的
 *    props.columns[].rule 分支，Task 6.4）。
 * 首行无缩进、嵌套行相对缩进，页面装配（Task 5.x）统一加页内缩进。
 */

import { camelField, pascal, type IrNode, type Unsupported } from '../ir'
import type { UniAppComponentMapping } from '../component-map'
import type { TargetProfile } from '../target-profile'

export interface UniFieldFragment {
  template: string
  /** 产物 script 追加行（precision 取整 handler 等）；无则缺省 */
  script?: string[]
  /** 产物 import 行（Task 11.1：FormulaField 的 LcFormula 等 runtime 具名组件）；无则缺省 */
  imports?: string[]
  /**
   * uni 侧适配不了的字段（Task 5.2 新增通道）：todo 占位只是产物内可见缺口，
   * unsupported 让报告/manifest 与产物看到同一份真相（容器装配收集合并）。
   */
  unsupported?: Unsupported[]
}

/**
 * 字段片段的后端别名（Task 11.1）：页面根级字段族装配时，页面自己持一套表单后端
 * （`pageForm`/`pageErrors`），与容器段后端的 `form`/`errors` 并存不撞名。
 * parse 算好的 v-model 前缀恒为 `form.`（页面作用域口径），这里只做前缀改名，
 * 行别名（group/tableForm 的 rowVar）与子对象路径不受影响。
 */
export interface UniFieldContext {
  formVar?: string
  errorsVar?: string
}

const DEFAULT_FIELD_CTX: Required<UniFieldContext> = { formVar: 'form', errorsVar: 'errors' }

const ctxOf = (ctx?: UniFieldContext): Required<UniFieldContext> => ({ ...DEFAULT_FIELD_CTX, ...ctx })

/** `form.x` → `<formVar>.x`；非 `form.` 前缀（行别名/子对象路径）原样透传 */
const aliasForm = (path: string, ctx: Required<UniFieldContext>): string =>
  ctx.formVar === 'form' || !path.startsWith('form.') ? path : `${ctx.formVar}${path.slice('form'.length)}`

/** 属性片段序列化（与 web emit.propText 同规则）：const → :name="constName"，字符串 → name="v"，其余 → :name="JSON" */
function propText(name: string, node: IrNode): string | null {
  const prop = node.props.find((p) => p.name === name)
  if (!prop) return null
  const v = prop.value
  if (v.kind === 'const') return `:${name}="${v.constName}"`
  // dsRef/globalDataSourceId 只出现在 runtime 组件面（dataPicker/LookupPicker，无 uni 映射），
  // 4.1 映射面（input/textarea/inputNumber/datePicker）不会出现；出现即不落
  if (v.kind !== 'literal') return null
  if (typeof v.value === 'string') return `${name}="${v.value}"`
  return `:${name}="${JSON.stringify(v.value)}"`
}

/** schema prop 字面量取值（precision 等 emit 侧判定用） */
function propLiteral(node: IrNode, name: string): unknown {
  const prop = node.props.find((p) => p.name === name)
  return prop && prop.value.kind === 'literal' ? prop.value.value : undefined
}

export function emitFieldNode(node: IrNode, profile: TargetProfile, ctx?: UniFieldContext): UniFieldFragment {
  const c = ctxOf(ctx)
  const label = String((node.attrs['el-form-item'] as Record<string, unknown> | undefined)?.label ?? node.artifact.field)
  const vmodel = aliasForm(node.artifact.host.vmodel ?? `form.${node.artifact.field}`, c)

  // FormulaField（Task 4.3）：对位组件 LcFormula 在 @lc/runtime-uni，不进 component-map（见 emitFormulaField 注）
  if (node.artifact.type === 'FormulaField' && node.artifact.field) return emitFormulaField(node, label, vmodel, c)

  // 嵌套块容器（Task 4.3）：group/subForm（carrier props.rule）递归出码；tableForm
  // （carrier props.columns[].rule）6.4 起出卡片式子列表编辑器；页面级嵌套容器已在
  // parse 侧整节点降级（无 form 后端），这里不再出块
  if (node.nested && !node.degraded && (node.nested.carrier === 'props.rule' || node.nested.carrier === 'props.columns[].rule')) {
    return emitNestedField(node, profile, label, c)
  }
  const mapping = profile.componentMap?.[node.artifact.type]
  if (!mapping || !node.artifact.field) {
    return {
      template: `<!-- lc:todo node=${node.artifact.id} type=${node.artifact.type} field=${node.artifact.field} 组件类型无 uniapp 出码契约，整字段未出码 -->`,
      unsupported: [
        {
          path: node.artifact.rulePath,
          type: node.artifact.type,
          key: 'field-component',
          message: `字段 ${node.artifact.field || '(无 field)'} 的组件 ${node.artifact.type} 无 uniapp 映射，模板以 lc:todo 占位`,
        },
      ],
    }
  }

  // select 三形态（Task 4.2）：单选 uni-data-select / multiple 弹层 / 远程搜索弹层
  if (node.artifact.type === 'select') return emitSelectField(node, mapping, label, vmodel, c)

  // 属性序：v-model → 固定接线（staticProps）→ 白名单内的 IR props（保持 schema 顺序）
  const attrs: string[] = [`v-model="${vmodel}"`]
  for (const [k, v] of Object.entries(mapping.staticProps ?? {})) {
    attrs.push(typeof v === 'string' ? `${k}="${v}"` : `:${k}="${JSON.stringify(v)}"`)
  }
  for (const [schemaName, tagName] of Object.entries(mapping.props ?? {})) {
    const text = propText(schemaName, node)
    if (text !== null) attrs.push(tagName === true ? text : `${tagName}${text.slice(schemaName.length)}`)
  }

  // inputNumber precision 封装（uni-number-box 无 precision 对位）
  const scriptLines: string[] = []
  if (node.artifact.type === 'inputNumber') {
    const precision = propLiteral(node, 'precision')
    if (typeof precision === 'number') {
      const handler = `on${pascal(camelField(node.artifact.field))}Change`
      attrs.push(`:step="${1 / 10 ** precision}"`)
      attrs.push(`@change="${handler}"`)
      scriptLines.push(
        `const ${handler} = (v: number) => {`,
        `  ${vmodel} = Number(Number(v).toFixed(${precision}))`,
        `}`,
      )
    }
  }

  const template = [
    `<!-- ${node.artifact.anchor} -->`,
    `${formItemOpen(node, label, c)}`,
    `  <${mapping.tag} ${attrs.join(' ')} />`,
    `</uni-forms-item>`,
  ].join('\n')

  return scriptLines.length ? { template, script: scriptLines } : { template }
}

/**
 * uni-forms-item 开标签（Task 4.4 必填/校验落法）：label + name（字段寻址，恒出）
 * + required（契约 $required 落 el-form-item 载体的值 === true 才出——uni-forms-item
 * 的星标视觉）+ :error-message（恒出——errors 由页面装配的 useUniForm.validate 提供
 * （Task 3.2），校验消息按字段写 errors[field]，模板逐字段展示）。
 * 所有字段载体（通用字段族/select 三形态/group/subForm/FormulaField）统一走这里，
 * 开标签形状由本函数单点锁定。
 */
function formItemOpen(node: IrNode, label: string, ctx: Required<UniFieldContext>): string {
  const field = node.artifact.field
  const required = (node.attrs['el-form-item'] as Record<string, unknown> | undefined)?.required === true
  return `<uni-forms-item label="${label}" name="${field}"${required ? ' required' : ''} :error-message="${ctx.errorsVar}.${field}">`
}

/**
 * select 三形态（Task 4.2）：
 *  · 单选 → uni-data-select 原生下拉：v-model 直绑值（无 picker 的 index↔value 映射
 *    glue）；:localdata="<config>.options" + format="{label}" 把 schema 的
 *    {label,value} 选项适配成组件要求的 text 显示——常量保持 IR 原状，数据零拷贝；
 *  · multiple → 自绘底部弹层：checkbox-group 勾选即生效（对位 el-select multiple 的
 *    「勾选即生效、无确定键」语义）；filterable（远程搜索）→ 自绘底部弹层：
 *    uni-search-bar 本地过滤常量选项，单选即点即关（真远程取数是动作/数据源出口的
 *    事，Task 5.3 接线）。uni-data-select 1.5.x 原生已支持 multiple（实测
 *    node_modules），spec 仍走自绘弹层：绝对定位下拉在 MP 表单页有裁剪风险，底部
 *    弹层是更稳的移动端形态；
 *  · options 常量缺失（config 缺省或 obj.options 非数组）→ 一律降级单选空下拉
 *    （弹层形态没有数据支撑是死 UI）；multiple/filterable 不在映射白名单——它们是
 *    形态分支条件，不是透传 prop，白名单缺登记即不会漏到模板上。
 * 属性序：v-model → options 绑定（:localdata + format）→ 白名单 props。
 * 常量声明是页面装配（Task 8.x）从 ir.consts 统一出的，片段只消费引用；
 * 弹层形态需要页面 script 预置 import { ref, computed } from 'vue'（装配侧恒出）。
 */
function emitSelectField(
  node: IrNode,
  mapping: UniAppComponentMapping,
  label: string,
  vmodel: string,
  ctx: Required<UniFieldContext>,
): UniFieldFragment {
  const options = optionsRefOf(node)
  const inst = `lcSel${pascal(camelField(node.artifact.field))}`
  // 白名单 props（与通用路径同规则，但无 v-model/staticProps 前置——下方按形态自行拼）
  const attrs: string[] = []
  for (const [schemaName, tagName] of Object.entries(mapping.props ?? {})) {
    const text = propText(schemaName, node)
    if (text !== null) {
      // 改名：从 "=" 处截断取值侧，绑定符（:）按原属性是否绑定重建
      const bind = text.startsWith(':') ? ':' : ''
      attrs.push(tagName === true ? text : `${bind}${tagName}${text.slice(text.indexOf('='))}`)
    }
  }

  // —— 形态一：单选 uni-data-select（含无 options 降级：弹层没有数据支撑是死 UI）——
  if (!options || (propLiteral(node, 'multiple') !== true && propLiteral(node, 'filterable') !== true)) {
    const local = options ? [`:localdata="${options}"`, `format="{label}"`] : []
    return {
      template: [
        `<!-- ${node.artifact.anchor} -->`,
        `${formItemOpen(node, label, ctx)}`,
        `  <${mapping.tag} ${['v-model' + `="${vmodel}"`, ...local, ...attrs].join(' ').trimEnd()} />`,
        `</uni-forms-item>`,
      ].join('\n'),
    }
  }

  // 弹层公共骨架：触发器（已选 label 或占位）+ uni-popup 底部弹层
  const trigger = [
    `  <view class="lc-select" @click="${inst}Popup?.open()">`,
    `    <text :class="{ 'lc-select__placeholder': !${inst}Label }">{{ ${inst}Label || '请选择' }}</text>`,
    `  </view>`,
    `  <uni-popup ref="${inst}Popup" type="bottom">`,
    `    <view class="lc-select-sheet">`,
  ]
  const triggerClose = [`    </view>`, `  </uni-popup>`]

  // —— 形态二：multiple 自绘弹层（checkbox-group 勾选即生效）——
  if (propLiteral(node, 'multiple') === true) {
    return {
      template: [
        `<!-- ${node.artifact.anchor} -->`,
        `${formItemOpen(node, label, ctx)}`,
        ...trigger,
        `      <checkbox-group class="lc-select-sheet__options" @change="${inst}Change">`,
        `        <label v-for="opt in ${options}" :key="opt.value" class="lc-select-sheet__option">`,
        `          <checkbox :value="String(opt.value)" :checked="(${vmodel} || []).includes(opt.value)" />`,
        `          <text>{{ opt.label }}</text>`,
        `        </label>`,
        `      </checkbox-group>`,
        ...triggerClose,
        `</uni-forms-item>`,
      ].join('\n'),
      script: [
        `const ${inst}Popup = ref()`,
        `const ${inst}Label = computed(() =>`,
        `  (Array.isArray(${vmodel}) ? ${vmodel} : [])`,
        `    .map((v) => ${options}.find((o) => o.value === v)?.label ?? String(v))`,
        `    .join('、'))`,
        `function ${inst}Change(e: { detail: { value: string[] } }) {`,
        `  ${vmodel} = e.detail.value.map((k) => ${options}.find((o) => String(o.value) === k)?.value)`,
        `}`,
      ],
    }
  }

  // —— 形态三：filterable 远程搜索自绘弹层（uni-search-bar 本地过滤 + 即点即关）——
  return {
    template: [
      `<!-- ${node.artifact.anchor} -->`,
      `${formItemOpen(node, label, ctx)}`,
      ...trigger,
      `      <uni-search-bar v-model="${inst}Keyword" class="lc-select-sheet__search" placeholder="搜索" cancel-button="none" />`,
      `      <scroll-view scroll-y class="lc-select-sheet__options">`,
      `        <view v-for="opt in ${inst}Options" :key="opt.value" class="lc-select-sheet__option" @click="${inst}Pick(opt)">`,
      `          <text>{{ opt.label }}</text>`,
      `          <uni-icons v-if="opt.value === ${vmodel}" type="checkmarkempty" size="18" />`,
      `        </view>`,
      `      </scroll-view>`,
      ...triggerClose,
      `</uni-forms-item>`,
    ].join('\n'),
    script: [
      `const ${inst}Popup = ref()`,
      `const ${inst}Keyword = ref('')`,
      `const ${inst}Label = computed(() => ${options}.find((o) => o.value === ${vmodel})?.label ?? '')`,
      `const ${inst}Options = computed(() => {`,
      `  const k = ${inst}Keyword.value.trim()`,
      `  return k ? ${options}.filter((o) => String(o.label).includes(k)) : ${options}`,
      `})`,
      `function ${inst}Pick(opt: { value: unknown }) {`,
      `  ${vmodel} = opt.value`,
      `  ${inst}Keyword.value = ''`,
      `  ${inst}Popup.value?.close()`,
      `}`,
    ],
  }
}

/** options 常量引用（"<config>.options"）；config 缺省或 obj.options 非数组 → null（降级单选空下拉） */
function optionsRefOf(node: IrNode): string | null {
  const cfg = node.config
  return cfg && Array.isArray(cfg.obj.options) ? `${cfg.name}.options` : null
}

/**
 * 嵌套块容器（Task 4.3）：group（行数组）与 subForm（单对象）。
 * 与 web renderNested 同构：lc-nested 块 + 行壳/子块 + 子节点 emitFieldNode 递归
 * （子 v-model 由 parse 的 planNested 按作用域算好：行别名 rowVar.field / 子对象
 * form.<容器>.<子>，本模块不重算）。uni 侧差异：
 *  · 行壳 card 型 uni-card、其余 view；行操作 el-button → button（:disabled 语义
 *    等价镜像，min/max 条件读 config 常量）；行头只在有真内容时出——web 侧空钩子
 *    span 恒出（它的 golden 锁了这个字节形状），uni 侧不出空视图；
 *  · 行函数 script 由片段携带（web 集中在页面 script 段），仅出模板真绑到的
 *    handler（没配增删/排序不留空函数——TS6133 孤儿），新行形状 = rowKeys，
 *    move 的边界守卫与 web 同一套；
 *  · tableForm（carrier props.columns[].rule）6.4 起出卡片式子列表编辑器（Task 6.4，
 *    design 决策 2）：web 是 el-table + 列模板，uni 每行一张卡片、字段纵向排；列头
 *    label 无载体不再重复（字段自身 form-item label 保留）；hidden 列 parse 侧整列
 *    降级落 todo 行；增删/上下限沿用 config（deletable→行删除键 min 禁用态、addable→
 *    添加行 max 条件、showIndex→行头序号）；filterEmptyColumn 是回填写入过滤
 *    （TableForm.vue:146），产物按原样回填、值在 config 常量供人工接管；行函数与
 *    group 同一套（新行形状 = rowKeys）。
 */
function emitNestedField(node: IrNode, profile: TargetProfile, label: string, ctx: Required<UniFieldContext>): UniFieldFragment {
  const n = node.nested!
  const cfgName = node.config?.name
  const has = (k: string) => !!node.config && k in node.config.obj
  const opt = (k: string, fallback: string) => (has(k) ? `${cfgName}.${k}` : fallback)
  const rows = aliasForm(n.valuePath, ctx)
  // 行函数名（group/tableForm 共用）：add< Pascal(field) >Row / remove… / move…
  const base = pascal(camelField(node.artifact.field))
  const h = { add: `add${base}Row`, remove: `remove${base}Row`, move: `move${base}Row` }

  // 子节点递归：parse 降级的子节点落 todo 行，其余走 emitFieldNode（子锚点/label/v-model
  // 都在子节点 artifact 上）。子片段的 script（inputNumber precision 取整 handler 等）
  // 并进本容器的 script——容器/页面装配只消费本函数的返回，不递归收子件 script。
  const childScripts: string[] = []
  const childFrag = (c: IrNode, pad: string): string[] => {
    if (c.degraded) {
      return [`${pad}<!-- lc:todo node=${c.artifact.id} type=${c.artifact.type} field=${c.artifact.field} ${c.degradeReason ?? 'parse 降级'} -->`]
    }
    const f = emitFieldNode(c, profile, ctx)
    childScripts.push(...(f.script ?? []))
    return f.template.split('\n').map((l) => `${pad}${l}`)
  }

  // —— subForm：值形态是对象，子字段直接挂 form.<容器字段>（v-model 由 parse 算好）——
  if (n.shape === 'object') {
    return {
      template: [
        `<!-- ${node.artifact.anchor} -->`,
        `${formItemOpen(node, label, ctx)}`,
        `  <view class="lc-nested lc-nested--sub">`,
        ...node.children.flatMap((c) => childFrag(c, '    ')),
        `  </view>`,
        `</uni-forms-item>`,
      ].join('\n'),
      ...(childScripts.length ? { script: childScripts } : {}),
    }
  }

  // —— tableForm：卡片式子列表编辑器（Task 6.4，design 决策 2）——
  // web 是 el-table + 列模板（emit.ts 949-980）；uni 无表格编辑形态 → 每行一张卡片、
  // 字段纵向排。列头（el-table-column label）无载体，列 label 不再重复出——字段自身
  // 的 uni-forms-item label 保留（kv 载体合一）；hidden 列 parse 侧已整列降级，不进
  // columns 迭代。增删/上下限沿用 config：deletable → 行头删除键（min 下限禁用态）、
  // addable → 添加行（max 上限条件，condOf 与 web 同构）、showIndex → 行头序号
  // （web innerText idx+1，uni 用 {{ i + 1 }}）；filterEmptyColumn 是回填写入过滤
  // （TableForm.vue:146），产物按原样回填，值在 config 常量里供人工接管，不出模板。
  // 行函数 add/remove 与 group 同一套（addPascalRow/removePascalRow，新行形状 = rowKeys）。
  if (n.carrier === 'props.columns[].rule') {
    const headLines: string[] = []
    const ops: string[] = []
    if (has('showIndex')) ops.push(`        <text class="lc-nested-row-idx">{{ i + 1 }}</text>`)
    if (has('deletable')) {
      ops.push(
        `        <button size="mini" :disabled="(${rows} || []).length <= ${opt('min', '0')}" @click="${h.remove}(i)">删除</button>`,
      )
    }
    if (ops.length) {
      headLines.push(`      <view class="lc-nested-row-head">`, ...ops, `      </view>`)
    }
    const template = [
      `<!-- ${node.artifact.anchor} -->`,
      `${formItemOpen(node, label, ctx)}`,
      `  <view class="lc-nested lc-nested--table">`,
      `    <view class="lc-nested-row" v-for="(${n.rowVar}, i) in ${rows} || []" :key="i">`,
      ...headLines,
      ...node.nested!.columns.flatMap((col) =>
        col.children.flatMap((c) => childFrag(c, '      ')),
      ),
      `    </view>`,
      ...(has('addable') ? [`    <button v-if="${condOf(node, cfgName!, rows, 'addable')}" @click="${h.add}">添加</button>`] : []),
      `  </view>`,
      `</uni-forms-item>`,
    ].join('\n')
    const script: string[] = []
    if (has('addable') || has('deletable')) {
      const keys = n.rowKeys.map((k) => `${k}: ''`).join(', ')
      script.push(`/** ${node.artifact.anchor} 行增删（新行形状 = 子字段） */`)
      if (has('addable')) script.push(`function ${h.add}() { ${rows}.push(${keys ? `{ ${keys} }` : '{}'}) }`)
      if (has('deletable')) script.push(`function ${h.remove}(i: number) { ${rows}.splice(i, 1) }`)
    }
    const all = [...script, ...childScripts]
    return all.length ? { template, script: all } : { template }
  }

  // —— group：行数组 + 行壳 + 行头/操作 + 添加键 ——
  const rowTag = node.config?.obj.type === 'card' ? 'uni-card' : 'view'

  const ops: string[] = []
  if (has('sortBtn')) {
    ops.push(`          <button size="mini" :disabled="i === 0" @click="${h.move}(i, -1)">上移</button>`)
    ops.push(`          <button size="mini" :disabled="i === (${rows} || []).length - 1" @click="${h.move}(i, 1)">下移</button>`)
  }
  if (has('button')) {
    ops.push(`          <button size="mini" :disabled="(${rows} || []).length <= ${opt('min', '0')}" @click="${h.remove}(i)">删除</button>`)
  }
  const headLines: string[] = []
  if (has('title') || ops.length) {
    headLines.push(`      <view class="lc-nested-row-head">`)
    if (has('title')) headLines.push(`        <text>{{ ${cfgName}.title.replace('{index}', String(i + 1)) }}</text>`)
    if (ops.length) headLines.push(`        <view class="lc-nested-row-ops">`, ...ops, `        </view>`)
    headLines.push(`      </view>`)
  }

  const template = [
    `<!-- ${node.artifact.anchor} -->`,
    `${formItemOpen(node, label, ctx)}`,
    `  <view class="lc-nested lc-nested--group">`,
    `    <${rowTag} class="lc-nested-row" v-for="(${n.rowVar}, i) in ${rows} || []" :key="i">`,
    ...headLines,
    ...node.children.flatMap((c) => childFrag(c, '      ')),
    `    </${rowTag}>`,
    ...(has('button') ? [`    <button v-if="${condOf(node, cfgName!, rows, 'button')}" @click="${h.add}">添加</button>`] : []),
    `  </view>`,
    `</uni-forms-item>`,
  ].join('\n')

  const script: string[] = []
  if (has('button') || has('sortBtn')) {
    const keys = n.rowKeys.map((k) => `${k}: ''`).join(', ')
    script.push(`/** ${node.artifact.anchor} 行增删（新行形状 = 子字段） */`)
    if (has('button')) {
      script.push(`function ${h.add}() { ${rows}.push(${keys ? `{ ${keys} }` : '{}'}) }`)
      script.push(`function ${h.remove}(i: number) { ${rows}.splice(i, 1) }`)
    }
    if (has('sortBtn')) {
      script.push(`function ${h.move}(i: number, d: number) {`)
      script.push(`  const rows = ${rows}`)
      script.push('  const j = i + d')
      script.push('  if (j < 0 || j >= rows.length) return')
      script.push('  rows.splice(j, 0, rows.splice(i, 1)[0])')
      script.push('}')
    }
  }
  const all = [...script, ...childScripts]
  return all.length ? { template, script: all } : { template }
}

/** 添加键显隐条件（与 web emit.condOf 同构）：max 缺省 '0' → !0 恒真 */
function condOf(node: IrNode, cfgName: string, rows: string, toggle: string): string {
  const max = node.config && 'max' in node.config.obj ? `${cfgName}.max` : '0'
  return `${cfgName}.${toggle} && (!${max} || (${rows} || []).length < ${max})`
}

/**
 * FormulaField（Task 4.3）：对位组件 LcFormula（@lc/runtime-uni/formula，formulaEval
 * 纯函数移植 + form 数据后端）。
 *  · v-model = vmodel：组件经 update:modelValue 回写自身字段（NaN → null 不提交脏值）；
 *  · :form = vmodel 去末段——公式只引用同层字段（formRuleWalk 第一版口径），页级是
 *    页面 model，嵌套时是行/子对象；
 *  · expression/precision/prefix/suffix/placeholder/disabled 按 IR 白名单透传（契约
 *    default 面已在 parse 侧裁掉等值缺省，IR 里没有的就不上模板）；
 *  · 不进 component-map：映射表键即画布件（@lc/ui-mobile）清单，加映射会拖入画布
 *    渲染与包测试涟漪——emit 特判分支（同 select 先例），画布侧 FormulaField 渲染
 *    维持现状（后续任务补）；
 *  · 页面装配侧对含 FormulaField 的页面出 import { LcFormula } from '@lc/runtime-uni/formula'。
 */
const FORMULA_PROPS: Record<string, string | true> = {
  expression: true,
  precision: true,
  prefix: true,
  suffix: true,
  placeholder: true,
  disabled: true,
}

function emitFormulaField(node: IrNode, label: string, vmodel: string, ctx: Required<UniFieldContext>): UniFieldFragment {
  const backend = vmodel.slice(0, vmodel.lastIndexOf('.'))
  const attrs: string[] = [`v-model="${vmodel}"`, `:form="${backend}"`]
  for (const [schemaName, tagName] of Object.entries(FORMULA_PROPS)) {
    const text = propText(schemaName, node)
    if (text !== null) {
      const bind = text.startsWith(':') ? ':' : ''
      attrs.push(tagName === true ? text : `${bind}${tagName}${text.slice(text.indexOf('='))}`)
    }
  }
  return {
    template: [
      `<!-- ${node.artifact.anchor} -->`,
      `${formItemOpen(node, label, ctx)}`,
      `  <LcFormula ${attrs.join(' ')} />`,
      `</uni-forms-item>`,
    ].join('\n'),
    // LcFormula 是 @lc/runtime-uni 的 runtime 具名组件：装配侧必须带上 import，
    // 否则产物引用未声明组件（Vue 编译告警 + 运行期渲染空）
    imports: [`import { LcFormula } from '@lc/runtime-uni/formula'`],
  }
}
