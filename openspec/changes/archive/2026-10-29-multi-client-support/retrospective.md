# Retrospective: multi-client-support

> Written: 2026-10-29 (after verify passed — verify.md Overall Decision = PASS WITH WARNINGS，C1/C2 校准已于 `db57ef7a` 处置)
> Commit range: `6d8bb4b3..db57ef7a`
> Worktree: `.worktrees/multi-client-support`（分支 feature/multi-client-support，未合并）

---

## 0. Evidence

- **Commit range**: `6d8bb4b3..db57ef7a`（43 commits，2026-10-25 → 2026-10-29）
- **Diff size**: 254 files changed, +20,780 / −667
- **Tasks done**: 33/53（校准后；其余 20 笔逐项标注 Deferred，归批 E=multi-client-uniapp-codegen 或 P2）
- **Active hours**: 未精确计时——跨 5 个日历日、多轮会话（含 P0 Node 线→Java 重建线 J1-J5→A/B 组→批 A/B/C→E-0→收尾核验六段）
- **Subagent dispatches**: 0（项目指令"所有任务由主代理自完成不委派"，见 §4）
- **New external dependencies**: `vant@^4.10.2`（MIT）、`@form-create/vant@^3.3.5`（MIT）——FE 移动预览渲染器物料；`express@^5.2.1`（MIT）——backend-node 工具线
- **Bugs encountered post-merge**: none（worktree 未合并；周期内缺陷见 §2/§5）
- **OpenSpec validate state at archive**: pass（`openspec validate multi-client-support` → "Change 'multi-client-support' is valid"，2026-10-29）
- **Test coverage signal**: FE vitest 2795 passed / 8 failed（=基线预坏集：AdminLayout 2 + MemberGroupPage 5 + VisualQueryBuilder 1 flaky）；backend-node 54/54 全绿；Java H2 套件随 J 系列/A5/B 组各提交附测（约 25 个新/扩展测试类，含 FieldPolicyServiceTest 367 行、PageAccessGuardTest 403 矩阵、PageDefinitionServiceTargetClientsTest 138 行）；vue-tsc 68 = 基线

Commit chain（时序，`git log --oneline main..HEAD` 全量）:

```
c1837fe9 change: multi-client-support（工件初始化）
98a7107e feat(client): sys_client/sys_client_channel 建模 + portal seed（V50）
f276ba6f chore(migrations): 移除 cron 复活的重复迁移 V39
2a6e2e5c feat(client): 菜单树按端作用域 + 端形态服务端校验
16e5a21a feat(client): 角色挂端与认证链端一致性（V52）
da8a0971 feat(client): A1 客户端管理列表页与菜单种子（V53）
4247eb18 feat(client): A2 客户端设置抽屉
e2267284 feat(client): A3 菜单管理端作用域切换与移动端分区
63e5c775 feat(client): 角色管理所属端列与表单挂端约束
ed98a4ee chore(spike): 存量 schema 语义/表现审计台账
dff8eb43 test(client): P0 多端建模端到端验收与测试记录
acd99436 feat(client): Java 多端地基重建 J1——端模型实体+V71-V74
1ec5dd42 feat(client): Java ClientService 重建 J2
ea1e5b81 feat(client): Java 端身份泛化 J3
0453f825 feat(client): Java token 端声明与端隔离 J4
7c8df4ff feat(client): Java A4 端身份管理链 J5a
49b741cf feat(client): 前端 A4 端身份抽屉 J5b
8ef13cd2 docs(opsx): J 系列完成回填 tasks.md 5.x
f58f6191 fix(infra): Flyway 先于 JPA 执行 + 客户端管理菜单归位
9cc01334 fix(menu): /api/menus/tree 按端过滤（补 J4 移植缺口）
3eb54636 docs(learnings): 多端组件形态裁决持久化
73ca116c docs(prd): 补 3.13 多端客户端交付需求
80c8f8d8 docs(designs): §5.2 用户复核确认——移动预览=Vant（本案关闭）
72a83ba3 feat(backend): 菜单服务端落点校验器（Node menu-shape 移植）
dcefe462 fix(backend): 端空态安全 roles 按端过滤（B5 用例）
7ba1df62 feat(page): A5 target_clients + publish 端校验 + guard 发布端闸
21c53bc9 feat(page): A5 前端 PagePublishDialog
a518f696 feat(lowcode): 字段策略与脱敏（序列化层出口）
1df30ea9 feat(lowcode): 移动渲染批A——模板映射单点 + Vant 骨架
1e5bcd4d feat(lowcode): 移动渲染批B——表单/详情/容器移动实现
dc032d15 feat(lowcode): 批C1——端覆盖层消费链 + 移动卡片配置面板
f58c2029 feat(lowcode): 批C2——设计器 iframe 移动预览
841f12cc feat(lowcode): 批C3——发布拦截两级清单
1830e6ee fix(lowcode): van-list 取数死锁 + 测试按真实 emit 时序
39abcfd1 docs(designs): 多端交付架构初稿（双设计器）
e50a35d1 docs(designs): 架构收敛为单设计器+分端出码，撤销双设计器初稿
c7ddf9ad docs(designs): 裁定批D-0放弃、批E范围收窄仅H5
a3a330a0 feat(lowcode): E-0 语义/表现分拣闭环——策略表+扫描器扩面
a88e10cb docs(learnings): 补交两篇在途经验文档
aed8e007 docs(opsx): verify.md 三维核验报告
db57ef7a docs(opsx): verify C1/C2 归档前校准
```

