# Retrospective: process-config-and-version

> Written: 2026-08-12 (after verify passed)
> Commit range: `8c15c12..42d469a` (15 commits)
> Worktree: `.worktrees/process-config-and-version/`

---

## 0. Evidence

- **Commit range**: `8c15c12..42d469a` (15 commits)
- **Diff size**: +1325 / -193 lines across 35 files
- **Tasks done**: 26/26（`grep -c '^- \[x\]' tasks.md` → 26）
- **Active hours**: ~3.5h（ff 0.5h + apply 2h + 验证修复 1h）
- **Subagent dispatches**: 6（4 个并行 implementer + 1 个 oracle 审查被 abort + 0 后续）
- **New external dependencies**: `spring-boot-devtools`（Spring Boot 4.0.7，runtime+optional）
- **Bugs encountered post-merge**: 无（未合入）；实现中发现并修复 5 个问题（见 Misses）
- **OpenSpec validate state at archive**: pass
- **Test coverage signal**: 后端 224 测试通过（+3：部署 hash 相关）；前端 108 测试通过

Commit chain (時序):

```
8c15c12 change: process-config-and-version（artifacts）
8099f38 feat: 前端配置层级收敛（流程级操作权限总控+移除转签入口）
1b97de5 feat: 流程历史版本列表与版本编辑器接口
0685cd2 feat: 部署变化检测改为XML+配置整体hash
cebee7b feat: 操作权限解析叠加流程级配置，移除allowForwardSign
346da9a feat: 转办增加权限校验，锁定多实例转办语义
cf688a2 feat: 流程历史版本查看（版本历史抽屉+只读设计器）
cb99219 chore: 标记 tasks.md 全部完成
484d615 fix: V18 迁移改为条件DDL（兼容 JPA ddl-auto 先行加列）
7580eb1 fix: ProcessDesigner 补 import computed
6698516 feat: 历史版本只读属性面板复用可视化组件（inert 禁交互）
52b652f feat: 只读属性面板改用 el-form disabled
9192fb9 fix: 部署变化检测仅使用当前编辑配置（排除历史版本快照）
5f1eb96 feat: 后端加入 spring-boot-devtools 热部署
b4ed376 fix: 部署降级路径比较配置快照（历史数据 hash 为空时配置变化也可部署）
42d469a feat: 表单配置标签的编辑表单按钮改为图标按钮
```

---

## 1. Wins

- [evidence: 0685cd2, 9192fb9, b4ed376] 部署变化检测从"仅比 XML"升级为"XML+配置整体 hash"，并解决两个隐蔽缺陷（快照污染、历史数据降级路径），用户真实场景"改配置→部署"最终验证通过
- [evidence: cebee7b] `extractOperations` 流程级 AND 节点级叠加，废弃的 `allowAddSigner`/`allowDelegate` 从死代码变为真正的流程级总控
- [evidence: 346da9a] 规划阶段发现 `TransferService.setAssignee` 天然支持 MI 节点（等价转签），避免过度设计 ForwardSignService 路由（见 §5）
- [evidence: 1b97de5, cf688a2] 历史版本查看完全复用现有数据（Flowable XML + nodeConfig 快照），零新增表
- [evidence: 5f1eb96] devtools 热部署落地后，后续修复无需手动重启（restartedMain 自动生效）

## 2. Misses

