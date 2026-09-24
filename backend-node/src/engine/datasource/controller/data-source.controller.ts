import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { type ColumnInfo, type ColumnMeta, type DataSourceMetadata } from '../../../common/domain/column-config'
import type { BizDataPageVO, BizDataVO } from '../../../common/domain/biz-data'
import { PageResponse } from '../../../common/domain/page-response'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import {
  bindIntProperty,
  blankToNull,
  intQueryParam,
  integerQueryParamOrNull,
} from '../../../framework/http/query-params'
import { DataSourceService, type DataSourceVO } from '../service/data-source.service'
import { DataSourceWriteService } from '../service/data-source-write.service'
import { BizDataSupport, asBusinessException } from '../../form/bizdata/biz-data-support'
import type { JoinConfig } from '../../form/bizdata/join-sql-generator'
import { SqlMetadataProbe } from '../../form/bizdata/sql-metadata-probe'
import { ApiMetadataProbe } from '../../form/bizdata/api-metadata-probe'

/**
 * 全局数据源管理（对齐 Java `DataSourceController`，前缀 `/api/v1/data-sources`）。
 *
 * ⚠️ 路由声明顺序有语义：Nest 按声明顺序匹配，字面量段（`enabled` / `db`）
 *    必须排在 `:id` 之前，否则 `GET /enabled` 会被 `:id` 吃掉。
 *
 * ⚠️ **写端点返回实体、读端点返回 DTO**：实体多一个 `formId`。
 *    这是契约的一部分（与表单定义模块同样的模式），不能统一掉。
 */
@Controller('api/v1/data-sources')
@JavaStatusOk()
export class DataSourceController {
  constructor(
    private readonly service: DataSourceService,
    private readonly writeService: DataSourceWriteService,
    private readonly metadataProbe: SqlMetadataProbe,
    private readonly apiMetadataProbe: ApiMetadataProbe,
    private readonly bizDataSupport: BizDataSupport,
  ) {}

