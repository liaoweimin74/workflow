# Tasks

## 1. 统一执行引擎（核心）

- [ ] 1.1 定义 `SqlAndParams` 中间产物（SQL + 参数绑定列表）供两模式共用
- [ ] 1.2 抽取统一执行器：复用 BizDataQueryBuilder 的分页（LIMIT/OFFSET + COUNT）/filter 白名单注入/ORDER BY/租户隔离逻辑，支持从 SqlAndParams 执行并返回 BizDataPageVO
- [ ] 1.3 统一执行器支持 sql 模式子查询包裹（`SELECT * FROM (管理员SQL) _qs WHERE <filter> ORDER BY <sort> LIMIT <size> OFFSET <offset>`）与基于包裹结果集的 COUNT
- [ ] 1.4 单测：统一执行器对 config/sql 两种产物的分页/排序/筛选/租户注入正确性

## 2. JoinSqlGenerator（config 模式）

- [ ] 2.1 实现 JoinSqlGenerator：将 joins[] 翻译为 LEFT JOIN（dataPicker JSON 外键 → JSON_UNQUOTE(JSON_EXTRACT(...)) 匹配）+ 虚拟列 SELECT
- [ ] 2.2 支持多 JOIN 链（多 join 顺序、列名去重、别名冲突规避）
- [ ] 2.3 保存校验：targetFormKey 对应表单存在、virtualKey 唯一
- [ ] 2.4 单测：单 JOIN / 多 JOIN / 关联排序 / 关联筛选的 SQL 生成与结果正确性

## 3. SqlTemplateEngine + SqlTemplateValidator（sql 模式）

- [ ] 3.1 实现 SqlTemplateValidator：仅允许 SELECT、必须含 `:tenantId`、columns 与 SELECT 输出别名匹配
- [ ] 3.2 实现 SqlTemplateEngine：管理员 SQL 作为子查询包裹，columns 白名单内注入 filter/sort/分页，tenantId 强制绑定
- [ ] 3.3 query 非空校验、columns 至少一个可排序列校验
- [ ] 3.4 单测：非 SELECT / 缺 tenantId / 声明列不匹配被拒；分页筛选排序正确；COUNT 语义（含聚合场景）锁定

## 4. FORM 数据源 queryMode 分流与 metadata 虚拟列

- [ ] 4.1 UnifiedDataSourceAdapter / BizDataSupport query 路径按 params.queryMode 分流到统一引擎
- [ ] 4.2 metadata：config 模式从 joins 推导虚拟列（virtualKey/label/columnType/sortable/filterable）并入 column_config；sql 模式从 columns 映射，与主表列一起返回
- [ ] 4.3 filter/sort 白名单扩展：config 模式 virtualKey + sql 模式 columns 纳入
- [ ] 4.4 集成测试：FORM 数据源 config/sql 模式的 metadata 与 query 端到端（含关联排序/筛选/分页）

## 5. FORM 数据源 params 开放 JOIN/SQL 编辑（后端）

- [ ] 5.1 DataSourceDefinitionService 支持 FORM 数据源查询配置段（queryMode/joins/query/columns）校验与保存，CRUD 接口 params 段保持不变
- [ ] 5.2 查询配置合法性校验（config targetFormKey/virtualKey；sql SELECT/tenantId/columns）接入保存流程
- [ ] 5.3 后端测试：FORM 数据源 JOIN/SQL 配置保存校验 + 非法配置 400

## 6. 前端（数据源管理页 JOIN/SQL 配置入口）

- [ ] 6.1 DataSourceListPage 为 FORM 数据源增加「关联查询配置」编辑区（queryMode 选择 + config joins 编辑 / sql query+columns 编辑）
- [ ] 6.2 config 模式 UI：targetFormKey 下拉（enabled 数据源表单）、localField/foreignField/joinField 下拉、virtualKey/label/sortable/filterable 配置、多 JOIN 增删
- [ ] 6.3 sql 模式 UI：query 文本域 + columns 声明编辑（key/label/columnType/sortable/filterable）
- [ ] 6.4 保存时提交 queryMode + 配置到 params；查询侧（BizDataListPage/PageDataTable）零改动验证虚拟列自动渲染与排序/筛选

## 7. 文档与迁移

- [ ] 7.1 更新 data-source 相关设计/文档说明 JOIN/SQL 双模式与「查看生成 SQL」迁移路径
- [ ] 7.2 向后兼容验证：现有无 queryMode 数据源行为不变
