import { describe, it, expect } from 'vitest'
import { withArrayLabels, injectFallbackOptions, normalizeEchoData, leafDisplayText } from '../arrayValueLabel'

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

  it('elTreeSelect 多选：props.data 树中全路径带前导 / 逗号连接', () => {
    const rules = [{
      type: 'elTreeSelect', field: 'org', props: {
        data: [
          { label: '总公司', value: '1', children: [{ label: '武汉分公司', value: '2' }] },
        ],
      },
    } as any]
    const out = withArrayLabels({ org: ['1', '2'] }, rules)
    expect(out.org_text).toBe('/总公司,/总公司/武汉分公司')
  })

  it('elTreeSelect 单选：全路径带前导 /', () => {
    const rules = [{
      type: 'elTreeSelect', field: 'org', props: {
        data: [
          { label: '总公司', value: '1', children: [{ label: '武汉分公司', value: '2' }] },
        ],
      },
    } as any]
    const out = withArrayLabels({ org: '2' }, rules)
    expect(out.org).toEqual(['2'])
    expect(out.org_text).toBe('/总公司/武汉分公司')
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

  it('elTransfer 静态选项（{label, key} 无 value）：_text 生成 label 而非值（与其他选项组件逻辑一致）', () => {
    const rules = [{
      type: 'elTransfer', field: 'team', props: {
        data: [{ label: '前端组', key: 'fe' }, { label: '后端组', key: 'be' }],
      },
    } as any]
    const out = withArrayLabels({ team: ['fe', 'be'] }, rules)
    expect(out.team).toEqual(['fe', 'be'])
    expect(out.team_text).toBe('前端组, 后端组')
  })

  it('cascader 单选（emitPath=false）：叶子 value → 全路径 / 分隔', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: {
        props: { emitPath: false },
        options: [
          { label: '省级', value: 'p', children: [{ label: '市级', value: 'c', children: [{ label: '叶子区', value: 'leaf' }] }] },
        ],
      },
    } as any]
    const out = withArrayLabels({ region: ['leaf'] }, rules)
    expect(out.region_text).toBe('/省级/市级/叶子区')
  })

  it('cascader 单选（emitPath=true）：路径数组 → 全路径带前导 /', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: {
        props: { emitPath: true },
        options: [
          { label: '省级', value: 'p', children: [{ label: '市级', value: 'c', children: [{ label: '叶子区', value: 'leaf' }] }] },
        ],
      },
    } as any]
    const out = withArrayLabels({ region: ['p', 'c', 'leaf'] }, rules)
    expect(out.region).toEqual(['leaf'])
    expect(out.region_text).toBe('/省级/市级/叶子区')
  })

  it('cascader 多选（emitPath=false）：多叶子逗号拼接', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: {
        props: { emitPath: false },
        options: [
          { label: 'A', value: 'a', children: [{ label: 'X', value: 'x' }] },
          { label: 'B', value: 'b', children: [{ label: 'Y', value: 'y' }] },
        ],
      },
    } as any]
    const out = withArrayLabels({ region: ['x', 'y'] }, rules)
    expect(out.region_text).toBe('/A/X,/B/Y')
  })

  it('cascader 多选（emitPath=true）：路径数组的数组 → 各路径前导 / 逗号连接', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: {
        props: { emitPath: true, multiple: true },
        options: [
          { label: 'A', value: 'a', children: [{ label: 'X', value: 'x' }] },
          { label: 'B', value: 'b', children: [{ label: 'Y', value: 'y' }] },
        ],
      },
    } as any]
    const out = withArrayLabels({ region: [['a', 'x'], ['b', 'y']] }, rules)
    expect(out.region).toEqual(['x', 'y'])
    expect(out.region_text).toBe('/A/X,/B/Y')
  })

  it('cascader 多选 emitPath=true：扁平叶子数组（getFormData 已转换后 BizDataListPage 双跑）不压缩', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: {
        props: { emitPath: true, multiple: true },
        options: [
          { label: 'A', value: 'a', children: [{ label: 'X', value: 'x' }] },
          { label: 'B', value: 'b', children: [{ label: 'Y', value: 'y' }] },
        ],
      },
    } as any]
    // 双跑场景：data 里主列已是叶子数组（getFormData 生成）→ 不得按单选路径压缩成单元素
    const out = withArrayLabels({ region: ['x', 'y'], region_text: '/A/X,/B/Y' }, rules)
    expect(out.region).toEqual(['x', 'y'])
    expect(out.region_text).toBe('/A/X,/B/Y')
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

  it('已有 _text 且新值可映射：覆盖为最新文本（编辑修改值后保持一致）', () => {
    const rules = [{
      type: 'select', field: 'dept', props: { multiple: true },
      options: [{ label: '研发部', value: 'r' }],
    } as any]
    const out = withArrayLabels({ dept: ['r'], dept_text: '旧文本' }, rules)
    expect(out.dept_text).toBe('研发部')
  })

  it('选项缺失（纯回退）时保留已有 _text', () => {
    const rules = [{
      type: 'select', field: 'dept', props: { multiple: true }, options: [],
    } as any]
    const out = withArrayLabels({ dept: ['r'], dept_text: '旧文本' }, rules)
    expect(out.dept_text).toBe('旧文本')
  })
})

