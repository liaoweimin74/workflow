# Retrospective: form-create-datasource-binding

> Written: 2026-09-02 (after verify passed with warnings)
> Commit range: `58999d1..HEAD`
> Worktree: `.worktrees/form-create-datasource-binding/`

---

## 0. Evidence

- **Commit range**: `58999d1..HEAD` (2 implementation/artifact commits before this report)
- **Diff size**: approximately +240 / -36 lines across 9 implementation files, plus verification artifacts
- **Tasks done**: 12/12 implementation checklist items (`tasks.md`)
- **Active hours**: less than 1 hour of active implementation after delegation cancellation
- **Subagent dispatches**: 4 attempts; all cancelled/failed before final implementation, then main agent completed the work
- **New external dependencies**: none; frontend dependencies installed from existing package manifest
- **Bugs encountered post-merge**: none; not merged yet
- **OpenSpec validate state at archive**: pass (91/91)
- **Test coverage signal**: 681 full-suite tests passed; focused datasource/config tests 13 passed

Commit chain:

```
58999d1 change: form-create-datasource-binding
ecec392 feat: add option datasource mapper
a254094 feat: bind form options to data sources
```

## 1. Wins

- 采用项目自有 vendor 扩展，没有修改 form-create 依赖源码。
- 通过 `OptionDataSourceConfig`、`mapOptionRecords` 和 `resolveOptionDataSource` 将配置、转换、查询职责分开。
- 保留无 datasource schema 的旧渲染同步路径，避免历史表单因异步解析而改变行为。
- 自动化证据覆盖普通映射、空结果、缺失字段、嵌套 children、乱序扁平树、配置校验、构建和全量测试。

## 2. Misses

- 🟡 [painful | evidence: 4 个子代理 session 均未产生可用实现结果] 代理执行连续超时，最终需要主代理接管；后续应对单文件任务设置更小的委派边界和更快的接管阈值。
- 🟡 [painful | evidence: verify.md §Overall Decision] 尚未运行真实浏览器设计器 smoke test，无法从自动化测试确认用户点击配置入口后的完整交互链路。
- 📌 [nit | evidence: frontend full test output] jsdom 输出既有 canvas `getContext()` warning，测试仍全部通过；可在后续测试基础设施变更中统一处理。

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| 1.2 | 没有抽取完整 DataPicker/LookupPicker 共用 composable，而是直接复用 `dataSourceApi` 与 metadata 约定 | 当前代码已有可直接使用的 API，抽取共享层会扩大范围；配置组件保持最小实现 |
| 4.3 | 未完成真实浏览器手工 smoke test | 本轮只执行自动化测试、类型检查和构建，作为 PASS WITH WARNINGS 记录 |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ |
| superpowers:writing-plans | ✓ |
| superpowers:subagent-driven-development | ✗ |
| superpowers:test-driven-development | ✓（通过 prompt 与主代理测试循环） |
| superpowers:verification-before-completion | ✓（执行测试、构建和 OpenSpec 校验后才报告） |
| superpowers:using-git-worktrees | ✓（通过 opsx-ff 创建） |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 取消了任务级 review 子代理和后续子代理驱动循环。
  - **Why this cycle**: 用户明确要求“取消所有子代理任务，全部由主代理完成”；随后所有实现/审查子代理被逐个取消或已失败，主代理接管实现。
  - **How to prevent recurrence**: `one-off — schema boundary case, no prevention possible`；这是用户在本周期明确改变执行方式的边界情况，不是默认工作流。

## 5. Surprises

- 预期可直接使用的 form-create vendor 工具是 JavaScript，而新增 resolver 使用 TypeScript，导致需要额外处理 JS/TS 注册与类型边界。
- 初次把所有规则都改成异步解析会破坏既有测试的同步挂载时序；增加“仅存在 datasource 时才异步解析”后恢复兼容。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **异步 schema 扩展必须保持无扩展路径同步** → **Promote to project CLAUDE.md**
  > **Why**: 首次实现导致 25 个既有 FormRenderer 测试因挂载时序变化失败，随后通过条件异步解析修复。
  > **How to apply**: 修改已有 schema 渲染入口并引入异步数据时，先保留没有新节点时的原同步路径。

- [ ] 📌 **为大范围 OpenSpec 变更预留浏览器 smoke test** → **Promote to skill**
  > **Why**: 类型、单元测试和构建无法验证设计器真实点击配置入口的完整交互。
  > **How to apply**: 任何新增设计器配置组件的变更，在 verify 阶段至少执行一次真实浏览器路径。
