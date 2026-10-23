/**
 * 目标端生成：IR → SFC / API 模块 / manifest。
 *
 * 本模块不得读取原始 schema —— 所有判定、绑定与登记都已在 parse 阶段落到 IrPage，
 * 这里只负责按 Vue/EP 目标的语法把 IR 渲染出来（移动端目标可以在同一 IR 上另写一份 emit）。
 */

import { STRUCT_DEFAULTS, TYPE_CONTRACTS, isFieldType, listOf, widgetOf } from './contract'
import { exportHelper, materialsOf, needsBlock, scriptFunction, stepStatements } from './chain-emit'
import {
  camelField,
  flattenIrNodes,
  kebab,
  pascal,
  type GeneratedManifest,
  type IrChain,
  type IrNode,
  type IrPage,
  type IrProp,
  type IrSwitchCase,
} from './ir'

const NO_REFRESH_TODO = 'lc:todo 列表组件未 defineExpose，取数刷新需人工接（page-list-cards 现状）'

/** 语句位的刷新调用：没暴露 refresh 就别出假接线，留一行注释给人看 */
export const refreshCall = (refName: string | null | undefined): string =>
  refName ? `${refName}.value?.refresh()` : `// ${NO_REFRESH_TODO}`

/** 回调位（删除后刷新）：注释不是表达式，箭头后只剩注释会把产物打成非法 TS，得包成空块 */
export const refreshThen = (refName: string | null | undefined): string =>
  refName ? `${refName}.value?.refresh()` : `{ /* ${NO_REFRESH_TODO} */ }`

/**
 * 注入 adapter 的产物实现（按 contract.injects.constName 取）：都落在容器 form 声明之后，
 * 所以可以直接吃 form。新增注入类型时在这里补一行，别在装配处写分支。
 */
const INJECT_ADAPTERS: Record<string, string> = {
  // FormulaField 逐依赖 api.getValue（FormulaField.vue:79-89）→ 后端就是容器 form
  formulaApi: 'const formulaApi = { api: { getValue: (field: string) => form[field] } }',
}

/** 展示方式 → 容器尺寸属性：drawer 吃 size，dialog 吃 width */
const containerSizeAttrOf = (ir: IrPage) => (ir.containerMode === 'drawer' ? 'size' : 'width')

/**
 * 该类型的标题有没有 el-form-item 载体（契约里 self.title 登记成 attr on el-form-item）。
 * 有才包一层 form-item —— 现网 form-create 给每个顶层节点都套，但 dash 系列与容器类刻意置空
 * title 就是为了不套（PageRendererPage.vue 的 transformComponent），补登记时得按类型自己表态。
 */
function labelCarrierOf(type: string): boolean {
  const entry = TYPE_CONTRACTS[type]?.self?.title
  return !!entry && entry.emit === 'attr' && entry.on === 'el-form-item'
}

/**
 * el-form-item 必填星标（Task 4.4）：$required 非缺省时载体真出 :required="true"。
 * 这是回导 rename（$required → el-form-item@required）在 web 产物上的核对证据——
 * 校验行为仍在 form-create 运行时（读 schema 的 $required），产物上的星标只是视觉。
 * $required: false 已被契约 skipDefault 拦在 parse 侧，这里只处理 true。
 */
function elFormItemRequired(node: IrNode): string {
  return node.attrs['el-form-item']?.required === true ? ' :required="true"' : ''
}

/** 单个属性片段：与重构前 propSnippet 的序列化规则逐字节一致 */
function propText(p: IrProp, ir: IrPage): string {
  const v = p.value
  if (v.kind === 'const') return `:${kebab(p.name)}="${v.constName}"`
  if (v.kind === 'dsRef') {
    const firstDsId = String(ir.dataSources[0]?.id ?? '')
    return v.sourceId && v.sourceId !== firstDsId
      ? `:${kebab(p.name)}="dataSources['${v.sourceId}']"`
      : `:${kebab(p.name)}="ds.refId"`
  }
  if (v.kind === 'globalDataSourceId') return `:${kebab(p.name)}="dataSources['${v.sourceId}']"`
  if (typeof v.value === 'string') return `${kebab(p.name)}="${v.value}"`
  return `:${kebab(p.name)}="${lit(v.value)}"`
}

/** 元素属性串：lc:node 地址在 IR 里是独立标记，模板端统一放在最前 */
function propTexts(p: IrNode, ir: IrPage): string[] {
  const out = p.marker ? [`lc:node="${p.artifact.id}"`] : []
  for (const prop of p.props) out.push(propText(prop, ir))
  return out
}

