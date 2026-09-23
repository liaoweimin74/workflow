import { describe, expect, it } from 'vitest'
import {
  buildAlterStatements,
  buildAlterSubTable,
  buildCreateSubTable,
  buildCreateTable,
  isAllowedColumnType,
  isCrossTypeChange,
  subTableName,
  tableName,
  validateFormKey,
  validateSubField,
  type ColumnInfo,
} from '../../../../src/engine/form/column/ddl-builder'
import { newColumnConfig, type ColumnConfig } from '../../../../src/common/domain/column-config'

/**
 * 受控 DDL 生成器的单测。
 *
 * 这些期望串是**从 Java `DdlBuilder` 的拼接代码逐字推导**的（哪个逗号在第几行、
 * 键行的顺序如何），因为物理表结构就是契约的一部分：
 * 结构与 Java 建出来的表不同，业务数据读写就会出现"某些列不存在"这类难查的问题。
 *
 * 另一半验证是**经验的**：`test/integration` 里会把这里生成的 DDL 真的执行到测试库，
 * 再与 Java oracle 建出的同名表做结构比对 —— 见 `ddl-structure.spec.ts`。
 */

/** 简写：造一个列定义（只写关心到的字段，其余走 newColumnConfig 的默认值）。 */
function col(overrides: Partial<ColumnConfig> & { key: string }): ColumnConfig {
  return { ...newColumnConfig(), ...overrides }
}

const P = col({ key: 'code', columnType: 'VARCHAR', length: 255, required: true, unique: true })
const N = col({ key: 'name', columnType: 'VARCHAR', length: 255, required: true })

describe('buildCreateTable', () => {
  it('列顺序与键顺序逐字对齐 Java', () => {
    expect(buildCreateTable('person', [P, N])).toBe(
      'CREATE TABLE IF NOT EXISTS wf_biz_person (\n' +
        '    id VARCHAR(64) NOT NULL,\n' +
        '    tenant_id VARCHAR(64) NOT NULL,\n' +
        '    code VARCHAR(255) NOT NULL,\n' +
        '    name VARCHAR(255) NOT NULL,\n' +
        '    version INT NOT NULL DEFAULT 1,\n' +
        '    created_by VARCHAR(50),\n' +
        '    created_at DATETIME,\n' +
        '    updated_at DATETIME,\n' +
        '    PRIMARY KEY (id),\n' +
        '    UNIQUE KEY uk_person_code (tenant_id, code)\n' +
        ')',
    )
  })

  it('indexed 生成 INDEX；unique 与 indexed 同时为真则两条都出（unique 在前）', () => {
    const sql = buildCreateTable('t', [
      col({ key: 'a', columnType: 'INT', unique: true, indexed: true }),
    ])
    expect(sql).toContain('    UNIQUE KEY uk_t_a (tenant_id, a),\n    INDEX idx_t_a (a)\n)')
  })

  it('子表占位字段（subColumns 非空）不进主表列', () => {
    const sql = buildCreateTable('t', [
      col({ key: 'items', columnType: null, subColumns: [col({ key: 'sku', columnType: 'VARCHAR', length: 64 })] }),
      col({ key: 'title', columnType: 'VARCHAR', length: 64 }),
    ])
    expect(sql).not.toContain('items')
    expect(sql).toContain('    title VARCHAR(64),')
  })

  it('各列类型的 SQL 片段（含 VARCHAR 默认 255、DECIMAL 默认 18,0、TINYINT 固定 (1)）', () => {
    const sql = buildCreateTable('t', [
      col({ key: 'a', columnType: 'VARCHAR' }),
      col({ key: 'b', columnType: 'DECIMAL' }),
      col({ key: 'c', columnType: 'TINYINT', length: 1 }),
      col({ key: 'd', columnType: 'TEXT' }),
      col({ key: 'e', columnType: 'LONGTEXT' }),
      col({ key: 'f', columnType: 'JSON' }),
      col({ key: 'g', columnType: 'DATE' }),
      col({ key: 'h', columnType: 'DATETIME' }),
      col({ key: 'i', columnType: 'INT' }),
    ])
    for (const fragment of [
      'a VARCHAR(255)',
      'b DECIMAL(18,0)',
      'c TINYINT(1)',
      'd TEXT',
      'e LONGTEXT',
      'f JSON',
      'g DATE',
      'h DATETIME',
      'i INT',
    ]) {
      expect(sql, `缺少 ${fragment}`).toContain(`    ${fragment},`)
    }
  })

  it('required=false 时不加 NOT NULL', () => {
    const sql = buildCreateTable('t', [col({ key: 'a', columnType: 'VARCHAR', length: 10 })])
    expect(sql).toContain('    a VARCHAR(10),')
    expect(sql).not.toContain('a VARCHAR(10) NOT NULL')
  })
})

