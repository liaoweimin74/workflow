# Design Summary

FORM 数据源扩展为「配置驱动 + SQL 模板」双模式统一查询引擎，支持跨表 JOIN 关联查询、按关联字段排序与筛选，同时满足简单场景可视化配置与复杂场景完整 SQL 表达力。

# Alternatives Considered

### 方案 A：纯子查询翻译（无真实 JOIN）
- **做法**：保持单表查询，将关联字段的排序/筛选翻译为 `EXISTS (SELECT ... WHERE 主表.col IN/匹配 ...)` 子查询。
- **优点**：`main` 无多表 JOIN，dataPicker `_text` 快照可复用的简单场景够用。
- **缺点**：无法显示关联表字段（列表只显示快照 `_text`）；无法按关联字段排序（子查询无法支撑 ORDER BY 关联列）；复杂关联不可表达。
- **为何未采用**：用户明确要求"主表 JOIN 关联表的问题，需要按关联字段排序"，子查询翻译做不到真实排序与关联字段展示。

### 方案 B：纯声明式 JOIN 配置
- **做法**：在 `DataSourceDefinition.params` 中声明 `joins[]` 数组（targetFormKey/localField/foreignField/selectField/virtualKey 等），系统翻译成 `LEFT JOIN` 生成 SQL。
- **优点**：简单场景直观、平台自动保证分页/租户隔离/SQL 注入安全。
- **缺点**：复杂 SQL（多层 JOIN、子查询、聚合、CASE WHEN、跨表子查询）无法用配置表达，配置项越多越难维护。
- **为何未采用**：用户指出"复杂 SQL 无法利用可视化配置"，声明式 JSON 配置有表达力天花板。

### 方案 C：仅 SQL 模板数据源
- **做法**：放弃配置化，仅提供 `type=SQL` 数据源，管理员手写 SQL 模板，平台包裹分页/租户隔离。
- **优点**：完整 SQL 表达力，覆盖所有复杂场景。
- **缺点**：简单场景也必须写 SQL，不直观。
- **为何未采用**：用户强调"多数场景都是简单 SQL（可以用配置配出来），如果都用复杂 SQL 会很不直观"。

# Agreed Approach

采用 **「配置编译为 SQL」统一引擎模型**（方案 B + C 的融合）：

```
配置化简单 JOIN → 系统自动生成 SQL ──┐
                                    ├──→ 统一 SQL 执行引擎 → 分页/排序/筛选 → 结果
手写复杂 SQL   → 直接使用 SQL      ──┘
```

- **核心洞察**：视觉配置不是"另一套查询系统"，而是 SQL 的 DSL。系统把配置翻译成 SQL，与手写 SQL 走同一条执行路径，底层完全统一。
- **双模式**：`DataSourceDefinition.params` 通过 `queryMode` 字段区分 `config`（joins 声明）与 `sql`（SQL 模板 + columns 声明）。
- **简单场景用配置（直观），复杂场景切 SQL（自由），前端零改动**。

# Key Decisions

1. **`queryMode` 双模式**：`config`（声明式 JOIN → JoinSqlGenerator 生成 SQL）与 `sql`（SQL 模板 → SqlTemplateEngine 包裹），并存于 FORM 数据源 params。
2. **统一执行引擎**：两条路径都产出统一的 `SqlAndParams`（SQL + 参数绑定列表），共享分页 / ORDER BY / WHERE filter 注入逻辑，交 JdbcTemplate 执行。
3. **metadata 统一**：config 模式由 JoinSqlGenerator 从 joins 配置推导虚拟列；sql 模式由管理员声明的 columns 提供；两种模式输出相同的 `ColumnConfig`，前端经 `GET /data-sources/{id}/metadata` 无感知消费。
4. **迁移路径**：配置可"查看生成 SQL"升级为 SQL 模板（系统展示 JoinSqlGenerator 生成的 SQL → 管理员手动增强 → 切换 sql 模式），前端完全无感。
5. **FORM 数据源 params 放开部分编辑**：原"params 自动生成只读"，现允许管理员编辑 JOIN/SQL 配置（CRUD 接口部分仍自动生成）。需同步修改 datasource-auto-params / data-source-management 既有约束。
6. **安全约束**：SQL 模板仅允许 SELECT；必须包含 `:tenantId` 且由系统强制绑定；参数化绑定杜绝注入；filter/sort 仅针对管理员声明的白名单列。
7. **`_text` 快照仍保留**：作为 dataPicker 冗余展示、未配置 JOIN 时的兜底，不可替代 JOIN 方案。

# Open Questions

- SQL 模板的 filter 注入协议是否完全复用 `BizDataQueryBuilder` 现有的 `{logic, conditions:[{column,op,value}]}` 协议 —— **默认复用**，实现时对齐。
- SQL 模板模式下 `count` 查询的正确性：包裹 `SELECT COUNT(1) FROM (管理员SQL) _qs WHERE ...`，需验证聚合/去重 SQL 在子查询包裹下的 total 语义 —— **实现时以集成测试锁定**。
