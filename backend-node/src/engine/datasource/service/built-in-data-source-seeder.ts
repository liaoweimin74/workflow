import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import type { WfDataSourceTable } from '../../../framework/database/types'
import { DataSourceRepository } from '../repository/data-source.repository'
import { generateParams } from './data-source-write.service'
import {
  BUILT_IN_ID_PREFIX,
  BUILT_IN_SYSTEM_SOURCES,
  BUILT_IN_TENANT,
} from './system-source-catalog'

/**
 * 系统内建数据源 Seeder —— 应用启动时幂等预置 8 条 SYSTEM 数据源。
 *
 * 【预置范围】系统管理（系统菜单 / 系统用户 / 组织机构 / 系统角色 / 系统字典）
 * 与流程管理（流程定义 / 流程实例 / 待办任务）的**系统内建结构数据**，
 * 全部以 `type=SYSTEM` 落库 —— 跨租户可见性由既有 SQL 的 `OR type='SYSTEM'`
 * 条件保证，不需要逐租户播种。
 *
 * 【幂等语义】固定 id（`ds-builtin-<sourceKey>`）+ 缺则插入：
 *   - 已存在（含被管理员改过 params 的场景）一律**不动**；
 *   - 被删过（理论上被写保护拦住，但兜底）重启后补回；
 *   - `status=ENABLED`、`created_by='system'`、`params` 由 `generateParams`
 *     生成只读端点配置（与手动启用的 SYSTEM 数据源同构）。
 *
 * 【为什么用启动 seed 而不是 Flyway 迁移】
 *   - 迁移只跑一次，行被误删后无法自愈；seed 每次启动对账，天然自愈；
 *   - 迁移写死 tenant 域数据，未来新增租户时无需回填（SYSTEM 行全局一份）；
 *   - seed 失败（如表未就绪）只降级为「列表里没有预置项」，不应阻塞启动，
 *     所以整个流程 catch 后 warn，不向上抛。
 */
@Injectable()
export class BuiltInDataSourceSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(BuiltInDataSourceSeeder.name)

  constructor(private readonly repository: DataSourceRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed()
    } catch (error) {
      // 预置失败不阻塞应用启动（如迁移未跑完/表结构漂移）；下次启动重试
      this.logger.warn(
        `系统内建数据源预置失败（下次启动重试）: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async seed(): Promise<void> {
    const now = new Date()
    let inserted = 0
    for (const source of BUILT_IN_SYSTEM_SOURCES) {
      const id = `${BUILT_IN_ID_PREFIX}${source.sourceKey}`
      const existing = await this.repository.findByIdAndTenantId(id, BUILT_IN_TENANT)
      if (existing !== null) continue
      const row: WfDataSourceTable = {
        id,
        tenant_id: BUILT_IN_TENANT,
        name: source.name,
        type: 'SYSTEM',
        form_key: null,
        source_key: source.sourceKey,
        form_id: null,
        params: generateParams('SYSTEM', '', source.sourceKey),
        status: 'ENABLED',
        created_by: 'system',
        created_at: now,
        updated_at: now,
      }
      await this.repository.insertDefinition(row)
      inserted++
    }
    if (inserted > 0) {
      this.logger.log(`系统内建数据源预置完成：新增 ${inserted} 条（共 ${BUILT_IN_SYSTEM_SOURCES.length} 条）`)
    }
  }
}
