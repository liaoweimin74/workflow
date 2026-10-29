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

## 4. origin/main 半成品预坏（已处置：revert-to-green 合入，2026-10-29）

- **处置结果**：`integrate/origin-main` 收 origin 107 笔（merge `73cf8dc0`，零冲突），断源撤除 15 文件（单笔 `c02ee1ce`，清单与理由见提交消息），三套门禁回基线后合入 main 并推送。origin 侧文件在历史与其会话分支中完整保留，对方补好实现后重新推送会自然再落地。
- **断源实况**（除原登记三簇外，演练又发现两处**运行时炸点**，编译期不报）：
  - `V2__init_data.sql` 与存量 `V2__init.sql` 版本号重复 → Flyway validate 启动炸
  - `system/controller/PostController`（origin 新增别名，路径 `/api/posts` 与存量 `api/controller/PostController` 完全重复）→ 默认 bean 名 `postController` 冲突 → **Spring 上下文炸，连锁污染 7 个测试类 35 错**。教训：不同包同名 `@RestController` 类不会报编译错，只在上下文启动时炸——归因红集先看 `ConflictingBeanDefinitionException`。
- **origin 会话再推时的适配点**（仍有效）：`LoginUserService.buildLoginUser` 现为 `(Long userId, Long clientId, String channel)` 三参，其单参调用点（`DataScopeController:121`）需适配为 `(userId, SysClient.PORTAL_CLIENT_ID, "WEB")`。
- **FE 侧同批半成品**（已随 c02ee1ce 撤除）：`PageRenderer.test.ts`(17 红)/`PageRenderer.keepalive.test.ts`(4 红) 为"先测试后实现"红灯（origin 未配套改 PageRenderer.vue）；`DataScopeDialog.vue+Test` mock `@element-plus/icons-vue` 缺 `Close` 导出，套件收集必炸。健康增量（`ViewDesigner.test` 全绿、`ViewCompilerTest` 26 例全绿、`filterMerge` 全绿等）**均已保留**。

## 5. 门禁判定的两个"不算回归"坑（2026-10-29 演练实证）

- **`test:integration` 不在官方 node 门禁口径**：backend-node `pnpm test` = `vitest run --exclude "**/integration/**"`（54/54）。集成 spec（如 `menu-client-scope.spec.ts` 的"sys_menu 全库 client_id=1"整库断言）依赖活库脏数据状态，红不红与代码回归无关，勿计入红集。
- **全量 FE 并行负载 flaky**：`DataSourceListPage.test.ts`(56 例) 245 文件全量跑时偶发 1 红、单跑全绿（VisualQueryBuilder 同类）。再次印证门禁按"红集成员"判定外，**新成员红须先单跑复核**再定性回归。
- **junction node_modules 的假红**：worktree 里用目录 junction 复用主仓 node_modules 时，`runtime-package.test.ts` 的"宿主与产物同一实现"`Object.is` 断言必红（realpath 分叉成两份模块实例）——环境副作用。FE 权威验证必须在主仓实依赖树跑。
