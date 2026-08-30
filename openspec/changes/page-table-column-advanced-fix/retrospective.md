# Retrospective: page-table-column-advanced-fix

> Written: 2026-08-30 (after verify passed)
> Commit range: `12beb67..63448dc`（4 commits）
> Worktree: `.worktrees/page-table-column-advanced-fix/`

---

## 0. Evidence

- **Commit range**: `12beb67..63448dc`（4 commits）
- **Diff size**: +541 / -7 lines across 9 files（实现部分：`DsBindingConfigDialog.vue` +21/-7、测试 +49）
- **Tasks done**: 9/9
- **Active hours**: ~1h
- **Subagent dispatches**: 0（用户明确要求"所有任务都由主代理自己完成"；最初派出的 1 个 background agent 在收到指令后立即取消）
- **New external dependencies**: none
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: pass（`openspec validate --all --json` → failed: 0）
- **Test coverage signal**: vitest — `DsBindingConfigDialog.table.test.ts` 6/6 PASS、`PageDataTable.test.ts` 7/7 PASS；`DsBindingConfigDialog.container.test.ts` 5 测试中 3 个为 pre-existing 失败（main 改动前同样失败）

Commit chain (時序):

```
12beb67 table-column-customization: archive change（base）
4c6c429 change: page-table-column-advanced-fix        （artifacts）
678cda6 test: DsBindingConfigDialog 列高级字段回填/保存回归用例（RED）
3a1798d fix: initTableData 保留列高级字段，回填不再丢弃（GREEN）
63448dc fix: handleConfirm 保存列时透传高级字段（GREEN）
```

---

## 1. Wins

- [evidence: 678cda6→63448dc] 严格执行 TDD RED→GREEN：先写两个回归用例并确认 RED（高级字段 undefined），再最小化实现转 GREEN。
- [evidence: 探索阶段 + 63448dc] 根因定位精确（`initTableData`/`handleConfirm` 字段白名单重建），改动最小化——单文件两个函数，渲染端/后端/VIEW 链路零改动。
- [evidence: design.md §方案 1] 透传字段清单与 `QueryColumnsConfig.saveAdvanced` 及 `ViewCompiler.compileColumns` 完全一致，两条链路行为对齐。
- [evidence: verify.md §4] design 决策与 delta spec 的 4 个 Scenario 一一对应，无漂移。

## 2. Misses

- 🟡 [painful | evidence: 误写 main `frontend/.../DsBindingConfigDialog.table.test.ts`] **edit 工具对 worktree 绝对路径误写到 main 会话根目录**。发现后复制回 worktree 并 `git checkout` 恢复 main，后续所有 worktree 文件修改改用 bash 行级操作。浪费约 10 分钟。
- 🟡 [painful | evidence: container.test.ts 3 failed] `DsBindingConfigDialog.container.test.ts` 3 个失败为 pre-existing（displayMode 相关），不在本 change 范围，未修复。已在 tasks.md 3.2 与 verify.md §2 记录。
- 📌 [nit | evidence: junction 创建] worktree 的 `frontend/node_modules` 因 .gitignore 不复制，需手动 `mklink /J` 指向 main 的 node_modules 才能跑 vitest。非阻塞但每次 worktree 都遇到。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 1-4 实现方式 | plan 要求 `task()` 派 deep subagent 逐任务实现 | 用户明确指令"所有任务都由主代理自己完成"，主代理直接实现（首个 background agent 已取消） |
| 3.3 eslint | 项目无 eslint 配置（无 `.eslintrc*`/`eslint.config.*`），改用 `npx tsc --noEmit` 类型检查 | 前端工具链实际使用 tsc（package.json build 脚本） |
| verify/retrospective | apply 阶段即生成（非等 finish） | schema status 显示二者已解锁 ready，且指令要求在 apply 完成后生成 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（ff 阶段生成 brainstorm.md） |
| superpowers:writing-plans                        | ✓（ff 阶段生成 plan.md） |
| superpowers:using-git-worktrees                  | ✓（.worktrees/ 隔离实现） |
| superpowers:subagent-driven-development          | ✗（用户要求主代理完成） |
| (transitive) superpowers:test-driven-development | ✓（RED→GREEN 严格执行） |
| (transitive) superpowers:requesting-code-review  | ✗（主代理自审 + verify 校验） |
| superpowers:finishing-a-development-branch       | ✗（属 finish 阶段） |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整个 subagent 派发 + task-reviewer 审查环节
  - **Why this cycle**: 用户在本 change apply 开始时明确指令"所有任务都由主代理自己完成"，覆盖了 schema 默认的 subagent 流程。已派出的第一个 background agent（bg_3f17bfac）在指令后立即取消。
  - **How to prevent recurrence**: `user-instruction override` —— 用户显式指令优先于 skill 流程；主代理直接实现时以 TDD + 自审 + verify 校验兜底。无需 schema 改动。

- **`superpowers:requesting-code-review`**
  - **What was skipped**: 外部 reviewer 审查
  - **Why this cycle**: 主代理直接实现且变更极小（单文件两函数），以 TDD 测试 + `tsc --noEmit` + verify.md 多维度校验替代外部 review。
  - **How to prevent recurrence**: `scope-judgment rule` —— 小变更（单文件、测试全绿、类型检查通过）可由 verify 阶段覆盖；大变更仍应走 reviewer。

## 5. Surprises

- edit 工具把 `D:\aicode\workflow\.worktrees\...` 的绝对路径解析到 main 会话根目录（`D:\aicode\workflow\...`），导致误改 main 文件。read 工具则能正确读 worktree 路径。
- worktree 的 `frontend/node_modules` 不存在（.gitignore 排除），需手动 junction；vitest 首次运行因缺依赖报 "Module not found"。
- `git merge-base HEAD origin/main` 返回较旧 commit（d8f9338），导致 diffstat 混入历史变更；用本 change 前 commit `12beb67` 作为 base 才得到正确统计。

## 6. Promote candidates — long-term learning

- [ ] 🟡 **edit/write 工具对 worktree 路径可能误写 main 会话根目录；worktree 文件修改应用 bash 行级操作并事后验证** — **Promote to project CLAUDE.md / docs/learnings**
  > **Why**: 本 change 中 edit 误改 main 文件，靠 `git checkout` 恢复；浪费 10 分钟并产生一次误提交风险。
  > **How to apply**: 任何对 `.worktrees/<name>/` 下已存在文件的修改，优先用 bash（PowerShell 行级替换 + `[IO.File]` 写回保持 LF），修改后 read/git status 验证落点。

- [ ] 📌 **worktree 需手动 junction `frontend/node_modules`** — **One-off**（记录即可，不 promote）
  > **Why**: 每个新 worktree 都会遇到，但已有固定解决命令（`mklink /J`），无需自动化。
  > **How to apply**: 新建 worktree 后跑 vitest 前，先检查并创建 junction。

- [ ] 📌 **`git merge-base HEAD origin/main` 在 worktree 可能返回过旧 base** — **One-off**（记录即可，不 promote）
  > **Why**: diff 统计应以 change 前的 commit（如 12beb67）为 base，而非 merge-base。
  > **How to apply**: 统计 change diff 时用 `git log --oneline <change-base>..HEAD` 显式指定。
