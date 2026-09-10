# Retrospective: card-style-customization

> Written: 2026-09-04 (after verify precheck passed)
> Commit range: `54908bc1f67c76e9326081aa2bcfc5027adf25ac..f6107e3`
> Worktree: `D:\aicode\workflow\.worktrees\card-style-customization`

---

## 0. Evidence

- **Commit range**: `54908bc..f6107e3` (25 commits)
- **Diff size**: 以本轮 worktree 提交链为准；覆盖前端样式模型、卡片/表格渲染、配置组件、测试和设计文档，最终工作区干净。
- **Tasks done**: `8` 个 OpenSpec 任务已在实现提交链中完成；原始 `tasks.md` 未采用 checkbox 跟踪，因此无法用 checkbox 计数重建完成比例。
- **Active hours**: 约 8 小时（从设计确认、实现、迭代修复到最终测试）。
- **Subagent dispatches**: 0；按项目约束由主代理执行。
- **New external dependencies**: none。
- **Bugs encountered post-merge**: 尚未合并；实现阶段发现并修复了暗色字段对比度、表格宽度、嵌套弹窗遮罩、滚动补偿竖线和 Element Plus 表格伪元素残留等问题。
- **OpenSpec validate state at archive**: verify precheck passed；`verify.md` 存在且未勾选 `❌ FAIL`。原文件未包含标准 Overall Decision checkbox，因此保留该事实。
- **Test coverage signal**: 最终前端 Vitest `71` 个测试文件、`846` 个测试通过；后续 UI/颜色回归累计达到 `845+`，最终提交前全量测试为 `846`。

Commit chain（时序）:

```text
54908bc base branch merge-base
1aff2c2 feat: 统一样式规则解析
1c48dc8 feat: 增加卡片主题类型与蓝色科技主题
3e0a97e feat: 增加主题 CSS 脚本转换
9740321 feat: 接入卡片整体与字段规则渲染
9295f7f feat: 接入表格 CELL 样式规则
103c341 feat: 接入表格整体样式规则
c99e887 feat: 增加样式脚本弹窗与规则编辑器
c208ddc feat: 统一字段高级样式配置
e7a1f88 feat: 优化样式脚本与条件表格布局
3132f1c fix: 修复暗色主题字段对比度
3e1778e fix: 对齐样式脚本与条件表格宽度
7ee18f7 fix: 将条件样式表格嵌入配置窗体
b7aa104 fix: 修复脚本编辑弹窗遮罩层级
cb009ed fix: 清理嵌套脚本弹窗关闭残留样式
f6107e3 fix: 移除条件表格边框伪元素残留
```

## 1. Wins

- `resolveStyleRules` 将无条件 CSS、条件表达式、CSS class 合并到一个共享解析入口，卡片和表格 CELL 均可复用（`frontend/src/utils/fieldStyle.ts`）。
- 表格整体和 CELL 样式都完成了接入，`tableColumnRenderer.test.ts` 与卡片集成测试覆盖了 CSS/class/条件规则行为。
- 样式脚本抽成可复用的 `StyleScriptInput`，支持直接输入、右侧编辑图标和独立 CSS 弹窗（`c99e887`、`e7a1f88`）。
- 条件规则表格最终使用三列等分剩余宽度、固定 `56px` 操作列；浏览器实测卡片表格为 `688px`，列宽约 `212/210/210/56px`（`3e1778e`）。
- 暗色和蓝色科技主题字段颜色改为 CSS 变量消费，浏览器实测暗色背景 `rgb(29,30,31)`、字段标签 `rgb(163,166,173)`、字段值 `rgb(229,234,243)`（`3132f1c`）。
- 嵌套脚本弹窗改为 body 挂载、独立遮罩和 `z-index: 3000`，并关闭重复 body 滚动锁定；随后局部禁用 `.el-table--border::before` 解决残留竖线（`b7aa104`、`cb009ed`、`f6107e3`）。
- 最终全量 Vitest 通过，且每轮 UI 修改都补充了针对性测试。

## 2. Misses

