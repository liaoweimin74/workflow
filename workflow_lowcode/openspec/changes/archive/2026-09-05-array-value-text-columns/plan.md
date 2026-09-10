# 数组组件 value+text 双列存储 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task. 本计划按 tasks.md 分解为 TDD 微步骤。

**Goal:** 业务表单数组值组件（select 多选/tree/elTreeSelect/transfer/cascader）统一"主列 JSON 叶子 value 数组 + `<key>_text` 冗余显示列"，解决列类型漂移、列表显示原始 value、按 label 查询不可用。

**Architecture:** 前后端列映射（ColumnTypeMapper/ColumnConfigDialog）为数组组件生成双列；前端提交预处理生成 `<key>_text`（value→label）；列表显示/模糊查询走 text 列；精确查询走主列 JSON 函数（JSON_CONTAINS/->>/JSON_OVERLAPS）；cascader 默认 emitPath=false。

**Tech Stack:** Java/Spring（后端列映射+查询）、Vue3/Element Plus/form-create（前端列映射+提交+渲染）、MySQL 8.x（JSON 查询）。

---

## Task 1: 后端列映射双列生成

- [ ] **Step 1 (RED):** ColumnTypeMapperTest.java 新增测试——`mapSelectMultiple_generatesTextColumn`、`mapTreeSelectSingle_generatesTextColumn`、`mapCascader_generatesTextColumn`、`mapCheckbox_generatesTextColumn`、`mapSelectSingle_noTextColumn`（期望 `<key>_text` VARCHAR(255) hidden；select 单选不生成）
- [ ] **Step 2 (GREEN):** ColumnTypeMapper.java 新增 `mapArrayComponentToColumns(key, props)` 返回主列+text 列；`mapComponentToColumn` 调用方（FormDefinitionService 列草案生成）改为生成双列
- [ ] **Step 3:** 运行 `mvn test "-Dtest=ColumnTypeMapperTest"` 确认通过
- [ ] **Step 4 (Commit):** `fix(form): 数组组件后端列映射生成 text 冗余列`

## Task 2: 前端列映射双列生成 + cascader emitPath

- [ ] **Step 1 (RED):** ColumnConfigDialog.test.ts 新增双列生成测试（select 多选、elTreeSelect 单选、cascader、checkbox 生成 `<key>_text`；select 单选不生成）
- [ ] **Step 2 (GREEN):** ColumnConfigDialog.vue `collectFields` 数组组件分支生成主列+text 列（hidden、VARCHAR(255)）
- [ ] **Step 3 (GREEN):** cascader.js 默认 `props.emitPath = false`
- [ ] **Step 4:** `npx vitest run src/views/form/components/__tests__/ColumnConfigDialog.test.ts`
- [ ] **Step 5 (Commit):** `fix(form): 前端列映射双列生成与级联叶子值`

## Task 3: 前端提交生成 `<key>_text`

- [ ] **Step 1 (RED):** 新增 `arrayValueLabel.ts` 工具测试——多选 label 拼接、级联全路径（`/` 分隔、`emitPath:false`）、options 缺失回退 value
- [ ] **Step 2 (GREEN):** `arrayValueLabel.ts`：遍历 schema 数组组件，`value→options 映射 label`，生成 `<key>_text`（cascader 用路径映射拼全路径）
- [ ] **Step 3 (GREEN):** 提交链路接入（BizDataListPage createApi/updateApi 预处理；FormRenderer 提交钩子）
- [ ] **Step 4:** 运行 `npx vitest run src/views/form` 相关测试
- [ ] **Step 5 (Commit):** `feat(form): 提交时生成数组组件显示文本`

## Task 4: 列表显示走 text 列

- [ ] **Step 1 (RED):** BizDataListPage.test.ts / PageDataTable.test.ts 新增——数组组件列 render 读 `<key>_text`（缺失回退 value join）
- [ ] **Step 2 (GREEN):** BizDataListPage.vue render 优先读 `row.data[<key>_text]`；PageDataTable.vue 元数据列 formatter 读 text 列
- [ ] **Step 3:** 运行对应测试套件
- [ ] **Step 4 (Commit):** `feat(form,page): 列表显示数组组件显示文本列`

## Task 5: 查询——模糊走 text、精确走 JSON

- [ ] **Step 1 (RED):** BizDataListPage 搜索字段测试——数组组件用 `<key>_text` 列可筛选；后端 BizDataQueryBuilder 测试——JSON 列 eq→`JSON_CONTAINS(col, ?)`、单选 `col->>'$[0]' = ?`、in→`JSON_OVERLAPS`
- [ ] **Step 2 (GREEN):** filterableColumns 对数组组件用 text 列；BizDataQueryBuilder 按列类型（JSON vs 普通）分支构建
- [ ] **Step 3:** 运行前端 + 后端对应测试
- [ ] **Step 4 (Commit):** `feat(form): 数组组件按显示文本模糊查询与 JSON 精确筛选`

## Task 6: 存量迁移与发布重建

- [ ] **Step 1:** 已发布表单重新发布时 DDL 新增 `<key>_text` 列（复用 ensureTable 建列路径）
- [ ] **Step 2:** 存量主列数据回填（路径→叶子、单值→数组）策略实现与测试
- [ ] **Step 3 (Commit):** `feat(form): 发布重建生成显示列并回填存量数据`

## Task 7: 全量回归

- [ ] **Step 1:** 前端 `npx vitest run src/views/form src/views/page src/vendor src/components/business` 全量通过
- [ ] **Step 2:** 前端 `npx vue-tsc --noEmit` 无新增错误
- [ ] **Step 3:** 后端 `mvn test` 通过（排除既有无关失败 PageDefinitionPublishIntegrationTest）