---

## 1. Wins

- [evidence: `acd99436..49b741cf` J1-J5b] **Java 重建线六段连发全部带 H2 测试落地**：端模型/登录泛化/token 端声明/A4 端身份链，且 `8ef13cd2` 当场回填 tasks.md 勾选——J 系列是"实现+回写"纪律最好的段落。
- [evidence: `a3a330a0`] **E-0 分拣闭环质量高**：`channelSchemaPolicy.ts` 363 行三表 + 12 例 RED→GREEN + 全量库存快照 fixture + `auditInventoryCoverage`/`validatePolicyIntegrity` 双互锁（与 `contract.ts` IDENTITY_KEYS 防漂移）；扩面还新挖出 rule 树表现键与 column_config 12 键零工作量的增量结论。
- [evidence: `1df30ea9`/`1e5bcd4d`/`dc032d15`/`f58c2029`/`841f12cc` 批 A→C3] 移动预览渲染器五批递进交付，每批 vitest 断言；发布拦截两级清单（块阻断/字段提示）成为可复用判定模式。
- [evidence: `a518f696`] 字段策略后端一次成型：封闭枚举规则集 + strictest-wins 合并 + 三出口（详情/导出/开放 API）统一应用点，测试 700+ 行。
- [evidence: `e50a35d1`+`c7ddf9ad`] **架构裁定当场落盘三部曲**（双设计器初稿→git mv 重写→遗留裁定），verify C2 校准时裁定链完整可考，文档漂移全部能在 10 分钟内对出证据。
- [evidence: verify.md 需求映射总表] 42 需求 30 项强实现，零实现性 CRITICAL——问题全部收敛为"文书校准"类。

## 2. Misses

