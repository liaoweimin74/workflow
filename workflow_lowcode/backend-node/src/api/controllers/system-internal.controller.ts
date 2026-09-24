import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
import { R } from '../../common/domain/r'
import { BusinessException } from '../../common/exception/business-exception'
import {
  bizDataPageVO,
  bizDataVO,
  type BizDataPageVO,
  type BizDataVO,
} from '../../common/domain/biz-data'
import {
  columnConfig,
  dataSourceMetadata,
  type DataSourceMetadata,
} from '../../common/domain/column-config'
import { JavaStatusOk } from '../../framework/http/java-status.decorator'
import { bindIntProperty, integerQueryParam } from '../../framework/http/query-params'
import { SystemService, type TreeNodeVO, type UserVO } from '../../system/service/system.service'
import { SystemSourceQueryService } from '../../engine/datasource/service/system-source-query.service'
import { BUILT_IN_SOURCE_KEYS } from '../../engine/datasource/service/system-source-catalog'

/**
 * SYSTEM 内部 REST 控制器（对齐 Java `SystemInternalController`，前缀 `/api/v1/internal`）。
 *
 * 这些端点不是给前端直接调的，而是**数据源 SPI 的另一半**：
 * `/api/v1/data-sources` 里类型为 SYSTEM 的数据源（部门树、用户）转发到这里。
 * 所以它们的响应形状用 `BizDataVO` / `BizDataPageVO`，与业务表单数据同构 ——
 * 页面设计器才能用同一套渲染逻辑。
 *
 * 放在 api 层是因为 Java 侧就在 `com.workflow.api.controller`，
 * 而且它同时用到了 system 模块的服务；engine 层不得依赖 api。
 */
@Controller('api/v1/internal')
@JavaStatusOk()
export class SystemInternalController {
  constructor(
    private readonly userService: SystemService,
    private readonly systemSourceQuery: SystemSourceQueryService,
  ) {}

  /**
   * 部门树扁平化（根节点 `parentId` 为空串）。
   * `keyword` 忽略大小写匹配 label 与 code。
   *
   * ⚠️ 分页外壳的 `page`/`size` 都是**扁平化后的条数**，不是请求参数
   *    （Java 传的是 `new BizDataPageVO(flattened, flattened.size(), 0, flattened.size())`）。
   */
  @Get('system/dept-tree')
  async deptTree(@Query('keyword') keyword?: string): Promise<R<BizDataPageVO>> {
    const nodes = await this.userService.orgTree()
    const flattened = flattenTree(nodes, normalizeKeyword(keyword))
    return R.ok(bizDataPageVO(flattened, flattened.length, 0, flattened.length))
  }