function lit(v: unknown): string {
  if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`
  return JSON.stringify(v)
}

/**
 * 产物依赖的 runtime 组件：必须含容器里的嵌套字段控件（dataPicker / LookupPicker /
 * FormulaField），过去只看顶层 plans 把它们漏掉了 —— 出成裸标签、清单也说不出要打包谁。
 */
function runtimeTagsOf(nodes: IrNode[]): string[] {
  return [
    ...new Set(
      flattenIrNodes(nodes)
        .filter((n) => !n.degraded && TYPE_CONTRACTS[n.type]?.runtime)
        .map((n) => String(n.host.tag)),
    ),
  ]
}

// ==================== 入口 ====================

export function emitTemplate(ir: IrPage): string {
  const { nodes: plans } = ir
  const listPlans = plans.filter((p) => listOf(p.artifact.type))
  const container = plans.find((p) => p.artifact.type === 'formContainer')
  const refName = listPlans[0]?.artifact.host.ref
  // form 里的字段带初值形态：普通字段 '' ，嵌套容器按值形态给 [] / {}（行数组 / 子表单对象）。
  // 容器的子字段不进 form —— 它们的值挂在行对象或容器对象上，摊平进 form 就是第二套真相。
  const fields: Array<{ name: string; init: string }> = []
  if (container) {
    const walk = (p: IrNode) => {
      if (p.nested) {
        if (p.artifact.field && !p.degraded)
          fields.push({ name: p.artifact.field, init: p.nested.shape === 'array' ? '[]' : '{}' })
        return
      }
      if (isFieldType(p.artifact.type) && p.artifact.field) fields.push({ name: p.artifact.field, init: "''" })
      p.children.forEach(walk)
    }
    container.children.forEach(walk)
  }
  // 注入 prop 的具名 adapter：值绑到 script 顶层常量（元素上的 v-bind 表达式不是 schema 证据），
  // 常量名去重后逐个落进容器块，form 声明之后
  const injectConsts = new Map<string, string>()
  for (const inj of ir.injections) injectConsts.set(inj.constName, inj.prop)
  // 写回目标并进 form 声明：容器只回填声明过的字段（对齐 DsBindingEngine.ts:79-82），
  // idField 目标没有可见 input 时（卡片语料页的 customer_id）不声明就是编辑态回填不回、保存丢 id。
  // 业务数据整包落 data_json（FormData.dataJson），多声明一个键无列冲突。
  for (const t of ir.writebacks.flatMap((w) => [w.idTarget, ...Object.values(w.map ?? {})])) {
    if (typeof t === 'string' && t && !fields.some((f) => f.name === t)) fields.push({ name: t, init: "''" })
  }

  // 链要的材料清单：op 用的与脚本用的分开（message 只有脚本正文吃别名，op 直接调 ElMessage）
  const materials = materialsOf(ir.chains)

  const L: string[] = []
  L.push('<!-- 由 lc-codegen 从页面 schema 出码，勿手改登记表以外的部分；人工接管写在 handler 里 -->')
  L.push('<template>')
  // stretch 只给列表页：那条高度链是「表单撑满、列表占余下空间」，仪表盘页按自然流出高度，
  // 组件的显示高度另有 props.height 档位（并排留白与固定高都在组件根上，见 dash-shared.ts）
  const hasList = listPlans.length > 0
  L.push(`  <div class="lc-page${hasList ? ' lc-page--stretch' : ''}">`)
  // 页面主体一棵 el-form：option.form.* 的落点，也是列表节点标题的载体（现网这层是 form-create 给的）。
  // 纯列表页照样包 —— 没有字段也有 label-position/size/labelWidth 要挂，去掉这层就等于把页面级配置丢掉。
  const formAttrs = Object.entries(ir.option.attrs['el-form'] || {}).map(([k, v]) =>
    typeof v === 'boolean' || typeof v === 'number' ? `:${kebab(k)}="${lit(v)}"` : `${k}="${v}"`,
  )
  L.push(`    <el-form class="lc-page-form"${formAttrs.length ? ` ${formAttrs.join(' ')}` : ''}>`)
  // 按画布顺序出节点：dash 组件连续的一段并进同一个 el-row（筛选器排在它影响的卡片之前就是靠顺序）
  const pendingWidgets: IrNode[] = []
  const flushWidgets = () => {
    if (!pendingWidgets.length) return
    L.push(...renderWidgetRow(pendingWidgets, '      ', ir))
    pendingWidgets.length = 0
  }
  for (const p of plans) {
    if (widgetOf(p.artifact.type)) {
      pendingWidgets.push(p)
      continue
    }
    flushWidgets()
    if (p.table) {
      L.push(...renderTable(p, '      ', ir))
      continue
    }
    if (p.artifact.type === 'formContainer') continue // 覆盖层容器出在 </el-form> 之后
    if (listOf(p.artifact.type)) {
      const head = p.artifact.host.ref ? ` ref="${p.artifact.host.ref}"` : ''
      const props = propTexts(p, ir)
      // 出口按节点算：契约里 when='chain' 的那几个只在该节点真有链时才在这份上
      const events = (p.outlets || []).map((e) => `@${e.on}="${e.handler}"`)
      const label = p.attrs['el-form-item']?.label
      const wrap = labelCarrierOf(p.artifact.type)
      L.push(`      <!-- ${p.artifact.anchor} -->`)
      if (wrap) L.push(`      <el-form-item${label === undefined ? '' : ` label="${label}"`}${elFormItemRequired(p)}>`)
      L.push(
        `${wrap ? '        ' : '      '}<${p.tag}${head}${props.length ? ` ${props.join(' ')}` : ''} ${events.join(' ')} />`,
      )
      if (wrap) L.push('      </el-form-item>')
      continue
    }
    // 降级节点（页面级嵌套容器）：不猜形态、不出死标签，整棵子树各留一行挂点注释。
    // 注释里的 node/type/field 就是回读侧的锚点，登记齐了 holes 仍为零，债走 unsupported。
    if (p.degraded) {
      L.push(...degradeComments(p, '      '))
      continue
    }
    // 未登记类型：留一行挂点注释（与容器子节点同一口径），别让整节点静默消失
    if (!TYPE_CONTRACTS[p.artifact.type]) {
      L.push(
        `      <!-- lc:todo node=${p.artifact.id} type=${p.artifact.type} field=${p.artifact.field} 组件类型无出码契约，整节点未出码 -->`,
      )
    }
  }
  flushWidgets()
  L.push('    </el-form>')
  if (container) L.push(renderContainer(container, ir))
  L.push('  </div>')
  L.push('</template>')
  L.push('')
  L.push('<script setup lang="ts">')
  L.push("import { reactive, ref } from 'vue'")
  // 链材料按需引入：一页没有链就一行都不多（语料 12 页产物字节不变的依据）。
  // 只 import 真被产物语句用到的：vue-tsc 开了 noUnusedLocals，多一行就是编译不过。
  const vueRouter = [...materials.ops].filter((n) => n === 'router' || n === 'route').map((n) => `use${pascal(n)}`)
  if (vueRouter.length) L.push(`import { ${[...new Set(vueRouter)].sort().join(', ')} } from 'vue-router'`)
  if (materials.ops.has('message') || materials.scripts.has('message')) {
    L.push("import { ElMessage } from 'element-plus'")
  }
  // runtime 标签一律要 import：过去只导列表组件，容器里的字段控件（dataPicker /
  // LookupPicker / FormulaField）出成了裸标签，产物看着对、实际跑不起来
  for (const tag of runtimeTagsOf(plans)) L.push(`import ${pascal(tag)} from '@lc/runtime/${tag}'`)
  // 脚本正文里的 http 就是产物同一份请求工具（包边界指回 src/utils/http）
  if (materials.scripts.has('http')) L.push("import http from '@lc/runtime/http'")
  // 带回的行值读取复用组件同一套 BizDataVO 兼容取值：裸 row[key] 会把内层业务字段读成 undefined
  if (ir.writebacks.some((w) => Object.keys(w.map ?? {}).length)) {
    L.push("import { readCellValue } from '@lc/runtime/lookupFetch'")
  }
  L.push(`import { getData, createData, updateData, deleteData } from './api/${ir.pageKey.replace(/_/g, '-')}'`)
  L.push('')
  L.push('// ==================== 数据源（schema.dataSources[]）====================')
  const ds = ir.dataSources[0] ?? { id: '', refId: '' }
  L.push(`const ds = { id: '${ds.id}', refId: '${ds.refId}' }`)
  if (ir.dataSources.length) {
    L.push('// 逐源登记表：页面声明的几个源都在册（含未绑到组件的），人工补接线时按 id 取 refId')
    L.push('const dataSources = {')
    ir.dataSources.forEach((d) => L.push(`  '${d.id}': '${d.refId}',`))
    L.push('}')
  }
  L.push('')
  for (const lp of listPlans) {
    if (!lp.artifact.host.ref) continue
    L.push(
      `// ==================== 节点 ${lp.artifact.id}：${lp.artifact.type}（schema.${lp.artifact.rulePath}.props）====================`,
    )
    L.push(`const ${lp.artifact.host.ref} = ref<InstanceType<typeof ${pascal(lp.tag!)}> | null>(null)`)
  }
  for (const [name, value] of ir.consts) L.push('', `const ${name} = ${jsonToTs(value)}`)
  L.push('')
  if (container) {
    L.push(
      `// ==================== 节点 ${container.artifact.id}：formContainer（schema.${container.artifact.rulePath}）====================`,
    )
    L.push('const containerVisible = ref(false)')
    L.push('const containerReadonly = ref(false)')
    L.push("const containerMode = ref<'create' | 'edit' | 'view'>('create')")
    L.push("const containerRecordId = ref('')")
    L.push('const containerVersion = ref<number | undefined>(undefined)')
    L.push('const formRef = ref()')
    // any 而不是 unknown：行容器要 form.items.push(...) / splice，unknown 上这些方法都不存在
    L.push(`const form = reactive<Record<string, any>>({ ${fields.map((f) => `${f.name}: ${f.init}`).join(', ')} })`)
    // 注入 prop 的 form 后端：值绑组件自己声明过的 prop（FormulaField.vue:53），求值逻辑留在组件里
    for (const [constName] of injectConsts) {
      const line = INJECT_ADAPTERS[constName]
      if (line) L.push(line)
    }
    L.push('')
    L.push(`/** lc:node=${container.artifact.id} → 打开容器并取记录（原总线 load-record / open-container 的合并语义） */`)
    L.push("async function openContainer(recordId: string, readonly: boolean, mode: 'create' | 'edit' | 'view') {")
    L.push('  containerMode.value = mode')
    L.push('  containerReadonly.value = readonly')
    L.push('  containerRecordId.value = recordId')
    L.push('  containerVersion.value = undefined')
    // 整表重置：只清首个字段的话，看完整条记录再点「新建」，其余字段还是上一条的值
    L.push("  Object.keys(form).forEach((k) => { form[k] = '' })")
    // 嵌套容器按形态复位：行数组清空（组件的初始值就是空数组），子表单回到空对象
    for (const f of fields.filter((x) => x.init !== "''")) L.push(`  form.${f.name} = ${f.init}`)
    L.push('  containerVisible.value = true')
    L.push('  if (recordId) {')
    L.push('    const res = await getData(recordId)')
    L.push('    // BizDataVO = { id, version, data: {业务字段} }：字段在 vo.data 里，摊错层就是一张空表单')
    L.push("    const vo = (res.data ?? {}) as { version?: number; data?: Record<string, unknown> }")
    L.push('    const record = vo.data ?? {}')
    L.push('    // 只回填容器声明过的字段（对齐 DsBindingEngine.ts:79-82）：整条记录灌进 form，保存时')
    L.push('    // { ...form } 会把根本没在编辑的业务字段一起写回去；id/version 留在字段模型之外')
    L.push('    Object.keys(form).forEach((k) => { if (k in record) form[k] = record[k] })')
    L.push("    containerVersion.value = typeof vo.version === 'number' ? vo.version : undefined")
    L.push('  }')
    L.push('}')
    L.push('')
    L.push('function closeContainer() {')
    L.push('  containerVisible.value = false')
    L.push('}')
    L.push('')
    L.push('async function confirmSave() {')
    L.push("  if (containerMode.value === 'create') {")
    L.push('    await createData({ ...form })')
    L.push('  } else {')
    L.push('    await updateData(containerRecordId.value, { ...form }, containerVersion.value)')
    L.push('  }')
    L.push('  closeContainer()')
    L.push(`  ${refreshCall(refName)}`)
    L.push('}')
    L.push('')
    if (ir.writebacks.length) {
      L.push('// ==================== 字段写回（选择器带回的显式化）====================')
      L.push('// 组件宿主里走 formCreateInject.api.setValue，产物没有 form-create 实例，改接 select/clear 显式赋值；')
      L.push('// returnFields 方向：key=被查表的源字段、value=表单目标字段（LookupPicker.vue:295-299）')
      const q = (s: string) => s.replace(/'/g, "\\'")
      for (const w of ir.writebacks) {
        const targets = [w.idTarget, ...Object.values(w.map ?? {})].filter((t): t is string => !!t)
        L.push(`/** lc:node=${w.nodeId} field=${w.field} 带回 → ${targets.join(' / ')} */`)
        L.push(`function ${w.select}(row: Record<string, unknown>) {`)
        if (w.idTarget) L.push(`  form['${q(w.idTarget)}'] = row.id ?? null`)
        for (const [src, target] of Object.entries(w.map ?? {})) {
          L.push(`  form['${q(target)}'] = readCellValue(row, '${q(src)}') ?? null`)
        }
        L.push('}')
        L.push(`function ${w.clear}() {`)
        for (const t of targets) L.push(`  form['${q(t)}'] = null`)
        L.push('}')
        L.push('')
      }
    }
    // 行容器的行增删：与组件同一套语义（add 推一行空对象、min/max 由模板里的禁用/显隐条件表达）
    const rowPlans = nestedPlansOf(container.children)
    if (rowPlans.length) {
      L.push('// ==================== 行容器（group / tableForm）的增删 ====================')
      for (const p of rowPlans) {
        const h = rowHandlerNames(p)
        const n = p.nested!
        const has = (k: string) => !!p.config && k in p.config.obj
        // 只出模板真绑到的 handler：没配增删/排序还留空函数，就是 vue-tsc 里的 TS6133 孤儿
        const canAdd = has(n.carrier === 'props.columns[].rule' ? 'addable' : 'button')
        const canRemove = has(n.carrier === 'props.columns[].rule' ? 'deletable' : 'button')
        const keys = n.rowKeys.map((k) => `${k}: ''`).join(', ')
        if (!canAdd && !canRemove && !has('sortBtn')) continue
        L.push(
          `/** lc:node=${p.artifact.id} type=${p.artifact.type} field=${p.artifact.field} 行增删（新行形状 = 子字段） */`,
        )
        if (canAdd) L.push(`function ${h.add}() { ${n.valuePath}.push(${keys ? `{ ${keys} }` : '{}'}) }`)
        if (canRemove) L.push(`function ${h.remove}(i: number) { ${n.valuePath}.splice(i, 1) }`)
        if (has('sortBtn')) {
          L.push(`function ${h.move}(i: number, d: number) {`)
          L.push(`  const rows = ${n.valuePath}`)
          L.push('  const j = i + d')
          L.push('  if (j < 0 || j >= rows.length) return')
          L.push('  rows.splice(j, 0, rows.splice(i, 1)[0])')
          L.push('}')
        }
        L.push('')
      }
    }
  }
  // 链材料与 handler：无链的页面这一段整块不出（语料产物的 golden 字节依据）
  L.push(...emitChainMaterials(ir, materials))
  L.push(...emitHandlers(ir, listPlans))
  if (ir.writeDashFilter) {
    L.push('// ==================== dash-filter 广播（运行期 dashInstances 语义）====================')
    L.push('// 渲染器把 emit(ready) 的组件实例收进 dashInstances，筛选器变更时按字段条件全量 setFilter')
    L.push('// （PageRendererPage.vue:263-278、505-549）。产物没有渲染器，这张表由产物自己持。')
    L.push('const dashInstances = new Set<any>()')
    L.push('function onDashReady(instance: any) {')
    L.push('  if (instance) dashInstances.add(instance)')
    L.push('}')
    L.push('function onFilterChange(payload: { field: string; op: string; value: unknown }) {')
    L.push('  if (!payload?.field) return')
    L.push('  const cond = { [payload.field]: payload.value === null ? null : { op: payload.op, value: payload.value } }')
    L.push('  for (const instance of dashInstances) {')
    L.push("    if (instance && typeof instance.setFilter === 'function') instance.setFilter(cond)")
    L.push('  }')
    L.push('}')
    L.push('')
  }
  L.push('</script>')
  L.push('')
  L.push('<style scoped>')
  L.push('.lc-page--stretch {')
  L.push('  height: 100%;')
  L.push('  display: flex;')
  L.push('  flex-direction: column;')
  L.push('}')
  // 撑满链路要多接一层：现网是 .el-form > .el-row > .el-col > .el-form-item > __content
  //（PageRendererPage.vue:746-757），产物没有 form-create 的栅格，高度从根 form 直接传到列表组件。
  L.push('.lc-page--stretch .lc-page-form {')
  L.push('  height: 100%;')
  L.push('  min-height: 0;')
  L.push('}')
  L.push('.lc-page--stretch .lc-page-form :deep(.el-form-item),')
  L.push('.lc-page--stretch .lc-page-form :deep(.el-form-item__content) {')
  L.push('  height: 100%;')
  L.push('  min-height: 0;')
  L.push('  min-width: 0;')
  L.push('}')
  L.push('.lc-container-body {')
  L.push('  overflow-y: auto;')
  L.push('  height: 600px;')
  L.push('}')
  // 嵌套容器：行壳、行头与格内 label 的收起。列头已经是标题，格内再挂一遍就是两行字
  L.push('.lc-nested {')
  L.push('  width: 100%;')
  L.push('}')
  L.push('.lc-nested-row + .lc-nested-row {')
  L.push('  margin-top: 8px;')
  L.push('}')
  L.push('.lc-nested-row-head {')
  L.push('  display: flex;')
  L.push('  align-items: center;')
  L.push('  justify-content: space-between;')
  L.push('  margin-bottom: 8px;')
  L.push('}')
  L.push('.lc-nested-row-ops :deep(.el-button + .el-button) {')
  L.push('  margin-left: 4px;')
  L.push('}')
  L.push('.lc-nested .lc-cell-item {')
  L.push('  margin-bottom: 0;')
  L.push('}')
  L.push('.lc-nested .lc-cell-item :deep(.el-form-item__label) {')
  L.push('  display: none;')
  L.push('}')
  // fcTable 静态表格：边界与单元格基线照抄运行期 Table.vue 的 ._fc-table（
  // table-layout:fixed / 最小 80×50 / 右+下边框 / 居中），合并格由 colspan/rowspan 表达
  L.push('.lc-fc-table {')
  L.push('  width: 100%;')
  L.push('  table-layout: fixed;')
  L.push('  border-collapse: collapse;')
  L.push('}')
  L.push('.lc-fc-table td {')
  L.push('  padding: 5px;')
  L.push('  min-width: 80px;')
  L.push('  min-height: 50px;')
  L.push('  border: 0 none;')
  L.push('  border-right: 1px solid #ebeef5;')
  L.push('  border-bottom: 1px solid #ebeef5;')
  L.push('  text-align: center;')
  L.push('  vertical-align: middle;')
  L.push('  overflow-wrap: break-word;')
  L.push('}')
  L.push('.lc-fc-table--no-border td {')
  L.push('  border: 0 none;')
  L.push('}')
  L.push('.lc-fc-table--mini td {')
  L.push('  padding: 0;')
  L.push('  min-height: 12px;')
  L.push('}')
  L.push('.lc-fc-table--mini :deep(.el-form-item) {')
  L.push('  padding: 0;')
  L.push('  margin: 0;')
  L.push('}')
  L.push('.lc-fc-table--form :deep(.el-form-item) {')
  L.push('  margin-bottom: 1px;')
  L.push('}')
  L.push('</style>')
  L.push('')
  return L.join('\n')
}