- 🟡 [painful | `vue-tsc` 输出] 项目原有 `ListCards.vue`、`SearchTable.vue`、`PageDataTable.vue` 类型错误持续存在，无法在本变更中清零；本轮通过过滤确认没有新增样式编辑器错误。
- 🟡 [painful | 浏览器状态] 热更新/刷新多次使登录态或浏览器会话断开，导致部分视觉验收需要重复登录和导航。
- 📌 [nit | OpenSpec `verify.md`] 原验证文件保留了早期“5 个主题/历史兼容”描述，和后续无历史兼容、6 个主题设计不完全一致；归档前应由后续维护补齐验证模板或明确更新策略。

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| Task 1/2 | 增加 `StyleRule`、`base/rules` 和 `techBlue` | 用户在实现过程中明确要求无历史兼容、统一规则模型和蓝色科技预设。 |
| Task 3 | 原 `StyleRuleEditor` 先以规则卡片实现，后改为紧凑表格 | 用户反馈表格更节省空间，并要求脚本可直接输入及弹窗编辑。 |
| Task 5 | 新增 `StyleScriptInput`，并移除字段分组标题/分割线 | 用户进一步明确了字段高级配置的视觉层级和控件形态。 |
| Task 8 | 增加多轮 Element Plus overlay、滚动锁定和伪元素修复 | 浏览器实测暴露了嵌套弹窗透出、关闭残留竖线等运行时问题。 |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ |
| superpowers:writing-plans | ✓ |
| superpowers:using-git-worktrees | ✓（已有 worktree） |
| superpowers:subagent-driven-development | ✗ |
| superpowers:test-driven-development | ✓（通过失败测试→实现→通过测试执行） |
| superpowers:verification-before-completion | ✓ |
| superpowers:visual-qa | ✓（浏览器实测；独立双 oracle 未完成） |
| superpowers:finishing-a-development-branch | ✓（收尾前读取并执行） |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 未使用子代理驱动的逐任务执行模式。
  - **Why this cycle**: 项目 `AGENTS.md` 明确要求“所有任务由主代理自己完成，不要委派给子代理”，本轮所有提交均由主代理直接完成。
  - **How to prevent recurrence**: `scope-judgment rule` — 当项目级指令明确禁止子代理时，继续使用主代理执行，并在 retrospective 的 dispatches 中记录为 0；不要因通用 skill 默认建议而违反仓库约束。

## 5. Surprises

- 主题颜色已经生成 CSS 变量，但字段 CSS 仍使用硬编码浅色值；“主题配置存在”并不代表字段实际消费了主题变量。
- `el-table--border::before` 是造成嵌套弹窗关闭后残留竖线的真正来源，单纯调整 overlay z-index 或 body 滚动锁定不能完全解决视觉问题。
- `append-to-body` 会改变测试中 Teleport 内容的查询位置，组件测试不能只检查 wrapper 内文本，需要检查 `document.body` 或显式 stub Teleport。
- Element Plus `el-form-item__content` 默认 flex 布局会让表格/脚本组件看起来像悬浮层；组件根宽度和父级 content 的 display 必须同时约束。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **主题系统必须同时验证变量定义和真实消费方**
  → **Promote to memory** (type: feedback)
  > **Why**: 暗色/蓝色主题变量存在，但字段模板硬编码浅色导致实际不可读。
  > **How to apply**: 每次新增主题或颜色 token 时，同时检查目标元素 computed style 和浏览器对比度，不只检查主题对象字段。

- [ ] 🟡 **嵌套 Element Plus 弹窗必须同时处理挂载、遮罩、滚动锁定和伪元素**
  → **Promote to project CLAUDE.md** (`frontend UI verification` 段)
  > **Why**: overlay 层级修复后仍出现 body 滚动补偿和 `.el-table--border::before` 残留。
  > **How to apply**: 任何嵌套 `el-dialog` 变更都验证父子 overlay、body class/style、伪元素和关闭后的 DOM 状态。

- [ ] 📌 **组件测试使用 Teleport 时应明确查询范围**
  → **One-off** (当前前端测试约定即可)
  > **Why**: `append-to-body` 后弹窗内容不在 wrapper 内，导致原有断言误判。
  > **How to apply**: 测试 Teleport 组件时优先检查 `document.body` 或 stub `teleport`，不要假设内容仍在 wrapper 树内。
