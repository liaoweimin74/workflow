# Retrospective: sitewide-beautify

> Written: 2026-09-06（after verify passed）
> Commit range: `9eb0fc9..d71a362`
> Worktree: `.worktrees/sitewide-beautify`（尚未合并，待 /opsx-finish）

---

## 0. Evidence

> 量化前置数据 — 后续 Wins / Misses bullets 直接引用，避免每行重复 [evidence: ...]。

- **Commit range**: `9eb0fc9..d71a362`（8 commits）
- **Diff size**: +925 / -80 lines across 14 files
- **Tasks done**: 20/20（`grep -cE '^\s*- \[x\]' tasks.md` → 20）
- **Active hours**: ~3h（单会话）
- **Subagent dispatches**: 1（Task 1.1 派发在 abort 前完成了提交 `05181f7`；此后按用户指令"取消子代理任务，全部由主代理自己完成"，全部由主代理直接实现）
- **New external dependencies**: none
- **Bugs encountered post-merge**: none（尚未 merge）
- **OpenSpec validate state at archive**: pass（98/98：change 2/2、spec 96/96）
- **Test coverage signal**: n/a（纯视觉主题任务，无逻辑测试；以 `npm run build` + 浏览器截图/交互实测为验证手段）

Commit chain（时序）:

```
1714627 change: sitewide-beautify          （ff 基线 artifacts + specs）
05181f7 docs(design): update design tokens to indigo/cyan theme
2c050b0 style(theme): indigo/cyan design tokens with EP light/dark overrides
30d34b0 style(theme): rebuild layout shell to indigo/cyan
86b29f7 style(theme): polish login and dashboard pages
93ff677 feat(theme): final polish and verification
d71a362 docs(tasks): mark all sitewide-beautify tasks complete
```

---

## 1. Wins

- [evidence: 86b29f7 / DashboardPage.vue] 首页仪表盘从 EP 默认表格风重写为参考稿风格——渐变横幅 + 4 主题色统计卡片 + 纯 SVG 装饰图表，全部无新依赖、无业务逻辑改动
- [evidence: DESIGN.md] 令牌权威机制生效：hex 合规扫描（Task 5.2）产出的全部新色值补入 2.5 Extended Scales / 2.6 EP 派生变量 / 2.7 Decorative Gradients，实现与文档零漂移
- [evidence: 2c050b0 / style.css] 只改 EP CSS 变量即实现全站换肤（按钮/表格/菜单/表单自动继承），符合 spec「无需逐组件修改样式」的 SHALL 约束
- [evidence: 30d34b0 / AdminLayout.vue] 布局外壳在尽量小的 props/插槽改动下完成换肤，SubMenu 激活态改由 style.css 全局规则承载
- [evidence: 浏览器实测] 登录 → 仪表盘（亮/暗）→ 流程中心渲染全部确认；`documentElement.classList.contains('dark')` = true 验证暗色 class 机制未破坏

## 2. Misses

- 🟡 [painful | evidence: Task 5.3/5.4] 浏览器自动化宿主中途断连，完整亮/暗截图集（登录页、仪表盘、流程中心、列表页 ×2 模式）与部分交互回归（页签切换、流程发起）未在 agent 内跑完，verify.md §5.3 已注明"待 finish 后人工复核"——非阻塞但未达计划内的全量证据
- 📌 [nit | evidence: PRECHECK] PowerShell `(git merge-base ...)` 子表达式在 `git log --oneline X..HEAD | Measure-Object` 管道中计数误报 0，实际直接执行得 8——首次 PRECHECK 显示 commits=0 需人工二次核实才通过
- 📌 [nit | evidence: npm install] worktree frontend 缺 node_modules 导致 TS2307「Cannot find module 'vue'/'element-plus'」，需先 `npm install` 才能构建——凡新建 worktree 应预判依赖安装

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1.1 | 原计划派发子代理；实际一个 dispatch 在 abort 前完成了提交 | 用户中途指令"取消子代理任务，全部由主代理自己完成"；已完成的提交被保留并复核 |
| 1.2–1.5 | style.css 覆盖范围超出计划（额外含菜单激活态圆角底块、表格表头亮色适配、暗色下拉/输入框） | 设计决策 "SubMenu 激活态由全局 CSS 承载"（见 30d34b0），集中放 style.css 便于维护 |
| 3.3 | 统计卡片图标色扩展为靛蓝/青/琥珀/渐变交替（琥珀卡片承载 safety 语义） | 保留 safety 琥珀的业务语义的同时让卡片区有节奏感 |
| 4.2 | ProfilePage 核对结论为"无需改动"（el-card 自动继承 EP 新变量） | 无硬编码灰底，间距与全局令牌一致，无需微调 |
| DESIGN.md | 新增 2.5 / 2.6 / 2.7 三个小节（超出原 artifacts 计划） | Task 5.2 hex 合规扫描的产品：需要把 DashboardPage 装饰渐变、EP 派生变量与完整色阶登记入令牌文档 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✅（/opsx-ff 阶段使用） |
| superpowers:writing-plans                        | ✅（plan.md 由 plan agent 生成、专家复核） |
| superpowers:using-git-worktrees                  | ✅（`.worktrees/sitewide-beautify` 全程隔离） |
| superpowers:subagent-driven-development          | ❌ |
| (transitive) superpowers:test-driven-development | ❌ |
| (transitive) superpowers:requesting-code-review  | ❌ |
| superpowers:finishing-a-development-branch       | ⏳（未到时机，/opsx-finish 阶段执行） |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整个 skill——不派发子代理，实现任务全部由主代理完成
  - **Why this cycle**: 用户在本 cycle 提出明确指令"取消子代理任务，全部由主代理自己完成"。触发点是用户观察/偏好（同一次会话内 Task 1.1 dispatch 后被 abort），非 skill 本身的缺陷
  - **How to prevent recurrence**: 属于 `one-off — schema boundary case`：adopter 的用户级指令与 schema 默认（子代理驱动）冲突时，用户指令优先。这是单次显式 override，非可自动复现的模式；若多 cycle 重复出现，应把"默认主代理直接实现"写入当前 AGENTS.md 判定规则取代 schema 默认

