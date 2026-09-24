import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../../common/exception/business-exception'
import { bizDataVO, type BizDataPageVO, type BizDataVO } from '../../../common/domain/biz-data'
import type { BizDataQueryRequest } from '../../form/bizdata/biz-data-support'
import type { MenuTreeVO } from '../../../system/service/system.service'
import { SystemService } from '../../../system/service/system.service'
import { ProcessDesignService } from '../../process/process-design.service'
import { ProcessInstanceService } from '../../runtime/process-instance.service'
import { TaskService } from '../../task/task.service'
import { tryGetUserId } from '../../../framework/security/user-context'
import { builtInSourceByKey } from './system-source-catalog'

/**
 * 内建系统数据源取数服务 —— 6 个新增 sourceKey 的统一取数实现。
 *
 * 两个消费方共享同一份逻辑，避免漂移：
 *   - `UnifiedDataSourceAdapter.systemQuery`：数据源 SPI 主路径（`/:id/data`）；
 *   - `SystemInternalController`：REST 化端点（`/api/v1/internal/system/...`，
 *     `generateParams` 生成的 `params.list.action` 指向它们）。
 *
 * 历史既有 sourceKey（`dept-tree` / `user-tree`）的取数**保留在 adapter 原位**
 * （golden 契约钉住分页外壳与空值语义，不做无谓搬家）。
 *
 * 【空值约定】与 dept-tree/user-tree 一致：字段值一律空串而不是 null
 * （null 列在 FORM 数据路径不进 data，系统数据源历史上全是空串，保持同构）。
 */
@Injectable()
export class SystemSourceQueryService {
  constructor(
    private readonly systemService: SystemService,
    private readonly processDesignService: ProcessDesignService,
    private readonly processInstanceService: ProcessInstanceService,
    private readonly taskService: TaskService,
  ) {}

  /** 是否由本服务负责取数（新 6 个 sourceKey；历史 2 个归 adapter）。 */
  static handles(sourceKey: string): boolean {
    return ['sys-menus', 'sys-roles', 'sys-dicts', 'process-definitions', 'process-instances', 'todo-tasks'].includes(
      sourceKey,
    )
  }

  /** 内建数据源元数据列（按 catalog 顺序），只读。 */
  async columnsOf(sourceKey: string) {
    const source = builtInSourceByKey(sourceKey)
    if (source === null) {
      throw new BusinessException(400, `未注册的系统数据源: ${sourceKey}`)
    }
    return source.columns
  }

  /** 统一取数入口（本服务负责的 6 个 sourceKey）。 */
  async query(sourceKey: string, req: BizDataQueryRequest): Promise<BizDataPageVO> {
    switch (sourceKey) {
      case 'sys-menus':
        return this.queryMenus()
      case 'sys-roles':
        return this.queryRoles(req)
      case 'sys-dicts':
        return this.queryDicts(req)
      case 'process-definitions':
        return this.queryProcessDefinitions()
      case 'process-instances':
        return this.queryProcessInstances(req)
      case 'todo-tasks':
        return this.queryTodoTasks(req)
      default:
        throw new BusinessException(400, `未注册的系统数据源: ${sourceKey}`)
    }
  }

  // ==================== 系统菜单（全量扁平化，语义同 dept-tree） ====================

  private async queryMenus(): Promise<BizDataPageVO> {
    const tree = await this.systemService.menuTree()
    const records: BizDataVO[] = []
    const walk = (node: MenuTreeVO): void => {
      records.push(
        bizDataVO(
          String(node.id),
          {
            id: String(node.id),
            parentId: node.parentId === null || node.parentId === undefined ? '' : String(node.parentId),
            menuName: node.menuName ?? '',
            menuType: node.menuType,
            path: node.path ?? '',
            permission: node.permission ?? '',
            sortOrder: node.sortOrder === null || node.sortOrder === undefined ? '' : String(node.sortOrder),
          },
          null,
          null,
          null,
        ),
      )
      for (const child of node.children ?? []) walk(child)
    }
    for (const node of tree) walk(node)
    return { records, total: records.length, page: 0, size: records.length }
  }

