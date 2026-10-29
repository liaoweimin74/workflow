# Verify — multi-client-support（多端客户端支持 Client × Channel）

> 核验日期：2026-10-29 ｜ 核验人：AI（/opsx-verify 流程）
> 工件基线：schema `superpowers-bridge-opencode`；brainstorm/proposal/design/tasks/plan/specs(×9) 齐备
> 证据来源：`git log main..HEAD`（29 笔实现/文档提交）+ 代码检索（Java/前端）+ 测试文件清点 + 收尾 Step 3 门禁实测（FE 2795 passed / 8 failed=基线预坏集；backend-node 54/54；vue-tsc 68=基线）

## Summary

| 维度 | 状态 |
|------|------|
| Completeness | 勾选 22/53；清点后实际完成 32/53（10 笔待追记），其余 21 笔为裁定后置/Deferred（批 E 另立 change） |
| Correctness | 42 需求中 30 个有强实现+测试证据，8 个部分实现，4 个（P2 两域）为计划内未实施 |
| Coherence | 已交付切片与 design.md 基本一致；两处**文档级漂移**需校准（D9 渲染形态、D5 目标端存储形态）——均有用户裁定在案 |

**核验范围声明**：本变更按 design.md「一次定义、分期实施（P0-P2）」。P0 全部与 P1 大部分已交付；批 E（uni-app 分端出码）经用户裁定收窄为仅 H5、另立 change（multi-client-uniapp-codegen 注册表条目在案）承接。本报告将「已实现未勾选」与「裁定后置」分开列出——前者须追记，后者须在 tasks.md 标记 deferred 归属，避免归档后 spec 基线失真。

---

## CRITICAL（归档前必须处置）

### C1. tasks.md 勾选状态与实现事实不一致（10 笔待追记 + 21 笔待标记 deferred）

后端 A/B 组与批 A/B/C 的交付没有回写勾选，而剩余未完成项若不标注归属，archive 合并 specs 时会把未实现能力当作已完成基线。

**已实现、待追记 `[x]`**（证据随附）：

| 任务 | 证据 |
|------|------|
| 2.5（安全面） | `dcefe462` roles 按端过滤 + `LoginUserServiceClientScopeTest` + `PageAccessGuardTest` B5 用例；**前端空态呈现**仅 WEB 端自然空侧边栏，移动端空工作台归 B1 |
| 6.1（除审计） | `a518f696` V78 双列 + FieldPolicyService(215 行) + RowPermission/Grant DTO 链 + 权限码；**操作审计未见落点**，追记时标注部分完成 |
| 6.2 | `MaskRule.java`(104 行，手机/姓名/身份证/车牌/地理泛化封闭枚举) + `MaskRuleTest`(109) |
| 6.3 | 出口统一应用：`DataSourceDefinitionService:413/450/467`、`BizDataScopeGuard:54-66`、`BizDataSupport:201`（resolve 文本封口）+ FieldPolicyServiceTest(367)/BizDataControllerTest(54) |
| 6.5 | 详情/导出/开放 API 三出口测试：BizDataControllerTest + PageDataExcelControllerTest + DataSourceDefinitionServiceTest 同主体同策略断言 |
| 8.1 | `7ba1df62` V77 target_clients + publish(clientIds) + PageDefinitionServiceTargetClientsTest(138) |
| 8.2 | `7ba1df62` PageAccessGuard (client,page) 闸 + `PageAccessGuardTest` 114 行增量（portal 兼容+403 矩阵）+ `21c53bc9`/`841f12cc` 前端配套 |
| 8.3 | PagePublishDialog.vue：目标端多选、停用端置灰（:94-95）、两级拦截清单（块阻断/字段降级提示，§8.3/§5.1）+ PagePublishDialog.test/mobileGate.test |
| 7.4 | 批 C2 `f58c2029` iframe 手机框移动预览 + `mobilePreviewBridge.ts` postMessage 同步（形态漂移见 C2-渲染条目，按 Vant 预览口径追记） |
| 7.2/7.3（部分） | 批 A `1df30ea9`/批 C1 `dc032d15`：`channelTemplates.ts`+`fieldTemplates.ts` 单点+完备性用例；`cardSlots.ts`+`MobileCardProfileDialog.vue`+`mobileRuleTransform.ts` 缺省自动映射。**映射目标=EP→Vant 预览**（非 uni 两列），映射表 uni 列归批 E 出码契约表——追记时注明口径 |

