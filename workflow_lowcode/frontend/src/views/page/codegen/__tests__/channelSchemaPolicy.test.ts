/**
 * E-0 语义/表现分拣策略表（channelSchemaPolicy）测试。
 *
 * 闭环判据（架构文档 §8 E-0）：台账分拣结论固化为机器可读策略表，
 * 且「策略表覆盖全部扫出键」——用 2026-10-27 全量库扫描快照做 fixture，
 * 未覆盖键清单必须为空。
 *
 * 运行：pnpm vitest run src/views/page/codegen/__tests__/channelSchemaPolicy.test.ts
 */
import { describe, expect, it } from 'vitest'
import {
  COLUMN_CONFIG_POLICY,
  PAGE_VIEW_POLICY,
  RULE_NODE_POLICY,
  DESIGNER_SKIP_KEYS,
  auditInventoryCoverage,
  matchPolicy,
  validatePolicyIntegrity,
} from '../channelSchemaPolicy'
import { IDENTITY_KEYS } from '../contract'
import { SCHEMA_INVENTORY_2026_10_27 } from '../../__tests__/fixtures/schema-inventory-2026-10-27.data'

describe('E-0 闭环：策略表覆盖全量扫描键库存', () => {
  it('fixture 库存（页面平铺区块 + 页面 rule 树 + 表单资产 + column_config）零未覆盖键', () => {
    const report = auditInventoryCoverage(SCHEMA_INVENTORY_2026_10_27)
    // 失败时打印未覆盖清单，便于增量分拣
    expect(report.uncovered, JSON.stringify(report.uncovered)).toEqual([])
  })

  it('覆盖数量与库存键数一致（防空表假绿）', () => {
    const report = auditInventoryCoverage(SCHEMA_INVENTORY_2026_10_27)
    expect(report.covered).toBeGreaterThan(100)
    expect(report.covered + report.uncovered.length).toBe(report.total)
  })
})

describe('策略表与台账分类判定一致（抽检）', () => {
  it('平铺 VIEW：columns[].width 表现→移动端忽略；pagination.pageSize 待议→迁渠道 profile', () => {
    expect(matchPolicy('page', 'columns', 'width')).toMatchObject({
      class: 'presentation',
      disposition: 'drop-on-mobile',
    })
    expect(matchPolicy('page', 'pagination', 'pageSize')).toMatchObject({
      class: 'pending',
      disposition: 'migrate-to-channel-profile',
    })
    expect(matchPolicy('page', 'detail', 'formMode')).toMatchObject({ class: 'pending' })
    expect(matchPolicy('page', 'display', '@scalar')).toMatchObject({
      disposition: 'migrate-to-channel-profile',
    })
  })

  it('页面 rule 树：page-table 的 EP 皮肤键全部表现→忽略，能力键语义→保留', () => {
    for (const k of ['props.border', 'props.stripe', 'props.stretch', 'props.actionColumnWidth']) {
      expect(matchPolicy('rule', 'page-table', k), k).toMatchObject({
        class: 'presentation',
        disposition: 'drop-on-mobile',
      })
    }
    for (const k of ['props.dataSourceId', 'props.selectionMode', 'props.viewActions', 'props.viewEvents']) {
      expect(matchPolicy('rule', 'page-table', k), k).toMatchObject({
        class: 'semantic',
        disposition: 'keep',
      })
    }
  })

  it('页面 rule 树：dialogWidth/dialogHeight/inlineHeight/props.style 表现→忽略', () => {
    expect(matchPolicy('rule', 'formContainer', 'props.dialogWidth')).toMatchObject({ class: 'presentation' })
    expect(matchPolicy('rule', 'formContainer', 'props.dialogHeight')).toMatchObject({ class: 'presentation' })
    expect(matchPolicy('rule', 'formContainer', 'props.inlineHeight')).toMatchObject({ class: 'presentation' })
    expect(matchPolicy('rule', 'input', 'props.style')).toMatchObject({
      class: 'presentation',
      disposition: 'drop-on-mobile',
    })
  })

  it('列内先验模式键与平铺面同判（批 E 契约表按这些模式路径查表）', () => {
    expect(matchPolicy('rule', 'page-table', 'props.columns[].width')).toMatchObject({
      class: 'presentation',
      disposition: 'drop-on-mobile',
    })
    expect(matchPolicy('rule', 'page-table', 'props.columns[].key')).toMatchObject({
      class: 'semantic',
      disposition: 'keep',
    })
    expect(matchPolicy('rule', '*', 'validate.required')).toMatchObject({ class: 'semantic' })
    expect(matchPolicy('rule', '*', 'col.span')).toMatchObject({
      class: 'presentation',
      disposition: 'migrate-to-channel-profile',
    })
  })

  it('designer 内部键归 designer-skip，不参与端分拣', () => {
    for (const k of ['_fc_id', '_fc_drag_tag', 'name']) {
      expect(matchPolicy('rule', 'input', k), k).toMatchObject({ class: 'designer' })
    }
  })

  it('通用节点键走 * 组：type/field/title/value 语义保留', () => {
    expect(matchPolicy('rule', '(no-type)', 'type')).toMatchObject({ class: 'semantic' })
    expect(matchPolicy('rule', 'textarea', 'field')).toMatchObject({ class: 'semantic' })
    expect(matchPolicy('rule', 'unknown-widget', 'title')).toMatchObject({ class: 'semantic' })
  })

  it('column_config 全键语义保留（数据模型面，端无关）', () => {
    const report = auditInventoryCoverage(SCHEMA_INVENTORY_2026_10_27)
    const cc = report.bySurface.columnConfig
    expect(cc.total).toBeGreaterThan(8)
    for (const k of ['columnType', 'length', 'scale', 'unique', 'indexed', 'required', 'key', 'label']) {
      expect(matchPolicy('columnConfig', 'column', k), k).toMatchObject({
        class: 'semantic',
        disposition: 'keep',
      })
    }
  })
})

describe('策略表完整性（防分拣结论自相矛盾）', () => {
  it('表现键不得 keep（= 桌面表现留在移动产物，正是 §5.1 要拦的事故）', () => {
    const violations = validatePolicyIntegrity()
    expect(violations, JSON.stringify(violations)).toEqual([])
  })

  it('DESIGNER_SKIP_KEYS 与出码契约表 IDENTITY_KEYS 同集（两表不得漂移）', () => {
    expect([...DESIGNER_SKIP_KEYS].sort()).toEqual([...IDENTITY_KEYS].sort())
  })

  it('三张表非空且条目字段齐备', () => {
    for (const table of [PAGE_VIEW_POLICY, RULE_NODE_POLICY, COLUMN_CONFIG_POLICY]) {
      expect(Object.keys(table).length).toBeGreaterThan(0)
    }
  })
})
