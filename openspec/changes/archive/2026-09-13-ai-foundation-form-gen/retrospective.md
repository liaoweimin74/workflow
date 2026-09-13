# Retrospective: ai-foundation-form-gen

> Written: 2026-09-13 (after verify passed)
> Commit range: `2b72e60..19841ae` (15 commits; +1 archive commit)
> Worktree: `.worktrees/ai-foundation-form-gen/` (branch `feature/ai-foundation-form-gen`)

---

## 0. Evidence

- **Commit range**: `2b72e60..19841ae`（15 commits，含 1 个 artifacts commit `ebe4fcd`；archive commit 另计）
- **Diff size**: `+5471 / -5 lines across 67 files`（含 artifacts `.md`）
- **Tasks done**: 44/44（`tasks.md` 中 `- [x]`=44，`- [ ]`=0）
- **Active hours**: ~10h（多轮迭代：基础设施 → 表单生成 → 统一入口 → 交互/渲染/品牌，含 3 次方向调整）
- **Subagent dispatches**: 2（均 oracle 审查尝试，30 分钟无活动超时；改为主代理自查）
- **New external dependencies**: `dompurify@^3.4.15`（MPL-2.0 OR Apache-2.0，前端）；后端零新增
- **Bugs encountered post-merge**: none（合并前修复 2 个真实缺陷：缺 `Authorization` 头、SSE 响应未正确终止）
- **OpenSpec validate state at archive**: pass（`items=103, passed=103, failed=0`）
- **Test coverage signal**: 前端 vitest **1111 passed**；后端 JUnit **1061 run / 1060 pass**（1 个既有失败）

Commit chain（时序）：

```text
2b72e60 feat(org): 组织编辑支持修改上级组织 + 循环引用校验   （base）
ebe4fcd change: ai-foundation-form-gen                     （artifacts）
8862056 feat(ai): AI 基础设施层（配置/模型抽象/OpenAI 兼容客户端/审计）
987e675 feat(ai): AI 表单生成（prompt 工程/校验清洗/服务/SSE+同步端点）
d7d5418 feat(ai): 表单设计器 AI 生成入口（SSE 客户端 + 生成弹窗 + 画布回填）
d892134 chore(ai): 增补 workflow.ai 配置（默认关闭）
5fb7d9f test(ai): 补齐 api-key 判空装配与 JSON 模式断言；勾选任务
13cbec1 feat(ai): 统一助手后端（function calling agent + /ai/chat，移除独立表单端点）
37eba48 feat(ai): 统一悬浮球助手入口（前端 store/动作总线/悬浮球/开关 + artifacts 修订）
dbb914d fix(ai): 请求携带 Authorization Bearer 头（修复供应商 401）
d454be6 feat(ai): 助手回复带可点击页面入口（open_page 工具 + 菜单白名单 + tag 跳转）
7dd2135 feat(ai): 助手改为完全悬浮对话窗体；入口随 message 返回并支持文本兜底匹配
4047b69 feat(ai): 助手回复 Markdown 渲染（markdown-it + DOMPurify + 链接白名单拦截）
bfd10ac fix(ai): 对话端点改同步 SSE 修复响应终止；行内胶囊 tag 链接 + 消除多余空行
58bfd77 feat(ai): 小智品牌样式（深色标题栏+机器人图标+头像+图标清除+输入框1-5行自适应）
19841ae style(ai): 缩小小智窗口尺寸（400x600 -> 340x480）   （head）
```

---

## 1. Wins

- [evidence: `8862056`] **零依赖冲突的 AI 基础设施**：自研 OpenAI 兼容客户端（`OpenAiCompatibleChatModel`），规避了 Spring AI 2.0 GA 与 Spring Boot 4.0.7 的 Enforcer 依赖对齐冲突；后端 0 新增依赖。
- [evidence: `987e675` + `FormSchemaValidatorTest` 9 项] **模型输出防御性清洗**：组件类型白名单降级、字段名规范化/去重、标题回填、warnings 汇总、容忍代码围栏——把不可信模型输出收敛为可渲染 schema。
- [evidence: `13cbec1` + `AiAgentServiceTest`] **统一对话入口 + function calling agent**：`AiToolRegistry` + agent loop（≤5 步），`generate_form_schema` 与 `open_page` 作为工具；工具异常返回错误 JSON 不中断。
- [evidence: `37eba48` + `FormDesigner.ai.test.ts`] **上下文绑定自动回填**：`aiActionBus` 在表单设计器上下文派发 `applyFormSchema`，复用既有 `setRule` 管线——能力层零重复实现。
- [evidence: `dbb914d`、`bfd10ac`] **两次运行时实测驱动的真实缺陷修复**：
  - 缺失 `Authorization: Bearer` 头 → 供应商 401（自动化 mock 未覆盖真实鉴权头）；
  - `SseEmitter` 异步响应在容器上 chunked 未正确收尾 → `curl(18)`（直连 100% 复现）+ vite 代理挂起 → 浏览器 `Failed to fetch`；改同步 `text/event-stream` 后 `exit=0`。
