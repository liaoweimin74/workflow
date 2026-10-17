import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeColumnStyle } from '@/utils/fieldStyle'

describe('ColumnAdvancedConfig — 统一样式结构', () => {
  it('normalizeColumnStyle 收敛旧字段到 style', () => {
    const result = normalizeColumnStyle({
      fontFamily: 'monospace',
      fontSize: 14,
      fontWeight: 600,
      fontColor: '#f00',
      align: 'center',
    })
    expect(result.style).toBeDefined()
    expect(result.style?.fontFamily).toBe('monospace')
    expect(result.style?.fontSize).toBe(14)
    expect(result.style?.fontWeight).toBe(600)
    expect(result.style?.color).toBe('#f00')
  })

  it('normalizeColumnStyle 保留已有 style.color', () => {
    const result = normalizeColumnStyle({
      style: { color: '#0f0' },
      fontColor: '#f00',
    })
    expect(result.style?.color).toBe('#0f0') // 已有值优先
  })

  it('normalizeColumnStyle 收敛 className', () => {
    const result = normalizeColumnStyle({
      className: 'col-highlight',
    })
    expect(result.style?.className).toBe('col-highlight')
  })

  it('normalizeColumnStyle 收敛 styleExpr', () => {
    const result = normalizeColumnStyle({
      styleExpr: "$row.status === '异常' ? 'color:red' : ''",
    })
    expect(result.style?.dynamic).toHaveLength(1)
    expect(result.style?.dynamic?.[0].when).toBe("$row.status === '异常' ? 'color:red' : ''")
  })
})

// ----- 点击动作参数区：契约驱动 + 卡片化竖排（dialog 内容在 jsdom 下不可稳定 mount，用源码结构断言）-----
describe('ColumnAdvancedConfig — 点击动作参数区按契约渲染', () => {
  const source = readFileSync(resolve(__dirname, '../ColumnAdvancedConfig.vue'), 'utf8')
  /** 点击动作编辑区片段 */
  const block = source.slice(source.indexOf('class="cellclick-editor"'), source.indexOf('+ 增加动作'))

  it('动作类型与「移除动作」在卡片头部行，参数不与之同排', () => {
    expect(block).toContain('class="event-action-head"')
    const head = block.slice(
      block.indexOf('class="event-action-head"'),
      block.indexOf('class="event-action-params"'),
    )
    expect(head).toContain('actionTypeOptions')
    expect(head).toContain('event-action-remove')
    expect(head).not.toContain('event-param-row')
  })

  it('参数纵向排列在参数区内，值输入弹性撑满', () => {
    expect(block).toContain('class="event-param-row"')
    expect(block).toContain('class="param-value"')
    expect(source).toMatch(/\.event-action-params\s*\{[\s\S]*?flex-direction:\s*column;/)
    expect(source).toMatch(/\.param-value\s*\{[\s\S]*?flex:\s*1 1 auto;/)
  })

  it('参数行按契约渲染：固定参数名只读，仅动态参数动作给增删入口', () => {
    expect(block).toContain('class="param-key-label"')
    expect(block).toContain('p.custom || paramsEditable(action.type)')
    expect(block).toContain('v-if="paramsEditable(action.type)"')
    expect(block).toContain('paramView(action)')
    // 动态参数动作零参数时也要渲染参数区，否则没有第一个参数的添加入口
    expect(block).toContain('paramView(action).length > 0 || paramsEditable(action.type)')
  })

  it('换动作类型走参数重置，不沿用上一个动作的残留键', () => {
    expect(source).toMatch(/p\.type \? \{ \.\.\.merged, params: retargetActionParams\(p\.type, a\.params\) \}/)
  })

  it('参数写操作先按契约对齐参数序，视图行号与 params 下标一致', () => {
    const mutators = source.slice(source.indexOf('function addParam('), source.indexOf('function handleSave('))
    expect(mutators).toMatch(/function patchParam[\s\S]*?syncActionParams\(a\.type, a\.params\)\.map/)
    expect(mutators).toMatch(/function addParam[\s\S]*?\[\.\.\.syncActionParams\(a\.type, a\.params\), \{ key: '', value: '' \}\]/)
    expect(mutators).toMatch(/function removeParam[\s\S]*?syncActionParams\(a\.type, a\.params\)\.filter/)
  })

  it('点击动作项显式占满栅格宽度（不吃 nth-of-type 半宽规则）', () => {
    // 栅格里 .alignment-class-row / .style-rule-table 同为 div，nth-of-type 计数会把点击动作项挤成 span 12（≈286px），
    // 参数值输入被压窄；故该项用专属 class 显式声明整行宽。
    expect(source).toMatch(/<el-form-item\s+class="cellclick-item"/)
    expect(source).toMatch(/\.advanced-column-form[\s\S]*?:deep\([^)]*\.cellclick-item\)\s*\{[\s\S]*?grid-column:\s*span 24;/)
    // 专属规则必须排在 nth-of-type 半宽规则之后（同特异度，后者覆盖前者）
    const nth = source.indexOf('.el-form-item:nth-of-type(4)')
    const mine = source.indexOf(':deep(.el-form-item.cellclick-item)')
    expect(mine).toBeGreaterThan(nth)
  })
})
