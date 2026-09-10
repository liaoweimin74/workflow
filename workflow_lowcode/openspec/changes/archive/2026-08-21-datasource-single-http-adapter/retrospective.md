# Retrospective: datasource-single-http-adapter

> Written: 2026-08-22 (after verify passed)
> Commit range: `665267e..941a53e`
> Worktree: `.worktrees/datasource-single-http-adapter` (branch `feature/datasource-single-http-adapter`)

---

## 0. Evidence

> 量化前置數據 — 後續 Wins / Misses bullets 直接引用，避免每行重複。

- **Commit range**: `665267e..941a53e` (13 commits，含 84306eb 初始 change artifact)
- **Diff size**: +2564 / -1244 lines across 26 files
- **Tasks done**: 15/15 (`grep -cE '^\s*- \[x\]' tasks.md` → 15)
- **Active hours**: ~2.5h (跨多個 session)
- **Subagent dispatches**: 0 (main-agent-only cycle，依 constraints)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none (尚未 merge)
- **OpenSpec validate state at archive**: pass（`openspec validate datasource-single-http-adapter` → valid）
- **Test coverage signal**: 後端 71 tests（SystemInternalController 11 + DataSourceDefinitionService 25 + InternalDataSourceRouter 20 + UnifiedDataSourceAdapter 15）；前端 13 tests（DataSourceListPage.test.ts）

Commit chain (時序)：

```
84306eb change: datasource-single-http-adapter
6704a2f feat(internal): system internal rest api
28110f6 feat(datasource): internal:// router
f977366 Task 3: UnifiedDataSourceAdapter consolidating Form/System/Api adapters
624af3f Task 3.4: DataSourceDefinitionService auto-generates params for FORM/SYSTEM
25d2c9f [frontend] Task 4: read-only auto-params display for FORM/SYSTEM
a9b4367 [frontend] Unify config UI: FORM/SYSTEM use same API editor with auto-fill
2fb101f [frontend] Fix: readonly ops for FORM/SYSTEM, auto-clear on type change, scrollable dialog body
4383de1 [frontend] Move 接口操作 divider outside scroll area
5648aba [frontend] FORM/SYSTEM use read-only display, API uses editable form, scrollable area below divider
7058afb [frontend] Fix: label left-align, hide ops when no identifier, openEdit crash, icon action buttons
941ced4 [frontend] Move 新建 button to toolbar (icon+text), align all form labels left
941a53e datasource-single-http-adapter: mark tasks done, add verify report
```

---

## 1. Wins

- [evidence: 6704a2f + SystemInternalControllerTest 11 tests] SYSTEM 数据源暴露为 internal REST API，dept-tree/user-tree 的 list/get/create/update/delete + metadata 全覆盖，TDD 先行。
- [evidence: 28110f6 + InternalDataSourceRouterTest 20 tests] `internal://` allowlist 直连 bean 方法映射，避免了 MockMvc loopback 的额外 HTTP 开销；TenantContext 透传 + 400 拒绝未注册路径均被测试锁定。
- [evidence: f977366 + UnifiedDataSourceAdapterTest 15 tests] 3 个 adapter 收敛为 1 个（UnifiedDataSourceAdapter），旧 Form/System/Api adapter 及测试同步删除，净删除 -535 行（Form 69 + System 135 + Api 311 + SystemTest 147 + ApiTest 261 中的迁移部分）。
- [evidence: 624af3f + DataSourceDefinitionServiceTest 25 tests] create()/enable() 对 FORM/SYSTEM 自动回填 params，前端无需维护只读配置的持久化。
- [evidence: 941ced4] 前端新建按钮移入工具栏（图标+文字），操作列只留行级图标按钮，符合 Element Plus 表格惯例。
- [evidence: 13 前端 + 71 后端 tests] 全链路测试通过，回归风险低。

## 2. Misses

