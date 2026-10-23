---

<!-- ⛔ 下方 openspec-superpowers-opencode_instructions 区块为自动生成，禁止修改 ⛔ -->
<!-- openspec-superpowers-opencode_instructions -->

# AGENTS.md - AI 行为指令

本项目使用 openspec-superpowers-opencode（`superpowers-bridge-opencode` schema）驱动开发流程，
所有功能变更遵循 artifact 生命周期管理。

# 输出语言
- 请始终使用中文进行回复。
- 使用 /init 命令生成的 AGENTS.md 文件也请使用中文

## 开发规则

- 变更必须先在 worktree（`.worktrees/<name>/`）中生成 artifacts 和代码
- `main` 分支仅包含已合并的完成工作，始终保持干净
- 实现阶段使用 TDD（RED → GREEN → REFACTOR）方法论
- **所有 OpenSpec 工作流操作必须使用 `/opsx-*` 系列命令（如 `/opsx-propose`、`/opsx-apply`、`/opsx-ff` 等），不得手动模拟**
- **禁止自动执行 OpenSpec 工作流命令**：`/opsx-propose`、`/opsx-ff`、`/opsx-apply`、`/opsx-finish` 等 OpenSpec 工作流命令。必须由用户发起后才能执行。用户显式调用的流程（如输入 `/opsx-finish` 后）内部步骤不受限制。

## Shell 调用规则
- 在启动前后端应用时打开独立的windows终端窗口，注意不是agent内的终端。
- 后端应用采用了热部署，后端修改代码后只用编译不用重启。

## Git 协作规则

- rebase 中遇到 lockfile（Cargo.lock、go.sum、package-lock 等自动 resolving 产物）冲突时，lockfile 无法手动合并，必须重新生成（如 `cargo generate-lockfile` / `npm install` / `go mod tidy` 等）。重新生成的锁文件可能引入非预期的版本漂移，所以必须先编译验证再 `rebase --continue`

## Superpowers Skill 载入

本 schema 使用 `Read` 替代 `skill()` 来载入 Superpowers skills。

### Superpowers 路径

```
C:\Users\foxwe\.cache\opencode\packages\superpowers@git+https_\github.com\obra\superpowers.git\node_modules\superpowers\skills\
```

### skill() 不可用时

如果 `skill()` 工具不可用或报错，改用手动 `Read` 对应 skill 文件：

- `Read <Superpowers 路径>/<技能名称>/SKILL.md`
- 按 Read 到的内容执行

### 子 Agent 调度
所有任务都由主代理自己完成，不要委派给子代理
| 任务类型    | 调用方式                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 实现任务    | `task(load_skills=[], ...)` — prompt 中嵌入 TDD 指令（Read C:\Users\foxwe\.cache\opencode\packages\superpowers@git+https_\github.com\obra\superpowers.git\node_modules\superpowers\skills\test-driven-development/SKILL.md） |

### ⚠️ 关键限制：`load_skills` 不支持 Superpowers 技能

`task()` 的 `load_skills` 参数**只接受已注册 skill ID**（`skill()` 工具可找到的技能）。
Superpowers 技能（TDD、brainstorming 等）是文件系统上的 `.md` 文件，**不是注册技能**。
传入 `load_skills=["test-driven-development"]` 会**静默忽略**，不报错。

**唯一正确的传递方式**：Read 文件后，内容直接嵌入 `prompt` 字段。见上方"子 Agent 调度"表。

## 项目文档参考

以下文档是 AI 理解项目上下文的主要入口。标注 `*` 的为推荐必配。

## 项目文档参考

以下文档是 AI 理解项目上下文的主要入口。标注 `*` 的为推荐必配。

### 项目概览

- `README.md` — 项目定位、安装、快速开始 *
- `docs/QUICKSTART.md` — 用户快速上手指南
- `docs/features.md` — 功能清单与版本差异说明

### 架构与设计

- `docs/architecture/` — 总体架构（二进制拆分、模块关系、运行时路径）*
- `docs/decisions/` — 决策记录（ADR 架构决策 / DDR 设计决策 / IDR 实现决策）
- `docs/designs/` — 功能设计方案与对比

### 开发与测试

- `docs/development.md` — 开发环境、构建命令、代码风格 *
- `docs/how-it-works.md` — 工作原理（高层面）
- `docs/testing.md` — 测试规范与运行方式 *
- `docs/cli-commands.md` — 命令行参考
- `docs/test-runs/` — 本地测试运行记录（不纳入 git 跟踪）

### 需求与实施

- `docs/requirements.md` — 产品需求与版本路线 *
- `docs/tasks.md` — 实施任务列表及当前进度 *

### 经验积累

- `docs/learnings/` — 踩坑记录、需要重复执行的应对方式
- `docs/known-issues.md` — 已知问题与根因

### 工作草稿

- `docs/local/` — 个人本地工作区（`.gitignore` 排除，不纳入版本控制）
  - `inbox/` — 待分析的原始材料、未分类草稿
  - `notes/` — 个人笔记、非正式记录

### 测试账号
- 登录用户名admin 密码admin123

<!-- openspec-superpowers-opencode_instructions -->
<!-- ⛔ 上方 openspec-superpowers-opencode_instructions 区块为自动生成，禁止修改 ⛔ -->

## Git 提交与推送纪律（人工追加，位于自动生成区块之外）

以下四条都是 2026-10 出码 P2 合并推送时实测踩出来的，违反任一条都会造成返工或丢工作。

- **新文件与对它的第一处引用必须落在同一笔提交**。按主题 `git add` 拆分时，若把 `import`／注册代码归给前一笔、把被引用的新文件归给后一笔，前一笔单独检出就跑不起来（`vite dev` 解析失败），bisect 也会断在这一笔。拆完用 `git show <提交> -- <新文件路径>` 确认成对出现。
- **cherry-pick 重放必须按拓扑序，不能按提交日期序**。定序只用
  `git rev-list --reverse --topo-order --no-merges main --not origin/main`；
  `git log --no-walk --stdin` 会按日期重排（`--no-walk` 不看祖先关系），兄弟提交与隔代提交会错位，撞出"文件 deleted in HEAD"这类假冲突。核对顺序用 `head`/`tail` 看文件本身，别再套一层 `git log`。
- **推前 Gate 是"树内容等价"，不是 sha 相等**。跑
  `git diff --name-only main <重放分支> -- . ':(exclude)backups' ':(exclude)worklog.md'`，
  输出必须为空——`origin/main` 上的 cron 机器人只往 `backups/*.sql` 与 `worklog.md` 追加提交，这两条路径之外的差异才是真问题。为空即代码逐字节一致，不必在临时 worktree 里重跑测试。
  同理，判断"分支内容是否已全部进 main"要看**文件级**差异：`git cherry` 报 `+1` 可能只是冲突解决导致 patch-id 不同。
- **推完必须对齐本地 main，否则本地长期是一堆重复 hash**。顺序：先确认 `git status --short -- backups worklog.md` 为空且暂存区为空，再 `git reset --mixed <远端新 SHA>`（不动工作区，他人/其他会话的在途改动原样保留），最后 `git checkout -- backups worklog.md`。
  漏掉最后一步，`git status` 会把"旧 dump 内容"显示成待提交的修改，任何一次 `git add -A` 都会把远端的 dump 轮转 revert 掉。
