import { describe, expect, it, vi } from 'vitest'
import { appendGeneratedRules, buildFieldRule } from '../useDataSourceCrud'

describe('buildFieldRule（数据容器按字段生成组件）', () => {
  it('componentType 存在时优先作为 rule.type（数据引用 dataPicker）', () => {
    const rule = buildFieldRule({ key: 'user_id', label: '所属用户', columnType: 'VARCHAR', componentType: 'dataPicker' })
    expect(rule.type).toBe('dataPicker')
    expect(rule.field).toBe('user_id')
    expect(rule.title).toBe('所属用户')
  })

  it('xxxText 冗余展示列回退为 input', () => {
    const rule = buildFieldRule({ key: 'user_id_text', label: '所属用户', columnType: 'VARCHAR', componentType: 'dataPickerText' })
    expect(rule.type).toBe('input')
  })

  it('AutoNumber 等 componentType 直接透传', () => {
    expect(buildFieldRule({ key: 'sn', columnType: 'VARCHAR', componentType: 'AutoNumber' }).type).toBe('AutoNumber')
  })

  it('componentType 缺失时按 columnType 推断（INT→inputNumber，DATETIME→datePicker，其余→input）', () => {
    expect(buildFieldRule({ key: 'age', columnType: 'INT' }).type).toBe('inputNumber')
    expect(buildFieldRule({ key: 'created', columnType: 'DATETIME' }).type).toBe('datePicker')
    expect(buildFieldRule({ key: 'name', columnType: 'VARCHAR' }).type).toBe('input')
  })

  it('DECIMAL 携带 precision，required 生成校验规则', () => {
    const rule = buildFieldRule({ key: 'amount', label: '金额', columnType: 'DECIMAL', scale: 4, required: true })
    expect(rule.type).toBe('inputNumber')
    expect(rule.props.precision).toBe(4)
    expect(rule.validate[0].required).toBe(true)
    expect(rule.validate[0].message).toContain('金额')
  })

  it('componentProps（源表单 props JSON）合并进 props 并覆盖推断值', () => {
    const rule = buildFieldRule({
      key: 'user_id', label: '所属用户', columnType: 'VARCHAR', componentType: 'dataPicker',
      componentProps: JSON.stringify({ placeholder: '请选择用户', multiple: true, rule: [{ field: 'inner' }] }),
    })
    expect(rule.type).toBe('dataPicker')
    expect(rule.props.placeholder).toBe('请选择用户')
    expect(rule.props.multiple).toBe(true)
    // 内嵌子规则树不应进入组件 props
    expect(rule.props.rule).toBeUndefined()
  })

  it('componentProps 非法 JSON 时忽略，保留推断 props', () => {
    const rule = buildFieldRule({ key: 'amount', columnType: 'DECIMAL', scale: 2, componentProps: 'not-json' })
    expect(rule.props.precision).toBe(2)
  })

  it('子表单组件按 componentType 生成（group/subForm/tableForm → JSON 列元数据）', () => {
    expect(buildFieldRule({ key: 'items', columnType: 'JSON', componentType: 'subForm' }).type).toBe('subForm')
    expect(buildFieldRule({ key: 'members', columnType: 'JSON', componentType: 'userPicker' }).type).toBe('userPicker')
  })

  it('tableForm 子表列按 subColumns 自动生成 props.columns（hidden 冗余列跳过）', () => {
    const rule = buildFieldRule({
      key: 'order_items', label: '订单明细', columnType: '', componentType: 'tableForm', subMode: 'dedicated',
      subColumns: [
        { key: 'item_name', label: '项目名称', columnType: 'VARCHAR', componentType: 'input', required: true },
        { key: 'amount', label: '金额', columnType: 'DECIMAL', scale: 2, componentType: 'inputNumber' },
        { key: 'picker', label: '引用', columnType: 'TEXT', componentType: 'dataPicker' },
        { key: 'picker_text', label: '引用（显示）', columnType: 'TEXT', componentType: 'dataPickerText', hidden: true },
      ],
    })
    expect(rule.type).toBe('tableForm')
    expect(rule.field).toBe('order_items')
    const cols = rule.props.columns
    expect(cols).toHaveLength(3) // picker_text（hidden）不进子表
    expect(cols[0]).toMatchObject({ label: '项目名称', required: true })
    expect(cols[0].rule[0]).toMatchObject({ type: 'input', field: 'item_name' })
    expect(cols[1].rule[0]).toMatchObject({ type: 'inputNumber', field: 'amount', props: { precision: 2 } })
    expect(cols[2].rule[0].type).toBe('dataPicker')
  })

  it('group 子表列按 subColumns 自动生成 props.rule', () => {
    const rule = buildFieldRule({
      key: 'detail', label: '明细', componentType: 'group',
      subColumns: [{ key: 'name', label: '名称', columnType: 'VARCHAR', componentType: 'input' }],
    })
    expect(rule.type).toBe('group')
    expect(rule.props.rule).toHaveLength(1)
    expect(rule.props.rule[0]).toMatchObject({ type: 'input', field: 'name', title: '名称' })
  })

  it('无 subColumns 的子表列仅生成容器本身', () => {
    const rule = buildFieldRule({ key: 'empty_sub', componentType: 'tableForm' })
    expect(rule.type).toBe('tableForm')
    expect(rule.props.columns).toBeUndefined()
  })
})