describe('injectFallbackOptions — 回显时 options 无匹配用 _text 注入兜底 option', () => {
  it('select 单选：options 无匹配项时注入 {value, label:_text}', () => {
    const rules = [{
      type: 'select', field: 'grade', props: {},
      options: [{ label: 'B', value: 'b' }],
    } as any]
    injectFallbackOptions(rules, { grade: 'a', grade_text: 'A' })
    expect(rules[0].options).toContainEqual({ value: 'a', label: 'A' })
    expect(rules[0].options).toHaveLength(2)
  })

  it('select 单选：options 已有匹配项时不注入', () => {
    const rules = [{
      type: 'select', field: 'grade', props: {},
      options: [{ label: 'A', value: 'a' }],
    } as any]
    injectFallbackOptions(rules, { grade: 'a', grade_text: 'A' })
    expect(rules[0].options).toEqual([{ label: 'A', value: 'a' }])
  })

  it('类型不匹配（字符串 v-model vs 数字 option value）时注入兜底显示 label', () => {
    const rules = [{
      type: 'select', field: 'dept', props: {},
      options: [{ label: '张三', value: 7 }],
    } as any]
    injectFallbackOptions(rules, { dept: '7', dept_text: '张三' })
    // 严格类型比较：'7' !== 7 → 注入字符串 value 兜底项，组件能匹配显示 label
    expect(rules[0].options).toContainEqual({ value: '7', label: '张三' })
    expect(rules[0].options).toHaveLength(2)
  })

  it('elTreeSelect 单选：props.data 无匹配时不注入（避免污染树结构）', () => {
    const rules = [{
      type: 'elTreeSelect', field: 'org', props: { data: [] },
    } as any]
    injectFallbackOptions(rules, { org: 'x', org_text: '/研发部/前端组' })
    expect(rules[0].props.data).toHaveLength(0)
  })

  it('cascader 单选（emitPath=false）：不注入兜底（树形结构组件统一不注入）', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: { props: { emitPath: false }, options: [] },
    } as any]
    injectFallbackOptions(rules, { region: 'leaf', region_text: '/省/市/leaf' })
    expect(rules[0].props.options).toHaveLength(0)
  })

  it('cascader 单选（emitPath=true，值已解包为叶子单值）：不注入兜底', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: { props: { emitPath: true }, options: [] },
    } as any]
    injectFallbackOptions(rules, { region: 'leaf', region_text: '/省/市/leaf' })
    expect(rules[0].props.options).toHaveLength(0)
  })

  it('无 _text 时不注入', () => {
    const rules = [{
      type: 'select', field: 'grade', props: {}, options: [],
    } as any]
    injectFallbackOptions(rules, { grade: 'a' })
    expect(rules[0].options).toHaveLength(0)
  })

  it('多选：缺失的值逐一注入（label 用对应叶子）', () => {
    const rules = [{
      type: 'select', field: 'dept', props: { multiple: true },
      options: [{ label: '研发部', value: 'r' }],
    } as any]
    injectFallbackOptions(rules, { dept: ['r', 'm'], dept_text: '研发部, 市场部' })
    expect(rules[0].options).toContainEqual({ value: 'm', label: '市场部' })
    expect(rules[0].options).toHaveLength(2)
  })

  it('树形/级联不注入兜底（避免污染树结构导致选择节点错乱）', () => {
    const treeRules = [{
      type: 'elTreeSelect', field: 'org', props: { data: [] },
    } as any]
    injectFallbackOptions(treeRules, { org: 'x', org_text: '/研发部/前端组' })
    expect(treeRules[0].props.data).toHaveLength(0)

    const cascaderRules = [{
      type: 'cascader', field: 'region', props: { props: { emitPath: false }, options: [] },
    } as any]
    injectFallbackOptions(cascaderRules, { region: 'leaf', region_text: '/省/市/leaf' })
    expect(cascaderRules[0].props.options).toHaveLength(0)
  })

  it('递归 props.rule 子表单中的数组组件注入', () => {
    const rules = [{
      type: 'group', field: 'g', props: {
        rule: [{ type: 'select', field: 'inner', props: {}, options: [] }],
      },
    } as any]
    injectFallbackOptions(rules, { inner: 'i', inner_text: '内' })
    expect(rules[0].props.rule[0].options).toContainEqual({ value: 'i', label: '内' })
  })

  it('值缺失或 _text 为空时不注入', () => {
    const rules = [{
      type: 'select', field: 'grade', props: {}, options: [],
    } as any]
    injectFallbackOptions(rules, { grade: 'a', grade_text: '' })
    expect(rules[0].options).toHaveLength(0)
  })
})

