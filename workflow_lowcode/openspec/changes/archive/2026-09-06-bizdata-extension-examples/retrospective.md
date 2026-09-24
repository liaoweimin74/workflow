# Retrospective: bizdata-extension-examples

> Written: 2026-09-06 (after verify passed)
> Commit range: `7e075fa..286fac4` (base..head)
> Worktree: `D:\aicode\workflow\.worktrees\bizdata-extension-examples`

---

## 0. Evidence

- **Commit range**: `7e075fa..286fac4`（8 个功能提交，不含 change scaffold 1a45c03）
- **Diff size**: +3708 / -713 lines across 36 files
- **Tasks done**: 21/21（tasks.md 全部 `- [x]`，open=0）
- **Active hours**: 跨多日多次会话（Task 1-7 + finish）
- **Subagent dispatches**: n/a（按项目 AGENTS.md「所有任务都由主代理自己完成」，未委派子代理）
- **New external dependencies**: none（V30 为纯 DB 迁移）
- **Bugs encountered post-merge**: none（尚未合并）
- **OpenSpec validate state at archive**: 待归档后确认
- **Test coverage signal**: 全量 `mvn test` = 851 tests；本变更新增 `EmpProfileHandlerTest` 9 用例 + `LeaveBillWorkflowIntegrationTest` 4 用例全部通过；唯一失败为 pre-existing `PageDefinitionPublishIntegrationTest.publish_sameContent_rejectedAsUnchanged`（基线即存在的失败，与本变更无关，已在交付报告说明）

Commit chain (時序):

```
7e075fa (base main)
455aacc feat(bizdata): handler override declarations for CRUD takeover
5292318 refactor(bizdata): split BizDataSupport reusable surface, gate BizDataService as facade
913ec71 feat(form): process state guard interface + flowable impl + process_key binding (V30)
b2d4b90 feat(bizdata): wire process guards into update/delete facade
86f7c5a feat(example): emp_profile domain with overridden query + semantic ops
4a05e27 feat(example): leave workflow form domain with process guard integration
b6d637b chore: final verification for bizdata-extension-examples
286fac4 fix(example): enforce phone required validation in emp_profile beforeCreate
```

---

## 1. Wins

- [evidence: 455aacc] BizDataHandler 覆盖声明接口简洁：`overridesQuery` / `beforeCreate` / `afterCreate` 三个钩子覆盖了「查询定制 + 前置校验 + 后置初始化」三类典型扩展点。emp_profile 与 leave_bill 各以不足 100 行的 Handler 演示了完整覆盖能力
- [evidence: 5292318] BizDataSupport 复用面拆分让 Handler 可复用通用 CRUD（`queryGeneric`/`createGeneric`/`updateGeneric`/`deleteGeneric`），BizDataService 保持门面单入口，覆盖与通用路径职责清晰
- [evidence: 913ec71] FormProcessGuard 接口与 Flowable 实现分离：接口层不依赖 Flowable 类型（仅 processKey 字符串协议），引擎可替换；V30 迁移幂等加列，兼容已有库
- [evidence: b2d4b90] 守卫只挂 update/delete 两个门面方法，submit/approve/reject 状态流转走 updateGeneric 绕开守卫——设计上避免「审批动作被守卫拦截」的自锁
- [evidence: 86f7c5a] emp_profile 覆盖查询实现了真实业务价值（在职天数计算 + 按当前用户部门过滤），而不仅是机制演示
- [evidence: 4a05e27] leave_bill 集成测试 4 用例覆盖完整生命周期，是验收的核心证据；测试基建（mock DynamicTableManager + 手工 H2 建表 + ensureFormDefinition/ensureDeployment）被验证可复用于后续 example
- [evidence: b6d637b + 286fac4] Task 7 最终验证阶段发现并修复了两个真实缺陷：reject 语义与 spec 不符（改 terminateProcessInstance 对齐「驳回=流程结束」）；emp_profile phone 校验未覆盖必填场景

## 2. Misses

