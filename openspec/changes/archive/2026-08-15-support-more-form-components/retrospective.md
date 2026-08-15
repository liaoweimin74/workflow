# Retrospective: support-more-form-components

> Written: 2026-08-15 (after verify passed)
> Commit range: `ef216e9..51ce770`（8 commits：1 artifacts + 7 实现）
> Worktree: `.worktrees/support-more-form-components/`

---

## 0. Evidence

- **Commit range**: `ef216e9..51ce770` (8 commits)
- **Diff size**: +2119 / -52 lines across 29 files
- **Tasks done**: 13/13
- **Active hours**: 约 6 小时（跨多轮会话）
- **Subagent dispatches**: 6（Task 1-6 由 general 子代理实现；Task 7+ 主代理直接实现——用户指示"不要派发子代理，你自己干"）
- **New external dependencies**: none
- **Bugs encountered post-merge**: 2 个实现期 bug（LONGTEXT 溢出、cascader Java 序列化乱码），已在合并前修复
- **OpenSpec validate state at archive**: pass
- **Test coverage signal**: 后端 356 测试 / 前端 253 测试全过

Commit chain (时序):

```
620c7ee change: support-more-form-components           （ff artifacts）
1103896 业务表单发布支持 8 类组件，多值组件统一 JSON 存储，subForm 预留 storageMode
9180722 slider 滑块组件支持 + 修复发布校验 LONGTEXT 白名单遗漏
2a2a91d signaturePad 改 TEXT、cascader 改 JSON、getNullableInt 溢出防御
c77942d serializeJsonColumns 按值形态判定（兜底 Java 序列化乱码）
d7fab5c 列映射记录 componentType、SearchTable render 富渲染、BizDataListPage 定制展示
c6f354e 穿梭框/树形/富文本/级联/签名列隐藏
51ce770 colorPicker 不出现在搜索栏
```

---

## 1. Wins

- [evidence: commit 1103896 + ColumnTypeMapperTest 37 cases] 前后端映射表逐 case 对齐（既有硬约束），通过两侧独立测试锁定，发布链路无映射漂移。
- [evidence: commit c77942d] serializeJsonColumns 按值形态判定（非字符串值一律序列化），从根上消除"数组值落到非 JSON 列触发 Java 序列化乱码"这一类问题，不依赖用户记得重新发布。
- [evidence: commit 2a2a91d + DynamicTableManagerTest] getNullableInt 溢出防御用 getLong 读取 information_schema，LONGTEXT 的 4GB 长度不再撑爆 Integer——这类边界在真实 MySQL 上暴露，单测 mock 难以预判，值得记入 learnings。
- [evidence: commit d7fab5c + c6f354e] 列渲染按 componentType 分派 + SearchTable render 函数扩展，把"组件类型"作为列映射一等公民持久化，后续新组件渲染只需加 case。

## 2. Misses

