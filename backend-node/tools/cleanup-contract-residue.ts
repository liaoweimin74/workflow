/**
 * 契约残留清理（录制前 / 比对前各跑一次）。
 *
 * ## 为什么必须有这个工具
 * 契约库是长期复用的，而有些残留**无法通过 API 清除**：
 *   - **已发布的表单定义不能删除**（Java 自己的规则：`BusinessException(400,"已发布的表单不能删除")`）
 *     ⇒ 每发布一次就永久多留 1 条 `wf_form_def` + 1 条 `wf_data_source`；
 *   - 发布顺带建出的物理表 `wf_biz_<key>` **没有任何删除端点**：`GET /data-sources/db/tables`
 *     能列出它们，但删不掉。
 *
 * 这些残留会顶偏**前面场景里按数组下标取值**的断言（实测踩到：上一轮留下的数据源让
 * `GET /data-sources/enabled` 多一项，后面按 `data[0]` 取到另一个数据源，
 * 整条链路的 placeholder 全部错位）。所以必须在**录制与比对之前**都把状态清成一致。
 *
 * ## 清理范围（只碰契约场景自己造的东西）
 *   - `wf_form_def` / `wf_data_source`：key 以 `contract_` 开头
 *   - `wf_process_draft` / `wf_node_config`：同上前缀（正常运行会被场景自己删掉，这里是兜底）
 *   - 物理表 `wf_biz_contract_%`
 *   - `wf_page_def`：key 以 `contract_` 开头（**已发布的页面删不掉**，见下）
 *   - `sys_menu`：path 形如 `/page/contract_%`（页面挂接菜单的产物），连同它的 `sys_role_menu` 授权行
 *   - **不碰** `person` / `leave_apply_biz` / `baoxiaodan` / `user-tree` / `dept-tree` 等真实数据，
 *     也不碰非契约页面的菜单
 *
 * ## 页面模块为什么也要清
 * `PageDefinitionService.delete` 是**软删除**（改 `status=ARCHIVED`），而且 `PUBLISHED` 直接拒绝
 * （`BusinessException(400,"已发布的页面不能删除")`）；`mount-menu` 建的菜单只有
 * `DELETE /pages/menus/{menuId}` 能"解除挂接"，而它也是**软删除**（`is_deleted=1`，行还在）。
 * 于是每录一轮就会永久留下：1 条 PUBLISHED 页面 + 1 条 ARCHIVED 草稿页 + 1 条软删菜单
 * + 1 条 `sys_role_menu` 授权行。这些都会顶偏**前面场景**（「页面详情与菜单」读菜单树）的断言。
 *
 * ⚠️ `sys_menu` 用**硬删除**（这里不是业务删除，是测试环境清理），且必须先删
 *    `sys_role_menu` 里指向它的行 —— 表之间没有外键，删漏了会留下悬空授权。
 *
 * ⚠️ `sys_menu.id` 是自增主键：删掉行不会回退 `AUTO_INCREMENT`，所以菜单 id 会随录制轮次
 *    单调增长。契约断言因此**不能**写死 menuId（场景里一律用 `{{...data.menuId}}` 回填）。
 *
 * 用法：
 *   node node_modules/tsx/dist/cli.mjs tools/cleanup-contract-residue.ts [--dry-run]
 */
import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise'

/**
 * 契约场景造物统一使用的 key 前缀。
 */
const PREFIX = 'contract_'

/**
 * 数据库连接参数。
 *
 * ⚠️ **不能 `import { loadEnv } from '../src/...'`**：eslint 有一条边界规则
 *    「tools 不得依赖 src（录制器必须独立于应用）」—— 契约工具必须在应用起不来时
 *    也能跑，否则「应用挂了」和「契约不一致」会混在一起。所以这里直接读环境变量，
 *    默认值与 `src/framework/config/env.ts` 保持一致（改一处要一起改）。
 */
function databaseConfig(): {
  host: string
  port: number
  user: string
  password: string
  database: string
} {
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '740130',
    database: process.env.DB_NAME ?? 'workflow_v6',
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const config = databaseConfig()
  const pool = createPool(config)
  try {
    await run(pool, dryRun, config.database)
  } finally {
    // ⚠️ 必须放在 finally：出错时不关闭连接池会让进程挂着不退出
    //    （实测：报错后脚本一直等待，直到外层超时）
    await pool.end()
  }
}

