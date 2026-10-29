# Retrospective — multi-client-uniapp-codegen

> 特殊周期：本 change 走完了 apply（27/28），但**未合入 main**——被 2026-10-29 裁定
> 改为"选择性移植、模型就新权威"（架构文档 §10）。本文是改道收尾的复盘，
> 归档采用 `--skip-specs`（designType 宇宙规格不入基线）。

## §0 Evidence

- 提交区间：`cddc7948..74a7b8f4`，**56 笔**（含 10-29 闭合笔 `74a7b8f4`）
- 规模：**184 文件 / +43,591 行 / -105**
- tasks：28 项中 27 完成；唯一未完成 10.3=真机人工核验（需真人+设备+真 appid，非自动化红）
- 活跃窗口：2026-10-23 起笔 → 10-25 10:55 停摆（4 天窗口），10-29 改道收尾
- 子代理调度：工件无台账，不可考（不虚构）
- 新增外部依赖：`@lc/ui-mobile`（file:packages）、`@lc/runtime-uni`、`uni-shell` 宿主工程（lc-uni-shell）、app-builder 8 文件（Node 零运行时）、miniprogram-ci、Uni ECharts（`a8086f5c`/`dc75b082` 链）
- 合并后 bug：不适用（未合并）；其自身缺陷当场闭（`26787dd4`/`88021b0a`/`200be668`/`dc75b082`）
- verify 状态：说明性 PASS WITH WARNINGS（Gate 记录 `a8086f5c`/`60d4ebcf` 在案，未重跑，用户批准）
- 提交链首尾：`be83649d` change 开档 → `453b27fa` Task 11.2 → `74a7b8f4` 停摆残留闭合

## §1 Wins

1. **批 E 判据被这条线率先跑穿**：一份页面 schema 出 uni-app H5 工程、浏览器跑通真实列表页
   （`dec8013c` 同源托管 + `200be668` 静态服务根修复）——产物期资产可直接进批 E 移植清单。
2. **实测结论密集成金**：easycom 缺失致 uni-ui 全裸标签（`dc75b082`）、列表族首载缺失（`26787dd4`）、
   ir 常量引用崩溃（`88021b0a`）、uni-table/Uni ECharts 可用性（Task 6/7）——批 E 免踩同坑。
3. **发布链完整落地**（Task 9.x）：app-builder 5302 + Java 状态机（`38b2d376`/`695a29b4`）+
   miniprogram-ci 体验版二维码（`c7ca4691`）——按裁定归批 F 启用，链路验证不白做。
4. **Gate 设计可迁移**：per-target 可出码率 + 语料体检（`60d4ebcf`/`a8086f5c`）是模型无关的质量面，
   批 E 移植后原样复跑即得新旧模型下的判据对照。
5. **"不静默丢弃"纪律**（`6eff4abb`/`ce8eed59`）：未装配族挂点注释 + 双端 manifest 登记——该原则进 learnings。

## §2 Misses

- 🔴 **时代冲突整线作废设计期**：Task 1.x App/Client 自建模型与 Task 2.x 契约画布（`ef5a0e22`/`be47481f`）
  被 10-27 单设计器收敛裁定否定——设计期约 50 文件（含 `@lc/ui-mobile` ~28 包文件）转移植/丢弃候选。
- 🟡 **会话间架构不同步**：10-23 开线时无共享裁定文档；10-25 停摆；10-27 另一线收敛架构——
  三天的独立推进没有任何一处引用或对照过对方决策，撞车成本到 10-29 盘点才显形（重叠仅 16 文件是幸运项）。
- 🟡 10.3 真机核验始终悬空（前置三条件缺一不可：本分支后端、uniapp 设计页、真 appid 配置）。
- 📌 停摆时留 8 个未提交文件 + 1 个孤儿 untracked 产物页（`uni_page.vue`），本次 `74a7b8f4` 闭合。

## §3 Plan deviations

