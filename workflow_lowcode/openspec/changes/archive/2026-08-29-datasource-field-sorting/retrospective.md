# Retrospective: datasource-field-sorting

> Written: 2026-08-29 (after verify passed)
> Commit range: `b582be4..64ddd8b` (22 commits)
> Worktree: `.worktrees/datasource-field-sorting/` (branch feature/datasource-field-sorting)

---

## 0. Evidence

- **Commit range**: `b582be4..64ddd8b` (22 commits)
- **Diff size**: +1719 / -115 lines across 30 files
- **Tasks done**: 37/37 (`grep -cE '^\s*- \[x\]' tasks.md`)
- **Active hours**: ~1 个工作日（连续多轮 TDD 会话）
- **Subagent dispatches**: 0（用户明确要求主代理直接实现，Task 1 后台任务 bg_87eaf5a7 已取消）
- **New external dependencies**: none
- **Bugs encountered post-merge**: 1（分页栏不显示——实为 apply 期间发现并修复，见 §5）
- **OpenSpec validate state at archive**: pass（74/74，修复 delta spec 格式后）
- **Test coverage signal**: 后端 mvn test 668/668；前端 vitest 551/561（10 个既有失败与 baseline 一致）

Commit chain (時序):

```
b582be4 change: datasource-field-sorting            (artifacts: brainstorm/design/proposal/specs/tasks/plan)
4c1e010 feat: add sortable field to ColumnConfig
f038904 feat: add SortableResolver for field sortability derivation
8beeb20 feat: declare field sortability in datasource metadata
2601bc2 feat: support dynamic ordering in workflow form datasource query
4cea0a0 feat: extend ColumnConfigItem with sortable
af7805a feat: manage server-side sort state inside SearchTable
cb749f5 feat: wire server-side sorting through list pages
6c322aa refactor: remove sortable switch from view designer column config
621182f test: update QueryColumnsConfig assertions after removing sortable switch
007e41a chore: mark all datasource-field-sorting tasks complete
a1c1014 feat: view-level sortableFields config (backend compile + sort whitelist)
12585ed feat: view-level sortableFields config bounded by datasource metadata
90826e6 docs: update artifacts for B1 view-level sortableFields
b521509 fix: preserve sortable from datasource metadata in PageDataTable
8775a55 feat: component-level sortableFields config for page/form data tables
b57a097 fix: showPagination Boolean prop defaults to true so pagination renders
7785a31 feat: pagination config for views and data tables (showPagination/pageSize/pageSizes)
66173f4 chore: mark pagination config tasks complete
dba67c7 style: pagination bar height aligned with table row height
1aac4a8 fix: convert new-capability spec to delta format for validation
64ddd8b docs: add pagination config requirement to spec + verification report
```

---

## 1. Wins

- [evidence: f038904, SortableResolverTest 4/4] 排序能力推导规则（JSON/TEXT/colorPicker/子表不可排）与现有 filterable 白名单模式同源，TDD 一次通过
- [evidence: 2601bc2, WorkflowFormDataQueryServiceTest 16/16] WORKFLOW 数据源动态排序（JSON_EXTRACT + 数值 CAST 避免 10<2、startTime 系统列映射）覆盖完整
- [evidence: af7805a, SearchTableTest 33/33] SearchTable 内部排序状态下沉组件（事件仍转发），一处改动全局列表页生效
- [evidence: 8775a55] 组件级 sortableFields 走公共部分（DsBindingConfigDialog + PageDataTable），页面与表单数据表格一处改动同时生效
- [evidence: b57a097] 分页 bug 根因定位精准（Boolean prop 未传默认 false），浏览器实证（表单 14 条/页面 7 条/数据源 11 条）后修复
- [evidence: 64ddd8b] verify 发现 delta spec 格式问题并修复，spec/实现一致性在 archive 前闭环

## 2. Misses