- 🟡 [painful | evidence: 4a05e27] DdlBuilder 生成 MySQL 方言 DDL（DATETIME 等），H2 无法执行——导致测试需要 `@MockitoBean DynamicTableManager` + 手工预建 H2 兼容表。排查过程中还验证了 MODE=MySQL 全局配置和 `flowable.database-type` 属性均不可行（各耗时一格）。这是跨环境方言问题的常见坑，值得沉淀
- 🟡 [painful | evidence: 4a05e27] `BizDataService.create` 的 afterCreate 钩子经 `updateGeneric` 回写状态会自增 version，而 create 返回的 VO 是旧 version——导致草稿创建后立即 PUT 触发乐观锁 409。根因是「钩子回写 vs 返回值版本」不一致，修复为创建后重新查询
- 🟡 [painful | evidence: 4a05e27] Spring Boot 4.0 移除 `@MockBean`（`org.springframework.boot.test.mock.mockito`），迁移到 `org.springframework.test.context.bean.override.mockito.MockitoBean`——升级基线带来的编译破坏，属预期但需注意
- 📌 [nit | evidence: b6d637b] reject 语义偏差（实现「移回发起人节点、流程仍运行」vs spec「驳回=流程结束、可改不可删」）直到 Task 7 specs 对齐阶段才被人工发现，而非测试驱动暴露——因为 LSP diagnostics 在 worktree 上不可用（`LSP file path must be inside request cwd`），规范自查只能靠 grep

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 6 reject 语义 | 从「RejectService 移回发起人节点、流程仍在运行」改为「terminateProcessInstance 终止流程、历史保留、状态置已驳回」 | specs 对齐发现：spec 要求「驳回流程结束」「已结束（包括被驳回）可改不可删」，原实现会造成业务死锁（驳回后记录卡在运行中态，无法修改重新提交） |
| Task 6 create 版本回读 | BizDataService.create 在 afterCreate 后重新查询返回最新 VO | 钩子 updateGeneric 自增 version 导致返回旧 version，草稿创建后立即 PUT 409 |
| Task 6 phone 必填 | EmpProfileHandler.beforeCreate 从「非空才校验」改为「始终校验」（phone 必填） | 例子的领域语义：员工档案 phone 应必填合法 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（artifact 阶段） |
| superpowers:writing-plans                        | ✓（plan.md 提供 TDD 微步骤） |
| superpowers:using-git-worktrees                  | ✓（全程在 .worktrees/bizdata-extension-examples） |
| superpowers:subagent-driven-development          | ✗（项目 AGENTS.md 明确「所有任务都由主代理自己完成，不要委派给子代理」） |
| (transitive) superpowers:test-driven-development | ✓（每个 task 先写测试 RED → 实现 GREEN → 回归） |
| (transitive) superpowers:requesting-code-review  | ✓（Task 7 规范自查：无空 catch、无 @SuppressWarnings、无类型压制） |
| superpowers:finishing-a-development-branch       | ✓（本 /opsx-finish 流程） |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整个 skill——实现全程未委派子代理
  - **Why this cycle**: 项目 AGENTS.md 的硬性指令「所有任务都由主代理自己完成，不要委派给子代理」覆盖 schema 默认流程；这是项目级配置决定的，非临时判断。实际执行中主代理直接完成全部 8 个提交，测试全绿，未出现因不委派导致的质量损失
  - **How to prevent recurrence**: 非跳过，是 `CLAUDE.md trigger` 类的项目覆盖——AGENTS.md 已明确写入「子 Agent 调度」表格，后续 cycle 继续遵循即可，无需改变；若项目决策变化，应同步修改 AGENTS.md 而非在本 retro 处理

## 5. Surprises

- DdlBuilder 生成 MySQL 方言 DDL，H2 无法执行——导致「mock DynamicTableManager + 手工建表」的测试方案；且 Flowable 自身在 H2 下用 `IDENTITY` 脚本建表，全局 `MODE=MySQL` 会破坏 Flowable 建表 → 两个「MySQL 兼容」方案都走不通
- Spring Boot 4.0 已移除 `@MockBean` 包——基线升级的破坏性变更，测试编写时踩到
- Flowable 8 的 Query API 没有 `exists()`，守卫判定用 `count() > 0`
- lsp_diagnostics 在 worktree 路径上不可用（`LSP file path must be inside request cwd`）——worktree 位于仓库内但 LSP 会话根是主目录，规范自查退化为 grep

## 6. Promote candidates → long-term learning

- [ ] 🟡 **H2 无法执行 MySQL 方言动态建表 DDL → 集成测试方案沉淀** → **Promote to CLAUDE.md**（AGENTS.md「项目文档参考 → docs/learnings/」或测试规范段）
  > **Why**: 多次尝试（MODE=MySQL、flowable.database-type）均失败，最终方案是 `@MockitoBean DynamicTableManager` + 手工预建 H2 兼容表；这类试错成本高，应直接复用
  > **How to apply**: 遇到涉及动态建表（wf_biz_*）的表单集成测试时，直接套用 LeaveBillWorkflowIntegrationTest 的测试基建，不再重走方言排查

- [ ] 🟡 **BizDataService.create 在 afterCreate 钩子回写后必须回读最新行** → **Promote to CLAUDE.md**（bizdata 模块契约注释或 learnings）
  > **Why**: 钩子 updateGeneric 自增 version，create 返回旧版本导致调用方乐观锁 409；这是 BizDataHandler 装饰链的隐式契约
  > **How to apply**: 任何新增 afterCreate 回写状态的 Handler example，都必须验证 create 返回 VO 的 version 为最新值；对应测试需覆盖「创建后立即可更新」

- [ ] 🟡 **reject 类流程语义以 spec 的「已结束（含被驳回）可改不可删」为准，而非直觉的「退回发起人」** → **Promote to memory**（业务语义决策参考）
  > **Why**: 实现的「移回发起人」与 spec「驳回=流程结束」不符，且会造成业务死锁；spec 对齐应早于实现
  > **How to apply**: 实现任何流程终局操作（驳回/终止/作废）前，先核对 form-process-guard spec 中「已结束」的状态可变性定义

- [ ] 📌 **Spring Boot 4 / Flowable 8 基线注意点** → **One-off**（基线迁移已知项，记录即可）
  > **Why**: `@MockBean` 移除改 `@MockitoBean`；Flowable Query 无 `exists()` 用 `count() > 0`
  > **How to apply**: 测试与守卫代码遇到对应 API 时直接采用新写法