/**
 * 链材料段：import 已在头部按需出，这里是配套的常量与 helper。
 * 一律「用到才出」—— vue-tsc 开了 noUnusedLocals，多一行没人读的常量就编译不过。
 */
function emitChainMaterials(ir: IrPage, materials: ReturnType<typeof materialsOf>): string[] {
  const L: string[] = []
  const consts: string[] = []
  if (materials.ops.has('router')) consts.push('const router = useRouter()')
  if (materials.ops.has('route')) consts.push('const route = useRoute()')
  // message 别名只给脚本正文用；op=message 直接调 ElMessage，不需要这层
  if (materials.scripts.has('message')) consts.push('const message = ElMessage')
  if (materials.scripts.has('page')) consts.push(`const page = { pageKey: '${ir.pageKey}' }`)
  if (consts.length) {
    L.push('// ==================== 动作链材料（按需引入）====================')
    L.push(...consts)
    L.push('')
  }
  if (materials.ops.has('export')) {
    L.push(...exportHelper(ir.pageKey))
    L.push('')
  }
  const scripts = ir.chains.flatMap((c) => c.steps.filter((s) => s.script).map((s) => scriptFunction(c, s)))
  if (scripts.length) {
    L.push('// ==================== 事件脚本（正文照搬，白名单在出码期把关）====================')
    scripts.forEach((lines) => L.push(...lines, ''))
    L.pop()
    L.push('')
  }
  return L
}