describe('buildCreateSubTable', () => {
  it('子表固定列、复合索引与列顺序逐字对齐 Java', () => {
    expect(
      buildCreateSubTable('leave', 'items', [col({ key: 'sku', columnType: 'VARCHAR', length: 64 })]),
    ).toBe(
      'CREATE TABLE IF NOT EXISTS wf_biz_leave_items (\n' +
        '    id VARCHAR(64) NOT NULL,\n' +
        '    biz_id VARCHAR(64) NOT NULL,\n' +
        '    tenant_id VARCHAR(64) NOT NULL,\n' +
        '    sku VARCHAR(64),\n' +
        '    sort_no INT NOT NULL DEFAULT 0,\n' +
        '    version INT NOT NULL DEFAULT 1,\n' +
        '    created_by VARCHAR(50),\n' +
        '    created_at DATETIME,\n' +
        '    updated_at DATETIME,\n' +
        '    PRIMARY KEY (id),\n' +
        '    KEY idx_leave_items_biz (tenant_id, biz_id)\n' +
        ')',
    )
  })

  it('子表唯一键是 (tenant_id, biz_id, key) 三列', () => {
    const sql = buildCreateSubTable('t', 'sub', [
      col({ key: 'sku', columnType: 'VARCHAR', length: 64, unique: true }),
    ])
    expect(sql).toContain('UNIQUE KEY uk_t_sub_sku (tenant_id, biz_id, sku)')
  })

  it('子表列名撞固定列（biz_id / sort_no）→ 抛错', () => {
    for (const key of ['biz_id', 'sort_no']) {
      expect(() =>
        buildCreateSubTable('t', 'sub', [col({ key, columnType: 'VARCHAR', length: 10 })]),
      ).toThrow(new RegExp(`子表列名 ${key} 为系统保留列`))
    }
  })
})

describe('标识符白名单', () => {
  it('表单 key / 子表字段名：必须字母开头、仅字母数字下划线、最长 64', () => {
    expect(() => validateFormKey('person')).not.toThrow()
    expect(() => validateFormKey('a1_B2')).not.toThrow()
    expect(() => validateFormKey('A'.repeat(64))).not.toThrow()
    for (const bad of ['1person', '_person', 'person-key', 'person key', 'A'.repeat(65), '']) {
      expect(() => validateFormKey(bad), `应当拒绝 ${JSON.stringify(bad)}`).toThrow(
        '非法表单 key',
      )
    }
    expect(() => validateSubField('items')).not.toThrow()
    expect(() => validateSubField('1items')).toThrow('非法子表字段名')
  })

  it('保留列名不允许作为业务列（主表六个 / 子表八个）', () => {
    for (const key of ['id', 'tenant_id', 'version', 'created_by', 'created_at', 'updated_at']) {
      expect(() =>
        buildCreateTable('t', [col({ key, columnType: 'VARCHAR', length: 10 })]),
      ).toThrow(new RegExp(`列名 ${key} 为系统保留列`))
    }
  })

  // ⚠️ 错误必须是 IllegalArgumentException 形态：Java 抛它就是 HTTP 400 + body code 400，
  //    普通 Error 会变成 HTTP 500。契约场景的非法列配置分支依赖这个类型。
  it('错误一律是 IllegalArgumentException 形态（→ HTTP 400）', () => {
    try {
      validateFormKey('1bad')
      expect.unreachable('应当抛错')
    } catch (error) {
      expect((error as Error).name).toBe('IllegalArgumentException')
    }
  })
})

