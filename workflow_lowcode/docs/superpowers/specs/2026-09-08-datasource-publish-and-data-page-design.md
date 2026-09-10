# Design: 数据源保存即发布 + 数据源数据管理页

## 背景与目标

1. 手动创建的数据源（API/SQL）当前保存为 DRAFT，需额外"启用"才能被页面使用；发布后无法编辑。改为**保存即发布（ENABLED）**，且发布状态可直接编辑，**移除启用/禁用按钮**。
2. 数据源列表（除 WORKFLOW 外：FORM/SYSTEM/API/SQL）新增**「数据管理」入口**：跳转到独立数据管理页，按数据源经 adapter SPI 渲染 SearchTable 查询数据；绑定了主表单（formKey）的数据源通过表单 schema 实现 CRUD。

## 关键现状（探索结论）

- 后端 `DataSourceDefinitionService.create` 对所有手动类型置 `DRAFT`（L118）；`enable/disable` 存在；`delete` 仅 DRAFT 可删（L217-222）。
- FORM/WORKFLOW 由表单事件自动创建（`DataSourceSyncListener` 直接 `ENABLED`）；SYSTEM 由初始化器创建。
- 前端 `DataSourceListPage` 行操作：查看/启用/禁用/编辑/删除；启用按钮 `show: type∈{API,SQL} && status≠ENABLED`；禁用按钮 `show: status===ENABLED`。
- 页面（`PageDefinition.dataSourceId`）经 `ViewDataSourceMigrator` 绑定数据源；`PageValidator` 校验时按 dataSourceId 调 `dsService.metadata`。
- `PageDataTable`（page/:pageKey 内）具备完整"按数据源 CRUD"逻辑：`loadMetadata`（列/writable/formKey）、`loadFormSchema`（表单 schema + 选项数据源）、`buildFormRule`（列映射回退）、`formConfig`（create/update/delete/get Api 全走 `/data-sources/{id}/data`）。但深度耦合页面 schema（viewActions/actionBus/事件链/列配置）。
- `SearchTable`：`formConfig` 存在时经 `getDefaultActions()` 自动出新增/编辑/删除按钮（L417-440）；`formConfig=undefined` 则纯列表。
- API/SQL 已在「业务表单」列支持可选绑定 formKey；后端 `apiMetadata`/`metadata(API)` 透传 formKey。
- 路由：`data-source/list` 已存在（AdminLayout 子路由）。

## 设计决策

### D1: API/SQL 保存即发布

- `DataSourceDefinitionService.create`：API/SQL 类型创建后直接 `ENABLED`（原 DRAFT）。创建时已执行 validateRequiredFields 与（API）params 校验——保证创建成功即配置完整、可发布。
- FORM/WORKFLOW/SYSTEM 创建路径不变（系统自动，本就 ENABLED）。
- 其余类型仍 DRAFT？不——手动创建仅 API/SQL 两个类型（新建 radio 仅这两项），无其它手动入口；`create` 对非 API/SQL 类型保留 DRAFT 现状（防御性，不应发生）。
- `enable/disable` Service 方法保留（未来/兼容），但**前端不再暴露启用/禁用按钮**。

### D2: 发布状态可编辑 + 删除放开（带引用保护）

- **编辑**：ENABLED 数据源可编辑（后端 `update` 已允许非 bindChanged 编辑；改 type/formKey 时保留重校验）。前端编辑按钮已对 API/SQL 显示，不变。
- **删除**：原"仅 DRAFT 可删"对保存即发布的 API/SQL 不再适用。放开为：**ENABLED/DISABLED/DRAFT 均可删**，但删除前校验**未被页面引用**：
  - 新增 `PageDefinitionRepository.countByTenantIdAndDataSourceId`（或等价查询）
  - `DataSourceDefinitionService.delete`：先查引用，`> 0` → 400「数据源已被 N 个页面引用，无法删除」。
  - 被引用的页面因 `PageValidator` 在发布/渲染时按 dataSourceId 取 metadata，删除已引用数据源会破坏页面 → 必须拦截。
  - 删除确认弹窗保留（前端已有）。

### D3: 数据管理入口（按钮 + 路由）

- **路由**：AdminLayout 子路由新增 `data-source/:id/data` → name `DataSourceData`，组件 `@/views/dataSource/DataSourceDataPage.vue`，meta.title「数据源数据管理」。
- **按钮**：数据源列表行操作新增「数据管理」（icon `Grid`，`permission: data-source:manage`）：
  - `show: (row) => row.type !== 'WORKFLOW'`（FORM/SYSTEM/API/SQL 显示）
  - onClick：`router.push({ name: 'DataSourceData', params: { id: row.id } })`
  - 位置：查看之后、编辑之前。
- **数据管理页骨架**：
  - 页头：返回按钮 + 数据源名称/类型/状态标签（参考 `BizDataListPage`）
  - `onMounted` 并行：`getDataSource(id)`（名称/类型/状态）、`useDataSourceCrud(id)` 内部 `getMetadata`
  - 主体：`SearchTable`（`merge-default-actions` 默认 true）+ `formConfig`（来自 composable）
  - 只读数据源（SYSTEM / 未绑表单的 API/SQL：`metadata.writable=false`）→ `formConfig=undefined` → SearchTable 无操作按钮、纯列表展示
  - 绑表单数据源（FORM / 绑了 formKey 的 API/SQL：`writable=true`）→ 表单 schema 弹窗 CRUD

