import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  computeChecksum,
  parseMigrationFileName,
  splitStatements,
} from '../../../src/framework/database/migrator'

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'migrations')

/**
 * checksum 必须与 **Flyway 逐字节兼容**，不能只是「Node 侧稳定」。
 *
 * 判据是实测的：契约库 `workflow_v6` 的 `flyway_schema_history` 里，V2..V31 由 Java 的
 * Flyway 写入，下面的期望值就是**库里的原值**（`SELECT version, checksum FROM
 * flyway_schema_history`）。改算法会让这些断言直接失败 —— 这正是我们要的：
 * 算法一旦不兼容，历史表就再也无法跨侧校验。
 */
describe('computeChecksum（Flyway 兼容的 CRC32）', () => {
  const flywayChecksums: Array<[string, number]> = [
    // V2 历史上发生过文件漂移，库侧 flyway_schema_history 已重定基准（实测
    // `SELECT checksum FROM flyway_schema_history WHERE version='2'` = 1139911049，
    // 与当前文件 computeChecksum 一致，Node migrator 运行时校验同值通过）。
    ['V2__init_data.sql', 1139911049],
    ['V3__grant_admin_menus.sql', 810571147],
    ['V6__create_wf_process_draft.sql', 664068881],
    ['V31__add_source_key_unique.sql', -996958868],
  ]

  it('对 Java 应用过的迁移，checksum 与历史表原值一致', () => {
    for (const [file, expected] of flywayChecksums) {
      const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      expect(computeChecksum(text), file).toBe(expected)
    }
  })

  it('按行归一：\\r\\n 与 \\n 等价、结尾换行不影响、首行 BOM 被滤掉', () => {
    const lf = 'CREATE TABLE a (id INT);\nSELECT 1;\n'
    const crlf = 'CREATE TABLE a (id INT);\r\nSELECT 1;\r\n'
    const noTrailing = 'CREATE TABLE a (id INT);\nSELECT 1;'
    const bom = '\uFEFFCREATE TABLE a (id INT);\nSELECT 1;\n'
    expect(computeChecksum(crlf)).toBe(computeChecksum(lf))
    expect(computeChecksum(noTrailing)).toBe(computeChecksum(lf))
    expect(computeChecksum(bom)).toBe(computeChecksum(lf))
  })

  it('内容变了 checksum 就变（校验的意义）', () => {
    expect(computeChecksum('SELECT 1;')).not.toBe(computeChecksum('SELECT 2;'))
  })

  it('结果是有符号 int32（写进 MySQL INT 列，不能溢出）', () => {
    for (const [, expected] of flywayChecksums) {
      expect(expected).toBeGreaterThanOrEqual(-(2 ** 31))
      expect(expected).toBeLessThanOrEqual(2 ** 31 - 1)
    }
  })
})

describe('parseMigrationFileName', () => {
  it('解析标准 V<n>__<desc>.sql', () => {
    expect(parseMigrationFileName('V12__create_form_tables.sql')).toEqual({
      version: '12',
      description: 'create form tables',
    })
  })

  it('下划线转空格，与 Flyway 的 description 行为一致', () => {
    expect(parseMigrationFileName('V31__add_source_key_unique.sql')?.description).toBe(
      'add source key unique',
    )
  })

  it('非迁移文件返回 null', () => {
    expect(parseMigrationFileName('README.md')).toBeNull()
    expect(parseMigrationFileName('init.sql')).toBeNull()
    expect(parseMigrationFileName('V1.sql')).toBeNull()
  })
})

describe('splitStatements', () => {
  it('按分号切分并丢弃空语句', () => {
    expect(splitStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('跳过行注释内的分号，且注释内容不进入语句', () => {
    expect(splitStatements('-- 注释里有 ; 分号\nSELECT 1;')).toEqual(['SELECT 1'])
  })

  it('跳过块注释', () => {
    expect(splitStatements('/* 多行\n注释 ; 分号 */ SELECT 1;')).toEqual(['SELECT 1'])
  })

  it('不切分单引号字符串内的分号', () => {
    expect(splitStatements("INSERT INTO t VALUES ('a;b');")).toEqual([
      "INSERT INTO t VALUES ('a;b')",
    ])
  })

  it('不切分反引号标识符内的分号', () => {
    expect(splitStatements('SELECT `a;b` FROM t;')).toEqual(['SELECT `a;b` FROM t'])
  })

  it('保留多语句顺序', () => {
    const sql = 'CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);\nINSERT INTO a VALUES (1);'
    expect(splitStatements(sql)).toHaveLength(3)
  })

  it('末尾无分号时仍产出最后一条语句', () => {
    expect(splitStatements('SELECT 1')).toEqual(['SELECT 1'])
  })

  it('纯注释输入得到空数组', () => {
    expect(splitStatements('-- 只有注释\n')).toEqual([])
  })
})