describe('列类型白名单与跨类判定', () => {
  it('白名单', () => {
    for (const t of ['VARCHAR', 'TEXT', 'INT', 'DECIMAL', 'DATE', 'DATETIME', 'TINYINT', 'JSON', 'LONGTEXT']) {
      expect(isAllowedColumnType(t), t).toBe(true)
    }
    for (const t of ['BLOB', 'varchar', '', null]) {
      expect(isAllowedColumnType(t), String(t)).toBe(false)
    }
  })

  // ⚠️ TINYINT 与 JSON 归到「字符串」大类，INT 单独一类 —— 这是照抄 Java 的怪癖
  it('同大类允许、跨大类禁止（含 Java 的怪癖归类）', () => {
    expect(isCrossTypeChange('VARCHAR', 'TEXT')).toBe(false)
    expect(isCrossTypeChange('DATE', 'DATETIME')).toBe(false)
    expect(isCrossTypeChange('VARCHAR', 'TINYINT')).toBe(false) // 都在 STRING 大类
    expect(isCrossTypeChange('JSON', 'VARCHAR')).toBe(false)
    expect(isCrossTypeChange('INT', 'VARCHAR')).toBe(true)
    expect(isCrossTypeChange('DECIMAL', 'INT')).toBe(true)
    expect(isCrossTypeChange('DECIMAL', 'VARCHAR')).toBe(true)
  })

  it('VARCHAR / DECIMAL 的长度边界', () => {
    expect(() => buildCreateTable('t', [col({ key: 'a', columnType: 'VARCHAR', length: 0 })])).toThrow(
      'VARCHAR 长度必须在 1~255 之间',
    )
    expect(() =>
      buildCreateTable('t', [col({ key: 'a', columnType: 'VARCHAR', length: 256 })]),
    ).toThrow('VARCHAR 长度必须在 1~255 之间')
    expect(() =>
      buildCreateTable('t', [col({ key: 'a', columnType: 'DECIMAL', length: 31, scale: 0 })]),
    ).toThrow('DECIMAL 长度/精度非法')
    expect(() =>
      buildCreateTable('t', [col({ key: 'a', columnType: 'DECIMAL', length: 10, scale: 11 })]),
    ).toThrow('DECIMAL 长度/精度非法')
    expect(() =>
      buildCreateTable('t', [col({ key: 'a', columnType: 'DECIMAL', length: 30, scale: 30 })]),
    ).not.toThrow()
  })
})

