# 全站界面美化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将工作流管理系统从默认 Element Plus 外观升级为参考稿「蓝紫 + 青科技感」主题，全站自动换肤 + 布局外壳与关键页面精修。

**Architecture:** 通过 ① `DESIGN.md` 定义令牌权威 → ② `style.css` 用 Tailwind v4 `@theme` + Element Plus CSS 变量覆盖实现全站自动换肤（亮/暗双套）→ ③ 布局外壳（AdminLayout/SubMenu/页签栏）改蓝紫风格 → ④ 关键页面（登录/仪表盘/流程中心）精修。业务逻辑零改动，bpmn/form-create 画布内部不动。

**Tech Stack:** Vue 3.5 / Element Plus 2.14 / Tailwind CSS v4 / Vite 8 / TypeScript

## Global Constraints

- 不改任何业务逻辑（`<script>` 逻辑、接口、路由、状态、keep-alive 机制）——只动 class/样式层
- 不引入新依赖（仪表盘装饰图表用内联 SVG/CSS）
- 令牌权威来源为根目录 `DESIGN.md`；源码中新出现的 hex 必须补入 DESIGN.md
- `safety`（#f59e0b 琥珀）是安全业务语义色，保留；`industrial` token 名保留、值改为靛蓝系
- 暗色模式沿用现有 `.dark` 体系（勿破坏 dark-mode-toggle 的 class 机制）
- 构建验证：`npm run build`（在 `frontend/` 下执行）；改动文件需 `lsp_diagnostics` 干净

---

## Task 1: 更新 DESIGN.md（令牌权威）

**Files:**
- Modify: `DESIGN.md`（根目录）

- [ ] **Step 1: 通读现有 DESIGN.md 结构**
  Read `DESIGN.md`，确认现有 8 节结构与 `industrial`/`safety` token 描述。

- [ ] **Step 2: 写入新色板与令牌**
  在文档中新增/替换以下令牌值：
  - 主色靛蓝：`--color-industrial-500: #5755ee`、`--color-industrial-600: #5452d3`（保留 token 名，改值）
  - 青色点缀新增：`--color-accent-400: #48e0dd`、`--color-accent-500: #46c9d6`、`--color-accent-100: #c6edf4`
  - 浅蓝紫背景：页面底 `#f1f4fe`、渐变 `linear-gradient(#f4f6fe, #eef1fc)`、侧边栏亮 `#eef0fc`/暗 `#161b36`
  - 选中态 `#e9eaff`、卡片边框 `#e9edfa`、卡片阴影 `0 1px 3px rgba(87,85,238,0.06)`
  - 暗色：底 `#12162b`、卡片 `#1b2040`、边框 `#2a3054`、主色微亮 `#7c7ff0`、青 `#5ee7e8`、文字 `#e5e7eb`/`#94a3b8`
  - 保留 `safety`（琥珀 #f59e0b）语义说明

- [ ] **Step 3: 自检并在变更目录提交**
  确认无 `industrial`/`safety` 冲突描述后运行：
  ```bash
  git add DESIGN.md && git commit -m "docs(design): update design tokens to indigo/cyan theme"
  ```

---

## Task 2: style.css — Tailwind @theme 扩展 + EP 亮暗变量覆盖

**Files:**
- Modify: `frontend/src/style.css`

- [ ] **Step 1: 读取 style.css 现有 @theme 与 .dark 结构**
  Read `frontend/src/style.css`，定位 `@theme` 块、`body` 背景定义、`.dark` 变量块。

- [ ] **Step 2: 调整 Tailwind `@theme` 色阶**
  在 `@theme` 中把 `--color-industrial-500/600` 改为靛蓝（#5755ee / #5452d3），
  新增 `--color-accent-500: #46c9d6; --color-accent-400: #48e0dd;` 等青色阶。

