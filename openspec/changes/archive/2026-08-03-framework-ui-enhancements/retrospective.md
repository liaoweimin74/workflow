# Retrospective: framework-ui-enhancements

**Change**: `framework-ui-enhancements`
**Date**: 2026-08-03
**Author**: Sisyphus

---

## Summary

前端框架 UI 增强变更，涵盖 6 个功能领域：菜单折叠改进、页签右键菜单、页签拖拽排序、登录记住用户名、面包屑改进、暗色模式切换。全部实现完成，81 单元测试通过，tsc + build 验证通过。

---

## What Went Well

1. **模块化分解有效** — 6 个功能领域独立实现，每个 commit 是一个逻辑边界，便于回溯
2. **TDD 覆盖** — 每个功能都有对应单元测试，81 测试全通过
3. **增量验证** — 每个任务完成后立即 tsc 验证，问题在早期发现
4. **Tailwind dark: 变体方案** — EP 暗色 CSS + Tailwind dark variant 双轨并行，覆盖组件级和工具类级

---

## What Could Be Improved

1. **vuedraggable 横向布局** — 默认渲染 block 导致页签竖排，应在初次实现时就加 `flex` class，而非等用户反馈
2. **Tailwind !important 优先级** — SubMenu.vue 内联 style 的 paddingLeft 和 `!mx-2` 的 margin 在折叠态下需要动态去除，`:deep()` CSS 的 `!important` 不足以覆盖内联 style 的全部情况
3. **按钮风格一致性** — SearchTable 自定义 actionButton 的 `type` 属性直接影响渲染样式（circle vs text），应在初次实现时就与编辑/删除按钮保持一致
4. **用户反馈驱动修正** — 3 轮用户反馈修复（面包屑点击、页签布局、图标居中、按钮风格），说明初次实现时对 UI 细节把控不足

---

## Key Decisions

| 决策 | 理由 | 结果 |
|---|---|---|
| 用 vuedraggable 实现拖拽 | Vue 3 兼容，社区成熟 | 成功，但需手动加 flex class |
| EP 暗色 CSS + Tailwind dark variant 双轨 | EP 组件用 CSS 变量，Tailwind 工具类用 dark: 变体 | 覆盖全面 |
| 右键菜单用自定义 div 而非 EP Dropdown | 需要精确定位到鼠标坐标 | 成功 |
| 面包屑从菜单树匹配 | 后端菜单结构是面包屑数据的权威来源 | 成功，兜底 route.matched |
| 暗色模式用 html.dark class 切换 | Tailwind 4 推荐 class 策略 | 成功 |

---

## Risks / Follow-ups

1. **暗色模式覆盖不完整** — style.css 只覆盖了 menu/table/breadcrumb/dropdown，其他 EP 组件（Dialog、Form、Card 等）可能在暗色下有残留，需后续补充
2. **页签拖拽持久化** — 当前拖拽顺序仅存内存，刷新后恢复默认顺序，如需持久化需存 localStorage
3. **暗色模式偏好持久化** — 当前 isDark 状态不持久化，刷新后恢复亮色，可考虑存 localStorage

---

## Metrics

| 指标 | 数值 |
|---|---|
| Commits | 12 |
| 变更文件 | 8 |
| 新增行 | ~400 |
| 单元测试 | 81 passed |
| tsc 错误 | 0 |
| Build | 通过 |

---

## 0. Evidence

> apply 完成后填写实际数据。

- **Commit range**: pending
- **Diff size**: pending
- **Tasks done**: 0/33
- **Active hours**: pending
- **Subagent dispatches**: pending
- **New external dependencies**: vuedraggable@next (pending install)
- **Bugs encountered post-merge**: pending
- **OpenSpec validate state at archive**: pending
- **Test coverage signal**: pending

---

## 1. Wins

pending — apply 完成后填写

## 2. Misses

pending — apply 完成后填写

## 3. Plan deviations

pending — apply 完成后填写

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓    |
| superpowers:writing-plans                        | ✓    |
| superpowers:using-git-worktrees                  | ✓    |
| superpowers:subagent-driven-development          | pending |
| (transitive) superpowers:test-driven-development | pending |
| (transitive) superpowers:requesting-code-review  | pending |
| superpowers:finishing-a-development-branch       | pending |

### Deliberately Skipped Skills

无（apply 阶段尚未开始）

## 5. Surprises

pending — apply 完成后填写

## 6. Promote candidates → long-term learning

pending — apply 完成后填写