- 🟡 [painful | evidence: b57a097] **分页栏不显示是 apply 中后期才被发现**：SearchTable `showPagination` Boolean prop 无默认值，Vue 默认 false，导致所有列表页分页被静默关闭。用户先报告"分页配置缺失"，实测才发现是默认值 bug。若早期对 SearchTable 现有分页做冒烟验证可提前暴露
- 📌 [nit | evidence: 7785a31] **`pagination !== false` 模板表达式在测试环境异常**：PageDataTable 模板该表达式对 undefined 计算为 false（预期 true），最终改用 `withDefaults` 默认值方案。根因未深究（可能是 vue-test-utils 对 Boolean prop 的处理），但 withDefaults 方案更清晰
- 📌 [nit | evidence: 1aac4a8] **新建能力的 spec 用了完整格式而非 delta 格式**：`datasource-field-sorting/spec.md` 写 `## Requirements`，openspec validate 报 "No delta sections found"，verify 阶段修复。应在一开始就按 delta 模板（`## ADDED Requirements`）撰写
- 📌 [nit | evidence: PowerShell Set-Content 事故] **调试中 PowerShell `Set-Content` 破坏 Vue SFC 换行**：导致 PageDataTable.vue 编译错误（'return' outside of function），git checkout 恢复后重做。教训：不要用 PowerShell 写代码文件，用 edit/write 工具

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 10 冒烟验证 | 未执行（用户接管验证） | 用户要求"改完不用测试，我来检查"，浏览器实测由用户执行 |
| 任务组 8（B1） | 计划外新增 | 用户确认方案 A 后追加"视图级 sortableFields 收窄（受数据源上限约束）" |
| 任务组 9（组件级） | 计划外新增 | 用户要求页面/表单数据表格共用 sortableFields 配置（改公共部分） |
| 任务组 10（分页配置） | 计划外新增 | 用户报告分页栏不显示，先修复 showPagination 默认值 bug，再实现三项分页配置 |
| Task 5（FORM 白名单对齐） | 无代码变更 | 确认既有 validateColumn 白名单已符合 spec，仅补测试覆盖确认 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✅ 多轮设计讨论（方案 A/B/C、B1 确认） |
| superpowers:writing-plans                        | ✅ plan.md 10 个 Task + 后续新增 |
| superpowers:using-git-worktrees                  | ✅ /opsx-ff 创建 worktree 隔离 |
| superpowers:subagent-driven-development          | ⚠️ 用户明确要求主代理直接实现（跳过子代理派发） |
| (transitive) superpowers:test-driven-development | ✅ 后端 7 个测试类、前端 5 个测试文件均 RED→GREEN |
| (transitive) superpowers:requesting-code-review  | ⚠️ 未派 oracle 审查（用户要求主代理自实现） |
| superpowers:finishing-a-development-branch       | ✅ 本次 /opsx-finish 执行中 |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整个 subagent 派发流程（implementer/task-reviewer/fix-loop）
  - **Why this cycle**: 用户在 Task 1 派发后台任务后明确指示「所有任务都由主代理自己完成，不要派发给子代理」（bg_87eaf5a7 被取消）。这是用户显式的工作方式选择，覆盖 schema 默认流程
  - **How to prevent recurrence**: `one-off — schema boundary case, no prevention possible`。用户工作流偏好（主代理直接实现 + 用户亲自验收 UI）在本次 session 中是稳定的，但属于用户显式指令而非 schema 缺陷；若后续 cycle 用户再次要求主代理实现，应在 dispatch 前先确认用户偏好，避免派发后被取消浪费 token

- **`superpowers:requesting-code-review`（transitive）**
  - **What was skipped**: apply 阶段的 oracle 审查环节
  - **Why this cycle**: 与 subagent-driven-development 一并被用户"主代理直接实现"指令覆盖；审查职责由主代理自检 + TDD RED→GREEN + 全量测试承担
  - **How to prevent recurrence**: `one-off — schema boundary case, no prevention possible`（同上，用户显式指令）

## 5. Surprises

- **分页栏不显示的真因**：最初假设"分页配置缺失"，实际是 SearchTable `showPagination` Boolean prop 无默认值导致 Vue 默认 false——所有未显式传该 prop 的列表页分页全被关闭。数据量无关（total=14 > 0 也满足条件，但 showPagination=false 短路了渲染）
- **运行中的应用是 worktree 代码**：排查时发现 vite 进程（pid 2008）直接运行在 `.worktrees/datasource-field-sorting/frontend`，浏览器实测可用，无需另起环境
- **`pagination !== false` 表达式异常**：JS 语义上 `undefined !== false` 应为 true，但 vue-test-utils 环境下该表达式未生效（硬编码 true 则通过），改用 withDefaults 默认值后稳定

## 6. Promote candidates — long-term learning

- [ ] 🔴 **Boolean 类型 prop 未传时 Vue 默认 false——声明时务必显式 `default: true`** — **Promote to memory** (type: feedback)
  > **Why**: SearchTable showPagination 未设默认值导致所有列表页分页被静默关闭，用户报告后经浏览器逐层排查（props 检查/源码对比/进程 cwd）才定位
  > **How to apply**: 编写 Vue 组件 props 时，任何语义为"默认开启"的 Boolean prop 必须 withDefaults 显式 `default: true`；审查既有组件时 grep `?: boolean` 检查是否缺默认

- [ ] 🟡 **新建能力 spec 必须用 delta 格式（`## ADDED Requirements`），勿写完整 spec 格式** — **Promote to project AGENTS.md / schema**
  > **Why**: datasource-field-sorting/spec.md 写 `## Requirements` 导致 openspec validate ERROR，verify 阶段才修复
  > **How to apply**: 创建 `specs/<capability>/spec.md` 时对照 template 的 delta headers（ADDED/MODIFIED/REMOVED/RENAMED）；archive 前的 validate 应纳入收尾 checklist

- [ ] 🟡 **浏览器实证排查优于纯静态分析** — **Promote to memory** (type: feedback)
  > **Why**: 分页栏问题静态分析 10+ 轮无果，浏览器 evaluate 读组件实例 props 一次定位（showPagination=false）；login 凭据在 V2__init_data.sql（admin/admin123）
  > **How to apply**: UI 层 bug 优先用浏览器（Playwright/paseo evaluate 读 __vueParentComponent.setupState）验证运行时状态，再回到代码

- [ ] 📌 **PowerShell 勿用 Set-Content 写代码文件** — **One-off** (记录即可, 不 promote)
  > **Why**: 调试中 Set-Content 破坏 Vue SFC 换行导致编译错误，git checkout 恢复；工具边界问题，非通用模式