describe('buildAlterStatements（主表差异变更）', () => {
  const existing = (overrides: Partial<ColumnInfo> & { key: string }): ColumnInfo => ({
    columnType: 'VARCHAR',
    length: 255,
    scale: null,
    nullable: false,
    unique: false,
    ...overrides,
  })

  it('新列 → ADD COLUMN（带 unique/index 时追加对应索引）', () => {
    expect(
      buildAlterStatements('t', [
        col({ key: 'a', columnType: 'VARCHAR', length: 64, required: true, unique: true, indexed: true }),
      ], []),
    ).toEqual([
      'ALTER TABLE wf_biz_t ADD COLUMN a VARCHAR(64) NOT NULL',
      'ALTER TABLE wf_biz_t ADD UNIQUE INDEX uk_t_a (tenant_id, a)',
      'ALTER TABLE wf_biz_t ADD INDEX idx_t_a (a)',
    ])
  })

  it('结构相同 → 无语句（幂等）', () => {
    expect(
      buildAlterStatements('t', [col({ key: 'a', columnType: 'VARCHAR', length: 255, required: true })], [
        existing({ key: 'a' }),
      ]),
    ).toEqual([])
  })

  it('长度变化 → MODIFY COLUMN', () => {
    expect(
      buildAlterStatements('t', [col({ key: 'a', columnType: 'VARCHAR', length: 128, required: true })], [
        existing({ key: 'a', length: 64 }),
      ]),
    ).toEqual(['ALTER TABLE wf_biz_t MODIFY COLUMN a VARCHAR(128) NOT NULL'])
  })

  it('可空性变化 → MODIFY COLUMN', () => {
    expect(
      buildAlterStatements('t', [col({ key: 'a', columnType: 'VARCHAR', length: 255, required: false })], [
        existing({ key: 'a', nullable: false }),
      ]),
    ).toEqual(['ALTER TABLE wf_biz_t MODIFY COLUMN a VARCHAR(255)'])
  })

  it('已存在列新增 unique → 追加 UNIQUE INDEX（且不重复加）', () => {
    expect(
      buildAlterStatements('t', [col({ key: 'a', columnType: 'VARCHAR', length: 255, required: true, unique: true })], [
        existing({ key: 'a', unique: false }),
      ]),
    ).toEqual(['ALTER TABLE wf_biz_t ADD UNIQUE INDEX uk_t_a (tenant_id, a)'])
    expect(
      buildAlterStatements('t', [col({ key: 'a', columnType: 'VARCHAR', length: 255, required: true, unique: true })], [
        existing({ key: 'a', unique: true }),
      ]),
    ).toEqual([])
  })

  // ⚠️ 两条"防丢数据"的硬规则
  it('缩短长度 → 抛错（防截断）', () => {
    expect(() =>
      buildAlterStatements('t', [col({ key: 'a', columnType: 'VARCHAR', length: 32, required: true })], [
        existing({ key: 'a', length: 64 }),
      ]),
    ).toThrow('列 a 不允许缩短长度/精度（防数据截断）')
  })

  it('类型跨大类 → 抛错', () => {
    expect(() =>
      buildAlterStatements('t', [col({ key: 'a', columnType: 'INT' })], [
        existing({ key: 'a', columnType: 'VARCHAR' }),
      ]),
    ).toThrow('列 a 类型跨类变更不被支持: VARCHAR -> INT')
  })

  // ⚠️ desired 里没有的现有列必须被**忽略**，绝不能生成 DROP COLUMN
  it('现有列不在 desired 里 → 什么都不做（禁止删列）', () => {
    const statements = buildAlterStatements('t', [], [existing({ key: 'legacy' })])
    expect(statements).toEqual([])
    expect(statements.join(';')).not.toContain('DROP')
  })

  it('子表占位字段不参与主表变更', () => {
    expect(
      buildAlterStatements('t', [
        col({ key: 'items', columnType: null, subColumns: [col({ key: 'sku', columnType: 'VARCHAR', length: 10 })] }),
      ], []),
    ).toEqual([])
  })
})

describe('buildAlterSubTable', () => {
  it('加列 / 改列宽；规则同主表但**不加索引**', () => {
    const statements = buildAlterSubTable(
      't',
      'sub',
      [
        col({ key: 'a', columnType: 'VARCHAR', length: 32, required: true, unique: true, indexed: true }),
        col({ key: 'b', columnType: 'VARCHAR', length: 128, required: true }),
      ],
      [{ key: 'b', columnType: 'VARCHAR', length: 64, scale: null, nullable: false, unique: false }],
    )
    expect(statements).toEqual([
      'ALTER TABLE wf_biz_t_sub ADD COLUMN a VARCHAR(32) NOT NULL',
      'ALTER TABLE wf_biz_t_sub MODIFY COLUMN b VARCHAR(128) NOT NULL',
    ])
  })

  it('跨大类 / 缩短 → 抛错（消息带"子表列"前缀）', () => {
    expect(() =>
      buildAlterSubTable('t', 'sub', [col({ key: 'a', columnType: 'INT' })], [
        { key: 'a', columnType: 'VARCHAR', length: 10, scale: null, nullable: false, unique: false },
      ]),
    ).toThrow('子表列 a 类型跨类变更不被支持')
    expect(() =>
      buildAlterSubTable('t', 'sub', [col({ key: 'a', columnType: 'VARCHAR', length: 8, required: true })], [
        { key: 'a', columnType: 'VARCHAR', length: 16, scale: null, nullable: false, unique: false },
      ]),
    ).toThrow('子表列 a 不允许缩短长度/精度')
  })
})

describe('表名', () => {
  it('主表 / 子表命名', () => {
    expect(tableName('person')).toBe('wf_biz_person')
    expect(subTableName('leave', 'items')).toBe('wf_biz_leave_items')
  })
})