/** 出口在产物里的固定顺序：button-click 打头（behavior 注释块归它），其余按组件 emit 的发生顺序 */
const OUTLET_ORDER = ['button-click', 'row-click', 'selection-change', 'cell-click', 'sort-change']

const usesRow = (lines: string[]): boolean => lines.some((l) => /\brow\b/.test(l))

/** 该节点该 handler 上的链，按 kinds 给顺序（总线在前、组件链在后，对齐组件 handleRowClick） */
function chainsOf(lp: IrNode, handler: string, ir: IrPage, kinds: IrChain['kind'][]): IrChain[] {
  return kinds.flatMap((k) => ir.chains.filter((c) => c.kind === k && c.nodeId === lp.artifact.id && c.outlet === handler))
}

function chainBody(chain: IrChain, indent: string): string[] {
  return chain.steps.flatMap((s) => stepStatements(s, chain, indent))
}

/**
 * handler 只出产物真绑得到的出口：组件没那个 emit（卡片的 selection-change）还留空函数，
 * 就是 vue-tsc 里的 TS6133 孤儿 —— 看着有挂点，实际没人调。
 */
function emitHandlers(ir: IrPage, listPlans: IrNode[]): string[] {
  const bindings = listPlans.flatMap((lp) => (lp.outlets || []).map((o) => ({ lp, o })))
  const ordered = [
    ...OUTLET_ORDER.flatMap((on) => bindings.filter((b) => b.o.on === on)),
    // 契约将来加出口时先出 handler，别静默丢掉一个绑了却没人实现的挂点
    ...bindings.filter((b) => !OUTLET_ORDER.includes(b.o.on)),
  ]
  const explicit = ir.behaviors.filter((x) => x.origin.startsWith('actions['))
  const L: string[] = []
  let behaviorHeader = false
  for (const { lp, o } of ordered) {
    const ref = lp.artifact.host.ref
    if (o.on === 'button-click') {
      if (!behaviorHeader) {
        behaviorHeader = true
        L.push('// ==================== lc:behavior ← schema.actions ====================')
        L.push(`// 原形态：${JSON.stringify(explicit.map((x) => ({ trigger: x.trigger, source: x.source, steps: x.steps })))}`)
        L.push('// target 填数据源标识 → 出码时解引用成具体容器（同源画布靠前的容器），运行期不再查表')
      }
      L.push(...emitButtonClick(lp, o.handler, ir, ref))
      continue
    }
    if (o.on === 'row-click') {
      const chains = [...chainsOf(lp, o.handler, ir, ['bus']), ...chainsOf(lp, o.handler, ir, ['view'])]
      const body = chains.flatMap((c) => chainBody(c, '  '))
      if (!body.length) {
        L.push(`function ${o.handler}(_row: Record<string, unknown>) {`)
        L.push('  // schema.actions 无 row-click 触发的动作链 → 空实现，保留挂点供人工接管')
        L.push('}')
        L.push('')
        continue
      }
      L.push(`function ${o.handler}(${usesRow(body) ? 'row' : '_row'}: Record<string, unknown>) {`)
      L.push(...body)
      L.push('}')
      L.push('')
      continue
    }
    if (o.on === 'selection-change') {
      const body = chainsOf(lp, o.handler, ir, ['view']).flatMap((c) => chainBody(c, '  '))
      L.push(`function ${o.handler}(_rows: Record<string, unknown>[]) {`)
      L.push(...(body.length ? body : ['  // 无关联动作']))
      L.push('}')
      L.push('')
      continue
    }
    if (o.on === 'cell-click') {
      L.push(...emitCellClick(lp, o.handler, ir))
      continue
    }
    if (o.on === 'sort-change') {
      const body = chainsOf(lp, o.handler, ir, ['view']).flatMap((c) => chainBody(c, '  '))
      L.push(`function ${o.handler}(_payload: { prop: string; order: string | null }) {`)
      L.push(...(body.length ? body : ['  // 无关联动作']))
      L.push('}')
      L.push('')
      continue
    }
    L.push(`function ${o.handler}() {`)
    L.push('  // 无关联动作')
    L.push('}')
    L.push('')
  }
  // 末个 handler 与 </script> 之间恒留一个空行：这是 golden 的字节形状，别在段落里 pop
  if (L.length && L[L.length - 1] !== '') L.push('')
  return L
}

