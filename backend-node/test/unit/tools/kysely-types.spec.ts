import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDeclaredSchema, parseDbTables } from '../../../tools/lib/kysely-types'

/**
 * `types.ts` 解析器的单测。
 *
 * 这个解析器是「Node 声明的 schema」与「迁移产出的 schema」对账的入口，
 * 一旦它悄悄少解析几张表，集成测试里的对账就会静默放水 ——
 * 所以解析结果本身必须先被钉住。
 *
 * 用的是**真实文件**（不是手写片段）：解析器与文件是同一份契约的两端，
 * 用假片段测等于绕过真实格式（注释块、泛型、可选字段）。
 */
const TYPES_PATH = join(process.cwd(), 'src', 'framework', 'database', 'types.ts')
const SOURCE = readFileSync(TYPES_PATH, 'utf8')

describe('parseDbTables', () => {
  it('解析出 DB 接口里的全部表，且数量与已知规模一致', () => {
    const tables = parseDbTables(SOURCE)
    expect(tables.size).toBe(33)
    // 抽查三个形态不同的表名
    expect(tables.get('wfe_process_def')).toBe('WfeProcessDefTable')
    expect(tables.get('msg_channel_config')).toBe('MsgChannelConfigTable')
    expect(tables.get('sys_user')).toBe('SysUserTable')
  })

  it('接口体里的注释不会被当成表名', () => {
    const tables = parseDbTables(SOURCE)
    expect([...tables.keys()]).not.toContain('*')
    expect([...tables.keys()].every((t) => /^[a-z_][a-z0-9_]*$/.test(t))).toBe(true)
  })
})

describe('parseDeclaredSchema', () => {
  it('每张表都解析出非空列集合', () => {
    const declared = parseDeclaredSchema(SOURCE)
    expect(declared.length).toBe(33)
    for (const t of declared) {
      expect(t.columns.length, `${t.table} 解析出 0 个列`).toBeGreaterThan(0)
    }
  })

  // 这两处是「Hibernate 补出来的列」里最容易漏的 —— 曾经就是因为迁移没建它们，
  // Node 后端在只跑迁移的干净库上会缺列。钉住，防止解析器退化。
  it('Hibernate 补出来的列能被解析到', () => {
    const declared = parseDeclaredSchema(SOURCE)
    const byTable = new Map(declared.map((t) => [t.table, t.columns]))
    expect(byTable.get('msg_template')).toContain('enabled')
    expect(byTable.get('msg_template')).toContain('content_type')
    expect(byTable.get('wf_process_draft')).toContain('process_key')
    expect(byTable.get('msg_channel_config')).toEqual([
      'id',
      'channel',
      'config_key',
      'config_value',
      'is_encrypted',
      'created_at',
      'updated_at',
    ])
  })

  it('注释块里的 `xxx:` 形态文本不会被当成字段', () => {
    const declared = parseDeclaredSchema(SOURCE)
    const commentLike = declared.flatMap((t) =>
      t.columns.filter((c) => !/^[a-z_][a-z0-9_]*$/.test(c)),
    )
    expect(commentLike).toEqual([])
  })

  it('DB 引用未定义接口时抛错（不静默漏出对账范围）', () => {
    expect(() => parseDeclaredSchema('export interface DB {\n  t: MissingTable\n}')).toThrowError(
      /没有定义该接口/,
    )
  })
})