describe('normalizeEchoData — 回显规范化（单选数组解包 + 注入叶子兜底）', () => {
  it('cascader 单选：数组解包为单值', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: { props: { emitPath: false }, options: [] },
    } as any]
    const data = { region: ['leaf'], region_text: '/省/市/leaf' }
    normalizeEchoData(rules, data)
    expect(data.region).toBe('leaf')
  })

  it('cascader 单选：存量路径数组取最后段（叶子）解包', () => {
    const rules = [{
      type: 'cascader', field: 'region', props: { props: { emitPath: true }, options: [] },
    } as any]
    const data = { region: ['p', 'c', 'leaf'], region_text: '/省/市/leaf' }
    normalizeEchoData(rules, data)
    expect(data.region).toBe('leaf')
  })

  it('elTreeSelect 单选：数组解包，不注入兜底、不加 fullPath、不改 label 字段', () => {
    const rules = [{
      type: 'elTreeSelect', field: 'org', props: {
        data: [
          { label: '总公司', value: '1', children: [{ label: '武汉分公司', value: '2' }] },
        ],
      },
    } as any]
    const data = { org: ['2'], org_text: '/总公司/武汉分公司' }
    normalizeEchoData(rules, data)
    expect(data.org).toBe('2')
    // 不污染树结构（不注入兜底节点）
    expect(rules[0].props.data).toHaveLength(1)
    expect(rules[0].props.data[0].children).toHaveLength(1)
    // 不加 fullPath 注解、不改显示 label 字段（下拉保持节点名称）
    expect(rules[0].props.data[0].fullPath).toBeUndefined()
    expect(rules[0].props.data[0].children[0].fullPath).toBeUndefined()
    expect(rules[0].props.props).toBeUndefined()
  })

  it('elTreeSelect 单选：数字 nodeKey 与字符串 v-model 类型归一化（input 正常回显）', () => {
    const rules = [{
      type: 'elTreeSelect', field: 'org', props: {
        data: [
          { label: '总公司', value: 1, children: [{ label: '武汉分公司', value: 7 }] },
        ],
      },
    } as any]
    const data = { org: '7', org_text: '/总公司/武汉分公司' }
    normalizeEchoData(rules, data)
    // v-model 归一化为树节点真实 value（数字 7）→ el-tree-select 按 nodeKey 匹配成功显示节点名称
    expect(data.org).toBe(7)
  })

  it('elTreeSelect 单选 + showCheckbox（UI 勾选非多选）：仍按单选归一化', () => {
    const rules = [{
      type: 'elTreeSelect', field: 'org', props: {
        showCheckbox: true,
        data: [{ label: '武汉分公司', value: 7 }],
      },
    } as any]
    const data = { org: '7', org_text: '/总公司/武汉分公司' }
    normalizeEchoData(rules, data)
    // showCheckbox 只是 UI 勾选，值形态仍单选 → 类型归一化生效
    expect(data.org).toBe(7)
  })

  it('多选：不解包（不注入兜底）', () => {
    const rules = [{
      type: 'elTreeSelect', field: 'org', props: { multiple: true, data: [] },
    } as any]
    const data = { org: ['2', '3'], org_text: '/总公司/武汉分公司,/总公司/北京分公司' }
    normalizeEchoData(rules, data)
    expect(data.org).toEqual(['2', '3'])
    expect(rules[0].props.data).toHaveLength(0)
  })

  it('树形多选：数组元素类型归一化', () => {
    const rules = [{
      type: 'elTreeSelect', field: 'org', props: {
        multiple: true,
        data: [{ label: '武汉分公司', value: 7 }, { label: '北京分公司', value: 8 }],
      },
    } as any]
    const data = { org: ['7', '8'], org_text: '/总公司/武汉分公司,/总公司/北京分公司' }
    normalizeEchoData(rules, data)
    expect(data.org).toEqual([7, 8])
  })

  it('options 已有匹配时数据不变（无注入无重复）', () => {
    const rules = [{
      type: 'elTreeSelect', field: 'org', props: {
        data: [{ label: '武汉分公司', value: '2' }],
      },
    } as any]
    const data = { org: '2', org_text: '/总公司/武汉分公司' }
    normalizeEchoData(rules, data)
    expect(rules[0].props.data).toEqual([{ label: '武汉分公司', value: '2' }])
  })

  it('多选 options 缺失（纯回退）保留已有 _text（修分隔符误判覆盖 bug）', () => {
    const rules = [{
      type: 'select', field: 'dept', props: { multiple: true }, options: [],
    } as any]
    // FormRenderer 已生成正确 _text；BizDataListPage 双跑时 schemaRules options 为空
    const out = withArrayLabels({ dept: ['r', 'm'], dept_text: '研发部, 市场部' }, rules)
    expect(out.dept_text).toBe('研发部, 市场部')
  })
})

describe('leafDisplayText — 表格列显示取叶子 label', () => {
  it('树形/级联全路径取最后一段叶子', () => {
    expect(leafDisplayText('/总公司/武汉分公司')).toBe('武汉分公司')
  })

  it('多选路径逗号连接各叶子', () => {
    expect(leafDisplayText('/总公司/武汉分公司,/总公司/北京分公司')).toBe('武汉分公司, 北京分公司')
  })

  it('select/checkbox 叶子 label 原样（无 /）', () => {
    expect(leafDisplayText('研发部, 市场部')).toBe('研发部, 市场部')
  })

  it('空/null 返回空串', () => {
    expect(leafDisplayText('')).toBe('')
    expect(leafDisplayText(null)).toBe('')
    expect(leafDisplayText(undefined)).toBe('')
  })
})