**建议标记 deferred（归属批 E / 后续 change，用户裁定 `c7ddf9ad`/`e50a35d1` 在案）**：
1.3（仅缺缓存与失效）、5.3（仅缺数据范围主体端化=裁定⑧延后+token 收紧开关）、6.4、7.1、7.5、7.6、7.7、8.4、8.5、9.1-9.4、10.1-10.4、11.1-11.3。

**处置**：更新 `openspec/changes/multi-client-support/tasks.md`（追记 + deferred 标注），与 C2 一并提交。

### C2. delta spec 与实现存在两处口径漂移，archive 合并前必须改写

specs 会在归档时合入 `openspec/specs/` 成为长期基线，按现文本合并会固化已被用户裁定放弃的形态：

1. **multi-client-rendering**：spec 写「移动渲染器=uni-app Vue3 内置组件 + `/m/` 同源产物 + iframe 加载真实 H5 产物」；实际交付=**Vant iframe 设计器预览渲染器**（预览≠产物），交付路线已裁定为**分端 uni-app 出码**（批 E，另一 change）。裁定证据：`80c8f8d8`（§5.2 用户复核：设计时移动预览=Vant 可编辑渲染器，本案关闭）、`e50a35d1`/`c7ddf9ad`（架构文档 §5-§8）。→ 按裁定改写 spec：映射表两列改「EP/Vant 预览 + EP/uni 出码（批 E）」双单点，`/m/` 产物与 B1 工作台条目标注移交出码 change。
2. **client-targeted-publishing**：spec/design D5 写 `page_client_target` 关系表；实现=`wf_page_def.target_clients` CSV（V77 注释载明理由：NULL 缺省 portal=存量零破坏、逻辑外键对齐 V71-V73）。→ spec 措辞改为「资产-端发布关系（实现形态：target_clients CSV 列）」或在 design.md 追加实现决策注记。

**处置**：修订上述 2 个 delta spec（或 design.md 增补 Decision-Update 节），保持 artifacts↔代码一致。

---

## WARNING（应处置，不阻塞归档）

1. **客户端停用全链路拒绝未实现**（client-channel-model「客户端停用」Requirement 半实现）：停用操作+portal 保护+绑定码校验在案（`ClientServiceImpl:238-240`、`BindCodeService:16`），但**端停用后该端登录/运行态 API 拒绝**未见闸（AuthServiceImpl 无 client status 检查）。建议：归档后小批次补齐（登录链 + PageAccessGuard 各加一处 status 闸），或在 spec 该需求下注明分步。
2. **A3 挂接候选未按端过滤**（8.4，client-targeted-publishing「双重闸」第二闸）：`MenuPage.vue:128-136` 下拉列全部 PUBLISHED 页面，未按当前端 targetClients 过滤。服务端闸已封（未发布不可达），仅管理面候选未收紧。归入 deferred（已列 C1 清单）。
3. **字段策略无前端维护入口**（6.4）：后端 API/DTO 全通（RoleDataPermissionController:64、RowPermissionController:88），FE 零消费（grep fieldPolic 无匹配）——功能暂只能经 API 配置。归入 deferred。
4. **场景覆盖薄弱点**：`端间存储不串`（localStorage 端命名空间）、`司机端 H5 端到端`（P1 验收 8.5）等场景依赖批 E/部署任务，当前无测试；`导出同点生效` 的 Excel 出口断言存在于 PageDataExcelControllerTest，其余出口由 FieldPolicyServiceTest 覆盖——总体可接受，随 8.5 端到端补。
5. **design.md 历史决策未标注失效**：D9（不引入 Vant/uni 单模型）、D10（`/m/` 一份产物两用）已被现行权威架构文档（`docs/designs/2026-10-27-多端交付-单设计器分端出码架构.md`）取代。design.md 是过程工件可不改写，但建议加一行「已被 2026-10-27 架构文档 §2-§5 修订」的指针（并入 C2 处置）。