- 计划（be47481f 设计修订）：契约渲染画布 + 三区能力矩阵 + 设计类型不可切换——**按当时路线执行到位**；
  改道后该三件成为"丢弃/重写"清单主体（§10）。
- 计划"先只打通 H5 再扩 APP/MP"被这条线**超额兑现**（9.x 发布链已做 MP/APP 构建）——超范围但零负作用，
  批 F 直接启用。
- reverse 回导：本线止步正向装配（Task 11.x），未做——与 §9-3 待拍板一致，无返工。

## §4 Skill / workflow compliance

| apply 阶段技能 | 实际使用 | 证据 |
|---|---|---|
| test-driven-development | ✅ | `60d4ebcf`/`a8086f5c`/`7444dcf2` 等 test→fix 配对笔链 |
| executing-plans / tasks 驱动 | ✅ | 提交消息全程带 Task 编号（1.1→11.2） |
| requesting-code-review | 不可考 | 工件无评审台账，不虚构 ✗/✓ |
| systematic-debugging | ✅（形态符合） | 缺陷 E（`dc75b082`）含根因与复现读数 |

### Deliberately Skipped Skills

- **verify 标准阶段**：被跳过——触发条件=10-25 停摆 + 10-27 架构改道（用户裁定 A2/§10），
  非"输出看着不对"；替代物=本次说明性 verify.md（Gate 记录在案）；防再犯=schema 边界情形
  （change 中途被裁定改道时无标准路径），本轮按"finish 裁剪版 + 说明性 verify"处置并全程留痕。

## §5 Surprises

- 假设"批 E 是从零开工"为真——实际本地藏着一条已到 27/28 的同方向线（56 笔未推送），
  盘点改变了批 E 的成本结构（移植>>新建）。
- 假设"designType 宇宙与新模型会大面积冲突"——实际文件重叠仅 **16/183**；真正的撞车在
  `AuthServiceImpl`/`PageDefinition*` 的语义层（凭证多实例 vs J3 泛化链）。
- 术语反转（对方 Client=渠道实例、我方 Client=受众端）比"模型不同"更危险：合并时不报任何冲突。

## §6 Promote candidates

- [ ] 🔴 并行会话必须先立共享裁定文档再开线
  - **Promote to** CLAUDE.md/AGENTS.md 触发条
  - > **Why**: 10-23 至 10-25 两条线（本线与设计器多端线）零对照推进，43k 行资产停在被否定的路线上。
  - > **How to apply**: 开新 change 前 grep `docs/designs/` 同主题裁定；发现他线活跃（registry/未推分支）先做重叠与模型对照。
- [ ] 🔴 本地成规模的未推送分支=最高风险资产，盘点即备份
  - **Promote to** memory
  - > **Why**: 本线 56 笔/+43k 行仅存本地一块盘 4 天；10-29 盘点当天完成推送备份。
  - > **How to apply**: 任何 `git rev-list origin..branch` 非空且超千行的分支，处置决策前先推同名远端分支。
- [ ] 🟡 "先测试后实现"红灯在 merge 归因中会伪装成回归
  - **Promote to** known-issues 处置范式（本轮已实操：`PageRenderer.test` 17 红随半成品成对撤除）
  - > **Why**: origin 半成品撤除时，FE 红灯需逐文件判"测试新于实现"还是"实现回归"，判据=对方是否改过被测组件。
  - > **How to apply**: revert-to-green 归因时先跑 `git diff --name-status base..tip -- <组件>`，无实现配套即判半成品。
- [ ] 📌 同名类跨包（bean 名冲突）只在 Spring 上下文启动时炸
  - **Promote to** known-issues §4（本轮已登记）
  - > **Why**: `PostController` 双包编译零错、上下文炸连锁 7 类 35 错，归因绕了一圈。
  - > **How to apply**: 全量红集首查 `ConflictingBeanDefinitionException`，红成员=连锁假红，勿逐个代修。
- [x]（已落地）不静默丢弃原则——`6eff4abb` 双端 manifest 登记形态收进批 E 移植清单（§10 保留面）。
