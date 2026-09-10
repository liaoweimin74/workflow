# Retrospective: table-form-container-linkage

> Written: 2026-08-28 (post-implementation)
> Commit range: `6af5c8c..bca13db` (5 commits)
> Worktree: `.worktrees/table-form-container-linkage/`

---

## 0. Evidence

- **Commit range**: `6af5c8c..bca13db` (5 commits, 全部实现 + 修复)
- **Commit chain**:
  ```
  7b6d34f feat: 抽取共享数据容器运行时机制
  c60dadb refactor: FormRenderer 复用共享容器机制
  6be7adb refactor: PageRendererPage 复用共享容器机制
  4fffa38 feat: 页面设计器复用数据组件配置
  bca13db fix: 数据组件旧协议兼容回填与过时测试修正
  ```
- **Diff size**: 15 files changed, 1488 insertions(+), 667 deletions(-)
  - 新增 3 文件：`useLinkageContainer.ts`(339)、`ContainerButtons.vue`(31)、`useLinkageContainer.test.ts`(389)
  - 核心重构：`FormRenderer.vue`(360 行变更)、`PageRendererPage.vue`(363)、`PageDesigner.vue`(206)
  - 兼容修复：`DataPicker.vue`、`DataPickerConfigDialog.vue`、`LookupPickerConfigDialog.vue`、`LookupPicker.test.ts`
- **Tasks done**: 14/14 (tasks.md 全部 `[x]`，0 待办)
- **Active hours**: 跨多天（artifact 生成 + 实现 + 多轮测试修复）
- **Subagent dispatches**: 0（遵循用户指令"所有任务都由主代理实现"）
- **New external dependencies**: none
- **Bugs encountered post-merge**: n/a (尚未合并)
- **OpenSpec validate state at archive**: 待执行
- **Test coverage signal**: 完整 `npm test` 从 57 失败 → 4 失败；剩余 4 个为**预存失败**（PageRenderer 3 + SearchTable 1，均在本次未触及的文件中）；`tsc --noEmit` 通过；`git diff --check` 通过
  - 运行时关键测试通过：useLinkageContainer 27、FormRenderer 36、PageRendererPage 容器 18、页面集成 8、formRuleWalk 24
  - 数据组件测试通过：DataPicker 40、DataPickerConfigDialog 15、LookupPickerConfigDialog 16、LookupPicker(重写后) 42

---

## 1. Wins

- [evidence: 7b6d34f] 抽取共享数据容器运行时机制（`DsBindingEngine.ts` + `useLinkageContainer.ts` + `ContainerButtons.vue`），使 FormRenderer 与 PageRendererPage 复用同一套容器逻辑，消除重复实现。
- [evidence: c60dadb、6be7adb] FormRenderer 与 PageRendererPage 均接入共享 `useLinkageContainer`，两处显示模式（dialog/newTab/inline）与按钮行为保持一致。
- [evidence: 4fffa38] 页面设计器（PageDesigner）复用表单设计器的数据源配置流（`DsBindingConfigDialog` 的 formContainer、DataPicker/LookupPicker 配置弹窗），设计时配置体验统一。
- [evidence: bca13db + 测试] 数据组件旧协议兼容（`sourceFormKey` 回退、`fetch` 输出、targetForms/targetColumns 回退）确保既有 schema 不破坏；过时测试重写为 `dataSourceId` 数据源路径后全部通过。
- [evidence: tasks.md 14/14] 6 个 task 全部验收标准达成，无遗留待办。

## 2. Misses

- 🟡 [painful | evidence: git log bca13db] **测试修复成本高**：LookupPicker 旧协议（fetchApi/fetch 运行时路径）在新 `dataSourceId` 机制下失效，初误判为实现回归，反复尝试恢复旧路径；用户澄清"实现正确、测试过时"后才改为重写测试。过程中浪费了多轮验证与方向修正。
- 🟡 [painful | evidence: 完整测试遗留] 完整套件仍残留 **4 个预存失败**（PageRenderer placement/style、SearchTable treeProps），非本次引入，但导致满足 `/opsx-finish` 的"全部通过"门槛需要多次定位确认。
- 📌 [nit | evidence: tests] 跨测试异步泄漏：多处需用 `flushPromises` 替代双重 `nextTick` 才能稳定断言 http 调用，测试健壮性仍较脆弱。

## 3. Plan deviations

- **Task 6（事件流配置界面）**：原计划在页面设计器创建事件流配置界面；实际以"表单设计器已有配置流复用"方式落地（PageDesigner 复用 DsBindingConfigDialog 等），未从零新建一套页面事件流编辑器。原因：复用既有一致配置模型，避免双轨维护。
- **Task 5（智能数据同步）**：随共享容器运行时（`useLinkageContainer`）统一实现，保存后同步对应行逻辑内聚到共享层，而非 formContainer 单独实现。

## 4. Skill / workflow compliance

| Skill | Used? | Note |
|-------|-------|------|
| test-driven-development | ✅ | 实现阶段写测试驱动（useLinkageContainer.test.ts 等）；兼容修复逐用例验证 |
| using-git-worktrees | ✅ | 变更在 `.worktrees/table-form-container-linkage/` 中开发 |
| writing-plans / executing-plans | ✅ | plan.md 驱动分步实现 |
| systematic-debugging | ✅ | 对 LookupPicker 失败走假设→验证循环（但一度方向错误见 §2/§5） |
| verification-before-completion | ✅ | `tsc` + `git diff --check` + 完整 `npm test` 均为证据 |

### Deliberately Skipped Skills

无。apply 阶段技能均已按需使用。

## 5. Surprises

- [assumption broken | evidence: bca13db] 假定"LookupPicker 的 fetchApi/fetch 是公开接口必须保留"——实际新 `dataSourceId` 数据源机制已取代旧运行时路径，真实调用方（DictPage、FormRenderer、PageRendererPage）全部走 `dataSourceId`；旧测试断言是基于已被取代的协议。此假设错误导致一度试图恢复已废弃逻辑。
- [assumption broken | evidence: git diff 6af5c8c..HEAD] 起初将完整套件的失败误归因于本次重构，经 `git diff` 逐一确认 DataPicker/LookupPicker/SearchTable/PageRenderer 运行时源码无改动后，方确认大部分失败为预存。

## 6. Promote candidates — long-term learning

- [ ] 🟡 **`dataSourceId` 数据源机制取代了 LookupPicker/DataPicker 的旧 fetchApi/fetch 运行时路径；改动运行时协议时，应同步甄别并更新过时测试，而非保留已废弃协议**
  - **Promote to** memory
  - > **Why**: 本次因错误保留废弃协议而多轮返工；真实调用方与新机制一致，旧测试才是真过时。
  - > **How to apply**: 重构组件数据获取路径时，先用 `git diff --name-only` + 调用方搜索确认旧协议是否仍被使用；若已全量迁移，直接更新测试。
- [ ] 📌 **跨测试异步泄漏需用 `flushPromises` 而非双重 `nextTick` 稳定断言**
  - **Promote to** memory
  - > **Why**: 双重 nextTick 无法完整冲刷 http 异步链，导致跨测试假失败。
  - > **How to apply**: 断言组件发起的 http 调用时，统一用 `@vue/test-utils` 的 `flushPromises`。
