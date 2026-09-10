# Retrospective: form-join-sql-engine

> Written: 2026-09-10（after apply + verify passed，tasks 5/6/7 补全后）
> Commit range: `d62d4517..b93ed11`（50 commits，`git rev-list --count main..HEAD`）
> Worktree: `.worktrees/form-join-sql-engine`（尚未合并，待 /opsx-finish）

---

## 0. Evidence

> 量化前置数据 — 后续 Wins / Misses bullets 直接引用，避免每行重复 [evidence: ...]。

- **Commit range**: `d62d4517..b93ed11`（50 commits，含 SQL 数据源/字段元数据/数据管理页等分支累积工作 + form-join-sql-engine 核心）
- **Diff size**: +14469 / -405 lines across 86 files
- **Tasks done**: 30/30（tasks.md 全绿；`- [x]` 计数 30）
- **Active hours**: ~3.5h（两段：引擎实现 + 5/6/7 补全）
- **Subagent dispatches**: n/a（按 AGENTS.md 指令，全部主代理直接实现）
- **New external dependencies**: none
- **Bugs encountered post-merge**: none（尚未 merge）
- **OpenSpec validate state at archive**: pass（102/102：change 2/2、spec 100/100）
- **Test coverage signal**: 前端 vitest 1058 passed（78 files）；后端 996 tests（1 失败为预先存在，main 分支同样失败，与本变更无关）

Commit chain（时序，核心段）：

```
2d60e5a change: form-join-sql-engine                          （ff 基线 artifacts）
045ff3d change: 增加 sql 模式运行时参数透传（params）
dc72aeb feat: Task 4 — FORM 数据源 queryMode 分流与 metadata 虚拟列
...（SQL 数据源/字段元数据/数据管理页等分支累积工作）
c197120 form-join-sql-engine: 完成 form join SQL 引擎实现        （tasks 1-4, 3a）
b93ed11 form-join-sql-engine: 补全 tasks 5/6/7                 （保存校验 + 前端配置 UI + 文档）
```

---

## 1. Wins

- [evidence: c197120 / JoinSqlGenerator] config 模式声明式 JOIN：dataPicker JSON 外键自动 `JSON_UNQUOTE(JSON_EXTRACT(...))` 匹配，主表 `m.*` + 虚拟列 SELECT，白名单筛选/排序/分页/租户注入一体
- [evidence: c197120 / SqlTemplateEngine] sql 模式安全约束完整：仅 SELECT、强制 `:tenantId`、columns 与 SELECT 输出列匹配、非 tenantId 占位符必须命中 params 白名单——管理员 SQL 能力有安全兜底
- [evidence: c197120 / FormQueryConfig] 缺省（无 queryMode）→ 单表查询回退，引擎层向后兼容由设计保证（task 7.2）
- [evidence: dc72aeb / BizDataSupport] metadata 虚拟列（config 推导 / sql 声明 sortable/filterable）使前端查询侧（BizDataListPage/PageDataTable）零改动即可展示/排序/筛选关联字段
- [evidence: b93ed11 / DataSourceDefinitionService] 保存校验闭环：config targetFormKey 存在性 + virtualKey 唯一性、sql 复用 SqlTemplateEngine.validate（IllegalArgumentException → 400）；create 时 queryMode 段与自动端点合并
- [evidence: b93ed11 / FormJoinConfig.vue] 前端 FORM「关联查询配置」三模式 UI：单表/声明式 JOIN（多卡片增删、字段下拉从表单 schema 提取可手输）/SQL 模板（复用 SqlEditor），保存保留原端点段
- [evidence: b93ed11 / DataSourceDefinitionServiceTest] TDD 16 个新用例（合法 config/sql 保存 + 非法配置 400 全族），61 测试全绿；前端 4 个 FORM 配置用例

## 2. Misses

