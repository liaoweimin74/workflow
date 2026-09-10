# Retrospective: data-picker

> Written: 待实施与 verify 通过后填写
> Commit range: 待填写
> Worktree: `.worktrees/data-picker/`（feature/data-picker）

---

## 0. Evidence

> 量化前置数据 —— 实施与验证完成后填写。

- **Commit range**: 待填写 (<n> commits)
- **Diff size**: 待填写
- **Tasks done**: 待填写
- **Active hours**: 待填写
- **Subagent dispatches**: 待填写（延续用户要求主代理完成）
- **New external dependencies**: 无（沿用现有栈）
- **Bugs encountered post-merge**: 待填写
- **OpenSpec validate state at archive**: 待填写

---

## 1. What Happened

待实施完成后填写：计划执行概况、偏离计划的点、实际交付范围。

---

## 2. Wins

待实施完成后填写。

---

## 3. Misses

待实施完成后填写。

---

## 4. Verification Gaps

待实施完成后填写（重点：verify.md §7 的 deferral —— 设计器配置弹窗交互与端到端级联的手动冒烟，是否有等价自动化覆盖或需 follow-up）。

---

## 5. Candidate Practices

待实施完成后填写。已知候选观察点：

- [ ] 🟡 **data-picker 冗余文本模式**（id 关系 + `<key>_text` 快照）值得沉淀
  > **Why**: "引用展示零联查 + 删除不红碎"的通用模式，可复用于后续任何引用类字段/跨表展示
  > **How to apply**: 评估是否 promote 到 docs/learnings/ 或作为组件规范
- [ ] 📌 **级联 filter 复用 BizDataService.query** 的接入方式
  > **Why**: 级联 = 依赖字段 → filter，零新增查询能力；后续复杂查询（JOOQ）的接入点
  > **How to apply**: 作为 v2 查询层演进输入

---

## 6. Carry-Forward

- [ ] **外部 API 数据源**：data-picker 支持 API 数据源（URL/参数/响应解析），本 change 明确不做
- [ ] **行级权限/数据范围**：引用目标表单的数据范围控制（v2 仅"能管理即能引用"）
- [ ] **跨表单统计/JOIN 查询**：data-picker 建立的表间引用关系是跨表查询的基础，JOOQ 引入时机随统计需求评估
- [ ] **被引用数据变更同步**：`_text` 快照不同步（改名后旧文本保留）——如需求出现，提供"刷新引用文本"批量任务