- [ ] **Step 3: 覆写 EP 亮色变量（:root）**
  加入：
  ```css
  :root {
    --el-color-primary: #5755ee;
    --el-color-primary-light-3: #8080f2;
    --el-color-primary-light-5: #a6a6f6;
    --el-color-primary-light-7: #cbcbfa;
    --el-color-primary-light-8: #dcdcfb;
    --el-color-primary-light-9: #eaeafd;
    --el-color-primary-dark-2: #4543bd;
    --el-border-radius-base: 8px;
    --el-bg-color: #ffffff;
    --el-border-color: #e3e8f7;
    --el-border-color-light: #e9edfa;
    --el-border-color-lighter: #eef1fc;
    --el-border-color-extra-light: #f4f6fe;
    --el-fill-color-blank: #ffffff;
    --el-text-color-primary: #1f2437;
    --el-text-color-regular: #4b5169;
    --el-text-color-secondary: #8b91ab;
  }
  ```

- [ ] **Step 4: 覆写 EP 暗色变量（.dark）**
  在现有 `.dark` 块中加入：
  ```css
  .dark {
    --el-color-primary: #7c7ff0;
    --el-color-primary-dark-2: #9ea0f5;
    --el-bg-color: #1b2040;
    --el-bg-color-overlay: #222750;
    --el-border-color: #2a3054;
    --el-border-color-light: #323a63;
    --el-border-color-lighter: #3a4370;
    --el-fill-color: #232950;
    --el-fill-color-light: #2a3158;
    --el-fill-color-lighter: #303860;
    --el-text-color-primary: #e5e7eb;
    --el-text-color-regular: #c3c8d9;
    --el-text-color-secondary: #94a3b8;
  }
  ```

- [ ] **Step 5: body 背景升级为渐变**
  亮色 `body` 背景改 `linear-gradient(#f4f6fe, #eef1fc)`（暗色下为 `#12162b` 纯色或深蓝紫渐变）。

- [ ] **Step 6: 构建验证 + lsp_diagnostics + 提交**
  ```bash
  cd frontend && npm run build
  ```
  `lsp_diagnostics` 检查 style.css 干净后提交：
  ```bash
  git add frontend/src/style.css && git commit -m "style(theme): global Element Plus + Tailwind indigo/cyan theme"
  ```

---

## Task 3: 布局外壳 — AdminLayout 与 SubMenu

**Files:**
- Modify: `frontend/src/layouts/AdminLayout.vue`
- Modify: `frontend/src/components/SubMenu.vue`

- [ ] **Step 1: 关联查看 AdminLayout 与 SubMenu 现有 class**
  Read 两个文件，定位侧边栏容器、logo 区（第 202 行 `bg-industrial-600`）、页签激活条（第 292 行 `border-t-safety-500`）、头像（第 229 行）。

- [ ] **Step 2: 侧边栏与 logo 区换肤**
  侧边栏底色 → `bg-[#eef0fc] dark:bg-[#161b36]`（或新 `industrial-50` token）；
  logo 圆块 → 靛蓝渐变 `bg-gradient-to-br from-[#5755ee] to-[#46c9d6]`。

- [ ] **Step 3: 页签激活指示条换色**
  第 292 行 `border-t-2 border-t-safety-500` → `border-t-2 border-t-accent-500`（验证 Tailwind 识别新增色阶；若不识别则用 `border-t-[#46c9d6]`）。

- [ ] **Step 4: 顶栏/右键菜单 hover 态**
  折叠按钮、通知铃铛 hover → 浅蓝紫底 `hover:bg-[#eef1fc] dark:hover:bg-[#2a3054]`；
  右键菜单（若内联样式）白底 + `border-[#e9edfa]` + hover 浅蓝紫。

- [ ] **Step 5: SubMenu 激活态**
  Element Plus 菜单激活通过 EP 变量自动生效（`--el-menu-active-color`）；如需自定义给 `el-menu-item.is-active` 加蓝紫圆角底块样式（在 style.css 或 scoped 内）。

- [ ] **Step 6: 构建 + lsp + 提交**
  重复 Task 2 Step 6 的验证与提交（`style(theme): rebuild layout shell to indigo/cyan`）。

---

## Task 4: 关键页面 — 登录页 + 仪表盘