  /**
   * 分页查询数据源列表。
   * 分页形状是 `PageResponse{content,pageNumber,pageSize,totalElements,totalPages}`。
   */
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ): Promise<R<PageResponse<DataSourceVO>>> {
    return R.ok(
      await this.service.list(
        intQueryParam(page, 'page', 1),
        intQueryParam(size, 'size', 20),
        type ?? null,
        status ?? null,
      ),
    )
  }

  /**
   * 创建数据源。
   *
   * ⚠️ 状态规则：**API/SQL 创建即 ENABLED**，其余类型一律 **DRAFT**。
   * ⚠️ FORM/WORKFLOW 的 `sourceKey` **恒等于 formKey**（formKey 权威，忽略入参）。
   */
  @Post()
  async create(@Body() body: DataSourceSaveRequest | null): Promise<R<Record<string, unknown>>> {
    return R.ok(
      await this.writeService.create({
        name: body?.name ?? null,
        type: body?.type ?? null,
        formKey: body?.formKey ?? null,
        sourceKey: body?.sourceKey ?? null,
        params: body?.params ?? null,
      }),
    )
  }

  /**
   * SQL 列元数据探测（对齐 Java `MetadataProbeController.exploreSql`）。
   *
   * ⚠️ 与 `DataSourceController` 同前缀，但 Java 侧是**另一个控制器类**；这里并入同一个
   *    `@Controller` —— Nest 的匹配只看段数与字面量，合并没有副作用。
   *    POST 下与 `:id/enable`（两段）段数不同，不会被 `:id` 遮蔽。
   */
  @Post('explore-sql')
  async exploreSql(@Body() body: { sql?: string } | null): Promise<R<ColumnMeta[]>> {
    return R.ok(await this.metadataProbe.probe(body?.sql ?? null))
  }

  /**
   * API 列元数据探测（对齐 Java `MetadataProbeController.exploreApi`）。
   *
   * ⚠️ 出站请求**不带认证头**，目标必须是公开可达的接口；否则只能拿到 401 响应体
   *    （里面没有数组）→ 400「接口返回中未找到数组数据，无法推断字段」。
   */
  @Post('explore-api')
  async exploreApi(
    @Body() body: Record<string, unknown> | null,
  ): Promise<R<ColumnMeta[]>> {
    return R.ok(await this.apiMetadataProbe.probe(body))
  }

  /**
   * config 模式 JOIN SQL 预览（对齐 Java `DataSourceController.previewJoin`）。
   *
   * formKey + joins → 生成的 SELECT SQL（不落库不执行）；目标可为业务表单或
   * 内建数据源（`join-target-catalog` 白名单解析物理表）。生成器抛出的非法参数
   * 统一转 400（与 queryJoinConfig 的 `asBusinessException` 语义一致）。
   */
  @Post('join-preview')
  async previewJoin(
    @Body() body: { formKey?: string; joins?: JoinConfig[] } | null,
  ): Promise<R<{ sql: string; params: unknown[] }>> {
    try {
      return R.ok(
        await this.bizDataSupport.previewJoinSql(String(body?.formKey ?? ''), body?.joins ?? []),
      )
    } catch (error) {
      throw asBusinessException(error)
    }
  }

  /** 仅已启用数据源（页面设计器数据源下拉），返回裸数组。 */
  @Get('enabled')
  async enabled(): Promise<R<DataSourceVO[]>> {
    return R.ok(await this.service.getEnabled())
  }

  /** 数据源详情（不存在 → 业务 404）。 */
  @Get(':id')
  async getById(@Param('id') id: string): Promise<R<DataSourceVO>> {
    return R.ok(await this.service.getById(id))
  }

  /** 原地更新数据源（字段为 null 表示不更新）。 */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: DataSourceSaveRequest | null,
  ): Promise<R<Record<string, unknown>>> {
    return R.ok(
      await this.writeService.update(id, {
        name: body?.name ?? null,
        type: body?.type ?? null,
        formKey: body?.formKey ?? null,
        sourceKey: body?.sourceKey ?? null,
        params: body?.params ?? null,
      }),
    )
  }

  /** 删除数据源（任意状态可删；被页面引用时拒绝）。 */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.writeService.remove(id)
    return R.ok()
  }

  /** 启用数据源（FORM 须绑定已发布表单）。 */
  @Post(':id/enable')
  async enable(@Param('id') id: string): Promise<R<Record<string, unknown>>> {
    return R.ok(await this.writeService.enable(id))
  }

  /** 禁用数据源（不做引用校验）。 */
  @Post(':id/disable')
  async disable(@Param('id') id: string): Promise<R<Record<string, unknown>>> {
    return R.ok(await this.writeService.disable(id))
  }

  /** 数据源元数据：列定义 + 可写标记（设计器切换数据源刷新列用）。 */
  @Get(':id/metadata')
  async metadata(@Param('id') id: string): Promise<R<DataSourceMetadata>> {
    return R.ok(await this.service.metadata(id))
  }

  /**
   * 数据源分页取数（经适配器 SPI）。
   *
   * ⚠️ Java 侧 `queryData(id, BizDataQueryRequest req)` 把查询参数绑定到 POJO，
   *    Spring 会实例化它，所以 `req` **永不为 null**；缺省值来自字段初始化器
   *    （`page = 1`、`size = 20`）。这里显式构造同样的默认值，
   *    而不是传 null 让下层兜底 —— 下层兜底会掩盖「该端点其实没默认值」这类差异。
   */
  @Get(':id/data')
  async queryData(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('filter') filter?: string,
    @Query('keyword') keyword?: string,
    @Query('keywordColumn') keywordColumn?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('params') params?: string,
  ): Promise<R<BizDataPageVO>> {
    return R.ok(
      await this.service.queryData(id, {
        filter: blankToNull(filter),
        keyword: blankToNull(keyword),
        keywordColumn: blankToNull(keywordColumn),
        sort: blankToNull(sort),
        order: blankToNull(order),
        params: blankToNull(params),
        // `page`/`size` 是**绑定对象**的 `int` 字段（形态 B）：非法值 → HTTP 200 + body code 400
        page: bindIntProperty(page, 'page', 1),
        size: bindIntProperty(size, 'size', 20),
      }),
    )
  }

  /**
   * 数据源单条取数。
   *
   * 段数与 `:id`（1 段）、`:id/metadata`、`:id/data`（各 2 段）都不同，不会互相遮蔽；
   * 但仍声明在它们之后，让「字面量段先于参数段」的惯例保持一致。
   */
  @Get(':id/data/:rowId')
  async getData(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
  ): Promise<R<BizDataVO>> {
    return R.ok(await this.service.getData(id, rowId))
  }

  /**
   * 数据源新增一行（只读数据源 → 400 不支持）。
   *
   * ⚠️ 返回的是**裸字符串 id**（`R<String>`），不是对象 ——
   *    形状与 `POST /api/v1/biz-data/{formKey}`（返回 `BizDataVO`）不同，
   *    原因是数据源端点要兼容 API/SQL 那种「外部系统返回一个 id」的语义。
   */
  @Post(':id/data')
  async createData(
    @Param('id') id: string,
    @Body() body: Record<string, unknown> | null,
  ): Promise<R<string>> {
    return R.ok(await this.service.createData(id, body))
  }

  /**
   * 数据源修改一行。
   *
   * ⚠️ `version` 走 **query 参数**（`?version=1`），对齐 Java 的
   *    `@RequestParam(required = false) Integer version`。body 里若也带 `version`，
   *    它会被当作普通字段处理、并因不在 `column_config` 里而被**静默丢弃**。
   */
  @Put(':id/data/:rowId')
  async updateData(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @Query('version') version?: string,
    @Body() body?: Record<string, unknown> | null,
  ): Promise<R<null>> {
    await this.service.updateData(
      id,
      rowId,
      body ?? null,
      // `@RequestParam(required = false) Integer version`（形态 A）：非法值 → HTTP 500。
      // ⚠️ 转换发生在**进入控制器方法时**，所以非法值会先于「数据源不存在」报出来 ——
      //    golden 里 `qiVersionBad` 打的就是一个不存在的 id，仍然报转换错误。
      integerQueryParamOrNull(version, 'version'),
    )
    return R.ok()
  }

  /** 数据源删除一行。 */
  @Delete(':id/data/:rowId')
  async deleteData(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
  ): Promise<R<null>> {
    await this.service.deleteData(id, rowId)
    return R.ok()
  }
}

