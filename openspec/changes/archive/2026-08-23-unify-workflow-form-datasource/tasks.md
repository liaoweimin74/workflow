## 1. WORKFLOW 数据源 SPI 接入（workflow-form-datasource）

- [x] 1.1 新增 `FormSchemaColumnExtractor` 组件：解析 FormDefinition schema（form-create rule JSON）→ List&lt;ColumnConfig&gt;（field→key、title→label、组件类型映射列类型：数字→INT/DECIMAL、日期→DATE/DATETIME、其余 VARCHAR；子表/文件字段跳过），含全分支单元测试
- [x] 1.2 新增 WORKFLOW 表单数据查询服务（engine/form 或 engine/datasource 下）：按 key 聚合全部版本 formDefId 的 wf_form_data 非快照记录（processInstanceId IS NOT NULL），行组装 = 5 系统列 + dataJson 按最新 PUBLISHED schema 展开（缺失空值/多余忽略）；filter/keyword 经 MySQL JSON_EXTRACT 等值/LIKE；排序仅支持 startTime/created_at；分页 limit/offset
- [x] 1.3 `UnifiedDataSourceAdapter` 增加 WORKFLOW 分支：supports() 放行；metadata = 系统列 + FormSchemaColumnExtractor 结果且 writable=false；query/get 委托 1.2 服务；create/update/delete 抛 BusinessException(400)；扩展 UnifiedDataSourceAdapterTest 全分支用例
- [x] 1.4 `DataSourceDefinitionService.enable()` 增加 WORKFLOW 校验：表单存在、最新版 PUBLISHED、type != BUSINESS；补对应测试
- [x] 1.5 ~~`InternalDataSourceRouter` 配置 WORKFLOW 仅放行 list/get，写操作拒绝路径测试~~ — **不适用（设计变更）**：WORKFLOW 数据源经 SPI 直连（UnifiedDataSourceAdapter WORKFLOW 分支不调用 router.resolve），写操作拒绝由 adapter 层抛 BusinessException(400) 保证，不经 internal 路由
- [x] 1.6 数据源管理页前端支持 WORKFLOW 类型：类型下拉新增选项、选择时表单联动过滤为已发布非 BUSINESS 表单 — **注**：合并 datasource-auto-creation 后按用户指令演进为「WORKFLOW 由系统自动创建（表单发布时），数据源管理页仅 API 类型可手动增删改」
- [ ] 1.7 后端集成测试：发起流程产生多条实例表单数据 → 创建并启用 WORKFLOW 数据源 → query 断言系统列+字段展开+筛选正确 — **待环境验证**（需运行后端+数据库发起流程实例）

## 2. VIEW 轨切换数据源绑定（view-datasource-binding）

- [x] 2.1 `PageDefinition` 实体与 DDL 新增 dataSource_id 列（formKey 保留不删）；PageDefinitionDTO/save request 同步
- [x] 2.2 `PageValidator.validateForPublish(VIEW)` 改造：dataSourceId 必填 + 数据源 ENABLED + searchFields/columns 引用列存在于 metadata.columns；大字段禁筛仅对 columnType∈{JSON,TEXT,LONGTEXT} 生效；改造 PageValidatorTest
- [x] 2.3 `PageQueryController.query()` 改造：解析 page.dataSourceId → dsService.queryData()，删除 BizDataService 直连依赖；searchFields 白名单过滤保留；改造 PageQueryControllerTest — **注**：与 plan.md:322 一致保留兼容兜底（dataSourceId 为空且 formKey 非空 → 遗留 BizDataService 路径，供迁移被跳过的页）
- [x] 2.4 前端 ViewDesigner.vue：绑定区从"选已发布业务表单"改为"选已启用数据源"（getEnabledDataSources 四类任选），选中后 getMetadata 拉候选列填充 searchFields/columns 配置
- [x] 2.5 前端 PageRenderer.vue 详情弹窗双轨：type=FORM 反查 formKey 渲染 FormRenderer 只读详情，其余类型只读 KV 列表
- [x] 2.6 前端 PageRenderer.vue 写操作按钮按 metadata.writable 显隐：open-create/edit/delete 仅 writable=true 渲染，只读保留 open-detail/open-link/refresh/export

## 3. 存量自动迁移（view-datasource-migration）

- [x] 3.1 新增迁移 ApplicationRunner：扫描 type=VIEW 且 formKey 非空且 dataSourceId 为空的页面；按命名约定复用或创建 FORM 数据源（直接 ENABLED，前提 PUBLISHED+BUSINESS）；回填 dataSourceId；幂等
- [x] 3.2 迁移健壮性：不满足条件的页面跳过并记警告日志；逐页面独立事务，单页失败不影响其他页面与应用启动
- [x] 3.3 迁移器单元测试：幂等重跑、多视图共享 formKey 复用单一数据源、未发布表单跳过、单页失败隔离四场景

## 4. 端到端验证与收尾

- [ ] 4.1 验收场景一（新能力）：建工作流表单+流程并发起多条实例 → 建 WORKFLOW 数据源启用 → 视图设计器绑定配列表发布 → 渲染页跨实例列表展示+筛选可用+详情 KV+无写按钮 — **待环境验证**
- [ ] 4.2 验收场景二（回归）：存量 FORM 视图经迁移后渲染/筛选/详情表单渲染/编辑删除行为不变 — **待环境验证**
- [x] 4.3 全量构建验证：backend mvn test 通过、frontend build 通过；更新 docs/features.md 数据源管理条目（WORKFLOW 类型）
