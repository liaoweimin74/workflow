import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  createQueryId,
  type Dialect,
  type RawBuilder,
} from 'kysely'

/**
 * 测试专用的「只编译」方言。
 *
 * 为什么不用 `MysqlDialect({ pool })`：那需要一个真实连接池对象，
 * 而这里**根本不需要连接** —— 只编译 SQL。自己实现 `Dialect` 的四个工厂，
 * 驱动换成 Kysely 自带的 `DummyDriver`，就得到一个不会尝试联网的编译器。
 */
class CompileOnlyMysqlDialect implements Dialect {
  createAdapter(): MysqlAdapter {
    return new MysqlAdapter()
  }
  createDriver(): DummyDriver {
    return new DummyDriver()
  }
  createIntrospector(db: Kysely<unknown>): MysqlIntrospector {
    return new MysqlIntrospector(db)
  }
  createQueryCompiler(): MysqlQueryCompiler {
    return new MysqlQueryCompiler()
  }
}

const compiler = new Kysely<Record<string, never>>({
  dialect: new CompileOnlyMysqlDialect(),
})

/**
 * 把 Kysely 片段编译成 MySQL 方言的 SQL 与参数。
 *
 * 直接断言 SQL 文本与参数是刻意的：这一层**唯一**的职责就是「生成正确的 SQL 与绑定」，
 * 而契约回归只覆盖了 happy path（`person` 表单、无筛选、无排序）。
 * 白名单拒绝、JSON 列分支、结构化筛选这些分支**只能**在这里验证。
 */
export function compile(fragment: RawBuilder<unknown>): { sql: string; params: unknown[] } {
  const compiled = compiler
    .getExecutor()
    .compileQuery(fragment.toOperationNode(), createQueryId())
  return { sql: compiled.sql, params: compiled.parameters as unknown[] }
}
