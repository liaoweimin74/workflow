# Retrospective: business-form-table

> Written: 待实施与 verify 通过后填写
> Commit range: 待填写
> Worktree: `.worktrees/business-form-table/`（feature/business-form-table）

---

## 0. Evidence

> 量化前置数据 —— 实施与验证完成后填写。

- **Commit range**: 待填写 (<n> commits)
- **Diff size**: 待填写
- **Tasks done**: 待填写
- **Active hours**: 待填写
- **Subagent dispatches**: 待填写（本 change 用户指定主代理完成）
- **New external dependencies**: 无（沿用 form-create / Spring Boot / Vue 现有栈）
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

待实施完成后填写（重点：verify.md §7 中标记的手动冒烟 deferral —— DDL 真实执行与前端业务数据管理页交互，是否有自动化测试等价覆盖或需 follow-up）。

---

## 5. Candidate Practices

待实施完成后填写。已知候选观察点：

- [ ] 🟡 **动态 DDL 的安全护栏模式**（列名/类型白名单 + 参数化）值得沉淀为项目级实践
  > **Why**: 运行时 DDL 是高风险能力，护栏做法可复用于其他动态建表/动态 SQL 场景
  > **How to apply**: 评估是否 promote 到 docs/learnings/
- [ ] 📌 **v1 子表/嵌套表单在底表中不支持**的取舍记录
  > **Why**: 影响后续 data-picker（v2）与字段类型扩展的规划
  > **How to apply**: 作为 v2 规划输入

---

## 6. Carry-Forward

- [ ] **data-picker 引用业务表单数据（v2）**：工作流表单字段通过数据源选择业务表单记录，依赖本 change 的 formKey=数据源标识基础
- [ ] **流程沉淀（v2）**：流程完成后表单数据写回业务表
- [ ] **行级权限/数据范围控制（v2）**：v1 仅"能管理该表单即能查全部"