/** 按钮 case：内建行为/删除是兜底语义，链 case 的体来自该按钮编译出来的链 */
function emitButtonClick(lp: IrNode, handler: string, ir: IrPage, ref: string | null): string[] {
  const body = ir.switchCases
    .filter((c) => c.nodeId === lp.artifact.id)
    .flatMap((c) => emitCase(c, ref, ir))
  const L: string[] = []
  L.push(`function ${handler}(payload: { key: string; row: Record<string, unknown> | null }) {`)
  // 没有 case 读 row 就别声明：noUnusedLocals 会把这行判成未使用变量
  if (usesRow(body)) L.push('  const row = payload.row')
  L.push('  switch (payload.key) {')
  L.push(...body)
  L.push('  }')
  L.push('}')
  L.push('')
  return L
}

function emitCase(sc: IrSwitchCase, ref: string | null, ir: IrPage): string[] {
  if (sc.kind !== 'chain') return [emitSwitchCase(sc, ref)]
  const chain = ir.chains.find((c) => c.kind === 'button' && c.nodeId === sc.nodeId && c.key === sc.key)
  if (!chain) return []
  const body = chainBody(chain, '      ')
  if (!body.length) return []
  // case 体里有 const/let 要包块：switch 的各 case 共享函数作用域，两个 case 声明同名直接编译失败
  return needsBlock(body)
    ? [`    case '${sc.key}': {`, ...body, '      return', '    }']
    : [`    case '${sc.key}':`, ...body, '      return']
}

/**
 * 列点击：组件 handleCellClick 里列级链短路整表级 cell-click，
 * 产物用同一个结构 —— switch 命中列就 return，表级链的语句落在 switch 之后。
 */
function emitCellClick(lp: IrNode, handler: string, ir: IrPage): string[] {
  const cellChains = chainsOf(lp, handler, ir, ['cell'])
  const tableChains = chainsOf(lp, handler, ir, ['view']).filter((c) => c.trigger === 'cell-click')
  const cases = cellChains.flatMap((c) => {
    const body = chainBody(c, '      ')
    if (!body.length) return []
    return needsBlock(body)
      ? [`    case '${c.key}': {`, ...body, '      return', '    }']
      : [`    case '${c.key}':`, ...body, '      return']
  })
  const tail = tableChains.flatMap((c) => chainBody(c, '  '))
  const rowUsed = usesRow([...cases, ...tail])
  const L: string[] = []
  L.push(
    `function ${handler}(${rowUsed ? 'row' : '_row'}: Record<string, unknown>, column: { property?: string; prop?: string } | null) {`,
  )
  if (cases.length) {
    L.push("  switch (column?.property ?? column?.prop ?? '') {")
    L.push(...cases)
    L.push('  }')
  }
  L.push(...tail)
  L.push('}')
  L.push('')
  return L
}

/** 内建兜底与删除这两类 case 的体；链 case 由 emitCase 走 chainBody，不进这里 */
function emitSwitchCase(sc: Exclude<IrSwitchCase, { kind: 'chain' }>, refreshTarget: string | null | undefined): string {
  if (sc.kind === 'delete') {
    return `    case 'delete':\n      if (row?.id != null) void deleteData(String(row.id)).then(() => ${refreshThen(refreshTarget)})\n      return`
  }
  return `    case '${sc.key}':\n      void openContainer(String(row?.id ?? ''), ${sc.readonly}, '${sc.mode}')\n      return`
}

/**
 * 展示组件段：连续的几个节点并进一段栅格。
 * el-row > el-col.fc-form-col > el-form-item > 组件 —— 现网这四层都是 form-create 给的，
 * 撑满档靠 dash-fill-height.css 沿 el-col.fc-form-col > el-form-item > __content 传高，
 * 少任意一层，props.height='100%' 就退化成内容高。
 */
function renderWidgetRow(widgets: IrNode[], indent: string, ir: IrPage): string[] {
  const L: string[] = [`${indent}<el-row>`]
  for (const p of widgets) {
    const span = p.attrs['el-col']?.span ?? 24
    const props = propTexts(p, ir)
    // dash-filter 联动：筛选器监听 filter-change，数据组件上报 ready（实例收进 dashInstances）。
    // 事件是产物接线（schema 里没有这个键），wireOnly 已在 parse 阶段登记
    const events: string[] = []
    if (ir.writeDashFilter && p.filterSource) events.push('@filter-change="onFilterChange"')
    if (ir.writeDashFilter && p.filterTarget) events.push('@ready="onDashReady"')
    L.push(`${indent}  <el-col class="fc-form-col" :span="${lit(span)}">`)
    L.push(`${indent}    <!-- ${p.artifact.anchor} -->`)
    // 标题载体按类型表态：dash 族的节点 title 被渲染器置空（空壳 form-item 只为撑满档传高），
    // page-* 展示组件的 title 照旧由 form-create 当 label 渲染，两者都靠 self.title 登记决定
    const label = p.attrs['el-form-item']?.label
    L.push(`${indent}    <el-form-item${label === undefined ? '' : ` label="${label}"`}${elFormItemRequired(p)}>`)
    L.push(`${indent}      <${p.tag}${props.length ? ` ${props.join(' ')}` : ''}${events.length ? ` ${events.join(' ')}` : ''} />`)
    L.push(`${indent}    </el-form-item>`)
    L.push(`${indent}  </el-col>`)
  }
  L.push(`${indent}</el-row>`)
  return L
}

/**
 * fcTable：静态表格。
 * 几何已在 IR 里算好（cells 只含可见 home 格，coveredSlots 记录被合并覆盖的地址），
 * 这里只按坐标画 tr/td；子节点按 slot 分进格，被覆盖 slot 的子也在 home 格里。
 */
function renderTable(p: IrNode, indent: string, ir: IrPage): string[] {
  const t = p.table!
  const border = literalProp(p, 'border')
  const cls = ['lc-fc-table']
  if (border === false) cls.push('lc-fc-table--no-border')
  if (literalProp(p, 'mini') === true) cls.push('lc-fc-table--mini')
  if (literalProp(p, 'formStyle') === true) cls.push('lc-fc-table--form')
  const tableStyle: Record<string, unknown> = {}
  const bw = literalProp(p, 'borderWidth')
  const bc = literalProp(p, 'borderColor')
  if (typeof bw === 'string' && bw) tableStyle.borderWidth = bw
  if (typeof bc === 'string' && bc) tableStyle.borderColor = bc
  const tableStyleText = styleText(tableStyle)
  // 不包 el-form-item：现网 fcTable 外层只有 el-col（rule 无 field，form-create 不包壳），
  // 自造一层会让格内组件命中 `.el-form-item .el-form-item { margin-bottom: 0 }`，行高少 18px
  const L: string[] = [
    `${indent}<!-- ${p.artifact.anchor} -->`,
    `${indent}<table lc:node="${p.artifact.id}" border="${border === false ? 0 : 1}" class="${cls.join(' ')}"${
      tableStyleText ? ` style="${attrVal(tableStyleText)}"` : ''
    }>`,
  ]
  for (let r = 0; r < t.rows; r++) {
    L.push(`${indent}  <tr>`)
    for (const cell of t.cells.filter((c) => c.row === r)) {
      const attrs = [`colspan="${cell.colspan}"`, `rowspan="${cell.rowspan}"`]
      const cellStyle = styleText(cell.style)
      if (cellStyle) attrs.push(`style="${attrVal(cellStyle)}"`)
      if (cell.className) attrs.push(`class="${attrVal(cell.className)}"`)
      L.push(`${indent}    <td ${attrs.join(' ')}>`)
      for (const child of cell.children) L.push(...renderTableCellChild(child, `${indent}      `, ir))
      L.push(`${indent}    </td>`)
    }
    L.push(`${indent}  </tr>`)
  }
  L.push(`${indent}</table>`)
  return L
}

