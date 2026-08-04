// TDD RED: extractXFields + applyPermissionsToDsl — VTJ DSL field extraction & permission application
// npx vitest run src/utils/__tests__/vtjDsl.test.ts

import { describe, it, expect } from 'vitest'
import { extractXFields, applyPermissionsToDsl } from '../vtjDsl'

// ---------- Test DSL fixtures ----------

/** Simple DSL: one XField at top level */
const simpleDsl = {
  nodes: [
    {
      name: 'XField',
      props: { name: 'username', label: '用户名' },
    },
  ],
}

/** Nested DSL: XField inside a container node */
const nestedDsl = {
  nodes: [
    {
      name: 'XContainer',
      props: {},
      children: [
        {
          name: 'XField',
          props: { name: 'email', label: '邮箱' },
        },
        {
          name: 'XField',
          props: { name: 'phone', label: '电话' },
        },
      ],
    },
  ],
}

/** DSL using `component` instead of `name` for node identification */
const componentAttrDsl = {
  nodes: [
    {
      component: 'XField',
      props: { name: 'age', label: '年龄' },
    },
  ],
}

/** DSL where XField has `field` prop instead of `name` */
const fieldPropDsl = {
  nodes: [
    {
      name: 'XField',
      props: { field: 'address', title: '地址' },
    },
  ],
}

/** Deeply nested DSL with children as non-array (single object) */
const deepDsl = {
  nodes: [
    {
      name: 'XForm',
      children: {
        name: 'XField',
        props: { name: 'deepField', label: '深层字段' },
      },
    },
  ],
}

/** Empty / edge cases */
const emptyDsl = { nodes: [] }
const noNodesDsl = { foo: 'bar' }

// ---------- extractXFields ----------

describe('extractXFields', () => {
  it('提取顶层 XField 节点', () => {
    const result = extractXFields(simpleDsl)
    expect(result).toEqual([{ field: 'username', label: '用户名' }])
  })

  it('递归提取嵌套 XField 节点', () => {
    const result = extractXFields(nestedDsl)
    expect(result).toEqual([
      { field: 'email', label: '邮箱' },
      { field: 'phone', label: '电话' },
    ])
  })

  it('支持 component 属性标识 XField', () => {
    const result = extractXFields(componentAttrDsl)
    expect(result).toEqual([{ field: 'age', label: '年龄' }])
  })

  it('支持 field prop 作为字段名，title 作为标签', () => {
    const result = extractXFields(fieldPropDsl)
    expect(result).toEqual([{ field: 'address', label: '地址' }])
  })

  it('递归遍历 children 为对象（非数组）的情况', () => {
    const result = extractXFields(deepDsl)
    expect(result).toEqual([{ field: 'deepField', label: '深层字段' }])
  })

  it('空 nodes 数组返回空数组', () => {
    const result = extractXFields(emptyDsl)
    expect(result).toEqual([])
  })

  it('无 nodes 属性时返回空数组', () => {
    const result = extractXFields(noNodesDsl)
    expect(result).toEqual([])
  })

  it('跳过没有 name/field 的 XField 节点', () => {
    const dsl = {
      nodes: [
        { name: 'XField', props: { label: '无标识' } },
        { name: 'XField', props: { name: 'valid', label: '有效' } },
      ],
    }
    const result = extractXFields(dsl)
    expect(result).toEqual([{ field: 'valid', label: '有效' }])
  })

  it('label 缺失时使用 fieldName 作为 label', () => {
    const dsl = {
      nodes: [
        { name: 'XField', props: { name: 'noLabel' } },
      ],
    }
    const result = extractXFields(dsl)
    expect(result).toEqual([{ field: 'noLabel', label: 'noLabel' }])
  })
})

// ---------- applyPermissionsToDsl ----------

describe('applyPermissionsToDsl', () => {
  it('对 VIEW 权限设置 disabled', () => {
    const dsl = {
      nodes: [
        { name: 'XField', props: { name: 'f1', label: 'F1' } },
      ],
    }
    const result = applyPermissionsToDsl(dsl, { f1: 'VIEW' })
    expect(result.nodes[0].props.disabled).toBe(true)
    expect(result.nodes[0].props.visible).toBeUndefined()
  })

  it('对 HIDDEN 权限设置 visible=false', () => {
    const dsl = {
      nodes: [
        { name: 'XField', props: { name: 'f1', label: 'F1' } },
      ],
    }
    const result = applyPermissionsToDsl(dsl, { f1: 'HIDDEN' })
    expect(result.nodes[0].props.visible).toBe(false)
    expect(result.nodes[0].props.disabled).toBeUndefined()
  })

  it('对 EDIT 权限不修改 props', () => {
    const dsl = {
      nodes: [
        { name: 'XField', props: { name: 'f1', label: 'F1' } },
      ],
    }
    const result = applyPermissionsToDsl(dsl, { f1: 'EDIT' })
    expect(result.nodes[0].props.disabled).toBeUndefined()
    expect(result.nodes[0].props.visible).toBeUndefined()
  })

  it('递归遍历嵌套节点', () => {
    const dsl = {
      nodes: [
        {
          name: 'XContainer',
          children: [
            { name: 'XField', props: { name: 'a', label: 'A' } },
            { name: 'XField', props: { name: 'b', label: 'B' } },
          ],
        },
      ],
    }
    const result = applyPermissionsToDsl(dsl, { a: 'VIEW', b: 'HIDDEN' })
    expect(result.nodes[0].children[0].props.disabled).toBe(true)
    expect(result.nodes[0].children[1].props.visible).toBe(false)
  })

  it('不修改无权限配置的字段', () => {
    const dsl = {
      nodes: [
        { name: 'XField', props: { name: 'f1', label: 'F1' } },
        { name: 'XField', props: { name: 'f2', label: 'F2' } },
      ],
    }
    const result = applyPermissionsToDsl(dsl, { f1: 'VIEW' })
    expect(result.nodes[0].props.disabled).toBe(true)
    expect(result.nodes[0].props.visible).toBeUndefined()
    // f2 未被修改
    expect(result.nodes[1].props.disabled).toBeUndefined()
    expect(result.nodes[1].props.visible).toBeUndefined()
  })

  it('不修改原始 DSL（返回深拷贝）', () => {
    const dsl = {
      nodes: [
        { name: 'XField', props: { name: 'f1', label: 'F1' } },
      ],
    }
    const result = applyPermissionsToDsl(dsl, { f1: 'VIEW' })
    expect(result).not.toBe(dsl)
    expect(result.nodes[0]).not.toBe(dsl.nodes[0])
    expect(result.nodes[0].props).not.toBe(dsl.nodes[0].props)
    // 原始不变
    expect(dsl.nodes[0].props.disabled).toBeUndefined()
  })

  it('空权限对象不修改 DSL', () => {
    const dsl = {
      nodes: [
        { name: 'XField', props: { name: 'f1', label: 'F1' } },
      ],
    }
    const result = applyPermissionsToDsl(dsl, {})
    expect(result.nodes[0].props.disabled).toBeUndefined()
    expect(result.nodes[0].props.visible).toBeUndefined()
  })
})