- **`superpowers:test-driven-development`**
  - **What was skipped**: RED → GREEN → REFACTOR 测试循环
  - **Why this cycle**: 本 cycle 是纯视觉主题变更（CSS 变量、class、内联 SVG 装饰），无业务逻辑可测；plan.md 与 tasks.md 均未定义任何单元测试任务（20/20 全部是样式与验证任务），验证手段为 `npm run build` + 浏览器截图/交互实测
  - **How to prevent recurrence**: `scope-judgment rule`——TDD 适用于有逻辑分支的代码变更；纯样式/令牌层任务可用 `npm run build`（tsc 类型检查）+ 视觉回归替代，判定标准为"diff 是否含 `<script>` 逻辑变更"。本 cycle 的 diff 全部在 style.css / template / class 层，无 script 逻辑

- **`superpowers:requesting-code-review`**
  - **What was skipped**: 实现完成后的代码审查阶段（oracle / 子代理审查）
  - **Why this cycle**: 用户明确取消子代理审查流程，改为主代理自验（verification-before-completion：构建通过 + 浏览器实测 + openspec validate 98/98 + verify.md PASS）
  - **How to prevent recurrence**: 同 subagent-driven-development 条目——用户级 override 取代 schema 默认审查流程；属 `one-off — schema boundary case`

## 5. Surprises

- **worktree frontend 无 node_modules**：首次 `npm run build` 报 TS2307（vue / element-plus 找不到），`npm install` 后恢复——worktree 从 git 检出不含依赖目录，需预判
- **浏览器自动化宿主中途断连**：验证阶段 paseo_browser 不可用，部分截图/交互回归未能全量完成，改为快照断言 + 标记人工复核项
- **hex 扫描噪声大**：源码中大量 hex 来自第三方/编辑器生成代码（非本次写入），需先过滤再补 DESIGN.md；DashboardPage 的手写装饰 CSS 是主要新增来源
- **DashboardPage 重写工作量集中在装饰层**：横幅渐变、SVG 波纹、柱状/环形图均为纯 CSS/SVG 叠层，约 340 行手写样式需逐段精修，收益远超预期观感

## 6. Promote candidates → long-term learning

- [ ] 🟡 **新建 worktree 后先 `npm install` 再构建** → **Promote to CLAUDE.md**（`AGENTS.md` 的 Shell 调用规则附近）
  > **Why**: .worktrees/sitewide-beautify 首次构建因缺 node_modules 报 TS2307，浪费一轮诊断
  > **How to apply**: 任何 worktree 内首次执行 `npm run build`/dev 前，先检查 `frontend/node_modules` 存在性并安装

- [ ] 📌 **PowerShell 管道中 git 子命令计数需二次核实** → **Promote to memory**（type: feedback）
  > **Why**: `(git merge-base ...)..HEAD | Measure-Object` 误报 0，直接执行同命令得 8；verify PRECHECK 差点因测量错误误判 apply 未产出
  > **How to apply**: 在 PowerShell 中执行 git 计数类 PRECHECK 时，先单独验证 merge-base 输出再计算范围，或将命令写成独立变量逐步执行

- [ ] 📌 **样式类变更的 TDD 替代策略** → **One-off**（本次视觉主题任务成立，不 generalize）
  > **Why**: 纯 CSS/令牌层无逻辑可测，构建 + 视觉回归足够；但项目后续加业务逻辑时须回归 TDD