- 🔴 [blocking, evidence: 2a2a91d] **LONGTEXT 引入造成发布回归**：最初 design 决策 signaturePad → LONGTEXT，实现后真实发布暴露 `Value '4294967295' is outside of valid range for Integer`（information_schema CHARACTER_MAXIMUM_LENGTH 溢出）。用户指示改为 TEXT 解决。教训：新列类型引入前应评估 information_schema 读取路径。
- 🔴 [blocking, evidence: 2a2a91d] **cascader 值形态误判**：原映射 cascader → VARCHAR(255)，但 cascader 值必为数组，写入时被 MySQL 驱动按 Java Serializable 编码（`\xAC\xED` 乱码）。这是既有映射缺陷，非本次新组件——但本次"多值统一 JSON"复盘时应覆盖到 cascader，直到真实更新数据才暴露。
- 🟡 [painful, evidence: 51ce770] **需求分批到达**：列渲染形态（完整定制 → 部分隐藏 → colorPicker 排除搜索）跨 3 轮用户反馈才收敛，每轮一次提交。若 brainstorming 阶段一次问清"哪些组件隐藏、哪些可筛选"，可减少 2 个 commit。
- 📌 [nit, evidence: tasks.md] tasks.md 用 PowerShell 追加时 section 9 重复写了两遍，归档前手工去重。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 2.1-2.4 LONGTEXT 支持 | 实现后弃用（signaturePad 改 TEXT） | 真实发布暴露溢出 bug，用户指示简化 |
| 6.3 colorPicker 色块 | 最初保留展示；后按用户指示排除搜索栏 | 用户反馈"颜色选择器不用出现在搜索栏" |
| 7.3 手工验证 | 推迟到 apply 后由用户实际操作 | ff 阶段无法做浏览器验证 |
| 新增 8-10 任务组 | slider 支持、签名 TEXT 化、列渲染 | 会话中用户增量提出 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（初版变更 + 列渲染补充均走 brainstorming） |
| superpowers:writing-plans                        | ✓ |
| superpowers:using-git-worktrees                  | ✓ |
| superpowers:subagent-driven-development          | ✓（Task 1-6 派子代理） |
| (transitive) superpowers:test-driven-development | ✓（每个任务 RED-GREEN） |
| (transitive) superpowers:requesting-code-review   | ⚠️ 主代理自审（用户指示不派 oracle 子代理） |
| superpowers:finishing-a-development-branch       | ✓（当前 /opsx-finish） |

### Deliberately Skipped Skills

- **`subagent-driven-development` 的 reviewer 环节**
  - **What was skipped**: Task 1-6 实现后未派 oracle 做 spec/code-quality 双审，改为主代理自审 diff
  - **Why this cycle**: 用户明确指示"不要派发子代理，你自己干"（oracle 派发被用户中断两次）
  - **How to prevent recurrence**: `CLAUDE.md trigger` — 用户对子代理的偏好是会话级变量，不升格为 schema 规则；未来同用户会话默认主代理自审，除非用户要求

## 5. Surprises

- [evidence: c77942d] **MySQL 驱动对数组值做 Java 序列化**：以为非 JSON 列收到数组会报 SQL 类型错误，实际驱动静默序列化成 `\xAC\xED` 魔数乱码入库——这类行为单测（mock JDBC）无法暴露，必须真实数据库验证。
- [evidence: 2a2a91d] **information_schema 对 LONGTEXT 返回 4294967295**：以为 CHARACTER_MAXIMUM_LENGTH 总是 int 安全，真实 MySQL 返回 4GB-1 撑爆 Integer。测试应覆盖 DB 真实行为而非 mock 假设。

## 6. Promote candidates → long-term learning

- [x] 🔴 **动态列发布链路必须真实数据库验证**（LONGTEXT 溢出 + Java 序列化乱码都是 mock 测不出的） → **Promote to memory** (type: feedback)
  > **Why**: 两次 blocking bug 均只在真实 MySQL 发布/更新时暴露，mock JDBC 无法预判 information_schema 返回值与驱动序列化行为
  > **How to apply**: 涉及列类型/DDL/参数绑定的变更，merge 前至少跑一次真实发布 + CRUD 往返，不能只靠单测

- [x] 🟡 **组件值形态决定列类型**（数组值 → JSON 列，字符串值 → TEXT/VARCHAR） → **Promote to project CLAUDE.md**（表单设计器相关段落）
  > **Why**: cascader 数组存 VARCHAR 触发 Java 序列化乱码；checkbox 数组存 TEXT 曾用逗号拼接；值形态是比"组件名"更根本的判据
  > **How to apply**: 新增组件列映射时，先确认 form-create 组件的 v-model 值形态（数组/标量/字符串），再定列类型；前后端映射逐 case 对齐并各建测试

- [x] 📌 **LONGTEXT 引入需评估 information_schema 读取路径** → **Promote to memory** (type: how-to)
  > **Why**: CHARACTER_MAXIMUM_LENGTH 对 LONGTEXT 返回 4294967295 超 int，getNullableInt 需 getLong + 溢出返回 null
  > **How to apply**: 未来任何新列类型，先查 DynamicTableManager.findTableColumns 的读取是否安全
