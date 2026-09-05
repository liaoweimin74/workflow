# Retrospective: array-value-text-columns

> Written: 2026-09-06 (after verify passed)
> Commit range: `061dd6f..bc9ab63` (15 commits)
> Worktree: `.worktrees/array-value-text-columns`

---

## 0. Evidence

- **Commit range**: `061dd6f..bc9ab63`（15 commits；merge-base = `061dd6f`）
- **Diff size**: +3302 / −193 lines across 46 files
- **Tasks done**: 22/25（tasks.md 第 7 组 7.1–7.3 全量回归未勾选，但 verify.md 摘要记录实际已执行：后端 821 测试仅 1 既有失败、前端全量通过、vue-tsc 无新增）
- **Active hours**: ~30h（跨多次 apply 迭代，registry 显示 last active 15h ago）
- **Subagent dispatches**: 0（项目 AGENTS.md 强制主代理自完成，不委派）
- **New external dependencies**: none
- **Bugs encountered post-merge**: none（分支未合并；合并前修复 10+ 个自测发现问题，见 §5）
- **OpenSpec validate state at archive**: pass（97 items 全部 valid）
- **Test coverage signal**: 前端 vitest 73 文件 940 passed / 6 既有失败（`PageDataTable.linkage.test.ts` 环境性）；后端 mvn 821 测试仅 1 既有失败（publish 幂等 rejection）

Commit chain (时序):

```
061dd6f feat: 表单设计器卡片配置入口与数据源下拉显示
2d3e9b7 docs: 数组组件 value+text 双列存储变更 artifacts
de90a8f array-value-text-columns: 实现数组组件 value+text 双列存储（列映射/提交生成 label/显示/查询）
d0ccac7 refactor: select 单选/多选统一 JSON 双列存储（查询走 _text 文本列）
6603675 docs: 同步方案A（select 单选统一 JSON 双列）到 spec/design/verify
bca2cfc fix: 表单回显数组组件 options 无匹配时用 _text 注入兜底 option
1027f70 fix: _text 生成用渲染时解析后选项；树形/级联显示文本改全路径 / 分隔
888f0fb fix: cascader emitPath=true 路径数组正确解析全路径；_text 覆盖策略改值可映射时覆盖
d50ad9e feat: 级联/树形统一规范——主列叶子数组存储、_text 带前导/全路径、回显解包、显示叶子 label
b4fd747 fix: select _text 双跑覆盖（mapped 标志修分隔符误判）；树形/级联移除兜底注入；树形回显 fullPath
1b0a527 fix: 回显 select 类型不匹配时注入兜底项（hasOption 改严格比较）
5dbc43e fix: 树形回显类型归一化（showCheckbox 误判多选）；撤销 fullPath 下拉恢复节点名称
f1c0189 fix: cascader emitPath=true 多选双跑扁平叶子数组被压缩成单值（toLeafArray 用 multiple 区分）
4e3a0cf fix: elTransfer 数据源选项补 key=value（防选一项全选联动）
2322fb1 fix: 选项冗余字段逻辑统一（value→label 匹配兼容 key）
5f94ec3 fix: 移除 _text 存储兜底——选项映射失败不生成 value，留空暴露问题
8ca9075 feat: SearchTable 查询栏组件化——单选选项字段生成下拉（查询值=显示值精确匹配 _text），日期选择器，其余 input 模糊
1e5435f feat: 页面设计器表格选项组件可查询——ViewDesigner 选项类主列可筛，PageDataTable 搜索映射 _text 显示列
306bad5 fix: PageDesigner DsBindingConfigDialog filterableKeys 同加选项类判定
cd0a5bb feat: 页面表格编辑弹窗按业务表单 schema 构建组件+列表显示显示值
24f6b5a feat: 查询组件按字段组件类型构建+选项数据源取数+卡片列表显示显示值
32d5ec5 fix: 首次访问表格/卡片列表数组值列显示原始值——metaLoaded 门控子组件挂载
cc0587b docs: verify 同步 commit id（888f0fb→32d5ec5）+ 记录首次访问数组值列显示修复
4a5fbe5 fix: 表单/页面设计器属性面板回显——setRule 前 ensureRuleProps 递归补 props
bc9ab63 feat: 模糊查询字段直接用文本输入框——匹配方式=like 字段查询栏渲染 el-input，移除 filterable/allow-create 方案残留
```

