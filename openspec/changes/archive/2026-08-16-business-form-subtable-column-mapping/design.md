# Design: BUSINESS 表单子表列映射

## Context

系统已具备 BUSINESS（物理表模型）表单能力：发布时基于 `column_config` 通过 `DynamicTableManager.ensureTable()` 创建/变更主表 `wf_biz_<formKey>`，`BizDataService` 提供 CRUD（乐观锁、租户隔离、必填/唯一校验、data-picker 引用解析）。

当前限制：`FormDefinitionService.validateBusinessSchema()` 与 `ColumnTypeMapper`（后端）、`ColumnConfigDialog`（前端）三处用 `UNSUPPORTED_COMPONENTS = {subTable, SubTable, nestedForm, NestedForm, dataTable}` 拒绝子表组件发布。该名单与实际 form-create 内置类型名（`group`/`tableForm`/`subForm`）不匹配，属历史遗留。

A 级 spike 已实测：form-create 三种子表组件在 WORKFLOW 表单全链路可用（设计/渲染/只读/数据往返，值均为数组快照）。本变更将同一能力扩展到 BUSINESS 表单，持久化到独立子表物理表（简道云式 1:N）。

约束：后端 Java 17 + Spring Boot + JdbcTemplate（无 ORM，动态 SQL）；前端 Vue3 + element-plus + form-create；DDL 全部经 `DdlBuilder` 白名单校验，禁拼接。

## Goals / Non-Goals

**Goals:**
- BUSINESS 表单支持 `group`/`tableForm` 子表组件发布，持久化为独立物理表 `wf_biz_<formKey>_<field>`（1:N，`biz_id` 关联主表行）。
- 主表 CRUD 默认内嵌子表数组 JSON 往返（一次请求拿全量）；同时提供独立子表行 CRUD 接口，传输方式由表单 column_config 中子表配置决定（可切换）。
- 子表行更新采用增量 diff：新增插入、删除删除、变化更新；`sort_no` 保序、行 id 稳定不漂移。
- 三处 `UNSUPPORTED_COMPONENTS` 名单同步修正：移除对 `group`/`tableForm`/`subForm` 的拦截，保留 `userPicker`/`deptPicker`/`divider`/`groupContainer` 等不可映射处理。
- 前端 `ColumnConfigDialog` 支持子表字段的子列映射配置（复用现有列映射 UI 与类型映射）。

**Non-Goals:**
- 子表内嵌套子表（仅一级子表）。
- 子表行的独立查询/筛选/统计/汇总（列表页聚合），留待后续迭代。
- WORKFLOW 表单数据存储改造（继续 dataJson JSON 快照，不受本变更影响）。
- `subForm`（单对象分组，无行概念）不映射独立表——其值序列化为 JSON 列存储（同 upload 组件处理）。
- 人员选择（userPicker/deptPicker）等不可映射组件的支持。

## Decisions

### D1：column_config 结构扩展（子表表达）

`ColumnConfig` 新增 `subColumns: List<ColumnConfig>` 与 `subMode: String` 字段（`@JsonIgnoreProperties(ignoreUnknown = true)` 保证向后兼容，旧 column_config 无此字段不受影响）：

- `subColumns == null/empty` → 普通列（现有行为不变）。
- `subColumns != null/empty` → 该 key 为子表字段：key=子表 field（同时作为子表表名后缀），subColumns 为子表内列映射（复用同一 ColumnConfig 结构与校验）。
- `subMode`：`"embedded"`（默认，内嵌 JSON 随主表往返）或 `"dedicated"`（独立子表 CRUD 接口）。

理由：复用现有 `ColumnTypeMapper` 映射、`DdlBuilder` 校验、Jackson 递归解析，不引入平行模型；Jackson 递归反序列化天然支持嵌套。

### D2：子表物理表结构

子表表名 `wf_biz_<formKey>_<field>`，`field` 通过 `DdlBuilder.COLUMN_KEY_PATTERN`（`^[a-zA-Z][a-zA-Z0-9_]{0,63}$`）白名单校验。固定列：

- `id VARCHAR(64)` PK（子表行 id，diff 依据，稳定不漂移）
- `biz_id VARCHAR(64)` NOT NULL（关联主表 id）
- `tenant_id VARCHAR(64)` NOT NULL
- 子表业务列（按 subColumns 生成，沿用 `columnDefinition()`）
- `sort_no INT NOT NULL DEFAULT 0`（行序，diff 时按数组序号重排）
- `version INT NOT NULL DEFAULT 1`、`created_by`、`created_at`、`updated_at`

索引：`UNIQUE KEY uk_<formKey>_<field>_biz (tenant_id, biz_id, id)`（或 `INDEX idx_..._biz (tenant_id, biz_id)` + PK 组合——design 定稿时取复合唯一约束保证租户内行唯一）。

### D3：DDL 生成与发布流程

`DdlBuilder` 新增 `buildCreateSubTable`/`buildAlterSubTable`（固定列 + 子业务列，约束规则与主表一致：仅增列/改宽/改必填/加索引，禁删列与类型跨类）。`DynamicTableManager.ensureTable` 增加子表重载，发布顺序：先主表后子表（同事务边界内依次执行，DDL 隐式提交特性与现状一致）。