- [evidence: `4047b69` + `markdown.test.ts` 4 项] **安全渲染**：`markdown-it(html:false)` + `DOMPurify`，链接白名单拦截（`data-nav` 走前端路由，外链新窗口）——区别于通知模块（可信来源、不消毒），此处按不可信输入处理。
- [evidence: `58bfd77`、`19841ae`] **UI 贴合参考稿**：深色标题栏 + 机器人图标「小智·AI 助手」、图标化清除、助手头像、输入框 1–5 行自适应。

## 2. Misses

- 🔴 [blocking] 无。
- 🟠 [painful | evidence: oracle 两次调用 30min 无活动超时] **mandated oracle 审查未产出**，最终以主代理自查替代（虽然发现并修复了 2 处规格偏差，但缺少独立第二意见）。
- 🟠 [painful | evidence: `dbb914d`] **首版漏发鉴权头**：`AiAutoConfiguration` 只设 base-url/超时，未附 Bearer；单测用 MockRestServiceServer 未覆盖真实鉴权 → 只有真机运行时才暴露。
- 🟠 [painful | evidence: `bfd10ac`] **SSE 终止缺陷靠 curl 才定位**：前端只显示 `Failed to fetch`，浏览器 DevTools 也难直接判断；用 `curl -N -w "%{exitcode} %{http_code}"` 才看到 `exit=18`。
- 🟠 [painful | evidence: prompt 修订于 `bfd10ac`] **提示词约束不足**：初版未强制"内联链接"，模型只在文字里描述、还自发声称"已为你打开"；后加"禁止已打开/必须内联 `[页面名](/路径)`"才生效。
- 🟡 [nit | evidence: `docs/superpowers/specs/` 24 个文档] 历史 design 文档未清理（非本次产物）。
- 🟡 [nit | evidence: frontend node_modules junction] 为在 worktree 跑前端测试，`npm install` 实际写入主检出的共享 `node_modules`（已 gitignore，但会改动主工作区依赖目录）。
- 🟡 [nit | evidence: `AiUsageRecorder`] 审计 token 计数恒为 0（流式响应无 usage 字段）。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 入口形态（原 1.x/5.x） | 表单设计器内嵌按钮/弹窗 → **统一悬浮球 + 对话**；移除独立 `/ai/forms/generate` 端点 | 用户要求"统一入口、所有 AI 能力经对话完成"（v2 修订，见 brainstorm 修订记录） |
| Task 17 对话端点 | `SseEmitter` 异步 → **同步返回 `text/event-stream;charset=UTF-8`** | 容器 chunked 未正确收尾导致客户端读取失败/代理挂起 |
| 依赖（proposal Impact） | 原"零新增" → 前端新增 **dompurify** | Markdown 渲染需对不可信 AI 输出消毒 |
| Task 18–20 前端 | 新增/移除多轮：`AiFormGenDialog` 删除；新增 store/actionBus/orb/MarkdownRenderer/RobotIcon/menuIndex/markdown | 统一入口与富文本渲染要求 |
| Agent 工具 | 新增 `open_page`；Agent 增加**文本兜底匹配**与**内联链接**引导 | 首版模型不调工具/不给入口，导致"看不到 tag" |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✅（入口策略、三方案对比、v2 修订） |
| superpowers:writing-plans                        | ✅（plan.md） |
| superpowers:using-git-worktrees                  | ✅（`.worktrees/ai-foundation-form-gen`） |
| superpowers:subagent-driven-development          | ⚠ 命令要求，但 AGENTS.md 规定"不委派子代理"→ 主代理实现；审查曾尝试 oracle（超时） |
| superpowers:test-driven-development              | ✅（先写测试后实现；后端 52 项 AI 测试、前端 1111 项） |
| superpowers:verification-before-completion       | ✅（verify.md：validate 103/103、tasks 44/44、测试证据） |
| superpowers:finishing-a-development-branch       | ✅（本步骤执行中） |

## 5. Process improvements

1. **SSE/异步端点必须用真实 HTTP 客户端验证终止**：`curl -N -w "%{exitcode}"` 应作为验收项；MockMvc 无法暴露 chunked 收尾问题。
2. **真实鉴权头纳入测试**：MockRestServiceServer 需断言 `Authorization` 头（已在 `OpenAiCompatibleChatModelTest` 补上）。
3. **提示词约束写成"必须/禁止"并配 few-shot**：软性描述不足以让模型稳定调用工具或内联链接。
4. **AGENTS.md 与 schema 命令的委派要求冲突需显式记录**：本项目不委派实现，审查尽量主代理自查；oracle 超时要有降级路径。
5. **worktree 前端依赖**：共享 `node_modules` 的 junction 会污染主检出，建议用独立安装或记录副作用。

## 6. Follow-ups（未纳入本变更）

- Markdown Phase 2：代码高亮（highlight.js/Shiki）+ 代码块复制按钮。
- 审计 token 计数（`stream_options.include_usage` 或非流式 usage 解析）。
- 清理 `docs/superpowers/specs/` 历史文档（历史遗留，另行处理）。
- 若未来需要真正的流式输出（逐 token），需重新设计 SSE 终止与节流渲染。