**Files:**
- Modify: `frontend/src/views/login/LoginPage.vue`
- Modify: `frontend/src/views/dashboard/DashboardPage.vue`

- [ ] **Step 1: 读取两文件现状**
  Read LoginPage.vue（104 行）与 DashboardPage.vue。

- [ ] **Step 2: 登录页背景与卡片升级**
  背景 `bg-gradient-to-br from-gray-50 to-gray-100` → 蓝紫对角渐变叠加青色光晕：
  ```html
  <div class="min-h-screen flex items-center justify-center relative overflow-hidden"
       style="background: linear-gradient(135deg, #eef1fc 0%, #dcdcfb 45%, #c6edf4 100%)">
    <div class="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-accent-400/20 blur-3xl"></div>
    <div class="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-[#5755ee]/15 blur-3xl"></div>
    ...
  ```
  卡片：`rounded-2xl` → `rounded-[20px] border border-[#e9edfa]`；登录按钮 `!bg-industrial-600` → 靛蓝渐变 `!bg-gradient-to-r !from-[#5755ee] !to-[#46c9d6]`（保留 `!rounded-lg !h-11 !text-base`）。

- [ ] **Step 3: 仪表盘欢迎横幅**
  新增顶部横幅：浅蓝紫渐变底、左侧 `text-2xl font-bold` 靛蓝标题（如"安全作业 · 工作流总览"）、右侧青色 SVG 装饰圆/波形（`<svg>` 内联，无第三方）。

- [ ] **Step 4: 仪表盘统计卡片区**
  4 张主题色卡片：白底 `rounded-xl border border-[#e9edfa]` + 左上角 `w-10 h-10 rounded-lg` 图标圆标（靛蓝/青/琥珀/紫交替）+ 大号数值（保留 `--`）+ 描述小字；数据仍为占位。

- [ ] **Step 5: 仪表盘装饰图表区**
  纯 SVG 柱状趋势（8-10 根高度各异圆角矩形，accent 青色系）+ 环形占比示意（`stroke-dasharray` 两段青色/浅灰），不标注数值、不引入库。

- [ ] **Step 6: 构建 + lsp + 提交**
  `style(theme): polish login and dashboard pages`。

---

## Task 5: 代表页面微调 + 全站验证

**Files:**
- Modify: `frontend/src/views/process/ProcessCenterPage.vue`（hover 强调）
- Modify: `frontend/src/views/profile/ProfilePage.vue`（如间距偏差）
- 验证：构建 + 截图 + hex 扫描

- [ ] **Step 1: 流程中心卡片 hover 增强**
  在 process-card 相关样式加 hover shadow 加深 + 顶部青色条：`hover:shadow-lg hover:border-accent-400`（如卡内无 scoped style 则加 `<style scoped>` 极小段）。

- [ ] **Step 2: Profile/列表页间距核对**
  浏览 ProfilePage 与 1-2 个列表页，容器 padding/卡片间距与令牌对齐，微调 class（如有偏差）。

- [ ] **Step 3: hex 合规扫描**
  ```bash
  grep -rEo "#[0-9a-fA-F]{6}" frontend/src --include="*.vue" --include="*.css" | sort -u
  ```
  未在 DESIGN.md 记录的非令牌 hex → 补入 DESIGN.md 或替换为令牌。

- [ ] **Step 4: 构建 + 启动 + 截图回归**
  `cd frontend && npm run build`；启动前后端（独立终端窗口），浏览器截图：登录页、首页仪表盘、流程中心、一列表页（亮 + 暗 2 模式），确认无布局回归。

- [ ] **Step 5: 关键交互回归**
  登录 → 菜单导航 → 页签切换 → 流程发起 → 暗色切换；确认 bpmn-js / form-create 画布内部未变。

- [ ] **Step 6: 提交 + 收尾**
  ```bash
  git add -A && git commit -m "feat(theme): final polish and verification"
  ```

---

## 执行交接

计划保存在各变更目录 `plan.md`。实现阶段使用 superpowers:subagent-driven-development
逐任务执行（每任务结束后截图/构建验证再进下一任务）。