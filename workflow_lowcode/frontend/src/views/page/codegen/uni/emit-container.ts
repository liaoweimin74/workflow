/**
 * uni 容器段出码（Task 5.2）：formContainer → uni-popup 弹层 + 三键 + 字段族装配。
 *
 * 对位 web 容器段（emit.ts 246-299 容器函数 + 832-849 抽屉模板 + 112-137 fields 推导），
 * uni 形态差异：
 *  · el-dialog/el-drawer → uni-popup 底部弹层（displayMode 运行期驱动，uni 首版统一弹层
 *    形态）；tabTitle 出弹层头（attrs 载体 title，rule.title 只是设计器节点名不出）；
 *  · 字段子节点走 emitFieldNode（v-model= form.<field> 由 parse 定好），缩进 4 嵌进弹层体；
 *    无 uniapp 映射的字段落 lc:todo + unsupported（UniFieldFragment.unsupported 通道）；
 *  · 三键 footer：readonly → 关闭，else 取消 + 确定（镜像 web 841-845；平铺 v-if，
 *    不用 template v-else 包裹——MP 编译器对 template 分支合并有裁剪风险）；
 *  · formRules 推导镜像 web fields 推导：嵌套容器按 shape 给 init []/{}（不递归子字段——
 *    值挂在行对象/子对象上，摊平就是第二套真相），叶字段全 ''；写回目标并进声明
 *    （对齐 DsBindingEngine 回填口径），带回接线登记 unsupported；
 *  · form 后端 = useUniForm（model 别名 form + errors/validate/reset：errors 是字段片段
 *    :error-message 的依赖；validate 在 confirmSave 前置——web 由 form-create 运行时校验，
 *    uni 出码期静态化，失败 toast 不提交）；
 *  · CRUD 走 @lc/runtime-uni/data 的 uniDataApi（refId 构造期定死=首源，镜像 web api.ts
 *    单 REF_ID 口径）；confirmSave 成功后关弹层并刷新首列表（web refreshCall(refName) 的
 *    uni 对位 = 首列表实例 reload()；无列表不出刷新行）。
 * 首行无缩进，页面装配统一加页内缩进。
 */
import { jsonToTs } from '../emit'
import { isFieldType } from '../contract'
import { camelField, type IrNode, type IrPage, type Unsupported } from '../ir'
import { PROFILES } from '../target-profile'
import { emitFieldNode } from './emit-field'

export interface UniContainerFragment {
  template: string
  /** 容器段脚本（装配侧插到数据源常量之后、其余片段脚本之前，对位 web 容器段位置） */
  script: string[]
  imports: string[]
  unsupported: Unsupported[]
}

interface UniContainerFieldRule {
  field: string
  title?: string
  props?: { required: boolean }
  init?: unknown
}

const requiredOf = (p: IrNode): boolean =>
  (p.attrs['el-form-item'] as Record<string, unknown> | undefined)?.required === true

const titleOf = (p: IrNode): string | undefined => {
  const label = (p.attrs['el-form-item'] as Record<string, unknown> | undefined)?.label
  return typeof label === 'string' && label ? label : undefined
}

/** formRules 推导（镜像 web emit.ts 116-127 walk）：嵌套按 shape 给 init，叶字段全 '' */
function fieldRulesOf(container: IrNode): UniContainerFieldRule[] {
  const rules: UniContainerFieldRule[] = []
  const walk = (p: IrNode): void => {
    if (p.nested) {
      if (p.artifact.field && !p.degraded) {
        rules.push({
          field: p.artifact.field,
          title: titleOf(p),
          init: p.nested.shape === 'array' ? [] : {},
        })
      }
      return
    }
    if (isFieldType(p.artifact.type) && p.artifact.field) {
      rules.push({
        field: p.artifact.field,
        title: titleOf(p),
        ...(requiredOf(p) ? { props: { required: true } } : {}),
      })
    }
    p.children.forEach(walk)
  }
  container.children.forEach(walk)
  return rules
}