  // ==================== 系统角色 / 系统字典（标准分页） ====================

  private async queryRoles(req: BizDataQueryRequest): Promise<BizDataPageVO> {
    const page = Math.max(req.page, 1)
    const result = await this.systemService.listRoles(page, req.size)
    const records = result.rows.map((row) =>
      bizDataVO(
        String(row.id),
        {
          id: String(row.id),
          roleName: row.roleName ?? '',
          roleCode: row.roleCode ?? '',
          description: row.description ?? '',
          status: row.status,
        },
        null,
        null,
        null,
      ),
    )
    return { records, total: result.total, page: result.page, size: result.size }
  }

  private async queryDicts(req: BizDataQueryRequest): Promise<BizDataPageVO> {
    const page = Math.max(req.page, 1)
    const result = await this.systemService.listDictTypes(page, req.size)
    const records = result.rows.map((row) =>
      bizDataVO(
        String(row.id),
        {
          id: String(row.id),
          dictCode: row.dictCode ?? '',
          dictName: row.dictName ?? '',
          remark: row.remark ?? '',
          status: row.status,
        },
        null,
        null,
        null,
      ),
    )
    return { records, total: result.total, page: result.page, size: result.size }
  }

  // ==================== 流程定义（全量，语义同 dept-tree） ====================

  private async queryProcessDefinitions(): Promise<BizDataPageVO> {
    const summaries = await this.processDesignService.listSummaries()
    const records = summaries.map((row) =>
      bizDataVO(
        row.id,
        {
          id: row.id,
          key: row.key ?? '',
          name: row.name ?? '',
          version: row.version,
        },
        null,
        null,
        null,
      ),
    )
    return { records, total: records.length, page: 0, size: records.length }
  }

  // ==================== 流程实例（标准分页，运行中） ====================

  private async queryProcessInstances(req: BizDataQueryRequest): Promise<BizDataPageVO> {
    const page = Math.max(req.page, 1)
    const result = await this.processInstanceService.listInstances(page, req.size)
    const records = result.content.map((row) =>
      bizDataVO(
        row.id,
        {
          id: row.id,
          name: row.name ?? '',
          processDefinitionName: row.processDefinitionName ?? '',
          businessKey: row.businessKey ?? '',
          currentNode: row.currentNode ?? '',
          status: row.status ?? '',
          startTime: row.startTime === null || row.startTime === undefined ? '' : String(row.startTime),
        },
        null,
        null,
        null,
      ),
    )
    return { records, total: result.totalElements, page: result.pageNumber, size: result.pageSize }
  }

  // ==================== 待办任务（标准分页，按当前登录人过滤） ====================

  /**
   * 待办任务：assignee 必须来自**当前登录人**（UserContextInterceptor 转入 ALS）。
   * 未认证上下文（@Public 链路/系统内部调用）没有登录人 → 400 明确报错，
   * 而不是静默返回全租户待办（那是越权）。
   */
  private async queryTodoTasks(req: BizDataQueryRequest): Promise<BizDataPageVO> {
    const userId = tryGetUserId()
    if (userId === null) {
      throw new BusinessException(400, '待办任务数据源需要登录用户上下文')
    }
    const assignee = String(userId)
    const page = Math.max(req.page, 1)
    const result = await this.taskService.listTodo(assignee, page, req.size)
    const records = result.content.map((row) =>
      bizDataVO(
        row.taskId,
        {
          taskId: row.taskId,
          currentNodeName: row.currentNodeName ?? '',
          processName: row.processName ?? '',
          assignee: row.assignee ?? '',
          initiatorName: row.initiatorName ?? '',
          createTime: row.createTime === null || row.createTime === undefined ? '' : String(row.createTime),
        },
        null,
        null,
        null,
      ),
    )
    return { records, total: result.totalElements, page: result.pageNumber, size: result.pageSize }
  }
}
