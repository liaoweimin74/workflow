import { describe, it, expect } from 'vitest'
import { withArrayLabels } from '../arrayValueLabel'

describe('withArrayLabels — 数组组件提交时生成 <key>_text 显示文本', () => {
  it('select 多选：value → options label 逗号拼接', () => {
    const rules = [{
      type: 'select', field: 'dept', props: { multiple: true },
      options: [
        { label: '研发部', value: 'r' },
        { label: '市场部', value: 'm' },
      ],
    } as any]
    const out = withArrayLabels({ dept: ['r', 'm'] }, rules)
    expect(out.dept_text).toBe('研发部, 市场部')
  })

  it('select 单选：单元素数组 → 单个 label', () => {
    const rules = [{
      type: 'select', field: 'grade', props: { multiple: true },
      options: [{ label: 'A', value: 'a' }],
    } as any]
    const out = withArrayLabels({ grade: ['a'] }, rules)
    expect(out.grade_text).toBe('A')
  })

  it('checkbox：value → label', () => {
    const rules = [{
      type: 'checkbox', field: 'tags',
      options: [{ label: '标签1', value: 't1' }],
    } as any]
    const out = withArrayLabels({ tags: ['t1'] }, rules)
    expect(out.tags_text).toBe('标签1')
  })

  it('elTreeSelect 多选：props.data 树中叶子 label 逗号拼接', () => {
    const rules = [{
      type: 'elTreeSelect', field: 'org', props: {
        data: [
          { label: '总公司', value: '1', children: [{ label: '武汉分公司', value: '2' }] },
        ],
      },
    } as any]
    const out = withArrayLabels({ org: ['1', '2'] }, rules)
    expect(out.org_text).toBe('总公司, 武汉分公司')
  })

  it('elTransfer：props.data 叶子 label', () => {
    const rules = [{
      type: 'elTransfer', field: 'team', props: {
        data: [{ label: '前端组', value: 'fe' }, { label: '后端组', value: 'be' }],
      },
    } as any]
    const out = withArrayLabels({ team: ['fe', 'be'] }, rules)
    expect(out.team_text).toBe('前端组, 后端组')
  })

  it('cascader 单选：全路径 / 分隔', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: {
        options: [
          { label: '省级', value: 'p', children: [{ label: '市级', value: 'c', children: [{ label: '叶子区', value: 'leaf' }] }] },
        ],
      },
    } as any]
    const out = withArrayLabels({ region: ['leaf'] }, rules)
    expect(out.region_text).toBe('省级/市级/叶子区')
  })

  it('cascader 多选：多路径逗号拼接', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: {
        options: [
          { label: 'A', value: 'a', children: [{ label: 'X', value: 'x' }] },
          { label: 'B', value: 'b', children: [{ label: 'Y', value: 'y' }] },
        ],
      },
    } as any]
    const out = withArrayLabels({ region: ['x', 'y'] }, rules)
    expect(out.region_text).toBe('A/X, B/Y')
  })

  it('选项缺失：回退 value join', () => {
    const rules = [{
      type: 'select', field: 'dept', props: { multiple: true }, options: [],
    } as any]
    const out = withArrayLabels({ dept: ['a', 'b'] }, rules)
    expect(out.dept_text).toBe('a, b')
  })

  it('非数组组件不生成 _text', () => {
    const rules = [{
      type: 'input', field: 'name', props: {},
    } as any]
    const out = withArrayLabels({ name: '张三' }, rules)
    expect(out.name_text).toBeUndefined()
  })

  it('select 单选（multiple 未开启）也生成 _text（查询走文本列）', () => {
    const rules = [{
      type: 'select', field: 'grade', props: { multiple: false },
      options: [{ label: 'A', value: 'a' }],
    } as any]
    const out = withArrayLabels({ grade: 'a' }, rules)
    expect(out.grade_text).toBe('A')
  })

  it('递归子表单 props.rule 中的数组组件生成 _text', () => {
    const rules = [{
      type: 'group', field: 'g', props: {
        rule: [{
          type: 'multiSelect', field: 'inner', props: {},
          options: [{ label: '内', value: 'i' }],
        }],
      },
    } as any]
    const out = withArrayLabels({ inner: ['i'] }, rules)
    expect(out.inner_text).toBe('内')
  })

  it('已有 _text 不覆盖', () => {
    const rules = [{
      type: 'select', field: 'dept', props: { multiple: true },
      options: [{ label: '研发部', value: 'r' }],
    } as any]
    const out = withArrayLabels({ dept: ['r'], dept_text: '旧文本' }, rules)
    expect(out.dept_text).toBe('旧文本')
  })
})