/**
 * ⚠️ 原先这里有个本地 `versionOrNull`，它对非法值退化成「未传」并声称那是「已知分歧」。
 * 契约场景「非法查询参数与分页边界」`qiVersionBad` 已把它定案：Java 抛的是
 * `MethodArgumentTypeMismatchException` → **HTTP 500 + R 信封**（不是 Spring 默认错误体），
 * 消息为 `Method parameter 'version': Failed to convert value of type 'java.lang.String'
 * to required type 'java.lang.Integer'; For input string: "abc"`。
 * 现在统一走 `framework/http/query-params.ts` 的 `integerQueryParamOrNull`，
 * 本地副本删除 —— 同一规则只允许有一个实现。
 */

/** 数据源保存请求体，对齐 Java `DataSourceSaveRequest`。 */
interface DataSourceSaveRequest {
  name?: string | null
  type?: string | null
  formKey?: string | null
  sourceKey?: string | null
  params?: string | null
}

/** 数据库结构只读端点（对齐 Java `DbSchemaController`，前缀 `/api/v1/data-sources/db`）。 */@Controller('api/v1/data-sources/db')
@JavaStatusOk()
export class DbSchemaController {
  constructor(private readonly service: DataSourceService) {}

  /** 当前库全部基础表名（排除 Flyway 迁移历史表）。 */
  @Get('tables')
  async tables(): Promise<R<string[]>> {
    return R.ok(await this.service.listTableNames())
  }

  /** 按表名列举真实字段（表不存在返回空列表）。 */
  @Get('tables/:table/columns')
  async columns(@Param('table') table: string): Promise<R<ColumnInfo[]>> {
    return R.ok(await this.service.listTableColumns(table))
  }
}
