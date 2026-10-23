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
 *  · 无映射的字段类型出 lc:todo 挂点注释（与 web 同纪律：绝不出空标签占位）。
 * 首行无缩进、嵌套行相对缩进，页面装配（Task 5.x）统一加页内缩进。
 */

import { camelField, pascal, type IrNode } from '../ir'
import type { UniAppComponentMapping } from '../component-map'
import type { TargetProfile } from '../target-profile'

export interface UniFieldFragment {
  template: string
  /** 产物 script 追加行（precision 取整 handler 等）；无则缺省 */
  script?: string[]
}

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

export function emitFieldNode(node: IrNode, profile: TargetProfile): UniFieldFragment {
  const mapping = profile.componentMap?.[node.artifact.type]
  if (!mapping || !node.artifact.field) {
    return {
      template: `<!-- lc:todo node=${node.artifact.id} type=${node.artifact.type} field=${node.artifact.field} 组件类型无 uniapp 出码契约，整字段未出码 -->`,
    }
  }

  const label = String((node.attrs['el-form-item'] as Record<string, unknown> | undefined)?.label ?? node.artifact.field)
  const vmodel = node.artifact.host.vmodel ?? `form.${node.artifact.field}`

  // select 三形态（Task 4.2）：单选 uni-data-select / multiple 弹层 / 远程搜索弹层
  if (node.artifact.type === 'select') return emitSelectField(node, mapping, label, vmodel)

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
    `<uni-forms-item label="${label}">`,
    `  <${mapping.tag} ${attrs.join(' ')} />`,
    `</uni-forms-item>`,
  ].join('\n')

  return scriptLines.length ? { template, script: scriptLines } : { template }
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
function emitSelectField(node: IrNode, mapping: UniAppComponentMapping, label: string, vmodel: string): UniFieldFragment {
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
        `<uni-forms-item label="${label}">`,
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
        `<uni-forms-item label="${label}">`,
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
      `<uni-forms-item label="${label}">`,
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