---

## 1. Wins

- [evidence: commit `de90a8f`+`d0ccac7`] TDD 全程——每个修复 commit 都伴随对应测试文件用例增长（arrayValueLabel 12→42、FormRenderer 36→38、BizDataListPage 9→14、PageDataTable 11→15），verify.md 记录了 891→933 的完整测试数轨迹，回归可控
- [evidence: commit `d0ccac7`] 方案 A 决策（select 单选统一 JSON 双列存储）消除"单选存值/多选存 JSON"的查询分叉，`_text` 列统一为查询载体，后续三处查询栏（BizDataListPage/PageDataTable/PageDataCards）全部复用同一映射逻辑
- [evidence: verify.md §5] 每次迭代后跑全量回归 + vue-tsc 基线比对（既有 50/343 → 182 行错误集始终无新增），用户浏览器 dogfood（page2 表格/卡片显示 label、新增弹窗组件正常）确认真实场景修复
- [evidence: commit `32d5ec5`] 竞态修复用最小改动（`metaLoaded` 门控 v-if）解决"首次访问显示原始 value"，无重写取数链路
- [evidence: commit `bc9ab63`] 需求变更（模糊→文本输入框）作为收尾 commit 干净落地：回退 filterable/allowCreate 方案残留（types.ts 字段、模板透传、7 个透传测试一并移除），无死代码遗留在分支

## 2. Misses

- 🟡 [painful | evidence: `bc9ab63`] **需求中途变更导致整轮方案回退**——先实现了 filterable/allow-create 可输入选择器方案（SearchTable/ListCards 透传 + types.ts 字段 + 9 个测试），用户后才明确"模糊查询字段直接用文本输入框"，产生约一轮完整实现的返工。根因：需求初始表述"可输入"被解读为可输入选择器
- 📌 [nit | evidence: tasks.md] tasks.md 第 7 组（7.1–7.3 全量回归）未勾选 [x]，但 verify.md §2 声称"7 组 21 任务全部完成"且摘要实际记录了对应回归——文档状态与 verify 结论不一致，会误导追溯
- 📌 [nit | evidence: verify.md] verify.md 的 commit 范围停留在早期（`2d3e9b7..de90a8f`），后续 12 个 commit（含方案 A、三处查询栏、首次访问修复、模糊→input 收尾）未同步进 §5 区块，仅在摘要中散记

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1–5（双列生成/提交/显示/查询） | 按计划完成 | 无偏差 |
| 6.1 存量迁移 | 决定不做后端自动重建/回填 | 设计决策"label 前端生成"——后端无 options 无法生成 label，依赖编辑提交补齐（`d0ccac7`/`6603675`） |
| 7（全量回归） | 多次执行但 tasks.md 未勾选 | 每次迭代后执行；verify.md 摘要有记录，tasks.md 漏勾 |
| （新增）方案 A | select 单选也统一 JSON 双列 | 单选若存主列字符串，`_text` 查询与多选分叉，统一后查询全走 `_text` |
| （新增）SearchTable 查询栏组件化 + 选项数据源取数 | 超出原计划 | 选项类字段需在查询栏渲染下拉，需 resolveOptionRules 取数 |
| （新增）页面设计器可查询/编辑弹窗 schema 构建/卡片列表显示 | 超出原计划 | dogfood 发现设计器与卡片路径未覆盖 _text 显示/查询 |
| （新增）首次访问竞态修复 | 超出原计划 | 用户 dogfood 报"首次访问显示原始值"，根因 metaColumns 异步 vs 子组件挂载竞态 |
| （新增）模糊→文本输入框 | 需求变更，收尾 commit | 用户明确"匹配方式=模糊用文本输入框"，回退 filterable 方案 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（brainstorm.md 存在，方案 A vs B 对比） |
| superpowers:writing-plans                        | ✓（plan.md 7 组 21 任务） |
| superpowers:using-git-worktrees                  | ✓（全程 `.worktrees/array-value-text-columns`，main 保持干净） |
| superpowers:subagent-driven-development          | ✗ |
| (transitive) superpowers:test-driven-development | ✓（每次 fix 先加测试；verify.md 记录测试数逐步增长） |
| (transitive) superpowers:requesting-code-review  | ✗ |
| superpowers:finishing-a-development-branch       | ✓（本流程执行中） |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整个 skill——未委托任何子代理执行任务，主代理全程自实现
  - **Why this cycle**: 项目 `AGENTS.md` 显式强制"所有任务都由主代理自己完成，不要委派给子代理"（用户级指令优先于 skill 默认），且本 change 的核心是同一批 Vue 组件内的连续修复，上下文集中度高于并行收益
  - **How to prevent recurrence**: `CLAUDE.md trigger`——项目 AGENTS.md 已固化该规则，无需额外修改；若未来 change 跨独立模块（如后端+前端无交集），应重新评估是否豁免