- 🔴 [blocking→已解除 | evidence: 收尾 Step 4 曾被闸] verify.md 缺失导致 retrospective 硬闸拦截——根因是 apply 阶段从未走 verify 环节；由 `/opsx-verify`（`aed8e007`）补全。
- 🟡 [painful | evidence: verify C1 清点出 11 笔滞后] **tasks.md 勾选系统性滞后**：Node 线批 A/B/C、后端 B 组、A5 线共 11 笔实现完未回写，直到 verify 才人工对齐——apply instruction 的"c3 审查通过后标记 checkbox"步骤在主代理直执流程中被漏掉。
- 🟡 [painful | evidence: `39abcfd1`→`e50a35d1`] 双设计器初稿一天内被推翻重写：架构裁定前多做了一次"初稿"提交，方向性文档应先只落裁定结论、演进史进 learnings。
- 🟡 [painful | evidence: `1830e6ee`] Vant `van-list` 取数死锁暴露"裸 `$emit` 测试捷径"存量问题——包装第三方组件的测试未复刻真实 emit 时序，测试红了才发现实现错了。
- 📌 [nit | evidence: `f276ba6f`] cron 机器人复活重复迁移 V39，需手动清理。
- 📌 [nit | evidence: verify WARNING-1/2/3] 三处半实现散件：端停用运行态闸、挂接候选按端过滤、字段策略 FE UI——均已 Deferred 标注，无遗漏追踪。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 7.1-7.7 渲染线 | 运行时解释器形态 → **分端 uni-app 出码**（批 E 承接）；7.2-7.4 先以 Vant 预览口径交付 | 架构裁定 `e50a35d1`：Taro/uni 运行时挂载预览不可行 + 预览≠产物漂移不可消除（`80c8f8d8` 用户复核） |
| 8.1 `page_client_target` | 关系表 → `wf_page_def.target_clients` CSV 列 | V77 注记：NULL 缺省 portal=存量零破坏、逻辑外键对齐 V71-V73；design.md 已增 Decision-Update |
| 9.x 批 D-0 | 放弃 | 裁定 `c7ddf9ad`；死锁修复 `1830e6ee` 保留（预览靠它出数） |
| 5.3 | 数据范围主体端化 + token 收紧开关延后 | 裁定⑧：现有端上下文链已闭环，延后不产生越权面 |
| 批 E 范围 | 三渠道 → **先只打通 H5** | 用户裁定（`c7ddf9ad`），APP/MP 后置 |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓（brainstorm.md，`c1837fe9`） |
| superpowers:writing-plans | ✓（plan.md 微任务分解，批 A-E 序列出自该文件） |
| superpowers:using-git-worktrees | ✓（`.worktrees/multi-client-support` 由 /opsx-ff 创建，全程在树内提交） |
| superpowers:subagent-driven-development | ✗（见下方 Deliberately Skipped） |
| (transitive) superpowers:test-driven-development | ✓（E-0 12 例 RED→GREEN `a3a330a0`；批 A/B/C vitest；J 系列 H2 先测后码；§7.3 Vant emit 时序规范由 `1830e6ee` 立档） |
| (transitive) superpowers:requesting-code-review | ✗（见下方 Deliberately Skipped） |
| superpowers:finishing-a-development-branch | ✓（收尾 Step 6 本会话执行，四选项呈报用户） |

> **Default expectation**: 全部 ✓。本 cycle 两项 ✗，均为**项目指令与 schema 设计的规范冲突**，非随意跳过。

### Deliberately Skipped Skills

- **`subagent-driven-development`**
  - **What was skipped**: 未按 implementer-prompt.md / task-reviewer-prompt.md 模板派发实现与审查子代理；全部微任务由主代理直接执行。
  - **Why this cycle**: 子仓 `workflow_lowcode/AGENTS.md` 明文规定"所有任务都由主代理自己完成，不要委派给子代理"（人工追加条款）；项目指令按 using-superpowers 规则优先于 skill。实际执行以等价纪律补位——TDD 流程内嵌（RED→GREEN 提交记录可考：`a3a330a0`、批 A/B/C、J 系列）+ 每批独立 commit + 门禁基线比对（收尾 Step 3 实测 FE 2795/8、node 54/54、tsc 68）。
  - **How to prevent recurrence**: `CLAUDE.md trigger`——AGENTS.md 条款已在位；建议在本 schema 的 apply instruction §2 开头加一句"项目指令禁止委派时，主代理直执 + 保留 TDD/审查等价纪律即视为合规"，避免每 cycle retro 重复三问论证。
