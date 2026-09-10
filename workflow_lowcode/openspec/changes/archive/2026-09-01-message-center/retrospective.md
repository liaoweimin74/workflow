# Retrospective: message-center

> Written: 2026-09-02 (after implementation verification)
> Commit range: `c8848cc..0c01e9c` (8 implementation commits)
> Worktree: `D:/aicode/workflow/.worktrees/message-center/`

---

## 0. Evidence

- **Commit range**: `c8848cc..0c01e9c` (8 commits)
- **Diff size**: 由 8 个实现/测试提交组成，涉及后端分页、通知渠道、前端组件和测试基线；最终 worktree clean。
- **Tasks done**: implementation tasks completed；原始 `verify.md` 仍是 planning-phase artifact，未反映本次实现状态。
- **Active hours**: 约 5 小时，包含分页协议迁移、通知渠道重构、表单布局修复和全量测试修复。
- **Subagent dispatches**: 0；遵循用户要求，所有工作由主代理完成。
- **New external dependencies**: none。
- **Bugs encountered post-merge**: 0；尚未合并主分支。
- **OpenSpec validate state at archive**: `verify.md` 为 planning-phase `PASS WITH WARNINGS`，未重新生成 implementation-phase validate 报告。
- **Test coverage signal**: 后端 `mvn test`：809 个测试通过；前端 `npm test -- --no-file-parallelism`：56 个测试文件、642 个测试通过。

Commit chain:

```text
c953d38 fix: unify pagination as one-based
557ed7f feat: centralize notification channel management
35eeb8d fix: align dynamic form labels
7877d14 docs: add pagination migration plan
3d44061 test: align notification and pagination contracts
df88867 fix: use unified data picker pagination
60569f8 test: stabilize frontend suite
0c01e9c test: isolate form renderer bindings
```

---

## 1. Wins

- 统一前后端分页协议为 1-based，底层 JPA/SQL 仅在边界转换；真实 user-tree 请求 `page=1` 返回 HTTP 200 且响应页码为 1。
- 统一数据源元数据和数据查询链路，`UnifiedDataSourceAdapter` 修复了绕过 `SystemInternalController` 的实际分页路径。
- 渠道管理收归管理员：`ChannelConfig.vue` 增加启用/禁用操作，后端提供对应接口并持久化渠道状态。
- 渠道禁用只阻止新消息创建投递记录，已创建的发送/重试任务继续处理；`MessageDispatcherTest` 和 `MessageServiceTest` 覆盖了该边界。
- 删除用户端通知设置入口与个人订阅投递判断，避免“用户关闭渠道但系统仍按强制规则发送”的语义冲突。
- `SearchTable`、`FormRenderer`、页面级 drawer/inline 容器共享动态 labelWidth 计算，修复 form-create 默认 125px 留白问题。
- 全量前端测试从 39 个失败恢复到 642/642 通过；期间补齐 Pinia、图标 mock、数据源绑定上下文和过期分页断言。

## 2. Misses

- 🟡 **painful**：原始 `verify.md` 没有在 apply 完成后重新生成，最终 archive 前仍显示 planning-phase 状态；应在实现结束时先运行并更新 implementation verification artifact。
- 🟡 **painful**：分页迁移初期只修复了 `SystemInternalController`，遗漏了 `UnifiedDataSourceAdapter.queryUsers()` 的真实调用路径，导致用户仍看到负页码异常。
- 🟡 **painful**：第一次动态 labelWidth 实现把 option 放在 FormRenderer 顶层，未进入 `option.form`，需要通过实际 form-create 代码追踪后修正。
- 📌 **nit**：测试环境 jsdom 不实现 Canvas `getContext()`，因此动态标签测试产生提示；生产浏览器不受影响，但可进一步抽离纯估算函数减少测试噪音。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 全量分页迁移 | 额外修改了较多既有前端测试 fixture 和页面容器测试 | 原始测试仍断言 0-based，无法证明新协议；必须同步契约而不能跳过测试 |
| 通知用户订阅 | 从“返回能力字段并禁用 IN_APP”调整为删除用户通知设置及 Controller | 用户明确要求渠道由管理员统一控制，普通用户不能设置 |
| 渠道状态存储 | 使用 `msg_channel_config` 中 `__enabled` 配置键，而未新增表 | 复用已有加密配置存储和渠道配置页面，降低迁移范围 |
| 渠道禁用时机 | 同时在 `MessageDispatcher` 和直接 `MessageService.send()` 边界处理 | 公告/测试消息可绕过 Dispatcher，必须覆盖两条新消息创建路径 |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ |
| superpowers:writing-plans | ✓ |
| superpowers:using-git-worktrees | ✓（使用既有 worktree） |
| superpowers:subagent-driven-development | ✗ |
| superpowers:test-driven-development | ✓ |
| superpowers:systematic-debugging | ✓ |
| superpowers:verification-before-completion | ✓ |
| superpowers:frontend | ✓ |
| superpowers:visual-qa | ✗ |
| superpowers:finishing-a-development-branch | ✓（执行到测试门槛，因 finish 命令要求等待集成选择而未合并） |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 未派发子代理执行任务。
  - **Why this cycle**: 用户明确要求“所有任务都由主代理自己完成，不要派发任务给子代理”，该约束优先于默认并行执行建议。
  - **How to prevent recurrence**: `scope-judgment rule` — 只有在用户未禁止子代理且任务可安全拆分时才启用；若用户明确要求主代理独立完成，则记录为本周期边界条件。