- **`superpowers:requesting-code-review`**
  - **What was skipped**: 未发起代码评审请求
  - **Why this cycle**: 每个 commit 均以 TDD 测试为门禁（939 前端 + 821 后端用例）且用户多次浏览器 dogfood 确认；verify.md 的 §4 spot check 承担了 spec 一致性复核
  - **How to prevent recurrence**: `scope-judgment rule`——单模块连续 fix 场景以全量回归+用户 dogfood 替代 formal review 可行；涉及跨模块 API 契约（本 change 含 `DataSourceMetadata.formKey` 后端 DTO 变更）时建议发起 review

## 5. Surprises

- elTransfer 用 `key`（非 `value`）作为选中值标识——数据源映射生成 `{label,value}` 缺 key 时所有项 key 相同，选一项全选联动（commit `4e3a0cf`）
- cascader `emitPath=true` 是存量表单已存配置，提交值为路径数组，与新建默认 `emitPath=false`（叶子值）并存——需同时支持回显与提交两种形态（`888f0fb`/`5dbc43e`）
- "首次访问显示原始 value"根因是子组件 `onMounted` 取数早于父组件 `loadMetadata()` 网络异步——说明顺序依赖而非逻辑 bug（`32d5ec5`）
- `PageDataTable.linkage.test.ts` 6 个失败是环境性（Cannot call trigger on empty DOM wrapper）且与本次改动无关，探索阶段确认后全周期未再触碰
- vue-tsc 基线会随代码增删漂移行号（BizDataListPage 删函数 369→319、PageDataTable 加分支 388→392），对比需用错误集合而非纯行数

## 6. Promote candidates → long-term learning

- [ ] 🟡 **数组组件 value+text 双列方案的完整知识图（列映射/提交生成/显示/回显/查询）值得沉淀** → **Promote to memory** (type: knowledge)
  > **Why**: 本 change 从后端 DDL 到前端三处查询栏全链路打通，过程中修复 10+ 边界问题（双跑覆盖、emitPath 两种形态、key/value 差异、竞态），跨多个 commit 分散
  > **How to apply**: 未来遇到"数组/多值字段存储与显示"类需求时，先读本 change 的 design.md + verify.md 摘要，避免重走探索路径
- [ ] 🟡 **需求"可输入"表述歧义导致整轮返工——实现前需确认语义** → **Promote to project CLAUDE.md** (AGENTS.md 开发规则段)
  > **Why**: 用户"直接用文本输入框"实为最简方案，但初始"可输入"被解读为可输入选择器（filterable/allow-create），返工一整轮
  > **How to apply**: 交互组件的需求涉及输入形态时，brainstorm 阶段显式问"是原生输入框还是可过滤的选择器"二选一
- [ ] 📌 **tasks.md 勾选状态须与 verify 结论一致** → **One-off**（记录即可，不 promote）
  > **Why**: 本轮 tasks.md 第 7 组未勾选而 verify 声称完成，实测证明全量回归确实执行过——不过是一次遗漏
  > **How to apply**: 主代理在 apply 完成时扫一遍 tasks.md 全量勾选（含第 7 组回归任务）再写 verify
- [ ] 📌 **vue-tsc 基线对比用错误集合（rub 行号漂移）** → **Promote to memory** (type: feedback)
  > **Why**: 行号随删改漂移（BizDataListPage 369→319），纯 Compare-Object 会误报 4 处"新增"实为同源错误移位
  > **How to apply**: 对比 vue-tsc 输出时按"文件:错误码:消息"去行号归一化再 diff；或直接比对错误码集合