- **`requesting-code-review`**
  - **What was skipped**: 未做正式的 oracle 代 code review（diff 评审包未生成）。
  - **Why this cycle**: 同上——审查类子代理派发同样被"不委派"条款禁止；等价补位为 verify.md 三维核验（`aed8e007`，逐需求映射 + 漂移清点）与收尾门禁实测。但**批 A/B/C 期间确有 6 笔连续提交未经任何第三方视角评审**（`1df30ea9..841f12cc`），死锁缺陷 `1830e6ee` 属该窗口内自发现。
  - **How to prevent recurrence**: `scope-judgment rule`——主代理直执流程下，每 3-5 笔连续实现提交后应做一次自查式 diff review（读 `git diff <batch-start>..HEAD` 对照 spec），并在 tasks.md 批注留痕；此规则建议写入 workflow_lowcode/AGENTS.md。

## 5. Surprises

- **"预览"与"产物"曾被默认为同一事物**：设计初稿假设 iframe 加载真实 H5 产物一份两用，实测 uni 内置组件无法在管理端运行时挂载（Taro blended issue #16418），最终裁定预览=Vant 近似、产物=出码，漂移写死进文档（`80c8f8d8`）。
- **Flyway 与 Hibernate DDL 竞争 + 后端首启地雷**（`a88e10cb` learnings 在案）：`f58f6191` 修复执行顺序前，迁移在 JPA 建表后跑，H2/MySQL 表现不一致——预期外的基础设施坑。
- **收帧全量重建意外掩盖了 §7.2 sourceId 重取缺口**：裁定不单独修（`c7ddf9ad`），"实现自愈了设计缺陷"的反例。
- **column_config 12 键全语义零工作量**：E-0 扩面前预期有表现字段遗留，扫描结果是零——库存快照 fixture 的价值所在。
- **VisualQueryBuilder 测试 flaky**：同码两轮跑出 7/8 与 8/8 红，基线红集本身不稳定，门禁判定需按"红集成员"而非"红数"比对。

## 6. Promote candidates — long-term learning

- [ ] 🟡 **实现提交与 tasks.md 勾选同笔落** — **Promote to** workflow_lowcode/AGENTS.md（开发规则节）
  > **Why**: 本 cycle 11 笔滞后（verify C1），由人工清点才对齐；J 系列（`8ef13cd2`）示范了"当场回填"是可行的。
  > **How to apply**: 主代理直执任务完成后，勾选回写必须与实现代码在同一 commit（或紧随的 `docs(opsx)` 小笔），不等批量回填。
- [ ] 🟡 **每 3-5 笔连续提交做一次自查式 diff review** — **Promote to** workflow_lowcode/AGENTS.md（替代 requesting-code-review 的等价纪律）
  > **Why**: 批 A-C3 六笔连续提交无第三方评审窗口，死锁缺陷在提交 5 笔后才被自发现（`1830e6ee`）。
  > **How to apply**: 项目指令禁委派时，批末读 `git diff <start>..HEAD` 对照 spec 自查并在批注留痕。
- [ ] 🟡 **包装第三方 UI 组件的测试必须复刻真实 emit 时序** — **Promote to** `workflow_lowcode/docs/testing.md`（已成 §7.3 规范，待搬入测试文档）
  > **Why**: 裸 `$emit` 捷径让 van-list 死锁在绿灯下存活（`1830e6ee` 实测）。
  > **How to apply**: 新写 Vant/EP 包装组件测试时，优先 mount + 交互驱动；禁直接 trigger 组件内部才会发的事件。
- [ ] 📌 **方向性架构文档先落裁定结论，演进史进 learnings** — **One-off**
  > **Why**: `39abcfd1` 初稿次日即被 `e50a35d1` 重写，多一次无效提交。
  > **How to apply**: 重大裁定未定型前用 docs/local/inbox 草稿区，定案后一次性立正式文档。
- [ ] 🟡 **schema 与项目指令的"不委派"冲突需要显式豁免条款** — **Promote to** schema（openspec-superpowers-opencode apply instruction）
  > **Why**: 每 cycle 的 retro §4 都要重答同一段三问（本份亦然），Deliberately Skipped 论证成本重复支付。
  > **How to apply**: apply instruction 加"项目指令禁止委派时的合规直执路径"判定段；若下个 cycle 仍为此写三问，即为 §6→schema PR 的实证。

> **Carry-forward**: 以上 unchecked 项随下 cycle（批 E multi-client-uniapp-codegen）retro 重评。