- 🟡 [painful | evidence: 并行子代理互相干扰] 4 个后端 implementer 并行改同一编译单元，Task 1 被编译错误卡 9+ 分钟 → 主代理接手；Task 2 的 stash 险些丢失 Task 5 的测试
- 🟡 [painful | evidence: 6698516, 52b652f] 只读属性面板方案两度迭代：先 JSON 展示（用户不满意"要可视化"）→ inert 禁用（tab 无法切换+滚动失效）→ 最终 el-form disabled。inert 的副作用未提前评估
- 🟡 [painful | evidence: 484d615] V18 迁移与 JPA `ddl-auto: update` 冲突（Duplicate column），Flyway 留下 failed 记录需手动清理
- 🟡 [painful | evidence: b4ed376] 部署降级路径（hash 为 NULL 的历史数据）只比 XML，导致"改配置不能部署"的恶性循环——hash 永远写不进去。问题在用户实测时才暴露
- 📌 [nit | evidence: 7580eb1] `computed` 未导入：`tsc` 不检查 `.vue` 文件（需 vue-tsc），运行时才暴露

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| D2 转办/转签合并 | "MI 节点路由 ForwardSignService" → "统一 setAssignee" | 发现 TransferService 已天然支持 MI（运行时等价），路由会重建 MI 执行树产生副作用 |
| D3 部署检测 | 降级路径从"仅比 XML"增强为"XML+配置快照比较" | 历史数据 hash 为 NULL 时配置变化被误拦截（用户实测发现） |
| 部署检测数据源 | `findByProcessDefId` → `findByProcessDefIdAndProcessDefinitionIdIsNull` | 前者混入历史版本快照，toMap 去重顺序不可靠导致 hash 污染 |
| 只读属性面板 | JSON 展示 → inert → el-form disabled | 用户要求可视化 + 可切换 tab + 可滚动，inert 副作用不符 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（6 问题探讨→方案收敛） |
| superpowers:writing-plans                        | ✓（ff 阶段 plan.md） |
| superpowers:using-git-worktrees                  | ✓（ff 创建，apply 使用） |
| superpowers:subagent-driven-development          | ✓（4 并行 implementer；并发问题见 Misses） |
| (transitive) superpowers:test-driven-development | ✓（子代理 + 主代理均按 RED-GREEN） |
| (transitive) superpowers:requesting-code-review  | ✗（oracle 审查被 abort，未完成） |
| superpowers:finishing-a-development-branch       | ✓（本次 /opsx-finish） |

### Deliberately Skipped Skills

- **`superpowers:requesting-code-review`（部分跳过）**
  - **What was skipped**: Task 4 完成后派 oracle 做 spec+质量审查，任务被系统 abort（后台任务完成通知抢占会话）；后续任务均未补审查
  - **Why this cycle**: 后台 4 个 implementer 的完成通知与 oracle 审查并发，会话被中断；且 `review-package` 脚本与 node 24 不兼容（SyntaxError），v6 单步审查链路断裂
  - **How to prevent recurrence**: 下次先等全部后台任务完成后统一审查，或改用主代理手动 diff 审查（本项目 review-package 脚本在 node 24 下不可用，属工具链环境问题）

## 5. Surprises

- `TransferService.setAssignee` 注释已声明"MI 节点业务上等价于转签"——设计 D2 时未读该注释，差点实现重复路由（plan 阶段发现后修正）
- `findByProcessDefId` 返回当前配置+历史快照混集，`toMap` 去重结果取决于数据库返回顺序（无排序）——hash 被旧快照污染，静态代码看不出，用户实测才暴露
- 历史数据（V18 前部署）`deployed_config_hash` 为 NULL，降级路径只比 XML → 改配置永远不能部署的恶性循环
- `tsc`（非 vue-tsc）不检查 `.vue` 文件——`computed` 未导入漏过 `npm run build`
- Superpowers 的 `task-brief` / `review-package` 脚本在 node 24 下 SyntaxError，v6 辅助脚本链路不可用

## 6. Promote candidates → long-term learning

- [ ] 🔴 **DDL 迁移脚本必须考虑 JPA ddl-auto 先行建列** → **Promote to project CLAUDE.md**（`AGENTS.md` 开发规则段）
  > **Why**: V18 与 `ddl-auto: update` 冲突导致启动失败 + Flyway failed 记录清理
  > **How to apply**: 新增 Flyway 迁移脚本时，若对应实体同时存在且 ddl-auto 为 update，脚本用 information_schema 条件 DDL 保证幂等

- [ ] 🟡 **后端任务并行会互相破坏编译** → **Promote to schema**（subagent-driven-development 并发规则）
  > **Why**: 4 个后端 implementer 并行，Task 1 被编译错误卡 9 分钟，Task 2 stash 险丢 Task 5 测试
  > **How to apply**: 后端（共享编译单元）任务改为串行或按文件边界隔离派发；仅前端可安全并行

- [ ] 🟡 **部署变化检测必须覆盖"当前配置 vs 历史快照"的完整对比** → **One-off**（已修复，记录经验）
  > **Why**: 降级路径只比 XML + 查询混入快照，两个独立缺陷叠加导致用户实测失败
  > **How to apply**: 涉及"部署前变化判定"时，测试必须覆盖：hash 为空的历史数据、配置-only 变更、快照与当前配置并存三种场景

- [ ] 📌 **`.vue` 文件需 vue-tsc 才能静态检查** → **Promote to project CLAUDE.md**
  > **Why**: `computed` 未导入漏过 `npm run build`（tsc），运行时才报 ReferenceError
  > **How to apply**: 前端 build 脚本考虑 `vue-tsc` 替代 `tsc`，或在改动 .vue 后必须浏览器实测
