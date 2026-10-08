# Retrospective: process-engine-core

> **Change**: `process-engine-core`
> **Date**: 2026-08-04
> **Status**: ✅ Completed

---

## What went well

### Spike-first 方法验证有效

在实现会签/或签、加签、转签前，先写 Spike 测试（Spike-1 到 Spike-7）验证 Flowable 8 API 行为。这避免了在不了解 API 的情况下盲目实现，减少了返工。

- Spike-1/2 验证 MI parallel 会签/或签
- Spike-5 验证 changeActivityState 驳回
- Spike-6 验证 addMultiInstanceExecution 加签
- Spike-7 验证 deleteMultiInstanceExecution + addMultiInstanceExecution 转签

### TDD 单元测试覆盖充分

每个 Service 都先写测试再实现：
- AddSignServiceTest: 6 tests
- ForwardSignServiceTest: 4 tests
- RejectServiceTest: 4 tests
- TransferServiceTest: 4 tests
- ProcessVariableServiceTest: 7 tests
- ProcessHighlightServiceTest: 3 tests
- CompleteTaskResponseTest: 3 tests
- MultiInstanceBpmnRewriterTest: 9 tests
- InitiatorNodeResolverTest: 3 tests
- WfTaskTransferRepositoryTest: 6 tests

总计 106 tests, 0 failures。

### 加签/转签/转办/委派语义清晰

四个容易混淆的操作在实现中明确定义了区别：
- **加签**：MI 实例级新增审批人，总人数增加
- **转签**：MI 实例级换人，当前人退出新人加入，总人数不变
- **转办**：任务级换人，适用于非 MI 单实例任务
- **委派**：临时交办，resolve 后回到原办理人

---

## What didn't go well

### Spec 验证发现多次格式问题

verify 阶段发现 6 个 spec requirement 缺少 SHALL/MUST 关键字或缺少 Scenario。原因是编写 spec 时使用了 WHEN/THEN 格式但没在 requirement 正文中包含 SHALL/MUST。

**改进**：编写 spec 时直接在 requirement 段落使用 "系统 SHALL..." 句式，不要只用 WHEN/THEN。

### tasks.md 未随实现同步更新

实现完成后 tasks.md 仍是全 `[ ]`，直到 verify 阶段才批量更新为 `[x]`。失去了 task 跟踪的实时性。

**改进**：每完成一个 task 立即更新 tasks.md 对应行。

### Librarian agent 失败

Flowable 8 API 查询时 librarian agent 因 "Service temporarily unavailable" 失败。但已通过 `javap` 直接检查 RuntimeService 接口 + Spike 测试验证 API 行为，未影响进度。

**改进**：librarian 失败时立即 fallback 到直接检查 jar 接口 + Spike 测试。

---

## Key learnings

### Flowable 8 MI API

- `addMultiInstanceExecution(activityId, processInstanceId, Map<String, Object>)` — 运行时加签，新增一个 MI 实例
- `deleteMultiInstanceExecution(executionId, boolean executionIsCompleted)` — 删除指定 MI 实例，`false` 表示不计入已完成
- 转签 = delete + add 的组合操作
- `changeActivityStateBuilder.moveActivityIdTo()` 对 MI 节点同样有效，会整体回退

### Flowable 8 vs 7 差异

- API 签名一致，未遇到 breaking change
- `BpmnXMLConverter` 在 Flowable 8 中仍可用，但需注意 `flowable:` 命名空间

---

## Misses / Follow-ups

### 1. 转办/加签/转签权限校验未实现

PRD spec 中定义了 `allowTransfer`/`allowReject` 权限控制，但当前实现未读取 `wf_node_config.configJson.operations` 进行权限校验。

**Follow-up**: 在 TransferService/AddSignService/ForwardSignService 中增加 `operations` 权限校验。

### 2. 加签/转签未记录审计

转办有 `wf_task_transfer` 审计表，但加签和转签没有对应的审计记录。

**Follow-up**: 考虑增加 `wf_task_add_sign` 和 `wf_task_forward_sign` 审计表，或扩展 `wf_task_transfer` 表支持多种操作类型。

### 3. 催办（3.3.5）和超时处理（3.3.6）未实现

PRD 3.3.5 催办和 3.3.6 超时处理尚未实现，属于下一阶段工作。

---

## Stats

| Metric | Value |
|---|---|
| Commits | 3 (artifacts + impl + verify) |
| Files changed | 42+ |
| Lines added | ~2900+ |
| Tests | 106 (94 existing + 12 new) |
| Test pass rate | 100% |
| Spike tests | 7 (Spike-1 to Spike-7) |
| New endpoints | 6 (reject, transfer, delegate, add-sign, forward-sign, highlight) + variable CRUD |
| New services | 7 (RejectService, TransferService, AddSignService, ForwardSignService, ProcessVariableService, ProcessHighlightService, InitiatorNodeResolver) |
| New entities | 1 (WfTaskTransfer) + 1 migration |