### D4: `useDataSourceCrud` composable（消除与 PageDataTable 的重复）

抽离 PageDataTable 的"按数据源 CRUD"核心为共享 composable，供数据管理页与 PageDataTable 复用：

- 文件：`frontend/src/composables/useDataSourceCrud.ts`
- 入参：`refId: Ref<string> | string`（数据源全局 id）
- 返回：`metaLoaded / metaColumns / writable / formKey / formSchemaRule / formDataSources / formRules / formConfig / loadFormSchema / refresh`
- 逻辑迁移自 PageDataTable L959-998（loadMetadata）、L636-657（loadFormSchema）、L625-633（buildFormRule）、L667-688（formConfig）：
  - `loadMetadata`：`dataSourceApi.getMetadata(refId)` → writable/formKey/metaColumns → `loadFormSchema()`
  - `loadFormSchema`：formKey 非空 → `formApi.getFormDefinitionByKey` → 规则/选项数据源解析（`hasOptionDatasource`/`resolveOptionRules`）
  - `buildFormRule`：列映射回退（componentType/columnType → 基础组件 + required 校验）
  - `formConfig`：writable=false 返回 undefined；否则组装 create/update/delete/get Api（`dataSourceApi.createData/updateData/deleteData/getData`，经 adapter 端点）
- PageDataTable 改为内部调用该 composable（删除内联实现，行为不变）；DataSourceDataPage 直接使用。
- 依赖：`dataSourceApi`、`formApi`、`option-datasource` 工具。纯前端、无后端耦合。

## 数据流

```
数据源列表(DataSourceListPage)
  └─「数据管理」按钮(非 WORKFLOW) → router.push /data-source/:id/data
       └─ DataSourceDataPage
            ├─ getDataSource(id) → 页头名称/类型/状态
            └─ useDataSourceCrud(id)
                 ├─ getMetadata(id) → metaColumns/writable/formKey → loadFormSchema
                 ├─ formConfig (undefined if !writable)
                 └─ SearchTable
                      ├─ fetchApi → dataSourceApi.queryData(id, ...)
                      ├─ columns = metaColumns（或表单 schema 关联）
                      └─ formConfig → 新增/编辑/删除/查看（表单 schema 或列映射）
```

## 影响面

### 后端
- `DataSourceDefinitionService.java`：
  - `create`：API/SQL → `STATUS_ENABLED`
  - `delete`：放开状态限制 + 页面引用检查（注入 `PageDefinitionRepository`）
- `PageDefinitionRepository.java`：新增 `countByTenantIdAndDataSourceId(String tenantId, String dataSourceId)`
- 测试：`DataSourceDefinitionServiceTest`（create_success 状态断言更新 ENABLED；delete 放开 + 引用拦截新用例；`PageDefinitionRepository` mock）

### 前端
- `frontend/src/views/dataSource/DataSourceListPage.vue`：
  - 移除「启用」「禁用」按钮（及 enableDataSource/disableDataSource 调用）
  - 新增「数据管理」按钮 → router.push
- `frontend/src/views/dataSource/DataSourceDataPage.vue`：新建（页头 + SearchTable + useDataSourceCrud）
- `frontend/src/composables/useDataSourceCrud.ts`：新建
- `frontend/src/views/page/components/PageDataTable.vue`：改用 useDataSourceCrud（删内联实现，行为不变）
- `frontend/src/router/index.ts`：新增 `data-source/:id/data` 路由

### 测试（前端）
- `DataSourceDataPage.test.ts`：metadata 加载渲染列；writable=false 无操作按钮/无新增；绑表单 formConfig 含 CRUD Api；WORKFLOW 无入口（按钮层测）
- `useDataSourceCrud.test.ts`：loadFormSchema 表单/列映射回退分支（若可独立挂载测试；否则由 DataSourceDataPage/PageDataTable 既有测试覆盖）
- `DataSourceListPage.test.ts`：更新按钮断言（启用/禁用移除、数据管理存在、show 非 WORKFLOW、点击跳转）
- `PageDataTable` 既有测试：确保抽 composable 后行为不回归

## 明确不做（YAGNI）
- 不做 WORKFLOW 数据源数据管理入口（只读跨实例聚合，从流程中心/实例管理查看）
- 不给数据管理页做批量操作、导入导出、自定义列显隐（非本次需求）
- 不改造 BizDataListPage（表单侧专用入口保留；数据源侧走新页，两者并存）
- 不引入"禁用"作为删除前置
- enable/disable Service 方法与 Controller 端点保留但前端不暴露（向后兼容系统内部/未来使用）

## 风险
- PageDataTable 抽 composable 回归风险 → 依赖其既有 43 处页面调用与测试兜底，行为保持不变
- delete 放开后误删引用数据源 → 引用计数拦截（核心防线）；被引页面在数据源删除后设计器打开报错属预期
- create 直接 ENABLED 后，若校验遗漏可产生半成品已发布 → create 已含 validateRequiredFields + API params 校验，且 FORM/WORKFLOW/SYSTEM 非手动入口，风险低