`FormDefinitionService.publish()` 流程变为：`validateBusinessSchema`（不再拦子表）→ `validatePickerReferences` → `parseColumnConfig` → `ensureTable`（主表+子表）→ 状态更新。`validateColumns` 递归校验 subColumns。

### D4：BizDataService 子表读写

- **create**：写主表行后，若 data 含子表字段（数组），按数组批量插入子表行（`biz_id`=新主表 id，`sort_no`=数组序号，逐行生成新 id）。
- **update（增量 diff）**：主表乐观锁更新后，对请求携带的子表字段执行 diff：库中行 id 不在请求数组 → DELETE；请求行有 id 且在库中 → 比较各列 UPDATE（变化才更新，`sort_no` 按新序号）；无 id 或不在库中 → INSERT。请求未携带的子表字段 → 不处理（保持不变）。
- **getById**：`subMode=embedded`（默认）时按 `biz_id` 批量查子表行组装为数组返回；`dedicated` 时主表响应不含子表数据（由独立接口取）。
- **delete**：删除主表行时同事务级联删除所有子表行（`DELETE FROM wf_biz_<k>_<f> WHERE tenant_id=? AND biz_id=?`）。

实现：新增 `SubTableManager`（或 `BizDataService` 内私有方法）负责子表 diff/组装；子表行查询用批量 `IN` 避免 N+1。

### D5：独立子表 CRUD 接口

新增（`subMode=dedicated` 或二次开发直接调用）：

- `GET /api/v1/biz-data/{formKey}/{id}/sub/{field}` — 子表行列表（按 sort_no 升序）
- `POST /api/v1/biz-data/{formKey}/{id}/sub/{field}` — 追加一行
- `PUT /api/v1/biz-data/{formKey}/{id}/sub/{field}/{rowId}` — 更新一行（乐观锁 version）
- `DELETE /api/v1/biz-data/{formKey}/{id}/sub/{field}/{rowId}` — 删除一行

租户隔离、必填/类型校验复用 BizDataService 既有机制；主表行不存在 404。

### D6：校验名单三处同步修正

| 位置 | 改动 |
|---|---|
| `FormDefinitionService.UNSUPPORTED_COMPONENTS` | 移除 subTable/SubTable/nestedForm/NestedForm/dataTable（子表类型改走校验分支：group/tableForm → 子表，subForm → JSON 列） |
| `ColumnTypeMapper.mapComponentToColumn` | `group`/`tableForm` 不再返回 null（但列映射由上层子表逻辑处理，不落入主表列）；`subForm` 映射 JSON |
| `ColumnConfigDialog.UNSUPPORTED_TYPES` + `collectFields` | group/tableForm → 生成子表配置项（可展开子列配置）；subForm → JSON 列；保留 userPicker/deptPicker/divider/groupContainer 拦截 |

### D7：前端子表配置 UI

`ColumnConfigDialog` 中，子表字段以可展开行呈现：主行显示子表字段 key/label（无 columnType 选择），展开后展示子列列表（复用现有列映射控件：类型/长度/必填/唯一/索引）+ "传输方式"选择（内嵌/独立接口）。`handleConfirm` 将子列包装为 `subColumns` 输出。

## Risks / Trade-offs

- [子表 DDL 复杂度高] → 复用 DdlBuilder 既有白名单/只增不删/禁跨类约束，递归校验；测试覆盖建表/变更/非法输入。
- [diff 并发覆盖] → 子表变更随主表同一事务提交；乐观锁仅作用于主表行，并发编辑同一主表时由主表 version 冲突拦截整体提交。
- [内嵌返回 N+1] → 批量 `IN` 查询一次取全主子表行，不逐行查。
- [子表行数失控] → 单次请求子表行数上限（默认 100），超限 400。
- [subForm 语义弱化] → 明确映射 JSON 列，文档注明与简道云单条分组等价；不误导用户按行编辑。
- [已发布子表字段删映射] → 与主表一致：子表字段从 column_config 移除时，子表物理表保留不删（防丢数据），仅新数据不再写入。
- [前端 UI 复杂度] → 子列配置复用现有控件，仅加展开层与传输方式选择，控制改动面。

## Migration Plan

- 纯新增能力：既有 column_config 无 `subColumns`，发布/CRUD 行为完全不变，无需数据迁移。
- 部署顺序：后端（DDL 生成 + CRUD + 接口）→ 前端（列配置 UI）→ 手工验证（发布含子表表单 → CRUD → 子表行 diff）。
- 回滚：不发布含子表的 BUSINESS 表单即回退；已发布表单如需回滚，子表物理表保留（无破坏性 DDL）。

## Open Questions

- 子表内某列必填的语义：仅"该行内此列必填"，不强制子表至少一行？（初步如此，spec 定稿确认）
- 子表行数上限 100 是否合适？（初步如此，可配置）
- 已发布子表字段的结构变更约束：与主表一致即可，还是额外禁止删除子表字段映射？（初步：与主表一致，禁删列但允许保留表）
