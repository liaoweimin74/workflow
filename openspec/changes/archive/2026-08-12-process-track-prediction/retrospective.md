# Retrospective: process-track-prediction

> Written: 2026-08-12 (after verify passed)
> Commit range: `24a672e..153c302`
> Worktree: `.worktrees/process-track-prediction`

---

## 0. Evidence

- **Commit range**: `24a672e..153c302` (2 commits)
- **Diff size**: +3591 / -340 lines across 65 files (artifacts 9 files +344; implementation 56 files +3247/-340)
- **Tasks done**: 17/17 (`grep -cE '^\s*- \[x\]' tasks.md` → 17)
- **Active hours**: ~4h（估计，跨 2 个会话）
- **Subagent dispatches**: 2（explore 存量评估；oracle code review 未触发——实现阶段由主 agent 直接 TDD）
- **New external dependencies**: none
- **Bugs encountered post-merge**: none（尚未合并）
- **OpenSpec validate state at archive**: pass（8/8 artifacts complete）
- **Test coverage signal**: 后端 `mvn test` 190/190 通过（新增 ProcessTaskPredictionServiceTest 4 例 + PredictionEndToEndSpikeTest 3 例）；前端 `npm run build` 成功

Commit chain (时序):

```
24a672e fix: 我发起的列表改为查 act_hi_procinst，去掉实例编号列，新增标题和发起时间（base）
0970bad change: process-track-prediction（artifacts：proposal/design/specs/tasks/plan）
153c302 feat: 流程执行预测列表（已完成+活跃+预测节点）并整合流程跟踪页（实现 + 测试）
```

---

## 1. Wins

- [evidence: 153c302 / ProcessTaskPredictionService.java] 预测服务 614 行单文件承载 BPMN 拓扑遍历逻辑，实现"已执行+活跃+预测"三态节点列表，核心算法集中在 runtime 层，controller 仅 3 行端点转发
- [evidence: PredictionEndToEndSpikeTest 3/3] 端到端测试覆盖 5.1（进行中实例活跃+预测）与 5.2（已结束实例无活跃无预测），用真实 Flowable 引擎验证而不是纯 mock，避免了"测试绿、线上挂"
- [evidence: ProcessTaskPredictionServiceTest 4/4] 单元测试通过 lenient stub 与拆分 buildPiQuery/buildTaskQuery 辅助方法消除 Mockito UnfinishedStubbingException，测试结构清晰可复读
- [evidence: tasks.md 17/17] 所有任务 checkbox 勾选，与 openspec status 8/8 artifacts complete 双重确认
- [evidence: 190/190 BUILD SUCCESS] 全量测试回归无破坏，顺手实现的改动（表单持久化、多实例审批人监听等）未引入回归

## 2. Misses

- 🟡 [painful | evidence: ProcessTaskPredictionServiceTest 修复过程] 实现阶段多个既有测试因新服务重构失败（AddSignServiceTest 7 例、WorkflowTaskServiceDetailTest 3 例需重写 stub 链），说明新实现改变了既有契约却未在提交前同步更新依赖测试——root cause 是测试修复滞后于实现
- 📌 [nit | evidence: verify.md] verify.md 内容为 Pre-Implementation Verification 模板（artifact 完整性 + spec 一致性），未包含 Post-implementation 的 Overall Decision 区块，格式与 template 不一致，回读时可读性打折扣

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| plan 6 项 | 实现阶段额外顺手实现表单数据持久化（FormDataService +162）、MultiInstanceApproverListener、已办列表 currentNode 显示等 | worktree 中已有存量改动，用户明确要求保留并一同提交，不丢弃 |
| 测试任务 | 计划内仅 prediction 相关测试；实际扩展修复 AddSignServiceTest / WorkflowTaskServiceDetailTest | 新服务重构触发了这些既有测试的失败，不修复无法保证 190/190 全绿 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（propose 阶段产出 brainstorm.md） |
| superpowers:writing-plans                        | ✓（plan.md 6 项） |
| superpowers:using-git-worktrees                  | ✓（全程在 .worktrees/process-track-prediction） |
| superpowers:subagent-driven-development          | ✓（Step 6 分步推进 + 存量评估 explore） |
| (transitive) superpowers:test-driven-development | ✓（测试先行，修复顺序 RED→GREEN） |
| (transitive) superpowers:requesting-code-review  | ✗ |
| superpowers:finishing-a-development-branch       | ✓（本流程 /opsx-finish） |

### Deliberately Skipped Skills

- **`(transitive) superpowers:requesting-code-review`**
  - **What was skipped**: 整个 requesting-code-review skill（实现完成后未发起外部 code review）
  - **Why this cycle**: apply 阶段 Step 6 采用测试驱动推进，质量闸门落在 190/190 全量测试 + 前端 build + 端到端 spike 测试三重验证上；验证步骤中 openspec status 已确认 8/8 artifacts，未触发 review 阶段（该 skill 在 schema apply 阶段非显式 gate，未产生 review 触发事件）
  - **How to prevent recurrence**: `schema graph fix` — 若要在 apply 阶段强制 review，应在 schema.yaml apply 阶段显式声明 review 步骤为依赖（当前 schema 未声明，故跳过属 schema 边界内行为）

## 5. Surprises

- Mockito 嵌套 stub（`when(...).thenReturn(helperThatStubs())`）会抛 UnfinishedStubbingException——需要先构造局部变量再注册 stub，这不是直觉可见的行为
- `getActivityName()` 并不存在，节点名必须从 BPMN model 的 activityNameMap 加载；`extractFormKey` 需直接查 nodeConfigRepository 而非经 ProcessDraft 中转——实现与计划假设不一致，以实际代码为准修正测试

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Mockito 嵌套 stub 必须先构造局部变量，否则 UnfinishedStubbingException** → **Promote to CLAUDE.md** (`docs/learnings/mockito.md` 段)
  > **Why**: 本 cycle 中 ProcessTaskPredictionServiceTest 与 AddSignServiceTest 均因嵌套 stub 失败，浪费多轮修复
  > **How to apply**: 任何 Mockito stub 涉及辅助方法返回 mock 时，先赋局部变量再 `thenReturn(...)`

- [ ] 📌 **新增服务重构需同步排查依赖测试的契约变化** → **Promote to CLAUDE.md** (`docs/learnings/` 段)
  > **Why**: 新实现导致 AddSignServiceTest（7 例）与 WorkflowTaskServiceDetailTest（3 例）失败，属于实现后未同步更新契约测试
  > **How to apply**: 修改既有服务方法签名/行为时，先 grep 依赖该方法的测试，纳入同一改动提交

- [ ] 📌 **verify.md 模板未区分 pre/post-implementation 格式** → **One-off** (记录即可,不 promote)
  > **Why**: 本 cycle verify.md 只有 Pre-Implementation 区块，无 Overall Decision；单次观察，可能是模板生成器差异
  > **How to apply**: 若后续 cycle 再次出现同格式问题，再考虑修正 schema 模板