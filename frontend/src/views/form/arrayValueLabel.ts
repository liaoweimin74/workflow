/**
 * 数组值组件提交预处理：为数组值组件（select / checkbox / multiSelect /
 * multiSelectPro / elTransfer / tree / elTreeSelect / cascader）生成 `<key>_text`
 * 显示文本，供列表显示与模糊查询使用。
 *
 * 组件选项取值位置：
 * - select/checkbox/multiSelect：rule.options（含 el-option-group 嵌套）
 * - tree/elTreeSelect/elTransfer：props.data（树）
 * - cascader：props.options（树，显示文本为完整路径 `/` 分隔）
 *
 * 单选值统一为长度 1 的数组（主列 JSON 语义）。选项缺失时回退 value join。
 * 已有 `<key>_text`：值可映射时覆盖为最新文本（编辑改值保持一致）；选项缺失（纯回退）时保留已有。
 */

const ARRAY_COMPONENTS = new Set(['select', 'checkbox', 'multiSelect', 'multiSelectPro', 'elTransfer', 'tree', 'elTreeSelect', 'cascader'])

interface TreeNode {
  label?: unknown
  value?: unknown
  children?: TreeNode[]
  fullPath?: string
}

interface RuleNode {
  type?: string
  field?: string
  props?: Record<string, any>
  options?: any[]
  children?: RuleNode[]
  [key: string]: any
}

/** 数组值组件判定（对齐 ColumnConfigDialog / ColumnTypeMapper） */
function isArrayComponent(type: string | undefined): boolean {
  if (!type) return false
  return ARRAY_COMPONENTS.has(type)
}

/** 树形/级联组件（主列统一叶子 value 数组存储） */
function isPathComponent(type: string): boolean {
  return type === 'cascader' || type === 'tree' || type === 'elTreeSelect'
}

/** 树形/级联值 → 叶子 value 数组：单选单值 → [v]；cascader emitPath=true 路径数组 → 每路径取最后段（叶子） */
function toLeafArray(type: string, rule: RuleNode, value: unknown): unknown[] {
  if (type === 'cascader') {
    const inner = rule.props?.props as Record<string, any> | undefined
    if (inner?.emitPath !== false) {
      // emitPath=true：值是路径数组（单选 [l1,l2,leaf]）或多选路径数组的数组（[[...],[...]]）
      if (Array.isArray(value)) {
        if (Array.isArray((value as unknown[])[0])) {
          return (value as unknown[][]).map((p) => (Array.isArray(p) && p.length > 0 ? p[p.length - 1] : p))
        }
        return (value as unknown[]).length > 0 ? [(value as unknown[])[(value as unknown[]).length - 1]] : []
      }
      return [value]
    }
  }
  return Array.isArray(value) ? value : [value]
}

/** 扁平 options 中 value → label（支持 el-option-group 嵌套） */
function labelOf(options: any[] | undefined, value: unknown): string | undefined {
  if (!Array.isArray(options)) return undefined
  for (const o of options) {
    if (o && (o.value === value || String(o.value) === String(value))) {
      return o.label === undefined ? undefined : String(o.label)
    }
    if (o && Array.isArray(o.options)) {
      const r = labelOf(o.options, value)
      if (r !== undefined) return r
    }
  }
  return undefined
}

/** 树中查找 value 匹配节点的 label（任意层级；cascader 路径段用） */
function findNodeLabelByValue(tree: TreeNode[] | undefined, value: unknown): string | undefined {
  if (!Array.isArray(tree)) return undefined
  for (const node of tree) {
    if (node.value === value || String(node.value) === String(value)) {
      return node.label === undefined ? undefined : String(node.label)
    }
    if (Array.isArray(node.children)) {
      const r = findNodeLabelByValue(node.children, value)
      if (r !== undefined) return r
    }
  }
  return undefined
}

