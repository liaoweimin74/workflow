import { Module } from '@nestjs/common'
import { SystemModule } from '../system/system.module'
import {
  DataSourceController,
  DbSchemaController,
} from './datasource/controller/data-source.controller'
import { DataSourceRepository } from './datasource/repository/data-source.repository'
import { DataSourceService, DATA_SOURCE_ADAPTERS } from './datasource/service/data-source.service'
import { DataSourceWriteService } from './datasource/service/data-source-write.service'
import { UnifiedDataSourceAdapter } from './datasource/adapter/unified-data-source-adapter'
import { InternalDataSourceRouter } from './datasource/internal-data-source-router'
import { WorkflowFormDataQueryService } from './datasource/workflow-form-data-query.service'
import { BizDataController } from './form/controller/biz-data.controller'
import { FormDataController } from './form/controller/form-data.controller'
import { FormDefinitionController } from './form/controller/form-definition.controller'
import { BizDataRepository } from './form/bizdata/biz-data.repository'
import { BizDataService } from './form/bizdata/biz-data.service'
import { BizDataSupport } from './form/bizdata/biz-data-support'
import { SqlMetadataProbe } from './form/bizdata/sql-metadata-probe'
import { SqlQueryEngine } from './form/bizdata/sql-query-engine'
import { ApiMetadataProbe } from './form/bizdata/api-metadata-probe'
import { HttpLogicExecutor } from './logic/http-logic-executor'
import { BackendLogicExecutor } from './logic/backend-logic-executor'
import { BackendLogicHook } from './logic/backend-logic-hook'
import { FormDataService } from './form/form-data.service'
import { FormDefinitionWriteService } from './form/form-definition-write.service'
import { DynamicTableManager } from './form/column/dynamic-table-manager'
import { FormDataRepository } from './form/repository/form-data.repository'
import { FormDefinitionRepository } from './form/repository/form-definition.repository'
import { FormDefinitionService } from './form/service/form-definition.service'
import { PageAccessGuard } from './page/page-access.guard'
import { PageValidator } from './page/page-validator'
import { ViewCompiler } from './page/view-compiler'
import { PageDefinitionController } from './page/controller/page-definition.controller'
import { PageDefinitionRepository } from './page/repository/page-definition.repository'
import { PageMenuRepository } from './page/repository/page-menu.repository'
import { PageDefinitionService } from './page/service/page-definition.service'
import { CategoryController } from './process/controller/category.controller'
import { CategoryService } from './process/category.service'
import { CategoryRepository } from './process/repository/category.repository'
import { ProcessDefinitionController } from './process/controller/process-definition.controller'
import { ProcessDesignController } from './process/controller/process-design.controller'
import { ProcessInstanceController } from './process/controller/process-instance.controller'
import { ProcessDesignService } from './process/process-design.service'
import { ProcessDesignRepository } from './process/repository/process-design.repository'
import { EnginePersistence } from './runtime/engine-persistence'
import { ProcessInstanceService } from './runtime/process-instance.service'
import { TaskController } from './task/controller/task.controller'
import { TaskService } from './task/task.service'

/**
 * 引擎模块（对齐 Java `com.workflow.engine`）。
 *
 * 依赖方向：engine → system / framework → common（由 eslint 边界规则强制）。
 * engine 不得依赖 api 层。
 *
 * 说明：数据源（datasource）、页面（page）、表单（form）三个子域在 Java 侧
 * 也位于 `com.workflow.engine.*` 下（它们是引擎的建模能力，不是独立业务模块），
 * 因此这里同样挂在 EngineModule 里，而不是各自新建 Nest 模块。
 * 等某个子域长出独立的运行期依赖时再拆。
 */
@Module({
  // ⚠️ SYSTEM 数据源的适配器分支要用 `SystemService`（部门树 / 用户列表）——
  //    依赖方向 engine → system 是允许的（见类注释）；SystemModule 不依赖 engine，无环。
  imports: [SystemModule],
  controllers: [
    ProcessDesignController,
    ProcessDefinitionController,
    ProcessInstanceController,
    TaskController,
    DataSourceController,
    DbSchemaController,
    PageDefinitionController,
    FormDefinitionController,
    BizDataController,
    FormDataController,
    CategoryController,
  ],
  providers: [
    ProcessDesignRepository,
    ProcessDesignService,
    EnginePersistence,
    ProcessInstanceService,
    TaskService,
    DataSourceRepository,
    DataSourceService,
    DataSourceWriteService,
    UnifiedDataSourceAdapter,
    InternalDataSourceRouter,
    WorkflowFormDataQueryService,
    {
      // 适配器以数组形式注入 DataSourceService，形状对齐 Java 的 List<DataSourceAdapter>
      provide: DATA_SOURCE_ADAPTERS,
      useFactory: (adapter: UnifiedDataSourceAdapter) => [adapter],
      inject: [UnifiedDataSourceAdapter],
    },
    PageDefinitionRepository,
    PageMenuRepository,
    PageValidator,
    ViewCompiler,
    PageDefinitionService,
    PageAccessGuard,
    FormDefinitionRepository,
    FormDefinitionService,
    BizDataRepository,
    BizDataSupport,
    SqlMetadataProbe,
    SqlQueryEngine,
    ApiMetadataProbe,
    HttpLogicExecutor,
    BackendLogicExecutor,
    BackendLogicHook,
    BizDataService,
    FormDataRepository,
    FormDataService,
    FormDefinitionWriteService,
    DynamicTableManager,
    CategoryRepository,
    CategoryService,
  ],
  exports: [
    ProcessDesignService,
    ProcessDesignRepository,
    EnginePersistence,
    ProcessInstanceService,
    TaskService,
    DataSourceService,
    PageDefinitionService,
    FormDefinitionService,
    FormDefinitionWriteService,
    BizDataService,
    BizDataSupport,
  ],
})
export class EngineModule {}