function renderTableCellChild(c: IrNode, indent: string, ir: IrPage): string[] {
  if (c.degraded) return degradeComments(c, indent)
  if (c.table) return renderTable(c, indent, ir)
  if (!TYPE_CONTRACTS[c.artifact.type]) {
    return [
      `${indent}<!-- lc:todo node=${c.artifact.id} type=${c.artifact.type} field=${c.artifact.field} 组件类型无出码契约，整节点未出码 -->`,
    ]
  }
  if (widgetOf(c.artifact.type)) return renderWidgetCell(c, indent, ir)
  if (listOf(c.artifact.type)) return renderListCell(c, indent, ir)
  return [
    `${indent}<!-- lc:todo node=${c.artifact.id} type=${c.artifact.type} field=${c.artifact.field} 该类型在 fcTable 里没有出码形态，整节点未出码 -->`,
  ]
}

/** 表格格内的展示组件：与顶层 widget 同一套 el-col > el-form-item > 组件层级（col.span 与撑满链都靠它） */
function renderWidgetCell(c: IrNode, indent: string, ir: IrPage): string[] {
  const span = c.attrs['el-col']?.span ?? 24
  const props = propTexts(c, ir)
  const events: string[] = []
  if (ir.writeDashFilter && c.filterSource) events.push('@filter-change="onFilterChange"')
  if (ir.writeDashFilter && c.filterTarget) events.push('@ready="onDashReady"')
  const label = c.attrs['el-form-item']?.label
  return [
    `${indent}<el-col class="fc-form-col" :span="${lit(span)}">`,
    `${indent}  <!-- ${c.artifact.anchor} -->`,
    `${indent}  <el-form-item${label === undefined ? '' : ` label="${label}"`}${elFormItemRequired(c)}>`,
    `${indent}    <${c.tag}${props.length ? ` ${props.join(' ')}` : ''}${events.length ? ` ${events.join(' ')}` : ''} />`,
    `${indent}  </el-form-item>`,
    `${indent}</el-col>`,
  ]
}

/** 表格格内的列表组件：与页面主体同一套事件接线，标题照旧走 el-form-item label */
function renderListCell(c: IrNode, indent: string, ir: IrPage): string[] {
  const head = c.artifact.host.ref ? ` ref="${c.artifact.host.ref}"` : ''
  const props = propTexts(c, ir)
  const events = (c.outlets || []).map((e) => `@${e.on}="${e.handler}"`)
  const label = c.attrs['el-form-item']?.label
  const wrap = labelCarrierOf(c.artifact.type)
  const L = [`${indent}<!-- ${c.artifact.anchor} -->`]
  if (wrap) L.push(`${indent}<el-form-item${label === undefined ? '' : ` label="${label}"`}${elFormItemRequired(c)}>`)
  L.push(
    `${indent}${wrap ? '  ' : ''}<${c.tag}${head}${props.length ? ` ${props.join(' ')}` : ''} ${events.join(' ')} />`,
  )
  if (wrap) L.push(`${indent}</el-form-item>`)
  return L
}

function literalProp(p: IrNode, name: string): unknown {
  const hit = p.props.find((x) => x.name === name)
  return hit && hit.value.kind === 'literal' ? hit.value.value : undefined
}

