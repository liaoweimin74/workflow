# Tasks: business-form-subtable-column-mapping

## 1. 后端：数据模型与 DDL 层

- [ ] 1.1 `ColumnConfig.java` 增加 `subColumns`（List<ColumnConfig>）与 `subMode`（String，缺省 embedded）字段及 getter/setter
- [ ] 1.2 `DdlBuilder.java` 新增 `buildCreateSubTable(formKey, field, subColumns)` 生成子表建表 SQL（固定列 id/biz_id/tenant_id/sort_no/version/时间列 + 子业务列 + (tenant_id, biz_id) 索引）
- [ ] 1.3 `DdlBuilder.java` 新增 `buildAlterSubTable(formKey, field, desired, existing)` 生成子表差异变更 SQL（复用主表规则：增列/改宽/改必填/加索引，禁删列/禁跨类）
- [ ] 1.4 `DdlBuilder.java` `validateColumns` 递归校验 `subColumns`（列名/类型/长度白名单复用现有逻辑）
- [ ] 1.5 `DynamicTableManager.java` 新增 `ensureSubTable(formKey, field, subColumns)`（表不存在→建表；存在→差异变更），复用 `tableExists`/`findTableColumns`
- [ ] 1.6 新增 `DdlBuilderTest` 子表用例：建表 SQL 断言、非法子表字段名、子表列白名单、禁删列/禁跨类
- [ ] 1.7 新增 `DynamicTableManagerTest` 子表用例：新建子表、差异变更、结构不变跳过

## 2. 后端：发布校验与流程

- [ ] 2.1 `ColumnTypeMapper.java`：`UNSUPPORTED_COMPONENTS` 移除 subTable/SubTable/nestedForm/NestedForm/dataTable；`mapComponentToColumn` 对 `subForm` 返回 JSON 列，`group`/`tableForm` 返回 null（由上层子表逻辑处理，不落入主表列）
- [ ] 2.2 `FormDefinitionService.java`：`UNSUPPORTED_COMPONENTS` 同步修正（移除子表类型，保留 userPicker/deptPicker/divider/groupContainer）；`validateBusinessSchema` 改为允许 group/tableForm/subForm
- [ ] 2.3 `FormDefinitionService.publish()`：`parseColumnConfig` 支持嵌套 subColumns 解析；BUSINESS 分支在 `ensureTable` 后遍历子表字段调用 `ensureSubTable`
- [ ] 2.4 新增/更新 `FormDefinitionPublishBusinessTest`：发布含 group 子表（创建主表+子表）、发布含 subForm（仅 JSON 列）、发布含 userPicker（400）、子表字段非法（400 且无 DDL）
- [ ] 2.5 更新 `ColumnTypeMapperTest`：subTable/nestedForm 断言移除或改为新语义（group/tableForm→null 用于子表分支、subForm→JSON）

## 3. 后端：BizDataService 子表 CRUD

- [ ] 3.1 `BizDataContext`/`loadContext` 增加子表列映射解析（subColumns + subMode + 子表表名）
- [ ] 3.2 `BizDataService.create`：写入主表后遍历请求中的子表字段批量插入子表行（biz_id=主表新 id，sort_no=数组序号，逐行生成 id）
- [ ] 3.3 `BizDataService.update`：对请求携带的子表字段执行增量 diff（库中存在而请求缺失→DELETE；有 id 且存在→比较列值 UPDATE + 重排 sort_no；无 id 或不在库→INSERT）；未携带的子表字段不处理
- [ ] 3.4 `BizDataService.getById`：subMode=embedded 时按 biz_id 批量 IN 查子表行组装数组返回（sort_no 升序）；dedicated 时不内嵌
- [ ] 3.5 `BizDataService.delete`：删除主表行后同事务级联删除全部子表行
- [ ] 3.6 子表行数上限校验（默认 100，超限 400）
- [ ] 3.7 新增独立子表行 CRUD 接口：`BizDataController` 增加 GET/POST/PUT/DELETE `/api/v1/biz-data/{formKey}/{id}/sub/{field}[/{rowId}]`（租户隔离、主表行 404、乐观锁 409、必填/类型校验复用）
- [ ] 3.8 新增/更新 `BizDataServiceTest`/`BizDataHandlerTest`：create 批量插入、update diff（增/删/改）、未携带不变、级联删除、行数超限、独立接口各场景

## 4. 前端：列映射 UI

- [ ] 4.1 `ColumnConfigDialog.vue`：`UNSUPPORTED_TYPES` 移除 subTable/SubTable/nestedForm/NestedForm/dataTable，保留 divider/groupContainer 等；`collectFields` 对 group/tableForm 生成子表配置项（key/label + 可展开子列），subForm 映射 JSON 列
- [ ] 4.2 `ColumnConfigDialog.vue` 子表配置 UI：子表字段行可展开，展示子列映射控件（复用现有列映射行：类型/长度/必填/唯一/索引）+ 传输方式选择（内嵌/独立接口）
- [ ] 4.3 `ColumnConfigDialog.vue` `handleConfirm`：子表字段输出 `subColumns` + `subMode`，过滤逻辑适配嵌套
- [ ] 4.4 更新 `ColumnConfigItem` 接口类型定义（subColumns/subMode 可选字段）

## 5. 端到端验证

- [ ] 5.1 手工验证：设计器配置含 group 子表的 BUSINESS 表单 → 发布成功 → 主表+子表建表（SQL 检查）
- [ ] 5.2 手工验证：POST 主表带子表行 → GET 内嵌返回 → PUT 增量 diff（增/删/改）→ DELETE 级联清空
- [ ] 5.3 手工验证：subMode=dedicated 表单走独立子表接口 CRUD；subForm 表单值落 JSON 列
- [ ] 5.4 回归：既有无子表 BUSINESS 表单发布/CRUD 行为不变；WORKFLOW 表单子表能力不受影响
