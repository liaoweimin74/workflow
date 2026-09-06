# FORM 数据源 JOIN 统一 SQL 引擎 — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 为 FORM 数据源引入跨表 JOIN 关联查询，config（声明式 JOIN）与 sql（SQL 模板）双模式并存，经统一 SQL 执行引擎实现关联字段展示/排序/筛选，前端零改动。

**Architecture:** 在 DataSourceAdapter SPI 链路内，FORM 数据源 query 按 params.queryMode 分流：config 模式经 JoinSqlGenerator 生成 JOIN SQL，sql 模式经 SqlTemplateEngine 将管理员 SQL 包裹为子查询；两模式产出统一 SqlAndParams 交共享执行器（复用 BizDataQueryBuilder 的分页/排序/筛选/租户隔离逻辑）。metadata 增加虚拟列（config 推导 / sql 从 columns 映射），filter/sort 白名单扩展覆盖虚拟列。

**Tech Stack:** Java 17 / Spring Boot / Spring Data JPA / MySQL 8（JSON_EXTRACT / JSON_UNQUOTE）/ JdbcTemplate / JUnit 5（TDD）；前端 Vue 3 + TypeScript。

---

## Task 1: 统一执行引擎（核心）

- [ ] **Step 1:** 定义 `SqlAndParams`（SQL + List<Object> 参数）中间产物类。
- [ ] **Step 2:** 从 BizDataQueryBuilder/查询链路抽取统一执行器，支持输入 SqlAndParams 执行并返回 BizDataPageVO，复用分页（LIMIT/OFFSET）+ COUNT + filter 白名单注入 + ORDER BY + tenantId 绑定。
- [ ] **Step 3:** 为 sql 模式增加子查询包裹执行：`SELECT * FROM (管理员SQL) _qs WHERE <filter> ORDER BY <sort> LIMIT <size> OFFSET <offset>`，COUNT 基于包裹结果集。
- [ ] **Step 4:** 单测统一执行器对 config/sql 两类产物的分页/排序/筛选/租户注入。

## Task 2: JoinSqlGenerator（config 模式）

- [ ] **Step 1:** 实现 joins[] → LEFT JOIN + 虚拟列 SELECT 翻译（dataPicker 外键 JSON → `JSON_UNQUOTE(JSON_EXTRACT(m.<localField>,'$[0]')) = c.id`）。
- [ ] **Step 2:** 支持多 JOIN（顺序、列去重、别名冲突规避）。
- [ ] **Step 3:** 保存校验 targetFormKey 存在 + virtualKey 唯一。
- [ ] **Step 4:** 单测单/多 JOIN 的 SQL 生成与关联排序/筛选结果。

## Task 3: SqlTemplateValidator + SqlTemplateEngine（sql 模式）

- [ ] **Step 1:** SqlTemplateValidator：仅 SELECT、必须含 `:tenantId`、columns 与该 SELECT 输出别名匹配。
- [ ] **Step 2:** SqlTemplateEngine：管理员 SQL 包裹为子查询，columns 白名单注入 filter/sort/分页，tenantId 强制绑定。
- [ ] **Step 3:** query 非空、columns 至少一个可排序列校验。
- [ ] **Step 4:** 单测非 SELECT/缺 tenantId/列不匹配被拒；分页排序筛选正确；COUNT 聚合语义锁定。

## Task 4: FORM 数据源 queryMode 分流 + metadata 虚拟列

- [ ] **Step 1:** query 路径按 params.queryMode 分流（无/缺省 → 现有单表；config → JoinSqlGenerator；sql → SqlTemplateEngine）。
- [ ] **Step 2:** metadata 输出虚拟列（config 从 joins 推导 / sql 从 columns 映射），并入 column_config。
- [ ] **Step 3:** filter/sort 白名单扩展 virtualKey / sql columns。
- [ ] **Step 4:** 集成测试 FORM 数据源 config/sql 的 metadata 与 query 端到端（关联排序/筛选/分页）。

## Task 5: FORM 数据源 params 开放 JOIN/SQL 编辑（后端）

- [ ] **Step 1:** DataSourceDefinitionService 支持 FORM 查询配置段校验与保存，CRUD 接口 params 段保持不变。
- [ ] **Step 2:** 查询配置合法性校验接入保存流程。
- [ ] **Step 3:** 后端测试配置保存校验 + 非法配置 400。

## Task 6: 前端数据源管理页 JOIN/SQL 配置入口

- [ ] **Step 1:** DataSourceListPage 增加 FORM「关联查询配置」编辑区（queryMode 选择 + config / sql 编辑）。
- [ ] **Step 2:** config 模式 UI（targetFormKey/localField/foreignField/joinField 下拉、virtualKey/label/sortable/filterable、多 JOIN 增删）。
- [ ] **Step 3:** sql 模式 UI（query 文本域 + columns 声明编辑）。
- [ ] **Step 4:** 保存提交 queryMode + 配置；查询侧零改动验证虚拟列渲染与排序/筛选。

## Task 7: 文档与迁移

- [ ] **Step 1:** 更新相关文档说明双模式与「查看生成 SQL」迁移路径。
- [ ] **Step 2:** 向后兼容验证：现有无 queryMode 数据源行为不变。