describe('appendGeneratedRules（getRule→追加→setRule 重建）', () => {
  const makeDesigner = (rules: any[]) => ({
    getRule: vi.fn(() => rules),
    setRule: vi.fn(),
  })

  it('按 _fc_id 定位容器，追加进解析态 props.rule，并调用 setRule 重建画布', () => {
    const rules = [
      { type: 'formContainer', _fc_id: 'c1', props: { rule: [{ type: 'input', field: 'name' }] } },
    ]
    const designer = makeDesigner(rules)
    const { added, skipped } = appendGeneratedRules(designer as any, 'c1', [
      { key: 'name', label: '姓名', columnType: 'VARCHAR' },
      { key: 'age', label: '年龄', columnType: 'INT' },
    ])
    expect(added).toBe(1)
    expect(skipped).toBe(1)
    expect(designer.setRule).toHaveBeenCalledTimes(1)
    const children = rules[0].props.rule
    expect(children).toHaveLength(2)
    expect(children[1].field).toBe('age')
    expect(children[1].type).toBe('inputNumber')
  })

  it('已存在同名字段（含子表单 props.rule 内）不重复生成', () => {
    const rules = [
      { type: 'formContainer', _fc_id: 'c1', props: { rule: [
        { type: 'subForm', props: { rule: [{ type: 'input', field: 'name' }] } },
      ] } },
    ]
    const designer = makeDesigner(rules)
    const { added, skipped } = appendGeneratedRules(designer as any, 'c1', [
      { key: 'name', label: '姓名', columnType: 'VARCHAR' },
    ])
    expect(added).toBe(0)
    expect(skipped).toBe(1)
    expect(designer.setRule).not.toHaveBeenCalled()
  })

  it('容器 _fc_id 未命中时不做任何修改', () => {
    const rules = [{ type: 'formContainer', _fc_id: 'c1', props: { rule: [] } }]
    const designer = makeDesigner(rules)
    const { added, skipped } = appendGeneratedRules(designer as any, 'nope', [
      { key: 'age', label: '年龄', columnType: 'INT' },
    ])
    expect(added).toBe(0)
    expect(skipped).toBe(0)
    expect(designer.setRule).not.toHaveBeenCalled()
  })

  it('无勾选列时不触发 setRule', () => {
    const rules = [{ type: 'formContainer', _fc_id: 'c1', props: { rule: [] } }]
    const designer = makeDesigner(rules)
    appendGeneratedRules(designer as any, 'c1', [])
    expect(designer.setRule).not.toHaveBeenCalled()
  })
})