/** 树中收集 value 匹配节点的完整路径 label（`/` 分隔；cascader/树形用） */
function collectPathLabels(tree: TreeNode[] | undefined, value: unknown, path: string[]): string[] {
  const out: string[] = []
  if (!Array.isArray(tree)) return out
  for (const node of tree) {
    const nextPath = [...path, node.label === undefined ? '' : String(node.label)]
    if (node.value === value || String(node.value) === String(value)) {
      out.push(nextPath.join('/'))
    }
    if (Array.isArray(node.children)) {
      out.push(...collectPathLabels(node.children, value, nextPath))
    }
  }
  return out
}

/** 构建单个数组组件的显示文本；mapped=至少一个 value 成功映射到 label/路径（非纯 value 回退） */
function buildText(type: string, rule: RuleNode, value: unknown): { text: string; mapped: boolean } {
  const values = Array.isArray(value) ? value : [value]
  if (type === 'cascader') {
    // 主列值已由 toLeafArray 统一为叶子 value 数组（walk 预处理）→ 每叶子取完整路径
    const tree: TreeNode[] | undefined = rule.props?.options
    const parts: string[] = []
    let mapped = false
    for (const v of values) {
      const paths = collectPathLabels(tree, v, [])
      if (paths.length > 0) {
        mapped = true
        parts.push(...paths.map((p) => '/' + p))
      } else {
        parts.push(String(v))
      }
    }
    return { text: parts.join(','), mapped }
  }
  if (type === 'tree' || type === 'elTreeSelect' || type === 'elTransfer') {
    const tree: TreeNode[] | undefined = rule.props?.data
    if (type === 'elTransfer') {
      // 穿梭框无层级：叶子 label 逗号连接（无路径前缀）
      const parts = values.map((v) => findNodeLabelByValue(tree, v) ?? String(v))
      const mapped = values.some((v) => findNodeLabelByValue(tree, v) !== undefined)
      return { text: parts.join(', '), mapped }
    }
    // 树形：完整路径带前导 /，多选逗号连接
    const parts: string[] = []
    let mapped = false
    for (const v of values) {
      const paths = collectPathLabels(tree, v, [])
      if (paths.length > 0) {
        mapped = true
        parts.push(...paths.map((p) => '/' + p))
      } else {
        parts.push(String(v))
      }
    }
    return { text: parts.join(','), mapped }
  }
  // select / checkbox / multiSelect / multiSelectPro
  const parts = values.map((v) => labelOf(rule.options, v) ?? String(v))
  const mapped = values.some((v) => labelOf(rule.options, v) !== undefined)
  return { text: parts.join(', '), mapped }
}

/** 递归遍历 rule 树，为数组组件生成 `<key>_text` */
function walk(rules: RuleNode[], formData: Record<string, unknown>): void {
  for (const rule of rules) {
    const type = rule.type as string | undefined
    if (isArrayComponent(type)) {
      const key = rule.field as string | undefined
      if (key && formData[key] !== undefined && formData[key] !== null) {
        let raw = formData[key]
        if (isPathComponent(type as string)) {
          // 树形/级联：主列统一为叶子 value 数组（单选单值 → [v]；cascader emitPath=true 路径数组 → 取叶子）
          raw = toLeafArray(type as string, rule, raw)
          formData[key] = raw
        }
        const { text, mapped } = buildText(type as string, rule, raw)
        // 选项映射失败（纯 value 回退，mapped=false）时保留已有 _text（回显显示文本），避免劣化；
        // 值可映射（mapped=true）时始终覆盖，保证编辑修改值后 _text 与 value 一致
        if (formData[key + '_text'] === undefined || mapped) {
          formData[key + '_text'] = text
        }
      }
    }
    if (Array.isArray(rule.children)) {
      walk(rule.children as RuleNode[], formData)
    }
    if (Array.isArray(rule.props?.rule)) {
      walk(rule.props.rule as RuleNode[], formData)
    }
    if (Array.isArray(rule.props?.columns)) {
      for (const col of rule.props.columns) {
        if (col && Array.isArray(col.rule)) walk(col.rule as RuleNode[], formData)
      }
    }
  }
}

