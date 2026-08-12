# Tasks: business-form-table

## 1. 后端：表单定义类型扩展（form-definition）

- [ ] 1.1 `FormDefinition` 实体新增 `type`（VARCHAR(20)，默认 WORKFLOW）与 `columnConfig`（JSON）字段，含 getter/setter
- [ ] 1.2 新增 Flyway 迁移脚本：`wf_form_def` 表加 `type VARCHAR(20) NOT NULL DEFAULT 'WORKFLOW'` 与 `column_config JSON NULL` 列
- [ ] 1.3 DTO 同步：`FormDefinitionDTO`/`FormDefinitionDetailDTO` 加 `type` 字段、DetailDTO 加 `columnConfig`；`FormDefinitionSaveRequest` 支持 `columnConfig`
- [ ] 1.4 `FormDefinitionService.create()` 接受 `type` 参数（默认 WORKFLOW）；`list()` 支持 `type` 筛选参数
- [ ] 1.5 `FormDefinitionController` create/list 接口透传 type 参数
- [ ] 1.6 单元测试：创建业务表单（type=BUSINESS）、默认 WORKFLOW、列表按 type 筛选

## 2. 后端：列映射与受控 DDL 引擎（business-form-data）

- [ ] 2.1 新增 `ColumnTypeMapper`：组件类型 → 列类型映射（VARCHAR/TEXT/INT/DECIMAL/DATE/DATETIME/TINYINT/JSON）+ 白名单校验（类型/长度/精度）
- [ ] 2.2 新增 `ColumnConfigDTO`/`ColumnConfig` 模型：key/label/columnType/length/scale/required/unique/indexed
- [ ] 2.3 新增 `DdlBuilder`：根据 column_config 生成 CREATE TABLE 与差异 ALTER 语句（ADD COLUMN / MODIFY COLUMN 加宽 / ADD INDEX / ADD UNIQUE INDEX (tenant_id, field)），列名正则白名单校验，禁止删列与类型跨类变更
- [ ] 2.4 新增 `DynamicTableManager`：建表（CREATE TABLE IF NOT EXISTS wf_biz_<formKey>，含 id/tenant_id/version/created_by/created_at/updated_at 固定列）、表信息查询（information_schema）、执行变更
- [ ] 2.5 单元测试：`DdlBuilder` 合法/非法列名、类型跨类变更拦截、CREATE/ALTER 语句正确性；`ColumnTypeMapper` 全组件映射

## 3. 后端：业务表单发布流程（form-definition + business-form-data）

- [ ] 3.1 `FormDefinitionService.publish()` 扩展：type=BUSINESS 时先校验 schema 不含子表/嵌套表单组件（存在则 400 提示移除），再调用 `DynamicTableManager` 建表/变更
- [ ] 3.2 发布过程加锁：对 form_def 行 `SELECT ... FOR UPDATE`（`@Lock(PESSIMISTIC_WRITE)` 或查询锁），防并发发布 DDL 竞态
- [ ] 3.3 结构变更随新版本记录审计（版本记录含 column_config 快照）
- [ ] 3.4 单元测试：发布业务表单建表成功、schema 含子表拒绝发布、重复发布增量变更（增列/改宽）、非法 column_config 拒绝发布

## 4. 后端：业务数据 CRUD API（business-form-data）

- [ ] 4.1 新增 `BizDataQueryBuilder`：动态 SELECT 生成（字段白名单、排序白名单、分页、tenant_id 强制过滤），全参数化
- [ ] 4.2 新增 `BizDataService`：新增（必填/唯一校验、写入 tenant_id）、分页查询（filter/keyword/sort）、详情、更新（乐观锁 version + 校验）、删除（tenant 范围限定）
- [ ] 4.3 新增 `BizDataController`：`POST/GET/GET{id}/PUT{id}/DELETE{id} /api/v1/biz-data/{formKey}`，表不存在 404、非法 formKey 400
- [ ] 4.4 新增 DTO：`BizDataSaveRequest`、`BizDataQueryRequest`、`BizDataVO`（含 version/createdAt/updatedAt）
- [ ] 4.5 单元测试：新增成功/缺必填/唯一冲突、分页筛选排序、非法排序字段 400、乐观锁冲突 409、跨租户访问 404、参数化 SQL 防注入（恶意字段名被拒）

## 5. 前端：表单类型与列映射确认（form-designer）

- [ ] 5.1 `api/form.ts`：FormDefinitionDTO 加 `type`、`columnConfig`；创建接口支持 type 参数
- [ ] 5.2 `FormListPage.vue`：新建表单时类型选择（工作流/业务）；列表加类型筛选（全部/工作流/业务）；业务表单行加"管理数据"按钮（跳转 /biz-data/{formKey}）
- [ ] 5.3 `FormDesigner.vue`：展示表单类型标识；发布 type=BUSINESS 表单前弹出列映射确认对话框（自动生成草案：字段/类型/长度/必填/唯一/索引，可编辑，跨类变更禁用，子表字段标记不支持）
- [ ] 5.4 列映射草案生成逻辑：schema 字段 → ColumnConfig 草案（映射规则与后端 ColumnTypeMapper 对齐），确认后随发布请求提交 column_config

## 6. 前端：业务数据管理页（business-form-data）

- [ ] 6.1 新增 `api/bizData.ts`：封装 biz-data CRUD 接口（list/detail/create/update/delete）与类型定义
- [ ] 6.2 新增 `BizDataListPage.vue`：通用数据表格——列由 column_config 动态生成（label/宽度），支持筛选器/排序/分页/关键词搜索；行内新增/编辑（弹窗复用 FormRenderer rule 直传）/删除（确认框）；表单标题与返回
- [ ] 6.3 路由：新增 `/biz-data/:formKey`（懒加载 BizDataListPage.vue），进入时按 formKey 加载表单定义取 column_config
