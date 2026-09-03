# Implementation Plan

## Overview

本变更统一卡片与表格的字段渲染样式模型（`FieldStyle`/`ConditionalStyle`），并补齐卡片整体样式自定义（`CardStyle` + 内置主题 + 栅格布局 + 条件样式），保留并强化可视化配置。实施采用 TDD（RED → GREEN → REFACTOR），先在 worktree 分支开发，完成验证后合并回 main。

## Prerequisites

- worktree: `.worktrees/card-style-customization/`（分支 `feature/card-style-customization`）
- 参考文件：
  - `frontend/src/components/business/ListCards.vue`（主组件）
  - `frontend/src/utils/tableColumnRenderer.ts`（公共列渲染模块）
  - `frontend/src/utils/scriptSandbox.ts`（条件表达式沙箱求值）
  - `frontend/src/views/page/components/ColumnAdvancedConfig.vue`（列高级配置弹窗）
  - `frontend/src/views/page/ViewDesigner.vue`（`ColumnViewConfig` 类型定义）

## Execution Order

### Phase 1 — 模型与工具（Task 1-2，无依赖，可并行）
1. **Task 1**：`FieldStyle`/`ConditionalStyle` 类型 + `resolveFieldStyle`/`normalizeColumnStyle` 工具 + 单元测试。
2. **Task 2**：`ListCards.types.ts`/`ListCards.themes.ts`/`ListCards.styles.ts` + 单元测试。

**验证**: Task 1、2 各自 vitest 通过。

### Phase 2 — 渲染链路（依赖 Phase 1）
3. **Task 3**：`ListCards.vue` 消费 `CardStyle`/`FieldStyle`（主题、栅格、区域布局、条件样式、图标）。
4. **Task 4**：`tableColumnRenderer.ts` 的 `buildCellRender` 接入 `resolveFieldStyle`（表格统一）。

**验证**: Task 3、4 组件/渲染测试通过；`vue-tsc` 无类型错误。

### Phase 3 — 配置面板（依赖 Phase 1）
5. **Task 5**：`ColumnAdvancedConfig`/`QueryColumnsConfig` 统一样式结构 + 迁移收敛。
6. **Task 6**：条件样式规则编辑器（替代 `styleExpr` 文本框）。

**验证**: Task 5、6 组件测试通过。

### Phase 4 — 类型与后端（可与 Phase 2/3 并行）
7. **Task 7**：`ColumnViewConfig` 扩展 `style`；`ViewCompiler.java` 透传 `style`/`dynamic`。

**验证**: 前端 `vue-tsc` + 后端编译通过。

### Phase 5 — 集成与回归（依赖全部）
8. **Task 8**：`PageDataCards`/`PageDataTable` 集成、全量测试回归、手工验证（表格↔卡片切换样式一致、条件样式、主题切换）。

**验证**: 全量测试通过；`vue-tsc` 无错误；后端编译通过；手工验证通过。

## Dependencies

```
Task 1 ─┐
        ├─→ Task 3 ─→ Task 8
Task 2 ─┤
Task 1 ─┴─→ Task 4 ─→ Task 8
Task 1 ─→ Task 5 ─→ Task 6 ─→ Task 8
Task 7 ──────────────────────→ Task 8
```

- Task 1、2、7 相互独立，可并行。
- Task 3、4、5、6 依赖 Task 1（FieldStyle/解析工具）；Task 3 额外依赖 Task 2（CardStyle/主题）。
- Task 8 依赖全部。

## Verification Strategy

- **单元测试**（vitest）：`fieldStyle` 解析/迁移、主题合并、条件样式、配置迁移、规则编辑器。
- **组件测试**：`ListCards` 主题/栅格/条件样式/图标、表格统一样式渲染、配置面板回填保存。
- **类型检查**：`vue-tsc`（前端）、后端编译。
- **手工验证**：视图设计器中表格↔卡片切换，确认样式一致无跳变；条件样式按行生效；5 个主题切换正常；旧 schema（含 `styleExpr`/`fontColor`）加载不丢样式。
- **回归**：前端全量测试 + 后端编译，无既有用例破坏。

## Rollback

新 `style` 字段与旧字段读取兼容，回滚仅需恢复旧渲染逻辑；数据格式不破坏（`normalizeColumnStyle` 收敛写回，但读取侧始终兼容旧字段）。