/**
 * 为数组值组件字段附加 `<key>_text` 显示文本。
 * @param formData 表单提交数据（业务字段平铺对象）
 * @param rules    表单 schema rule 数组
 * @returns 附加了 `<key>_text` 的新对象（不修改入参）
 */
export function withArrayLabels(formData: Record<string, unknown>, rules: Array<Record<string, any>>): Record<string, unknown> {
  const out = { ...formData }
  walk(rules as unknown as RuleNode[], out)
  return out
}

/**
 * 回显兜底：为数组组件注入缺失的选项项。
 *
 * 表单回显时，数组组件的 options（rule.options / props.data / props.options）若找不到
 * 主列 value 的匹配项（异步数据源未就绪、value 类型不匹配、静态选项缺失），element 组件
 * 会回退显示原始 value。此处用 `<key>_text` 显示文本注入 `{ value, label }` 兜底项，
 * 使组件直接显示显示文本；已有匹配项时不注入（保留真实 label）。
 * 就地修改 rule（不深拷贝），调用方应在组件渲染前使用。
 */
export function injectFallbackOptions(rules: Array<Record<string, any>>, formData: Record<string, unknown> | undefined): void {
  if (!Array.isArray(rules) || !formData) return
  for (const rawRule of rules) {
    const rule = rawRule as RuleNode
    const type = rule.type as string | undefined
    if (isArrayComponent(type)) {
      const key = rule.field as string | undefined
      if (key) {
        const v = formData[key]
        const text = formData[key + '_text']
        if (v !== undefined && v !== null && text !== undefined && text !== null && String(text) !== '') {
          const list = optionContainerOf(type as string, rule)
          if (list) {
            const values = Array.isArray(v) ? v : [v]
            const labels = leafLabelsOf(text, values)
            for (let i = 0; i < values.length; i++) {
              const single = values[i]
              if (single !== undefined && single !== null && !hasOption(list, single)) {
                list.push({ value: single, label: labels[i] ?? String(text) })
              }
            }
          }
        }
      }
    }
    if (Array.isArray(rule.children)) {
      injectFallbackOptions(rule.children as RuleNode[], formData)
    }
    if (Array.isArray(rule.props?.rule)) {
      injectFallbackOptions(rule.props.rule as RuleNode[], formData)
    }
    if (Array.isArray(rule.props?.columns)) {
      for (const col of rule.props.columns) {
        if (col && Array.isArray(col.rule)) injectFallbackOptions(col.rule as RuleNode[], formData)
      }
    }
  }
}

/** 扁平选项组件的选项容器：select/checkbox/multiSelect → rule.options。
 * 树形结构组件（tree/elTreeSelect/cascader）返回 null——根级注入孤立节点会污染树结构，
 * 导致组件匹配/选中节点错乱（回显显示全路径由 prepareTreeFullPath 处理）。 */
function optionContainerOf(type: string, rule: RuleNode): unknown[] | null {
  if (type === 'tree' || type === 'elTreeSelect' || type === 'cascader') return null
  // select / checkbox / multiSelect / multiSelectPro
  if (!Array.isArray(rule.options)) rule.options = []
  return rule.options
}

/** options 列表中是否存在 value 匹配项（String 比较容错） */
function hasOption(list: unknown[], value: unknown): boolean {
  return list.some((o) => o !== null && typeof o === 'object'
    && ((o as Record<string, unknown>).value === value || String((o as Record<string, unknown>).value) === String(value)))
}

/** 从 `<key>_text` 提取各 value 对应的叶子 label（路径最后一段）；顺序与 values 对应 */
function leafLabelsOf(text: unknown, values: unknown[]): (string | undefined)[] {
  if (text === null || text === undefined) return values.map(() => undefined)
  const segments = String(text).split(',')
  return values.map((_v, i) => {
    const seg = segments[i]?.trim()
    if (!seg) return undefined
    const leaf = seg.split('/').pop()
    return leaf === undefined || leaf === '' ? undefined : leaf
  })
}

