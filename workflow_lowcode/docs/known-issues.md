# 已知问题清单

> 与 `docs/learnings/`（踩坑经验）分工：这里登记**仍然活着的问题**，解决后删除条目。
> 门禁判定以本清单为"基线红集"依据：测试红必须 ∈ 基线成员（按文件名比对，不比数量）。

## 1. Java 全量套件基线红（1 例）

- **`mvn -B test`**：`WorkflowTaskServiceCompleteTest.completeTaskWithResponse_returnsNextTask` — 确定性 NPE（单类重跑复现）。
  - **根因**：`WorkflowTaskService:1246` 实现走 `nextQuery.orderByTaskCreateTime().asc()`，但测试 mock 只 stub 了 `processInstanceId()`/`singleResult()`，`orderByTaskCreateTime()` 走 Mockito 默认返回 null → `.asc()` NPE。
  - **来源**：实现改动 `fd136bb1` 与测试树"gitignore 误吞恢复"重建（`a8991854`）之间脱节；multi-client-support 分支（43 笔）对两文件零改动，属历史预坏。
  - **修法**：测试补一行 stub `when(nextQuery.orderByTaskCreateTime()).thenReturn(nextQuery)` 即可（TaskQuery 返回自身）。归后续小批处理。
  - 登记日期：2026-10-29（本分支 FF 合并后全量首跑建立基线）。

## 2. 前端 vitest 基线红集（8 例）

- `src/layouts/__tests__/AdminLayout.page-fullscreen.test.ts` — 2 failed（composable 复用 / pageStageRef 覆盖层类）
- `src/views/system/member-group/__tests__/MemberGroupPage.test.ts` — 5 failed
- `src/views/dataSource/components/__tests__/VisualQueryBuilder.test.ts` — 1 failed（**flaky**：同码两轮 7/8 与 8/8 红，判定时按"红集成员"而非"红数"）
- **门禁判定**：全量 `pnpm vitest run` 允许红集恰为上述成员；出现新成员即回归，必须当场修。
- 参照实测：2026-10-29 主仓 FF 后 2795 passed / 8 failed 与基线逐字节一致。

## 3. vue-tsc 全量类型错误基线（68 错）

- 门禁比对同样按成员集合，新增错即回归。

## 4. origin/main 半成品预坏（在途，阻塞常规 pull）

- **现状**（2026-10-29 取证）：origin/main 领先旧基线 107 笔，其中含**编译不过**的在途代码：
  - `DataScopeService` 缺 `list/save/delete/effectiveRule/conditionFor/subjectsOf/matchedRules`（被 origin 的 `DataScopeController` 调用）
  - `AiProperties` 缺 `isConfigured()`（被 `TestCaseNarrateService` 调用）
  - `PageDefinitionRepository` 缺 `findByTypeAndFormKeyNotNullAndDataSourceIdNull`（被 `ViewDataSourceMigrator` 调用）
- **一处跨分支签名冲突**：本地 J4/dcefe462 将 `LoginUserService.buildLoginUser(Long)` 改为 `(Long, Long, String)`（userId, clientId, channel），origin 的单参调用点（`DataScopeController:121`）合入后接不上，pull 时需适配为三参。
- **处置**：待 origin 在途会话修绿推送后再 pull 适配；在那之前主仓常规 `git pull` 会把预坏代码收进来导致编译炸（2026-10-29 实测发生过一次，已回退）。
