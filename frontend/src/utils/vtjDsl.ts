/**
 * VTJ DSL 工具函数：从 VTJ DSL 节点树中提取 XField 字段信息，
 * 以及递归应用字段权限。
 */

import type { FormRule } from '@/components/business/types'

/** XField 提取结果 */
export interface ExtractedField {
  field: string
  label: string
}

/** 字段权限类型 */
export type FieldPermission = 'EDIT' | 'VIEW' | 'HIDDEN'

/** VTJ DSL 节点类型（宽松定义，DSL 结构灵活） */
export interface DslNode {
  name?: string
  component?: string
  props?: Record<string, any>
  children?: DslNode[] | DslNode
  [key: string]: any
}

/** VTJ DSL 根结构 */
export interface VtjDsl {
  nodes?: DslNode[]
  [key: string]: any
}

/**
 * 判断节点是否为 XField 组件
 */
function isXField(node: DslNode): boolean {
  return node.name === 'XField' || node.component === 'XField'
}

/**
 * 从单个 XField 节点提取 field 和 label
 */
function extractFieldFromNode(node: DslNode): ExtractedField | null {
  const fieldName = node.props?.name || node.props?.field || ''
  if (!fieldName) return null
  const fieldLabel = node.props?.label || node.props?.title || fieldName
  return { field: fieldName, label: fieldLabel }
}

/**
 * 递归遍历 VTJ DSL 节点树，提取所有 XField 的 name 和 label。
 *
 * @param dsl VTJ DSL 对象，含 nodes 数组
 * @returns 提取出的字段列表 { field, label }
 */
export function extractXFields(dsl: any): ExtractedField[] {
  const result: ExtractedField[] = []

  function traverse(nodes: any[]): void {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue

      if (isXField(node)) {
        const field = extractFieldFromNode(node)
        if (field) result.push(field)
      }

      if (node.children) {
        const children = Array.isArray(node.children) ? node.children : [node.children]
        traverse(children)
      }
    }
  }

  const rootNodes = dsl?.nodes || (Array.isArray(dsl) ? dsl : [dsl])
  traverse(rootNodes)
  return result
}

/**
 * 递归遍历 VTJ DSL 节点树，对 XField 节点应用字段权限。
 * 返回深拷贝后的 DSL，不修改原始对象。
 *
 * - VIEW: 设置 props.disabled = true
 * - HIDDEN: 设置 props.visible = false
 * - EDIT: 不修改
 *
 * @param dsl VTJ DSL 对象
 * @param permissions 字段权限映射 { fieldName: permission }
 * @returns 应用权限后的新 DSL 对象
 */
export function applyPermissionsToDsl(
  dsl: VtjDsl,
  permissions: Record<string, FieldPermission>,
): VtjDsl {
  function cloneNode(node: DslNode): DslNode {
    const cloned: DslNode = { ...node }
    if (node.props) {
      cloned.props = { ...node.props }
    }

    if (isXField(cloned) && cloned.props) {
      const fieldName = cloned.props.name || cloned.props.field || ''
      const permission = fieldName ? permissions[fieldName] : undefined
      if (permission === 'VIEW') {
        cloned.props.disabled = true
      } else if (permission === 'HIDDEN') {
        cloned.props.visible = false
      }
    }

    if (node.children) {
      const children = Array.isArray(node.children) ? node.children : [node.children]
      cloned.children = children.map(cloneNode)
    }

    return cloned
  }

  const result: VtjDsl = { ...dsl }
  if (dsl.nodes) {
    result.nodes = dsl.nodes.map(cloneNode)
  }
  return result
}

// ============================================================
// FormRule → BlockSchema 转换器
// ============================================================

/** form-create type → VTJ XField editor 映射 */
const FORM_TYPE_TO_EDITOR: Record<string, string> = {
  input: 'text',
  textarea: 'textarea',
  select: 'select',
  radio: 'radio',
  checkbox: 'checkbox',
  inputNumber: 'number',
  number: 'number',
  date: 'date',
  datePicker: 'date',
  time: 'time',
  timePicker: 'time',
  datetime: 'datetime',
  dateTimePicker: 'datetime',
  switch: 'switch',
  slider: 'slider',
  rate: 'rate',
  cascader: 'cascader',
  treeSelect: 'picker',
  LookupPicker: 'picker',
}

/**
 * 判断输入是否为 FormRule[]（旧版 form-create 规则数组）。
 * FormRule 有 `type` + `field` 属性，BlockSchema 有 `name` + `nodes` 属性。
 */
export function isFormRuleArray(input: unknown): input is FormRule[] {
  if (!Array.isArray(input) || input.length === 0) return false
  const first = input[0]
  if (!first || typeof first !== 'object') return false
  return 'type' in first && ('field' in first || 'prop' in first) && !('name' in first && 'nodes' in first)
}

/**
 * 将单个 FormRule 转换为 VTJ NodeSchema（XField 节点）。
 */
function ruleToNode(rule: FormRule): DslNode {
  const fieldName = rule.field || rule.prop || ''
  const fieldLabel = rule.title || rule.label || fieldName
  const editor = FORM_TYPE_TO_EDITOR[rule.type] || 'text'

  const nodeProps: Record<string, any> = {
    name: fieldName,
    label: fieldLabel,
    editor,
  }

  // 合并 props（placeholder、data、options 等）
  if (rule.props) {
    nodeProps.props = { ...rule.props }
  }

  // 透传 options（select/radio/checkbox 用）
  if (rule.options) {
    if (!nodeProps.props) nodeProps.props = {}
    nodeProps.props.options = rule.options
  }

  // 透传 value（默认值）
  if (rule.value !== undefined) {
    nodeProps.modelValue = rule.value
  }

  // 处理 validate 规则 → 转为 required + rules
  if (rule.validate && Array.isArray(rule.validate)) {
    const requiredRule = rule.validate.find((v: any) => v.required)
    if (requiredRule) {
      nodeProps.required = true
      if (requiredRule.message) {
        nodeProps.rules = [{ required: true, message: requiredRule.message, trigger: requiredRule.trigger || 'blur' }]
      }
    }
  }

  return {
    name: 'XField',
    props: nodeProps,
  }
}

/**
 * 将 form-create FormRule[] 转换为 VTJ BlockSchema。
 *
 * 生成的 BlockSchema 包含一个 XForm 根节点，
 * 其 children 为各 XField 节点。
 *
 * @param rules form-create 规则数组
 * @returns VTJ BlockSchema 对象
 */
export function formRuleToBlockSchema(rules: FormRule[]): VtjDsl {
  const nodes: DslNode[] = rules.map(ruleToNode)

  return {
    name: 'XForm',
    nodes: [
      {
        name: 'XForm',
        props: {
          labelWidth: '100px',
          labelPosition: 'right',
          footer: false,
        },
        children: nodes,
      },
    ],
  }
}
