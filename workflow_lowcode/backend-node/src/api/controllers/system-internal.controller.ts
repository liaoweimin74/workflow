import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
import { R } from '../../common/domain/r'
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
import { integerQueryParam } from '../../framework/http/query-params'
import { SystemService, type TreeNodeVO, type UserVO } from '../../system/service/system.service'

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
  constructor(private readonly userService: SystemService) {}

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