- **`superpowers:visual-qa`**
  - **What was skipped**: 未完成真实浏览器截图及双 reviewer 视觉验收。
  - **Why this cycle**: 本次 finish 阶段的阻塞验证是前端 Vitest 全量测试；当前 worktree 没有可用的已登录浏览器 tab，且未启动独立前端服务进行视觉截图。
  - **How to prevent recurrence**: `scope-judgment rule` — 涉及 SearchTable/FormRenderer 视觉布局的后续实现必须在启动前端服务后运行真实浏览器截图验收；纯协议/测试修复不以视觉 QA 作为替代测试。

## 5. Surprises

- 统一数据源的 user-tree 查询并不经过 `SystemInternalController.users()`，而是由 `UnifiedDataSourceAdapter.systemQuery → queryUsers` 直接调用 `UserService`；这是负页码问题持续存在的根因。
- form-create 的默认 125px 来自依赖包 `@form-create/element-ui/src/core/config.js`，而不是项目自身 CSS；仅修改容器 padding 无法覆盖它。
- 渠道配置的“是否有配置”不能等同于“管理员是否启用”：启停状态必须独立持久化，否则保存渠道参数会意外重新启用渠道。
- `MessageService.send()` 是公告和渠道测试等业务入口，不能只在异步 Dispatcher 阶段检查渠道状态。

## 6. Promote candidates → long-term learning

- [ ] 🔴 **统一协议改造必须沿真实调用图追踪所有旁路** → **Promote to memory** (type: feedback)
  > **Why**: 只修 Controller 未覆盖 Adapter 直调 service 的路径，导致 page=0 运行时错误仍然存在。
  > **How to apply**: 任何跨层 API 契约迁移，在修改入口前必须用 CodeGraph/调用链枚举所有实际消费者和旁路。

- [ ] 🟡 **渠道启停状态必须与渠道配置完整性分离** → **Promote to project CLAUDE.md** (`通知模块约定`段)
  > **Why**: `isConfigured` 只能表示参数存在，不能表示管理员允许投递；混用会使保存配置覆盖启停语义。
  > **How to apply**: 设计渠道管理或投递链路时，始终分别建模 `enabled`、`configured` 和 `available`。

- [ ] 🟡 **form-create option 的表单布局属性必须放在 option.form 内** → **Promote to memory** (type: feedback)
  > **Why**: 顶层 `labelWidth` 不会被 form-create manager 读取，实际渲染仍使用默认 125px。
  > **How to apply**: 修改第三方组件布局时，先阅读依赖源码确认配置消费路径，再写组件级修复。

- [ ] 📌 **jsdom Canvas 警告不代表浏览器运行失败** → **One-off** (记录即可，不 promote)
  > **Why**: 仅发生在测试环境，代码已有无 Canvas fallback，生产浏览器原生支持 Canvas。
  > **How to apply**: 看到 jsdom API 未实现提示时，分别验证测试 fallback 和真实浏览器行为，不要盲目新增依赖。
