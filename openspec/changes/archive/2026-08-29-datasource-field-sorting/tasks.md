# datasource-field-sorting Tasks

## 1. 后端：排序能力推导与 metadata 声明

- [x] 1.1 `ColumnConfig.java` 增加 `sortable` 字段（Boolean，缺省 null=未推导），含 getter/setter
- [x] 1.2 新增 `SortableResolver` 推导工具：按列类型计算 sortable（JSON/TEXT/colorPicker/含 subColumns → false；数值/日期/短文本/VARCHAR → true），提供 `resolve(List<ColumnConfig>)`
- [x] 1.3 `UnifiedDataSourceAdapter.metadata` 填充 sortable：FORM 按 `getBusinessColumnsByKey` 推导，WORKFLOW 按 `columnsFor` 推导，SYSTEM/API 返回 false
- [x] 1.4 `WorkflowFormDataQueryService` 系统列 sortable 声明：`startTime`=true（映射 `h.START_TIME_`），`instanceId`/`processStatus`/`initiatorName`/`currentNodeName`=false

## 2. 后端：WORKFLOW 数据源动态排序

- [x] 2.1 `WorkflowFormDataQueryService.query` 解析 `req.getSort()/getOrder()`：sort 字段白名单校验（businessColumns key ∪ 可排系统列映射表，非法 400），order 仅接受 asc/desc（非法回退默认）
- [x] 2.2 动态 ORDER BY 拼接：业务列 `JSON_UNQUOTE(JSON_EXTRACT(f.data_json,'$.<key>'))`，数值列（INT/DECIMAL）`CAST(... AS SIGNED/DECIMAL)`；系统列 startTime 用 `h.START_TIME_`；缺省保持 `COALESCE(h.START_TIME_, f.created_at) DESC`
- [x] 2.3 `WorkflowFormDataQueryServiceTest` 新增排序用例：白名单拒绝（非表单字段/派生列）/ 数值列 CAST 排序 / startTime 映射 / 缺省排序保持

## 3. 后端：FORM 路径白名单对齐

- [x] 3.1 确认 `BizDataQueryBuilder.buildSelect` 的 `validateColumn` 排序白名单基于 column_keys，与 SortableResolver 推导来源一致（column_config），不一致则对齐
- [x] 3.2 `BizDataQueryBuilderTest` 补排序白名单用例（若已有则确认覆盖）

## 4. 前端：SearchTable 内部排序状态

- [x] 4.1 `SearchTable.vue` 新增 `sortState` 状态：`@sort-change` 写入 `{prop, order}` 并照常 `emit('sort-change')`，然后 `fetchList()`
- [x] 4.2 `fetchList()` 将 `sortState` 合并进 `props.fetchApi` params（order 归一化 ascending/descending → asc/desc）
- [x] 4.3 `handleReset()` 清空 `sortState` 恢复默认排序
- [x] 4.4 SearchTable 排序状态单测：点排序后重新请求携带 sort/order；翻页保留；重置清空

## 5. 前端：列表页透传与列能力合并

- [x] 5.1 `ColumnConfigItem`（`@/api/bizData`）增加 `sortable?: boolean`
- [x] 5.2 `PageRenderer.vue`（VIEW）：`searchTableColumns` 渲染时合并 `dataSourceMeta.columns` 的 sortable（schema 列命中可排列 → sortable:true）；`searchTableFetchApi` 透传 sort/order
- [x] 5.3 `PageDataTable.vue`（PAGE）：列 sortable 取 `metaColumns` 的 sortable；`fetchApi` 透传 sort/order
- [x] 5.4 `BizDataListPage.vue`：列 sortable 按 column_config 类型前端推导（抽取/复用与 filterable 同源规则）；`fetchApi` 透传 sort/order
- [x] 5.5 前端单测：PageRenderer 列 sortable 合并用例

## 6. 前端：ViewDesigner 移除排序开关

- [x] 6.1 `ColumnsConfig.vue` 移除"排序"列与 `sortableOf`/`setProp('sortable')` 逻辑
- [x] 6.2 `QueryColumnsConfig.vue` 同步移除排序相关渲染（若复用 ColumnsConfig 则一并生效）
- [x] 6.3 `ColumnViewConfig.sortable` 字段标记废弃（注释说明由数据源能力决定，历史残留忽略）

## 7. 验证

- [x] 7.1 后端编译通过 + `mvn test`（或项目等价命令）全绿
- [x] 7.2 前端 `npm run lint` + 相关单测通过

## 8. B1：视图级 sortableFields 配置（受数据源上限约束）

- [x] 8.1 `ViewCompiler` 编译 schema 顶层 `sortableFields` 进产物（引用列存在校验），移除 compileColumns 的列级 sortable 残留
- [x] 8.2 `ViewDesigner`：schema 增加 `sortableFields`；绑定数据源后从 metadata 加载可排字段作候选（候选仅含 sortable=true 字段）；提供"可排序字段"多选 UI（缺省跟随数据源全部可排字段）
- [x] 8.3 `PageRenderer`：parseSchema 读取产物 `sortableFields`；`searchTableColumns` 排序入口 = 列显示 ∧ metadata 可排 ∧ ∈ 视图 sortableFields
- [x] 8.4 `PageQueryController`：VIEW 路径校验 `req.sort` ∈ schema.sortableFields（声明非空时，非法 400）
- [x] 8.5 测试：ViewCompiler 编译 sortableFields + 引用校验；PageQueryController 排序白名单；PageRenderer 渲染收窄；ViewDesigner 候选受数据源上限约束

## 9. B1 组件级：页面/表单数据表格 sortableFields 配置（公共部分）

- [x] 9.1 `PageDataTable`：props 增加 `sortableFields?: string[]`；`resolvedColumns` 双条件 = metadata 可排 ∧ (sortableFields 空 或 包含该列)，未声明=跟随数据源全部可排字段
- [x] 9.2 `DsBindingConfigDialog`（table-mode，页面/表单共用）：tableData 增加 sortableFields；"显示列"tab 的 QueryColumnsConfig 接线 `v-model:sortable-fields` + `:sortable-candidates`（候选 = 绑定数据源 metadata 可排字段）；回填/保存 sortableFields；清理列级 sortable 残留
- [x] 9.3 测试：PageDataTable 收窄渲染（props.sortableFields 生效）；DsBindingConfigDialog table-mode 保存/回填 sortableFields

## 10. 分页配置（视图 + 数据表格，三项：showPagination/pageSize/pageSizes）

- [x] 10.1 `PageDataTable`：props 增加 `pageSize?: number`/`pageSizes?: number[]`，透传 SearchTable `:default-page-size`/`:page-sizes`/`:show-pagination`（pagination 已有）
- [x] 10.2 `DsBindingConfigDialog`（table-mode，公共）：tableData 增加 pagination/pageSize/pageSizes；"显示列"tab 旁加"分页"配置（开关 + 每页大小 + 可选页大小）；回填/保存
- [x] 10.3 `ViewCompiler`：编译 schema 顶层 `pagination: {show,pageSize,pageSizes}` 进产物（校验 pageSizes 合法）
- [x] 10.4 `PageRenderer`：parseSchema 读取产物 pagination → SearchTable `:show-pagination :default-page-size :page-sizes`（缺省跟随默认）
- [x] 10.5 `ViewDesigner`：schema 增加 pagination；"显示&查询"tab 加分页配置区（开关 + 每页大小 + 可选页大小）
- [x] 10.6 测试：PageDataTable 透传；DsBindingConfigDialog 回填/保存；ViewCompiler 编译；PageRenderer 传参