- 🟡 [painful | evidence: 首次 /opsx-finish 检测] **tasks 5/6/7（10 项）在 apply 阶段未实现就进入 finish**——引擎核心（1-4/3a）完成但 FORM 数据源管理页开放 JOIN/SQL 配置的保存校验+前端 UI 缺失，配置当时只能手工改库写入 params。第一次 finish 流程中核对代码发现（前端 `targetFormKey/virtualKey/localField` 零匹配、FORM 保存走 `buildApiParams()`），暂停收尾补全后才继续
- 📌 [nit | evidence: b93ed11] 分支累积了大量非本 change 主题提交（SQL 数据源可视化/字段元数据/数据管理页，约 40 个），retrospective 的 commit range 与 diff 统计含这些工作，无法精确切分 form-join-sql-engine 本体
- 📌 [nit | evidence: bizTableLayout.ts] 全量前端 tsc 检查暴露预先存在的类型错误（`align` 字面量宽化），已随补全修复（`as const`）
- 📌 [nit | evidence: PageDefinitionPublishIntegrationTest] 后端 1 个测试 `publish_sameContent_rejectedAsUnchanged` 失败为**预先存在**（main 分支复现同样失败），非本变更引入，未修复

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 5.1/5.2 | 校验集中在 `validateFormQueryConfig`（config joins 结构 + sql 复用 SqlTemplateEngine.validate），create 时合并 queryMode 段到生成端点 | 引擎已有 SqlTemplateEngine 校验能力，保存校验直接复用避免重复实现；create FORM 原本强制 generateParams 忽略入参 params，需合并才支持带配置创建 |
| 6.1-6.3 | 新建独立 `FormJoinConfig.vue` 组件承载三模式配置，而非直接在 DataSourceListPage 内联 | DataSourceListPage 已 1700+ 行，独立组件与 VisualQueryBuilder/SqlEditor 组件化模式一致，便于测试 |
| 6.4 | 前端保存 FORM 时**保留原 params 端点段**（formJoinBaseParams）+ 叠加 queryMode 段 | 首次实现用 buildApiParams() 生成端点，但 FORM 端点由后端自动生成、前端 apiOps 不填充，直接覆盖会丢端点——测试暴露后修正 |
| 6.5 | BizDataQueryParams 与 DataSourceQueryParams 同时加 params 段，bizDataApi.list 序列化 | 两条查询路径（/v1/biz-data 与数据源 SPI）都需透传能力 |
| 7.1 | 新建独立设计文档 `docs/superpowers/specs/2026-09-09-form-join-query-config-design.md` | 与既有 data-source 系列设计文档并列，描述双模式结构/校验/迁移路径 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✅（/opsx-ff 阶段使用） |
| superpowers:writing-plans                        | ✅（plan.md 由 plan agent 生成） |
| superpowers:using-git-worktrees                  | ✅（`.worktrees/form-join-sql-engine` 全程隔离） |
| superpowers:subagent-driven-development          | ❌ |
| (transitive) superpowers:test-driven-development | ⚠️（5.x 后端严格 TDD：先写 16 测试 RED → 实现 GREEN；6.x 前端为改既有测试 + 补新测试） |
| (transitive) superpowers:requesting-code-review  | ❌ |
| superpowers:finishing-a-development-branch       | ⏳（本 retrospective 所在阶段执行） |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整个 skill——不派发子代理，实现任务全部由主代理完成
  - **Why this cycle**: AGENTS.md 明确指令"所有任务都由主代理自己完成，不要委派给子代理"（用户级 override）
  - **How to prevent recurrence**: `one-off — schema boundary case`：用户级指令优先于 schema 默认；已固化在 AGENTS.md 判定规则

- **`superpowers:requesting-code-review`**
  - **What was skipped**: 实现完成后的 oracle/子代理审查
  - **Why this cycle**: 同 subagent-driven-development——用户级 override 取代 schema 默认审查流程
  - **How to prevent recurrence**: `one-off — schema boundary case`；主代理以 verification-before-completion（tsc + 全量 vitest + mvn test + openspec validate 102/102）替代

## 5. Surprises

- **FORM 数据源前端原本不可编辑**：actionButtons 编辑/删除仅对 API/SQL 显示，FORM 由系统管理——补全 6.x 需先开放 FORM 编辑按钮，且 dialogTitle/只读逻辑按类型区分
- **FORM 保存覆盖端点风险**：前端 buildApiParams() 对 FORM 生成空端点（apiOps 不填充），直接提交会清空后端自动生成的 list/get 端点——必须保留原 params 端点段
- **PowerShell Set-Content 编码损坏**：用 `Get-Content -Raw | replace | Set-Content` 改测试文件导致全文件中文字符损坏，git checkout 恢复后用 edit 工具重做（edit 工具编码安全）
- **`git log | Measure-Object` 计数异常**：rev-list --count 得 50 而管道行数 24，PowerShell 管道对 git 输出行数统计不可靠，以 rev-list 为准

## 6. Promote candidates → long-term learning

- [ ] 🟡 **/opsx-finish 前强制校验 tasks.md 全绿 + verify.md 非 DEFERRED** → **Promote to memory** (type: feedback)
  > **Why**: form-join-sql-engine 首次 finish 时 tasks 5/6/7 未实现（10 项），Step 3 测试通过但实现不完整，收尾被中断补全——finish 的"测试通过"不保证"任务完成"
  > **How to apply**: /opsx-finish Step 3 后检查 `grep -cE '^\s*- \[ \]' tasks.md` 为 0 且 verify.md Overall Decision 非 DEFERRED，未满足则 STOP 报告

- [ ] 📌 **PowerShell 中 git 计数命令用 rev-list 而非管道 Measure-Object** → **Promote to memory** (type: feedback)
  > **Why**: `git log --oneline X..HEAD | Measure-Object` 误报 24（实际 50），rev-list --count 准确
  > **How to apply**: 任何 git commit 计数一律 `git rev-list --count <range>`

- [ ] 📌 **改含中文的文件禁用 Set-Content/Get-Content 管道** → **Promote to memory** (type: feedback)
  > **Why**: PowerShell 5.1 Set-Content 默认 ANSI 编码，全文件中文字符损坏，需 git checkout 恢复重做
  > **How to apply**: 文件修改一律用 edit/apply_patch 工具；必须 shell 批量替换时先确认编码或改用 `-Encoding utf8`

- [ ] 📌 **FORM 类型保存须保留自动生成端点段** → **One-off**（本次修复，不 generalize）
  > **Why**: FORM 端点由后端 generateParams 生成，前端 buildApiParams 不填充，直接覆盖丢端点
  > **How to apply**: 数据源编辑页保存 FORM params 时基于原始 params 叠加配置段，不重建
