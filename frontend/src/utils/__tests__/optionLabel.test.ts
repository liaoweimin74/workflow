import { describe, expect, it } from 'vitest'
import { extractOptionMap, mapOptionLabel } from '../optionLabel'

/**
 * 选项类字段 value→label 映射（列表显示「是/否」而非 yes/no 的通用修复）。
 * 覆盖 radio（rule.options）/ select（rule.props.options）/ 树（rule.props.data）
 * 三类选项载体与单值/数组/JSON 数组文本三种值形态。
 */
describe('extractOptionMap', () => {
  it('radio：rule.options → value→label 映射', () => {
    const map = extractOptionMap({
      type: 'radio',
      field: 'is_approved',
      options: [
        { label: '是', value: 'yes' },
        { label: '否', value: 'no' },
      ],
    })
    expect(map.get('yes')).toBe('是')
    expect(map.get('no')).toBe('否')
    expect(map.size).toBe(2)
  })

  it('select：rule.props.options 同样提取', () => {
    const map = extractOptionMap({
      type: 'select',
      props: {
        options: [
          { label: '年假', value: 'annual' },
          { label: '病假', value: 'sick' },
        ],
      },
    })
    expect(map.get('annual')).toBe('年假')
    expect(map.get('sick')).toBe('病假')
  })

  it('树形选项：rule.props.data 递归 children', () => {
    const map = extractOptionMap({
      type: 'tree',
      props: {
        data: [
          { label: '华东', value: 'east', children: [{ label: '上海', value: 'sh' }] },
        ],
      },
    })
    expect(map.get('east')).toBe('华东')
    expect(map.get('sh')).toBe('上海')
  })

  it('无选项定义 → 空 Map（列按原值显示）', () => {
    expect(extractOptionMap({ type: 'input' }).size).toBe(0)
    expect(extractOptionMap(null).size).toBe(0)
  })
})

describe('mapOptionLabel', () => {
  const map = new Map([
    ['yes', '是'],
    ['no', '否'],
    ['annual', '年假'],
  ])

  it('单值命中 → label（用户报错场景：yes → 是）', () => {
    expect(mapOptionLabel(map, 'yes')).toBe('是')
    expect(mapOptionLabel(map, 'no')).toBe('否')
  })

  it('单值未命中 → 原值字符串（兼容旧数据/自定义 value）', () => {
    expect(mapOptionLabel(map, 'unknown')).toBe('unknown')
  })

  it('数组 → 逐项映射逗号拼接（checkbox 多选）', () => {
    expect(mapOptionLabel(map, ['yes', 'no'])).toBe('是, 否')
  })

  it('JSON 数组文本 → 解析后逐项映射', () => {
    expect(mapOptionLabel(map, '["annual","no"]')).toBe('年假, 否')
  })

  it('空值 → 空字符串（占位由调用方处理）', () => {
    expect(mapOptionLabel(map, null)).toBe('')
    expect(mapOptionLabel(map, undefined)).toBe('')
    expect(mapOptionLabel(map, '')).toBe('')
    expect(mapOptionLabel(map, '  ')).toBe('')
  })

  it('非 JSON 括号文本原样', () => {
    expect(mapOptionLabel(map, '[not json]')).toBe('[not json]')
  })
})