async function run(pool: Pool, dryRun: boolean, database: string): Promise<void> {
  const like = `${PREFIX}%`
  const counts = await survey(pool, like)
  console.log(`目标库：${database}${dryRun ? '（dry-run）' : ''}`)
  for (const [label, n] of Object.entries(counts)) {
    console.log(`  ${label}: ${n}`)
  }
  if (dryRun) return

  // 顺序有讲究：先删引用方（数据源/节点配置/草稿），再删被引用方（表单定义），最后删物理表
  await pool.query('DELETE FROM wf_data_source WHERE source_key LIKE ? OR form_key LIKE ?', [like, like])
  // ⚠️ `wf_process_draft` 用的是 `process_key`，**不是** `key`：
  //    契约库的这张表是 Hibernate 建的（没有 `key` 列，只有 `process_key`），
  //    而迁移文件 V6 建的是 `key`、由 V35 补出 `process_key` —— 两种形状下 `process_key` 都存在。
  await pool.query(
    `DELETE FROM wf_node_config WHERE process_def_id IN
       (SELECT id FROM wf_process_draft WHERE process_key LIKE ?)`,
    [like],
  )
  await pool.query('DELETE FROM wf_process_draft WHERE process_key LIKE ?', [like])
  await pool.query('DELETE FROM wf_form_def WHERE `key` LIKE ?', [like])

  /**
   * 表单数据行（`wf_form_data`）：**没有按 id 删除的端点**（只有草稿 `DELETE /form-data/draft/{formDefId}`）。
   *
   * 「WORKFLOW 数据源读路径」场景会建一行来做跨实例聚合的断言，若不清理，
   * 下一轮同一个 `query` 就会多出一行 ⇒ 断言变成非确定性的。
   * 只删本套契约自建的那一批：`process_instance_id` 以 `wf-pi-` 开头（合成实例 id 的固定前缀）。
   *
   * ⚠️ 刻意**不**按 `tenant_id` 或全表删 —— 契约库里可能有真实数据，
   *    前缀筛选是唯一安全的判据。
   */
  await pool.query('DELETE FROM wf_form_data WHERE process_instance_id LIKE ?', ['wf-pi-%'])

  // 页面与挂接菜单。顺序：先摘授权行 → 再删菜单（软删的也在）→ 最后删页面定义。
  // ⚠️ path 的形状由 `PageMenuController.mountMenu` 固定为 `/page/<pageKey>`，
  //    所以 `contract_` 前缀在 path 里是**中缀**（/page/contract_xxx），匹配模式要跟着变。
  const menuLike = `/page/${PREFIX}%`
  await pool.query(
    `DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE path LIKE ?)`,
    [menuLike],
  )
  await pool.query('DELETE FROM sys_menu WHERE path LIKE ?', [menuLike])
  await pool.query('DELETE FROM wf_page_def WHERE `key` LIKE ?', [like])

  // 物理表：MySQL 不支持参数化表名，但名字来自我们自己的查询结果 + 严格前缀过滤
  const [tables] = await pool.query<Array<RowDataPacket & { name: string }>>(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ?`,
    [`wf_biz_${PREFIX}%`],
  )
  for (const row of tables) {
    const name = row.name
    if (!/^wf_biz_contract_[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error(`拒绝删除非契约表：${name}`)
    }
    await pool.query(`DROP TABLE IF EXISTS \`${name}\``)
  }
  console.log(`  已删除物理表: ${tables.length}`)

  const after = await survey(pool, like)
  const remaining = Object.entries(after).filter(([, n]) => n > 0)
  console.log(
    remaining.length === 0 ? '清理后残留为 0' : `清理后仍有残留: ${JSON.stringify(after)}`,
  )
}

/**
 * 统计当前残留。
 *
 * ⚠️ `wf_process_draft` 用 `process_key`（不是 `key`）—— 见上面的说明。
 */
async function survey(pool: Pool, like: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const pairs: Array<[string, string]> = [
    ['表单定义', 'SELECT COUNT(*) AS c FROM wf_form_def WHERE `key` LIKE ?'],
    ['数据源', 'SELECT COUNT(*) AS c FROM wf_data_source WHERE source_key LIKE ?'],
    ['流程草稿', 'SELECT COUNT(*) AS c FROM wf_process_draft WHERE process_key LIKE ?'],
    ['页面定义', 'SELECT COUNT(*) AS c FROM wf_page_def WHERE `key` LIKE ?'],
    ['表单数据行', 'SELECT COUNT(*) AS c FROM wf_form_data WHERE process_instance_id LIKE ?'],
    ['挂接菜单', 'SELECT COUNT(*) AS c FROM sys_menu WHERE path LIKE ?'],
    [
      '物理表',
      `SELECT COUNT(*) AS c FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ?`,
    ],
  ]
  for (const [label, sqlText] of pairs) {
    const isTableList = label === '物理表'
    const isMenu = label === '挂接菜单'
    const isFormData = label === '表单数据行'
    const arg = isTableList
      ? `wf_biz_${like}`
      : isMenu
        ? `/page/${like}`
        : isFormData
          ? 'wf-pi-%'
          : like
    const [rows] = await pool.query<Array<RowDataPacket & { c: number | string }>>(sqlText, [arg])
    out[label] = Number(rows[0]?.c ?? 0)
  }
  return out
}

main().catch((err) => {
  console.error('清理失败:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
