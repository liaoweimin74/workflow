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

  const label = (node.attrs['el-form-item'] as Record<string, unknown> | undefined)?.label ?? node.artifact.field
  const vmodel = node.artifact.host.vmodel ?? `form.${node.artifact.field}`

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