/** 树形/级联是否单选（无 multiple / showCheckbox 配置） */
function isSingleSelect(rule: RuleNode): boolean {
  const props = rule.props as Record<string, any> | undefined
  if (props?.multiple || props?.showCheckbox) return false
  const inner = props?.props as Record<string, any> | undefined
  if (inner?.multiple) return false
  return true
}

/** 递归为树节点添加 fullPath（前导 / 全路径，如 /总公司/武汉分公司） */
function annotateFullPath(nodes: TreeNode[], parentPath: string): void {
  for (const node of nodes) {
    const label = node.label === undefined ? '' : String(node.label)
    const fullPath = parentPath + '/' + label
    node.fullPath = fullPath
    if (Array.isArray(node.children)) annotateFullPath(node.children, fullPath)
  }
}

/**
 * 回显规范化：
 * 1. 树形（tree/elTreeSelect）递归为树节点添加 fullPath 并将显示 label 字段指向 fullPath
 *    （用户未自定义 label 字段时），输入框与下拉树显示全路径；
 * 2. 树形/级联单选主列为数组时解包为单值（取最后一段叶子，兼容存量路径数组）；
 * 3. 扁平选项组件（select/checkbox 等）options 无匹配时注入 `<key>_text` 叶子 label 兜底。
 * 表单渲染前调用。
 */
export function normalizeEchoData(rules: Array<Record<string, any>>, formData: Record<string, unknown>): void {
  if (!Array.isArray(rules) || !formData) return
  for (const rawRule of rules) {
    const rule = rawRule as RuleNode
    const type = rule.type as string | undefined
    if (type === 'tree' || type === 'elTreeSelect') {
      // 全路径显示预处理（单选/多选均生效）
      if (Array.isArray(rule.props?.data)) {
        annotateFullPath(rule.props.data as TreeNode[], '')
        if (!rule.props) rule.props = {}
        if (!rule.props.props) rule.props.props = {}
        // 用户未自定义 label 字段时指向 fullPath（输入框显示选中节点全路径）
        if (!rule.props.props.label) rule.props.props.label = 'fullPath'
      }
    }
    if (isPathComponent(type as string) && isSingleSelect(rule)) {
      const key = rule.field as string | undefined
      if (key && Array.isArray(formData[key])) {
        const arr = formData[key] as unknown[]
        formData[key] = arr.length > 0 ? arr[arr.length - 1] : ''
      }
    }
    if (Array.isArray(rule.children)) normalizeEchoData(rule.children as unknown as Array<Record<string, any>>, formData)
    if (Array.isArray(rule.props?.rule)) normalizeEchoData(rule.props.rule as unknown as Array<Record<string, any>>, formData)
    if (Array.isArray(rule.props?.columns)) {
      for (const col of rule.props.columns) {
        if (col && Array.isArray(col.rule)) normalizeEchoData(col.rule as unknown as Array<Record<string, any>>, formData)
      }
    }
  }
  injectFallbackOptions(rules, formData)
}

/**
 * 表格列/显示用：从 `<key>_text` 提取显示文本——每段路径取最后一段（叶子 label），逗号连接。
 * select/checkbox/transfer 的 `_text` 无 `/`，原样返回（叶子 label）；树形/级联 `/总公司/武汉分公司` → `武汉分公司`。
 */
export function leafDisplayText(text: unknown): string {
  if (text === null || text === undefined) return ''
  return String(text)
    .split(',')
    .map((s) => {
      const seg = s.trim()
      if (!seg) return ''
      const leaf = seg.split('/').pop()
      return leaf === undefined || leaf === '' ? seg : leaf
    })
    .filter(Boolean)
    .join(', ')
}