## SUGGESTION

1. A5 对话框未显示各端「已开通渠道徽标」（ClientOptionVO.channelTypes 数据已有，PagePublishDialog 只显名称+停用）——批 E 收尾时补。
2. `channelProfiles.ts`（schema 端微调）与 `channelSchemaPolicy.ts`（策略表）、`contract.ts` 防漂移互锁已同构——批 E 写 uni-app 出码契约表时沿用该互锁模式。
3. 11.3 文档补多端章节：learnings/分拣台账/架构文档已在 `a88e10cb`/`a3a330a0` 覆盖大半，features.md/QUICKSTART.md 随批 E 后统一补。

---

## 需求映射总表（42 需求 → 状态）

| 能力域 | 需求数 | 已实现+证据 | 部分实现 | 计划内未实施 |
|--------|--------|------------|----------|--------------|
| client-channel-model | 5 | 4（建模/渠道参数/管理界面/portal 缺省） | 1（停用：配置面✓ 运行闸✗） | 0 |
| client-scoped-menu | 5 | 5（作用域/回填/形态校验/端切换/空态安全闸） | —（空态呈现归 B1） | 0 |
| client-scoped-role | 4 | 4（挂端/端一致/所属端 UI/语义不变） | 0 | 0 |
| client-login-identity | 5 | 4（方式门禁/openid 泛化/绑定码/A4 抽屉） | 1（token 上下文：签发+过滤器✓，数据范围主体+收紧开关✗） | 0 |
| data-field-masking | 5 | 4（策略模型/规则集/序列化出口/行列表叠合） | 1（维护入口：API✓ UI✗） | 0 |
| multi-client-rendering | 6 | 0 | 3（分界审计✓迁移✗；映射预览口径✓uni 列✗；覆盖层+骨架✓） | 3（B1 工作台/`/m/` 部署/隔离存储→批 E） |
| client-targeted-publishing | 5 | 3（发布选端/(client,page) 服务端闸/拦截+降级提示） | 1（挂接候选过滤✗） | 1（按渠道出制品→P2） |
| app-native-shell | 4 | 0 | 0 | 4（P2 计划内；渠道参数 minVersion/forceUpdate 字段已预留） |
| miniprogram-runtime-shell | 4 | 0 | 1（静默登录+绑定码底座 J3 已通用化，壳未建） | 3（P2 计划内） |

**测试时序规范符合性**：批 C 移动组件测试已按 §7.3 规范复刻 Vant 真实 emit 时序（`1830e6ee` 改造在案），无裸 `$emit` 捷径残留。

---

## 核验方法说明（降级项）

- 未重跑 Java 全量测试套件（历史证据：J 系列/A5/B 组各提交均附 H2 测试，收尾 Step 3 实测 backend-node 54/54、FE 基线一致）；如需当堂复跑可执行 `mvn test`。
- 运行时端到端（真实浏览器多端登录）未在本轮执行——P1 判据 8.5 属 deferred 集合，由批 E 后验收。

---

## Overall Decision

- [ ] PASS
- [x] PASS WITH WARNINGS —— 条件：C1（tasks.md 追记+deferred 标注）与 C2（两 delta spec 漂移校准）在归档前完成；WARNING 项随批 E / 后续小批处置。
- [ ] FAIL

**Final Assessment**：已交付切片（P0 全域 + P1 主体 + Java J 系列 + 移动预览批 A/B/C + E-0 分拣闭环）质量有测试强背书，无实现正确性缺陷。两处 spec↔实现漂移均系用户裁定所致、裁定记录在案，属**文档校准义务**而非实现问题。完成 C1/C2 后即可进入 /opsx-finish 归档流程。