- 🟡 [painful | evidence: 25d2c9f→5648aba 之间 5 个前端提交反复] 前端配置 UI 形态经历了 5 轮方向调整（只读展示 → 统一可编辑 → 只读编辑框 → 滚动容器拆分 → 只读展示回归 + 工具栏新建），每轮都伴随测试重写。根因是需求在"统一界面"与"只读展示"之间摇摆，未在 brainstorm 阶段锁定。
- 🟡 [painful | evidence: 7058afb] `onSourceSelected()` 函数在提交 5648aba 中被删除，但 `openEdit()` 内仍保留 `nextTick(() => onSourceSelected())` 调用，导致编辑 FORM/SYSTEM 数据源时抛 ReferenceError、弹窗不弹出。删除函数时未同步清理所有调用点。
- 📌 [nit | evidence: 941ced4] 前端两个 `el-form` 的 `label-position` 不一致（一个漏加 `label-position="left"`），导致 label 左边缘错位，靠用户视觉反馈发现而非测试覆盖。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 4.1 单页签配置 | FORM/SYSTEM 从"可编辑 readonly 表单"回归为"只读端点展示"，API 保持可编辑 | 用户评审后明确偏好非编辑框形式的只读展示，且要求接口操作区分割线以下可滚动 |
| 4.1 工具栏 | 新建按钮从行操作列移至工具栏（图标+文字） | 用户要求符合 Element Plus 惯例：新建是页面级动作，放工具栏；行级操作用图标按钮 |
| 5.3 E2E | 未做浏览器级 E2E，改为组件级测试覆盖 | 与项目现有测试惯例一致（vitest 组件测试），未引入 Playwright 依赖 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (proposal.md/brainstorm.md 产物) |
| superpowers:writing-plans                        | ✓ (plan.md 产物) |
| superpowers:using-git-worktrees                  | ✓ (worktree 隔离全程) |
| superpowers:subagent-driven-development          | ✗ |
| (transitive) superpowers:test-driven-development | ✓ (每个 backend 任务先测试后实现) |
| (transitive) superpowers:requesting-code-review  | ✗ |
| superpowers:finishing-a-development-branch       | ✓ (本次 /opsx-finish) |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整个 skill——未用 subagent 执行实现任务。
  - **Why this cycle**: 本 cycle 有显式约束"main-agent-only（no task() subagents）"，且前端任务（DataSourceListPage.vue 单文件重构）与后端任务均适合主 agent 直接执行；触发条件在 cycle 开始时已由 constraint 声明，非临时判断。
  - **How to prevent recurrence**: `one-off — schema boundary case, no prevention possible`——cycle 约束显式排除 subagent，属授权边界，非流程遗漏。若未来无此约束，应按 plan.md 的独立任务拆分 subagent。

- **`superpowers:requesting-code-review`**
  - **What was skipped**: 整个 skill——未在实现完成后请求外部代码评审。
  - **Why this cycle**: 无独立 reviewer 可用（main-agent-only），且每个任务均以 TDD + 全量测试回归为质量闸门；verify.md 承担了实现一致性核验。
  - **How to prevent recurrence**: `scope-judgment rule`——当 cycle 为单 agent 且测试覆盖完整（前端 13 + 后端 71 全过）时，可用 verify 代替外部 review；若涉及跨模块接口变更（如本 cycle 的 adapter 收敛），默认仍应请求 review。

## 5. Surprises

- FORM/SYSTEM 的"统一 API 配置界面"需求，用户实际期望的是**布局统一**而非**编辑方式统一**——即三种类型共用同一块界面区域，但 FORM/SYSTEM 的接口配置为只读展示。最初理解成"全部用 API 可编辑表单"导致 5 轮返工。
- SYSTEM 数据源后端只生成 `list` 操作（只读结构数据），但前端最初尝试为 SYSTEM 生成全部 5 个操作，与后端契约不符。
- `v-else-if` 链若其前兄弟是注释/空白而非 `v-if` 元素，Vue 编译器报 `Codegen node is missing` 而非直观的模板错误，调试成本高。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **删除函数前先 grep 全部调用点** → **Promote to memory** (type: feedback)
  > **Why**: 5648aba 删除 `onSourceSelected()` 但 openEdit 仍调用，导致编辑弹窗静默崩溃，靠用户报告才发现。
  > **How to apply**: 任何函数/方法删除或改名时，先 `grep` 该符号在工作区全部引用，确认无残留调用再提交；IDE rename 工具优先。

- [ ] 🟡 **需求关键词"统一"需在 brainstorm 阶段澄清编辑方式 vs 布局** → **Promote to memory** (type: feedback)
  > **Why**: "希望三种数据源的配置界面是统一的"被实现为"全部可编辑表单"，实际期望是"同一布局 + FORM/SYSTEM 只读"，导致 5 轮前端返工。
  > **How to apply**: 用户说"统一/一致"时，brainstorm 阶段追问：是交互方式统一（都可编辑），还是视觉布局统一（只读展示但同区域）？输出到 proposal 的 Explicit Non-Goals。

- [ ] 📌 **Element Plus 多 form 弹窗的 label 对齐需统一 label-position** → **One-off** (記錄即可,不 promote)
  > **Why**: 单次遗漏 `label-position="left"` 导致 label 错位，纯视觉问题、无通用规律。
  > **How to apply**: 无（不推广——属一次性视觉缺陷）。
