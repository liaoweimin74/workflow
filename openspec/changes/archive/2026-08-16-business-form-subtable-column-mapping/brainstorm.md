# Brainstorm: BUSINESS 表单子表列映射

## Design Summary

让 type=BUSINESS（物理表模型）表单支持 form-create 子表组件（`group`/`tableForm`/`subForm`）持久化到独立子表物理表，最接近简道云子表语义。

**核心方案**：每个子表字段映射为独立物理表 `wf_biz_<formKey>_<field>`（1:N），通过 `biz_id` 关联主表行；子表内字段沿用现有 `ColumnTypeMapper` 列映射规则生成子表业务列；主表 CRUD 默认内嵌子表数组 JSON 往返，同时提供独立子表 CRUD 接口，传输方式由表单配置决定；子表行更新采用增量 diff（新增插入/删除删除/变化更新），`sort_no` 保证行序稳定。

**背景修正**：现有 `UNSUPPORTED_COMPONENTS` 名单（`subTable`/`SubTable`/`nestedForm`/`NestedForm`/`dataTable`）与实际 form-create 内置类型名（`group`/`tableForm`/`subForm`）不匹配——A 级 spike 已实测三种子表组件在 WORKFLOW 表单全链路可用（设计/渲染/只读/数据往返），本变更将同一能力扩展到 BUSINESS 表单的物理表持久化。

## Alternatives Considered

### 方案 A：独立子表物理表（简道云式）
- **做法**：每个子表字段创建独立物理表 `wf_biz_<formKey>_<field>`，含固定列（id/biz_id/tenant_id/version/sort_no/created_by/created_at/updated_at）+ 子表业务列；主表与子表通过 `biz_id` 1:N 关联。
- **优点**：子表行可独立查询/统计/回填；最贴近简道云语义；后续扩展（子表筛选、汇总）自然。
- **缺点**：发布 DDL、CRUD 逻辑、事务处理工作量最大；需维护子表结构变更（增列/改宽）。
- **为何未采用**：采用。用户明确选择此方案，作为本次变更主方向。

### 方案 B：主表 JSON 列
- **做法**：子表整段序列化为主表一列 JSON 存储。
- **优点**：发布/CRUD 零改动，成本极低。
- **缺点**：子表行不可按列查询/关联/统计；仅能整体读写；违反"业务数据可查询"的既有设计原则。
- **为何未采用**：无法满足子表行独立查询需求，与简道云语义差距大；仅作为降级兜底提及。

### 方案 C：仍不支持（仅修正校验名单）
- **做法**：本次仅修正 `UNSUPPORTED_COMPONENTS` 名单与报错文案，继续拒绝子表发布；仅文档化 WORKFLOW 表单的子表能力。
- **优点**：改动最小。
- **缺点**：BUSINESS 表单无法使用已实测可用的子表组件，能力割裂。
- **为何未采用**：用户已确认要落地子表能力到 BUSINESS 表单。

## Agreed Approach

**方案 A（独立子表物理表）+ 内嵌 JSON 往返（默认）/独立子表 CRUD 接口（可配置）+ 增量 diff 更新策略**。

设计要点：
1. **子表识别**：校验与列映射不再把 `group`/`tableForm`/`subForm` 视为不支持组件；子表字段在 `column_config` 中表达为嵌套结构（子表字段 + 子表列列表）。
2. **DDL**：`DynamicTableManager.ensureTable` 扩展为同时确保主表与所有子表结构；子表表名 `wf_biz_<formKey>_<field>` 经 DdlBuilder 白名单校验。
3. **CRUD**：`BizDataService` 在写主表时按 diff 同步子表行（携带则 diff，未携带则不变）；读主表时按配置决定是否内嵌返回子表数组。
4. **独立接口**：新增子表行 CRUD 接口（按主表行 + 子表字段维度），供配置为"独立接口"模式或二次开发使用。
5. **前端**：`ColumnConfigDialog` 支持子表字段的子列配置（沿用现有列映射 UI），移除对 `group`/`tableForm`/`subForm` 的拦截标记。

## Key Decisions

1. **持久化形态**：独立子表物理表 `wf_biz_<formKey>_<field>`，`biz_id` 关联主表 id（1:N）。
2. **API 传输**：默认主表 CRUD 内嵌子表数组 JSON 往返；同时新增独立子表 CRUD 接口；传输方式由表单 column_config 中的子表配置决定（可切换）。
3. **更新策略**：增量 diff——请求携带的完整子表数组与库中现有行比较：新增插入、删除删除、变化更新；子表行固定 `sort_no` 保序，行 id 稳定不漂移。
4. **子表固定列**：`id`（VARCHAR(64) PK）、`biz_id`（VARCHAR(64)，关联主表，复合索引 `(tenant_id, biz_id)`）、`tenant_id`、`version`（乐观锁）、`sort_no`（INT 行序）、`created_by`/`created_at`/`updated_at`。
5. **子表列映射**：子表内字段沿用 `ColumnTypeMapper` 既有映射规则（VARCHAR/TEXT/INT/DECIMAL/DATE/DATETIME/TINYINT/JSON 白名单），不引入新类型。
6. **校验名单修正**：移除 `UNSUPPORTED_COMPONENTS` 中对 `group`/`tableForm`/`subForm` 的拦截（后端 `FormDefinitionService`、`ColumnTypeMapper` 与前端 `ColumnConfigDialog` 三处同步修正）；保留对 `userPicker`/`deptPicker`/`divider`/`groupContainer` 等的不可映射处理。
7. **主表删除**：删除主表行时级联删除其子表行（同事务）。
8. **嵌套限制**：子表内不再支持嵌套子表（一级子表），避免递归复杂度失控。

## Open Questions

- 子表行的必填校验：子表内某列必填，是否要求子表至少有一行？（初步：列必填指"该行内此列必填"，子表整体非必填；待 design 确认）
- 子表行数上限：是否限制单表单次提交的最大行数（防止超大请求）？（初步：限制 100 行，待 design 确认）
- 已发布子表的结构变更约束：与主表一致（仅增列/改宽/改必填，禁删列/类型跨类变更），是否还需要额外限制（如禁止删除子表字段映射）？（待 design 确认）