/** 内联样式串：对象值按 CSS 输出，回读侧按 `键: 值;` 解析回对象 */
function styleText(style: Record<string, unknown> | undefined): string {
  if (!style) return ''
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${kebab(k)}: ${String(v)}`)
    .join('; ')
}

const attrVal = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

function renderContainer(plan: IrNode, ir: IrPage): string {
  const attrs = plan.attrs[plan.tag!] || {}
  const sizeAttr = containerSizeAttrOf(ir)
  // title 先写：容器锚点里读不到它，人 review 时第一眼要看的就是标题
  const order = ['title', sizeAttr, ...Object.keys(attrs).filter((k) => k !== 'title' && k !== sizeAttr)]
  const open: string[] = ['v-model="containerVisible"']
  const attrSnippets = order.filter((k) => k in attrs).map((k) => {
    const v = attrs[k]
    return typeof v === 'string' && (k === 'title' || k === sizeAttr) ? `${k}="${v}"` : `:${k}="${lit(v)}"`
  })
  open.push(...attrSnippets)
  // 容器内层 form 只带自己的接线：现网 containerOption（PageRendererPage.vue:700-706）是现造的，
  // 不吃页面 option.form.*，labelWidth 用运行期测量值 —— 产物不测 DOM，留 CSS 变量占位。
  const formLine = ['ref="formRef"', ':model="form"', 'label-width="var(--lc-label-width)"']
  const items: string[] = []
  const nestedWidgets: IrNode[] = []
  const flushNested = () => {
    if (!nestedWidgets.length) return
    items.push(...renderWidgetRow(nestedWidgets, '          ', ir))
    nestedWidgets.length = 0
  }
  for (const c of plan.children) {
    // 容器里的展示组件同样走栅格：内层表单也是 form-create 渲染的，层级与页面主体一致
    if (widgetOf(c.artifact.type)) {
      nestedWidgets.push(c)
      continue
    }
    flushNested()
    if (c.table) {
      items.push(...renderTable(c, '          ', ir))
      continue
    }
    if (c.degraded) {
      items.push(...degradeComments(c, '          '))
      continue
    }
    // 嵌套容器不是单个控件，出的是行壳/表格/子表单（v-model 前缀由它自己定）
    if (c.nested) {
      items.push(...renderNested(c, '          '))
      continue
    }
    if (!c.tag) {
      // 未登记的字段类型没有标签可出。绝不能用空 tag 占位：`< v-model="…" />` 既过不了
      // Vue 编译，又会把回导侧的 el-form-item 祖先关系搅乱（语料体检里 8 条 label 错位的根因）。
      // 只留一行 lc:todo 注释，节点本体作为广度债进 holes，由补契约来消。
      // 注释里带 node=<id>：回导侧据此把该子节点补回数组占位，否则整个 rule 数组只报一次
      // 「长度不符」，到底是哪几个字段没出码就看不见了（广度债会被容器掩盖）。
      items.push(
        `          <!-- lc:todo node=${c.artifact.id} type=${c.artifact.type} field=${c.artifact.field} 组件类型无出码契约，整字段未出码 -->`,
      )
      continue
    }
    items.push(...fieldBlock(c, `form.${c.artifact.field}`, '          '))
  }
  flushNested()
  return [
    `    <!-- ${plan.artifact.anchor} -->`,
    `    <${plan.tag} ${open.join(' ')}>`,
    '      <div class="lc-container-body">',
    `        <el-form ${formLine.join(' ')}>`,
    ...items,
    '        </el-form>',
    '      </div>',
    '      <template #footer>',
    '        <el-button v-if="containerReadonly" type="primary" @click="closeContainer">关闭</el-button>',
    '        <template v-if="!containerReadonly">',
    '          <el-button @click="closeContainer">取消</el-button>',
    '          <el-button type="primary" @click="confirmSave">确定</el-button>',
    '        </template>',
    '      </template>',
    `    </${plan.tag}>`,
  ].join('\n')
}

/** 字段控件的一整块（锚点注释 + form-item + 控件），v-model 路径由调用方给：页面级 form / 行别名 / 子表单对象 */
function fieldBlock(c: IrNode, valuePath: string, indent: string, itemClass?: string): string[] {
  const label = c.attrs['el-form-item']?.label ?? c.artifact.field
  const control = propTexts(c, EMPTY_PAGE_FOR_PROPS)
  // 带回接线：事件不在契约 props 面（产物有、schema 无），wireOnly 已在 parse 阶段登记
  const wb = c.writeback
  const wbEvents = wb?.select ? ` @select="${wb.select}" @clear="${wb.clear}"` : ''
  const inner = `${indent}  `
  const open = `${inner}<${c.tag} v-model="${valuePath}"${control.length ? ` ${control.join(' ')}` : ''}${wbEvents}`
  const cls = itemClass ? ` class="${itemClass}"` : ''
  const L = [`${indent}<!-- ${c.artifact.anchor} -->`, `${indent}<el-form-item${cls} label="${label}"${elFormItemRequired(c)}>`]
  // options 在 rule 顶层（form-create 形状）：选项由常量驱动 el-option，写成 :options= 是错位 emit
  if (c.config && Array.isArray(c.config.obj.options)) {
    L.push(`${open}>`)
    L.push(`${inner}  <el-option v-for="opt in ${c.config.name}.options" :key="opt.value" :label="opt.label" :value="opt.value" />`)
    L.push(`${inner}</${c.tag}>`)
  } else {
    L.push(`${open} />`)
  }
  L.push(`${indent}</el-form-item>`)
  return L
}

/**
 * 字段控件的属性不需要数据源表引用（只有 dataPicker 的 globalDataSourceId 需要），
 * 但 propText 需要 page 来判定首个源 —— 用一个空页占位会把 `dataSources['x']` 退化成 ds.refId。
 * 实际字段控件的 IR prop 里不含 dsRef，globalDataSourceId 分支不读 page，因此这里传最小占位安全。
 */
const EMPTY_PAGE_FOR_PROPS = { dataSources: [] } as unknown as IrPage

interface RowHandlers {
  add: string
  remove: string
  move: string
}

const rowHandlerNames = (p: IrNode): RowHandlers => {
  const base = pascal(camelField(p.artifact.field))
  return { add: `add${base}Row`, remove: `remove${base}Row`, move: `move${base}Row` }
}

/** 容器子树里真会渲染的行容器（数组形态、未降级），按出现顺序 —— handler 按它们逐个出 */
function nestedPlansOf(plans: IrNode[]): IrNode[] {
  const out: IrNode[] = []
  const walk = (p: IrNode) => {
    if (p.nested && !p.degraded) {
      if (p.nested.shape === 'array') out.push(p)
      for (const col of p.nested.columns) col.children.forEach(walk)
      return
    }
    p.children.forEach(walk)
  }
  plans.forEach(walk)
  return out
}

function degradeComments(p: IrNode, indent: string): string[] {
  const out = [
    `${indent}<!-- lc:todo node=${p.artifact.id} type=${p.artifact.type} field=${p.artifact.field} ${p.degradeReason ?? '整节点未出码'} -->`,
  ]
  p.children.forEach((c) => out.push(...degradeComments(c, indent)))
  for (const col of p.nested?.columns || []) col.children.forEach((c) => out.push(...degradeComments(c, indent)))
  return out
}

/**
 * 嵌套容器的产物形态。
 * 行容器（group/tableForm）出 v-for + 行别名，行内控件的 v-model 落在行对象上；
 * 子表单（subForm）的值形态是对象，子字段直接挂 form.<容器字段>。
 * 行增删的上下限条件照组件语义出（add 受 max 限、删除受 min 限），配置一律读 script 里的那份常量。
 */
function renderNested(p: IrNode, indent: string): string[] {
  const n = p.nested!
  const cfgName = p.config?.name
  const has = (k: string) => !!p.config && k in p.config.obj
  const opt = (k: string, fallback: string) => (has(k) ? `${cfgName}.${k}` : fallback)
  const rows = n.valuePath
  const label = p.attrs['el-form-item']?.label
  const head = (tagLine: string) => [
    `${indent}<!-- ${p.artifact.anchor} -->`,
    `${indent}<el-form-item${label === undefined ? '' : ` label="${label}"`}${elFormItemRequired(p)}>`,
    tagLine,
  ]

  if (n.shape === 'object') {
    // 子表单：值是一个对象（component.jsx:17-21），子字段写进 form.<容器字段>
    const L = head(`${indent}  <div lc:node="${p.artifact.id}" class="lc-nested lc-nested--sub">`)
    for (const c of p.children) {
      if (c.degraded) L.push(...degradeComments(c, `${indent}    `))
      else L.push(...fieldBlock(c, `${rows}.${c.artifact.field}`, `${indent}    `))
    }
    L.push(`${indent}  </div>`, `${indent}</el-form-item>`)
    return L
  }

  const h = rowHandlerNames(p)
  const body = `${indent}  `

  if (n.carrier === 'props.columns[].rule') {
    // 子表格：行数组 + 每列一个 el-table-column（列标题来自列的 label），格内控件仍按行别名绑值
    const L = head(`${indent}  <div lc:node="${p.artifact.id}" class="lc-nested lc-nested--table">`)
    L.push(`${indent}    <el-table :data="${rows} || []" border>`)
    if (has('showIndex')) L.push(`${indent}      <el-table-column v-if="${cfgName}.showIndex" type="index" label="#" width="60" />`)
    for (const col of n.columns) {
      // 隐藏列首版不出码（TABLE_COLUMN_CONTRACT.hidden），列元素与格内控件都不渲染
      if (col.hidden) continue
      L.push(`${indent}      <el-table-column lc:node="${col.node.id}" label="${col.label}">`)
      L.push(`${indent}        <template #default="{ row: ${n.rowVar}, $index }">`)
      for (const c of col.children) {
        if (c.degraded) L.push(...degradeComments(c, `${indent}          `))
        // 列头已经是标题，格内复刻的 form-item label 由 CSS 收起（保留 form-item 供后续校验挂 prop）
        else L.push(...fieldBlock(c, `${n.rowVar}.${c.artifact.field}`, `${indent}          `, 'lc-cell-item'))
      }
      L.push(`${indent}        </template>`, `${indent}      </el-table-column>`)
    }
    if (has('deletable')) {
      L.push(`${indent}      <el-table-column v-if="${cfgName}.deletable" label="操作" width="90">`)
      L.push(`${indent}        <template #default="{ $index }">`)
      L.push(
        `${indent}          <el-button link :disabled="(${rows} || []).length <= ${opt('min', '0')}" @click="${h.remove}($index)">删除</el-button>`,
      )
      L.push(`${indent}        </template>`, `${indent}      </el-table-column>`)
    }
    L.push(`${indent}    </el-table>`)
    if (has('addable')) {
      L.push(`${indent}    <el-button v-if="${condOf(p, cfgName!, rows, 'addable')}" @click="${h.add}">添加行</el-button>`)
    }
    L.push(`${indent}  </div>`, `${indent}</el-form-item>`)
    return L
  }

  // 分组：component-elm-group 的行是对象数组，card 型每行一张 el-card，其余普通块
  const rowTag = p.config?.obj.type === 'card' ? 'el-card' : 'div'
  const L = head(`${indent}  <div lc:node="${p.artifact.id}" class="lc-nested lc-nested--group">`)
  L.push(`${body}<${rowTag} class="lc-nested-row" v-for="(${n.rowVar}, i) in ${rows} || []" :key="i">`)
  L.push(`${body}  <div class="lc-nested-row-head">`)
  // 行标题是模板（component.jsx:313 title.replace('{index}', index+1)）：只在配置了 title 时出
  if (has('title')) L.push(`${body}    <span>{{ ${cfgName}.title.replace('{index}', String(i + 1)) }}</span>`)
  L.push(`${body}    <span class="lc-nested-row-ops">`)
  if (has('sortBtn')) {
    L.push(`${body}      <el-button link :disabled="i === 0" @click="${h.move}(i, -1)">上移</el-button>`)
    L.push(`${body}      <el-button link :disabled="i === (${rows} || []).length - 1" @click="${h.move}(i, 1)">下移</el-button>`)
  }
  // 组件是 total > min 才出删除键；产物常驻按钮、用禁用态表达同一条下限
  if (has('button')) {
    L.push(
      `${body}      <el-button link :disabled="(${rows} || []).length <= ${opt('min', '0')}" @click="${h.remove}(i)">删除</el-button>`,
    )
  }
  L.push(`${body}    </span>`, `${body}  </div>`)
  for (const c of p.children) {
    if (c.degraded) L.push(...degradeComments(c, `${body}  `))
    else L.push(...fieldBlock(c, `${n.rowVar}.${c.artifact.field}`, `${body}  `))
  }
  L.push(`${body}</${rowTag}>`)
  if (has('button')) {
    L.push(`${body}<el-button v-if="${condOf(p, cfgName!, rows, 'button')}" @click="${h.add}">添加</el-button>`)
  }
  L.push(`${indent}  </div>`, `${indent}</el-form-item>`)
  return L
}

