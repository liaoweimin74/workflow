// ----- Task 2.2: 渲染机组件解析（resolveComponent）-----
// 同一渲染机按 design_type 解析组件注册表：web→宿主 el-* 包（现状，全局别名解析，返回 null）；
// uniapp→@lc/ui-mobile 契约组件（component-map 单一事实源）。
// npx vitest run src/views/page/codegen/__tests__/component-map.test.ts

import { describe, expect, it } from 'vitest'
import { resolveComponent, UNIAPP_COMPONENT_MAP } from '../component-map'

describe('resolveComponent(type, designType)', () => {
  it('uniapp 页面解析到 @lc/ui-mobile 契约组件', () => {
    expect(resolveComponent('input', 'uniapp')).toBe('LcInput')
    expect(resolveComponent('select', 'uniapp')).toBe('LcSelect')
    expect(resolveComponent('datePicker', 'uniapp')).toBe('LcDatePicker')
  })

  it('web 页面返回 null（宿主 el-* 包按 form-create 全局别名解析，现状不动）', () => {
    expect(resolveComponent('input', 'web')).toBeNull()
    expect(resolveComponent('select', 'web')).toBeNull()
  })

  it('uniapp 无映射的类型返回 null（web-only 组件走能力矩阵置灰，画布不强行渲染）', () => {
    expect(resolveComponent('PageIframe', 'uniapp')).toBeNull()
    expect(resolveComponent('page-tree', 'uniapp')).toBeNull()
    expect(resolveComponent('不存在的类型', 'uniapp')).toBeNull()
  })

  it('映射表覆盖字段族核心类型（input/select/radio/checkbox/switch/datePicker 至少在列）', () => {
    for (const type of ['input', 'select', 'radio', 'checkbox', 'switch', 'datePicker']) {
      expect(UNIAPP_COMPONENT_MAP[type], `uniapp 侧应映射 ${type}`).toBeDefined()
    }
  })
})