  /** 用户分页。 */
  @Get('system/users')
  async users(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<BizDataPageVO>> {
    const result = await this.userService.listUsersByUsername(
      normalizeKeyword(keyword),
      // Java 这里声明的是 `Integer`（不是 `int`）⇒ 失败消息里的类型名是 `java.lang.Integer`
      integerQueryParam(page, 'page', 1),
      integerQueryParam(size, 'size', 20),
    )
    return R.ok(
      bizDataPageVO(result.rows.map(toUserRow), result.total, result.page, result.size),
    )
  }

  // ⚠️ 路由声明顺序有语义：Nest 按声明顺序匹配，`system/users/metadata`
  //    必须排在 `system/users/:id` 之前，否则 `:id` 会吃掉 `metadata`，
  //    走到 `Number('metadata') === NaN` 拼出一条 `WHERE id = NaN` 的 SQL
  //    （契约比对抓到的真实故障，不是理论风险）。

  /** 部门树元数据（固定 4 列，不可写标记为 true）。 */
  @Get('system/dept-tree/metadata')
  deptTreeMetadata(): R<DataSourceMetadata> {
    return R.ok(
      dataSourceMetadata(
        [
          columnConfig('id', 'ID'),
          columnConfig('parentId', '父节点'),
          columnConfig('label', '名称'),
          columnConfig('code', '编码'),
        ],
        true,
      ),
    )
  }

  /** 用户元数据（固定 6 列）。 */
  @Get('system/users/metadata')
  usersMetadata(): R<DataSourceMetadata> {
    return R.ok(
      dataSourceMetadata(
        [
          columnConfig('id', 'ID'),
          columnConfig('username', '用户名'),
          columnConfig('nickname', '昵称'),
          columnConfig('orgId', '组织ID'),
          columnConfig('orgName', '组织名称'),
          columnConfig('status', '状态'),
        ],
        true,
      ),
    )
  }

  /** 按 id 查用户。 */
  @Get('system/users/:id')
  async getUser(@Param('id') id: string): Promise<R<BizDataVO>> {
    return R.ok(toUserRow(await this.userService.getUserById(Number(id))))
  }

  // ==================== 写（委托 system 模块，同样对齐 Java 的委托） ====================

  /**
   * 新建部门。
   *
   * ⚠️ Java 传的是 `new OrganizationCreateRequest(null, orgName, orgCode, null, null)`
   *    —— **parentId 恒为 null**、sortOrder/status 也不传（走服务端默认 0/1）。
   *    所以这个端点**只能建根节点**。请求体里给了 parentId 也不会生效。
   */
  @Post('system/dept')
  async createDept(@Body() body: Record<string, unknown> | null): Promise<R<BizDataVO>> {
    const node = await this.userService.createOrg({
      parentId: null,
      orgName: String(body?.orgName ?? ''),
      orgCode: String(body?.orgCode ?? ''),
      sortOrder: null,
      status: null,
    })
    return R.ok(toDeptRow(node))
  }

  /**
   * 删除部门（**软删除**）。
   *
   * ⚠️ 三重校验决定报哪条错误：不存在 → 存在子节点 → 该机构下存在用户。
   *    后两条都是业务异常（HTTP 200 + code 500）。
   */
  @Delete('system/dept/:id')
  async deleteDept(@Param('id') id: string): Promise<R<null>> {
    await this.userService.deleteOrg(Number(id))
    return R.ok()
  }

  /**
   * 新建用户。
   *
   * ⚠️ Java 传 `new UserCreateRequest(username, nickname, null, null, orgId, null, null)`
   *    —— email/phone/roleIds 恒为 null、status 走默认 1。
   *    `orgId` 只有是 Number 时才取，其余（含字符串）一律为 null。
   */
  @Post('system/user')
  async createUser(@Body() body: Record<string, unknown> | null): Promise<R<BizDataVO>> {
    const orgIdRaw = body?.orgId
    const user = await this.userService.createUser({
      username: String(body?.username ?? ''),
      nickname: String(body?.nickname ?? ''),
      email: null,
      phone: null,
      orgId: typeof orgIdRaw === 'number' ? orgIdRaw : null,
      roleIds: null,
      status: null,
    })
    return R.ok(toUserRow(user))
  }

  /** 删除用户（**软删除**）。 */
  @Delete('system/user/:id')
  async deleteUser(@Param('id') id: string): Promise<R<null>> {
    await this.userService.deleteUser(Number(id))
    return R.ok()
  }

  // ==================== 内建系统数据源 REST 化取数（新 6 个） ====================
  //
  // 这些端点与数据源 SPI（adapter 直调服务）共享同一份实现
  // （SystemSourceQueryService），是 `generateParams` 生成的 `params.list.action`
  // 的落点；也给前端/页面直连提供 REST 形状。取数均**只读**。
  //
  // ⚠️ 路由声明顺序有语义：`*/metadata` 与字面量段（process/...）必须排在
  // 对应参数段（*/:id）之前（Nest 按声明顺序匹配，同 users 的历史教训）。

  /** 系统菜单列表（全量扁平化）。 */
  @Get('system/menus')
  async systemMenus(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<BizDataPageVO>> {
    return R.ok(await this.sourceList('sys-menus', page, size))
  }

  /** 系统菜单元数据。 */
  @Get('system/menus/metadata')
  async systemMenusMetadata(): Promise<R<DataSourceMetadata>> {
    return R.ok(await this.sourceMetadata('sys-menus'))
  }

  /** 系统菜单单条。 */
  @Get('system/menus/:id')
  async systemMenuById(@Param('id') id: string): Promise<R<BizDataVO>> {
    return R.ok(await this.sourceGet('sys-menus', id))
  }

  /** 系统角色列表（标准分页）。 */
  @Get('system/roles')
  async systemRoles(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<BizDataPageVO>> {
    return R.ok(await this.sourceList('sys-roles', page, size))
  }

  /** 系统角色元数据。 */
  @Get('system/roles/metadata')
  async systemRolesMetadata(): Promise<R<DataSourceMetadata>> {
    return R.ok(await this.sourceMetadata('sys-roles'))
  }

  /** 系统角色单条。 */
  @Get('system/roles/:id')
  async systemRoleById(@Param('id') id: string): Promise<R<BizDataVO>> {
    return R.ok(await this.sourceGet('sys-roles', id))
  }

  /** 系统字典（类型）列表（标准分页）。 */
  @Get('system/dicts')
  async systemDicts(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<BizDataPageVO>> {
    return R.ok(await this.sourceList('sys-dicts', page, size))
  }

  /** 系统字典元数据。 */
  @Get('system/dicts/metadata')
  async systemDictsMetadata(): Promise<R<DataSourceMetadata>> {
    return R.ok(await this.sourceMetadata('sys-dicts'))
  }

  /** 系统字典单条。 */
  @Get('system/dicts/:id')
  async systemDictById(@Param('id') id: string): Promise<R<BizDataVO>> {
    return R.ok(await this.sourceGet('sys-dicts', id))
  }

  /** 流程定义列表（全量）。 */
  @Get('system/process/definitions')
  async processDefinitions(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<BizDataPageVO>> {
    return R.ok(await this.sourceList('process-definitions', page, size))
  }

  /** 流程定义元数据。 */
  @Get('system/process/definitions/metadata')
  async processDefinitionsMetadata(): Promise<R<DataSourceMetadata>> {
    return R.ok(await this.sourceMetadata('process-definitions'))
  }

  /** 流程实例列表（标准分页，运行中）。 */
  @Get('system/process/instances')
  async processInstances(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<BizDataPageVO>> {
    return R.ok(await this.sourceList('process-instances', page, size))
  }

  /** 流程实例元数据。 */
  @Get('system/process/instances/metadata')
  async processInstancesMetadata(): Promise<R<DataSourceMetadata>> {
    return R.ok(await this.sourceMetadata('process-instances'))
  }

  /** 待办任务列表（标准分页，按当前登录人过滤）。 */
  @Get('system/process/todo-tasks')
  async processTodoTasks(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<BizDataPageVO>> {
    return R.ok(await this.sourceList('todo-tasks', page, size))
  }

  /** 待办任务元数据。 */
  @Get('system/process/todo-tasks/metadata')
  async processTodoTasksMetadata(): Promise<R<DataSourceMetadata>> {
    return R.ok(await this.sourceMetadata('todo-tasks'))
  }

  /** 内建数据源取数（page/size 缺省与 queryData 同默认：1/20）。 */
  private async sourceList(
    sourceKey: string,
    page?: string,
    size?: string,
  ): Promise<BizDataPageVO> {
    return this.systemSourceQuery.query(sourceKey, {
      filter: null,
      keyword: null,
      keywordColumn: null,
      sort: null,
      order: null,
      params: null,
      page: bindIntProperty(page, 'page', 1),
      size: bindIntProperty(size, 'size', 20),
    })
  }

  /**
   * 内建数据源元数据（列来自目录常量）。
   *
   * ⚠️ 第二参与既有 deptTreeMetadata/usersMetadata 同构传 `true`
   * （历史端点的既成行为）；数据管理页实际走 SPI 路径
   * `/data-sources/:id/metadata`（adapter 返回 writable=false 只读），
   * 这些 REST metadata 端点当前没有前端消费方，一致性优先。
   */
  private async sourceMetadata(sourceKey: string): Promise<DataSourceMetadata> {
    return dataSourceMetadata(
      (await this.systemSourceQuery.columnsOf(sourceKey)).map((column) =>
        columnConfig(String(column.key), String(column.label)),
      ),
      true,
    )
  }

  /** 内建数据源单条：全量取回后按 id 线性查找（对齐 adapter SYSTEM get 的语义）。 */
  private async sourceGet(sourceKey: string, id: string): Promise<BizDataVO> {
    if (!BUILT_IN_SOURCE_KEYS.has(sourceKey)) {
      throw new BusinessException(400, `未注册的系统数据源: ${sourceKey}`)
    }
    const all = await this.systemSourceQuery.query(sourceKey, {
      filter: null,
      keyword: null,
      keywordColumn: null,
      sort: null,
      order: null,
      params: null,
      page: 1,
      // 全量取回：size 给安全上限，full/paged 语义差异由服务内部处理
      size: 100000,
    })
    const row = all.records.find((item) => item.id === id)
    if (row === undefined) {
      throw new BusinessException(404, `系统数据不存在: ${id}`)
    }
    return row
  }
}

/** Java `keyword == null || keyword.isEmpty()` —— 注意**空白串不算空**，与 isBlank 不同。 */
function normalizeKeyword(keyword: string | undefined): string | null {
  if (keyword === undefined || keyword === '') return null
  return keyword
}

/**
 * 部门树 → 扁平列表（前序遍历，保留层级顺序）。
 * 对齐 Java `flattenTree`：命中 keyword 的节点进入结果，但**子节点仍会被遍历**
 * （即父节点被过滤掉时子节点照样可能命中）。
 */
function flattenTree(nodes: TreeNodeVO[], keyword: string | null): BizDataVO[] {
  const result: BizDataVO[] = []
  const walk = (node: TreeNodeVO | null): void => {
    if (node === null) return
    const needle = keyword === null ? null : keyword.toLowerCase()
    const matches =
      needle === null ||
      (node.label !== null && node.label.toLowerCase().includes(needle)) ||
      (node.code !== null && node.code.toLowerCase().includes(needle))
    if (matches) result.push(toDeptRow(node))
    for (const child of node.children ?? []) walk(child)
  }
  for (const node of nodes) walk(node)
  return result
}

/** 部门节点 → BizDataVO。根节点 parentId 为空串（对齐 Java 的三元表达式）。 */
function toDeptRow(node: TreeNodeVO): BizDataVO {
  return bizDataVO(
    String(node.id),
    {
      parentId: node.parentId !== null ? String(node.parentId) : '',
      label: node.label,
      code: node.code,
    },
    null,
    null,
    null,
  )
}

/** 用户 → BizDataVO（字段集合与顺序对齐 Java `toUserRow`）。 */
function toUserRow(user: UserVO): BizDataVO {
  return bizDataVO(
    String(user.id),
    {
      username: user.username,
      nickname: user.nickname,
      orgId: user.orgId,
      orgName: user.orgName,
      status: user.status,
    },
    null,
    null,
    null,
  )
}