/**
 * 添加按钮的显示条件：开关 && 未到上限。上限键缺省时组件按不限处理（component max 默认 0 /
 * TableForm max 不限），产物写成 `!0` 恒真，回读仍核对常量里的原值。
 */
function condOf(p: IrNode, cfgName: string, rows: string, toggle: string): string {
  const max = p.config && 'max' in p.config.obj ? `${cfgName}.max` : '0'
  return `${cfgName}.${toggle} && (!${max} || (${rows} || []).length < ${max})`
}

/** 常量序列化：合法标识符键名去引号、无引号的字符串值用单引号，贴近人写的风格便于 review */
function jsonToTs(v: unknown): string {
  return JSON.stringify(v, null, 2)
    .replace(/^(\s*)"([A-Za-z_$][\w$]*)": /gm, '$1$2: ')
    .replace(/: "([^"'\\]*)"/g, ": '$1'")
}

function emitApi(ir: IrPage): string {
  const ds = ir.dataSources[0] ?? { id: '', refId: '' }
  const refId = String(ds.refId ?? '')
  return [
    `// lc:module=api page=${ir.pageKey} source=schema.dataSources[0]（${ds.id ?? ''} → refId ${refId}）`,
    '// 出码把「数据源标识」解析成固定 refId，运行期不再查页面 dataSources 表（原链路：resolveRefId，PageDataTable.vue:800-806）',
    "import http from '@lc/runtime/http'",
    '',
    `const REF_ID = '${refId}'`,
    '',
    'export interface QueryParams {',
    '  page?: number',
    '  size?: number',
    '  keyword?: string',
    '  keywordColumn?: string',
    '  sort?: string',
    '  order?: string',
    '  /** 结构化筛选 JSON 字符串，受 searchFields 白名单约束 */',
    '  filter?: string',
    '  params?: string',
    '}',
    '',
    `export const queryData = (params: QueryParams) => http.get(\`/v1/data-sources/\${REF_ID}/data\`, { params })`,
    `export const getData = (id: string) => http.get(\`/v1/data-sources/\${REF_ID}/data/\${id}\`)`,
    `export const createData = (data: Record<string, unknown>) => http.post(\`/v1/data-sources/\${REF_ID}/data\`, data)`,
    `export const updateData = (id: string, data: Record<string, unknown>, version?: number) =>`,
    `  http.put(\`/v1/data-sources/\${REF_ID}/data/\${id}\`, data, { params: { version } })`,
    `export const deleteData = (id: string) => http.delete(\`/v1/data-sources/\${REF_ID}/data/\${id}\`)`,
    '',
  ].join('\n')
}

export function emitFiles(ir: IrPage): Record<string, string> {
  return { [ir.file]: emitTemplate(ir), [ir.apiFile]: emitApi(ir) }
}

// ==================== manifest ====================

export function emitManifest(ir: IrPage): GeneratedManifest {
  // 注入 adapter 缺失是产物侧（目标实现）的事实，挂到 manifest 的报告里而不是在 parse 里判
  const unsupported = [...ir.unsupported]
  for (const inj of ir.injections) {
    if (INJECT_ADAPTERS[inj.constName]) continue
    unsupported.push({
      path: 'script',
      type: 'codegen',
      key: inj.constName,
      message: `契约声明了注入 ${inj.prop}，但产物没有 ${inj.constName} 的实现（INJECT_ADAPTERS 缺一条），未接线`,
    })
  }
  return {
    kind: 'page-codegen-manifest',
    manifestVersion: 2,
    generator: 'lc-codegen@0.1.0-spike1',
    source: {
      pageKey: ir.pageKey,
      pageName: ir.pageName,
      schemaDigest: ir.schemaDigest,
      digestRule: '键名升序规范化序列化后取 FNV-1a 32 位（首版占位，正式版换 sha256 前 16 位）',
      exportedAt: ir.exportedAt,
    },
    runtime: {
      package: '@lc/runtime',
      sdkVersion: '1',
      components: runtimeTagsOf(ir.nodes),
      note: '表单容器不出 runtime 组件，出成容器标签 + EP 原生表单模板',
    },
    contract: {
      comment: '回导（产物 → schema）只靠登记表才能零歧义；本表由 codegen/contract.ts 的能力表自动产出，不手写',
      registers: {
        dropped: '身份键清单：出码丢弃、setRule 回导时补回（按作用域前缀匹配叶名）',
        'warnings[].path': '丢弃登记表：path 相对 node.rulePath 且必须机器可读；kind ∈ dropKinds 的条目在回导对比时豁免',
        renames: '重命名/派生登记表：from(schema 路径) ← to(产物侧证据)，回导先校验两侧值一致再剥离产物键',
        wireOnly: '归属登记表：产物里有、schema 里没有的接线键，回导剥离不报多造',
        defaults: '默认值登记表：结构键取默认值时产物省略不写，回导按此补；非默认值必须显式出码',
        'dataSources[].warnings': '数据源级丢弃登记：path 为页面级绝对路径（dataSources[i].<键>），bindings 记消费节点',
      },
      dropKinds: [
        'ignored-by-runtime',
        'no-consumer',
        'overridden-at-runtime',
        'not-in-artifact',
        'runtime-derived',
        'default-elided',
        'step-param-dropped',
        'chain-compiled',
      ],
      defaults: STRUCT_DEFAULTS,
    },
    nodes: [...flattenIrNodes(ir.nodes), ir.option.node],
    dataSources: ir.dataSources,
    behaviors: ir.behaviors,
    unsupported,
    identity: {
      policy:
        '出码丢弃 _fc_id/name/_fc_drag_tag；回导时由 FcDesigner.setRule 经 vendor loadRule/makeRule 补全（ruleIdentityStability.test.ts 保证缺失才补、已有值不改写）',
    },
  }
}