export function emitContainerNode(node: IrNode, ir: IrPage): UniContainerFragment | null {
  if (node.artifact.type !== 'formContainer') return null
  const unsupported: Unsupported[] = []

  // —— 弹层头标题：tabTitle → attr as title（el-dialog/el-drawer 载体，容器 mode 驱动）——
  const dialogAttrs = (node.attrs['el-dialog'] ?? node.attrs['el-drawer']) as Record<string, unknown> | undefined
  const headTitle = typeof dialogAttrs?.title === 'string' ? dialogAttrs.title : ''

  // —— 字段片段（缩进 4 嵌进弹层体）+ 无映射字段 unsupported 收集 ——
  const pad4 = (l: string) => (l ? `    ${l}` : l)
  const bodyLines: string[] = []
  for (const child of node.children) {
    const frag = emitFieldNode(child, PROFILES.uniapp)
    bodyLines.push(...frag.template.split('\n').map(pad4))
    unsupported.push(...(frag.unsupported ?? []))
  }

  // ==================== 模板 ====================
  const T: string[] = []
  T.push(`<!-- ${node.artifact.anchor} -->`)
  T.push('<uni-popup ref="formPopup" type="bottom" class="lc-form-popup" background-color="#fff">')
  if (headTitle) T.push(`  <view class="lc-form-popup__head">${headTitle}</view>`)
  T.push('  <view class="lc-form-popup__body">')
  T.push(...bodyLines)
  T.push('  </view>')
  T.push('  <view class="lc-form-popup__footer">')
  T.push('    <button v-if="containerReadonly" type="primary" @click="closeContainer">关闭</button>')
  T.push('    <button v-if="!containerReadonly" @click="closeContainer">取消</button>')
  T.push('    <button v-if="!containerReadonly" type="primary" @click="confirmSave">确定</button>')
  T.push('  </view>')
  T.push('</uni-popup>')

  // —— 写回目标并进 formRules 声明（容器只回填声明过的字段）；带回接线登记 unsupported ——
  const rules = fieldRulesOf(node)
  const declared = new Set(rules.map((r) => r.field))
  const childIds = new Set(node.children.map((c) => c.artifact.id))
  for (const wb of ir.writebacks.filter((w) => childIds.has(w.nodeId))) {
    unsupported.push({
      path: wb.rulePath,
      type: wb.type,
      key: 'writeback',
      message: `字段 ${wb.field} 的选择器带回接线（web wbEvents select/clear）uni 首版未出`,
    })
    for (const t of [wb.idTarget, ...Object.values(wb.map ?? {})]) {
      if (typeof t === 'string' && t && !declared.has(t)) {
        declared.add(t)
        rules.push({ field: t })
      }
    }
  }

  // —— confirmSave 的刷新目标：首列表实例（web refreshCall(listPlans[0]) 的 uni 对位）——
  const firstList = ir.nodes.find((n) => n.artifact.type === 'page-list-cards')
  const reloadLine = firstList?.artifact.field
    ? [`  closeContainer()`, `  void ${camelField(firstList.artifact.field)}List.reload()`]
    : [`  closeContainer()`]

  // ==================== 脚本 ====================
  const S: string[] = []
  S.push(...`const formRules = ${jsonToTs(rules)}`.split('\n'))
  S.push('const { model: form, errors, validate, reset: formReset } = useUniForm(formRules)')
  S.push('const dsApi = uniDataApi({ refId: ds.refId })')
  S.push('const formPopup = ref<{ open: () => void; close: () => void } | null>(null)')
  S.push('const containerReadonly = ref(false)')
  S.push("const containerMode = ref<'create' | 'edit' | 'view'>('create')")
  S.push("const containerRecordId = ref('')")
  S.push('const containerVersion = ref<number | undefined>(undefined)')
  S.push(`/** lc:node=${node.artifact.id} → 打开容器并取记录（原总线 load-record / open-container 的合并语义） */`)
  S.push("async function openContainer(recordId: string, readonly: boolean, mode: 'create' | 'edit' | 'view') {")
  S.push('  containerMode.value = mode')
  S.push('  containerReadonly.value = readonly')
  S.push('  containerRecordId.value = recordId')
  S.push('  containerVersion.value = undefined')
  // 整表复位：只清首个字段的话，看完整条记录再点「新建」，其余字段还是上一条的值（web 同口径）
  S.push('  formReset()')
  S.push('  formPopup.value?.open()')
  S.push('  if (recordId) {')
  S.push('    const res = await dsApi.get(recordId)')
  S.push('    const vo = (res.data ?? {}) as { version?: number; data?: Record<string, unknown> }')
  S.push('    const record = vo.data ?? {}')
  S.push('    // 只回填容器声明过的字段（对齐 web DsBindingEngine 回填口径）')
  S.push('    Object.keys(form).forEach((k) => {')
  S.push('      if (k in record) form[k] = record[k]')
  S.push('    })')
  S.push("    containerVersion.value = typeof vo.version === 'number' ? vo.version : undefined")
  S.push('  }')
  S.push('}')
  S.push('function closeContainer() {')
  S.push('  formPopup.value?.close()')
  S.push('}')
  S.push('async function confirmSave() {')
  S.push('  if (!validate()) {')
  S.push("    uni.showToast({ title: '请检查表单填写', icon: 'none' })")
  S.push('    return')
  S.push('  }')
  S.push("  if (containerMode.value === 'create') {")
  S.push('    await dsApi.create({ ...form })')
  S.push('  } else {')
  S.push('    await dsApi.update(containerRecordId.value, { ...form }, containerVersion.value)')
  S.push('  }')
  S.push(...reloadLine)
  S.push('}')

  return {
    template: T.join('\n'),
    script: S,
    imports: [
      `import { ref } from 'vue'`,
      `import { useUniForm } from '@lc/runtime-uni/form'`,
      `import { uniDataApi } from '@lc/runtime-uni/data'`,
    ],
    unsupported,
  }
}
