# workflow-backend-node

工作流平台的 Node.js 后端（NestJS + TypeScript + Kysely）。

Java 后端（`../backend`）在迁移期保留可运行，作为行为基准（oracle）。

- 迁移设计规格：`../docs/superpowers/specs/2026-09-16-nodejs-backend-migration-design.md`
- P0 实施计划：`../docs/superpowers/plans/2026-09-16-p0-contract-harness-and-node-skeleton.md`

## 快速开始

```bash
pnpm install
cp .env.example .env  # 或直接导出环境变量（模板见 .env.example）
pnpm migrate          # 应用 migrations/（Flyway 兼容运行器）
pnpm test             # 单元测试（不需要 MySQL）
pnpm test:integration # 集成测试（需要 MySQL）
pnpm lint             # ESLint，含模块边界强制
pnpm dev              # 启动，默认 :8081
```

## 当前状态（2026-09-18）

| 项 | 数值 |
|---|---|
| 契约回归 | **50 场景 / 650 步：一致 650 / 未实现 0 / 不一致 0 / 告警 0** |
| 端点 | 队内 **189/189 全部实现**（契约网覆盖 186，菜单写端点 3 个走集成测试） |
| 单测 / 集成 | **779（51 文件）/ 33（6 文件，含 SSE 与并发的端到端）** |
| 迁移 | 37 个（V1..V38，无 V10）；checksum **与 Flyway 同算法**（CRC32），可跨侧校验；V37 实例乐观锁、V38 修节点配置唯一键 |
| `grep -rn '尚未迁移' src/` | 3 处（VIEW 页面分派 U32 残余、通知未读数缓存、外部渠道适配器）—— **适配器分支已全部接通** |

## 部署与运维（P8）

### 启动

```powershell
# 本地：独立窗口 + 日志（脚本在 docs/local/scripts/，属本地工作区不入库）
pwsh -File ../docs/local/scripts/run-node-8081.ps1 -Rebuild

# 生产（推荐）：pm2 进程守护，单实例
npm i -g pm2                       # 部署期工具，刻意不进 dependencies
pm2 start ecosystem.config.cjs     # 配置见该文件的注释（含"为什么必须单实例"）
pm2 save; pm2 startup              # 开机自启（Linux；Windows 用 pm2-installer / 计划任务）
pm2 logs workflow-backend-node

# 生产（裸起，无守护）：仅用于排查
pnpm build && node dist/main.js
```

#### systemd 备选（不用 pm2 时）

```ini
# /etc/systemd/system/workflow-backend-node.service
[Unit]
Description=workflow backend (node)
After=network.target mysql.service

[Service]
Type=simple
User=workflow
WorkingDirectory=/opt/workflow/backend-node
EnvironmentFile=/opt/workflow/backend-node/.env      # 见 .env.example
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=2
KillSignal=SIGTERM
TimeoutStopSec=10                                    # 给在途请求留时间（对齐 pm2 kill_timeout）

[Install]
WantedBy=multi-user.target
```

#### 发布与回滚（单实例，允许秒级中断）

```
1. pnpm install --prod=false && pnpm build    # 产物在 dist/
2. pnpm migrate                               # 只增不删；先校验 checksum，失败即中止
3. pm2 restart workflow-backend-node          # 停在途请求 ≤5s（kill_timeout）
4. 冒烟：/api/health + 见下方"首次部署检查单"第 3 步
回滚：git checkout <上一个提交> → pnpm build → pm2 restart（迁移是只增的，无需回退 DDL）
```

⚠️ **改完 `src/` 必须重新 `build` 并重启进程**。契约比对打的是**正在运行的那个进程**，
只构建不重启会报「未实现」或旧行为，看起来像契约破损（这个坑本项目踩过多次）。

### 首次部署检查单

```
1. 建库/迁移   $env:DB_NAME='<目标库>'; pnpm migrate
                 ⚠️ 与 Java 共用 flyway_schema_history：指向已有库时不会重复执行已应用的版本
                 ⚠️ migrate 会**先校验已应用迁移的 checksum**（与 Flyway 同算法：CRC32），
                    脚本被事后改动 → 直接失败并提示 `pnpm migrate:repair`（不回滚 DDL）
2. 构建 + 起服务 pnpm build; pm2 start ecosystem.config.cjs
3. 冒烟（**必须含一次部署**，只读端点不足以证明可用 —— 见下）
                POST /api/auth/login                                  → 200 + accessToken
                GET  /api/v1/data-sources                             → 200
                POST /api/v1/process-definitions/drafts?name=x&key=t1 → 200（草稿）
                PUT  /api/v1/process-definitions/{id}/design          → 200（**body 带 nodeConfigs**）
                POST /api/v1/process-definitions/{id}/deploy          → 200
                POST /api/v1/process-instances                        → 200（发起）
                GET  /api/v1/tasks?assignee=<发起人>                   → 200 且能看到待办
4. 全量测试     pnpm test && pnpm test:integration
5. 契约回溯     pnpm residue:clean; pnpm contract   # 期望：不一致 0 / 未实现 0 / 告警 0
                （需要 Java 在 8082 作为对照，见下）
```

> ⚠️ 第 3 步为什么要**多打一遍部署**：曾经只打 login + 只读端点，于是漏掉一个
> 「**全新库根本没法部署流程**」的缺陷（`wf_node_config` 唯一键过窄，规格 U39）——
> 契约库因为表是 Java/Hibernate 先建的而恰好没有那个键，所以契约一直全绿、掩盖了真相。
> 这个检查单现在由 `test/integration/concurrency.spec.ts` 自动守护（它就跑在
> **只由迁移建出来的全新库**上，并且会部署带 `nodeConfigs` 的流程）。

### 部署形态前提（**当前：单实例**）

| 项 | 现状 | 说明 |
|---|---|---|
| **实例数** | ✅ **单实例**（`ecosystem.config.cjs` 已锁 `instances: 1`） | 引擎的**并发正确性已由乐观锁保证**（V37 + CAS，规格 U40）：同一实例的并发请求会被 CAS 挡下而不是互相覆盖。但**仍需单实例**的两个原因：① SSE 连接表在进程内（多实例下跨进程推不到，要 Redis 广播）；② 页面发布的**跨进程**按 key 串行锁未实现（规格 U33） |
| 定时任务 | 无 | Node 侧目前**没有任何调度器**（`grep cron/setInterval` 为空），所以不构成多实例阻塞；将来加「投递重试扫描」这类后台任务时，多实例需要唯一执行者 |
| 进程守护 | ✅ pm2（systemd 备选见上） | 含自动重启、启动抖动保护（`min_uptime`）、优雅退出（`kill_timeout`）、内存兜底 |
| 与 Java 共库 | 仅迁移期 | Node 用 `wfe_*`、Java/Flowable 用 `ACT_*`（约束 C2）。**同一个流程实例不能同时被两个引擎接管 ⇒ 灰度必须按实例/租户切，不能按请求轮询** |

### 环境变量

见 `.env.example`（逐项有注释）。两条最容易出事的：

- `DB_NAME` 默认 **`workflow_v6`** —— 不是 `workflow`（那个开发库的 Flyway 历史与仓库文件不一致，Java 自身也起不来）；
- `JWT_SECRET` **必须与 Java 一致**，否则切换期间两边发的 token 互不识别（切换验收要专门验这一条）。

`PORT` 默认 **8081** —— 8080 留给 Java 后端，两者并存做契约比对。

## 契约回归

契约冻结是硬约束：196 个端点的路径、响应形状、HTTP 状态码与错误信息不得变化。

```bash
pnpm endpoints        # 从 Java Controller 源码抽取端点清单 → tools/endpoints.generated.json
# 在独立终端窗口启动 Java 后端（:8080）后：
pnpm golden:record    # 录制黄金样本 → test/fixtures/golden/
# 启动 Node 后端（:8081）后：
pnpm contract         # 回放并对 Node 响应做逐字段比对
```

`contract` 输出三档：

| 档位 | 含义 |
|---|---|
| **一致** | Node 响应与 Java 完全一致 |
| **未实现** | Node 返回 404，端点尚未迁移（P0/P1 阶段的正常状态） |
| **不一致** | 形状或取值有差异 —— **必须为 0**，否则就是契约破裂 |

比对规则刻意严格：字段集合、字段类型（含 `null` vs `undefined`、数字 vs 字符串数字）、
数组长度、标量取值全部强校验。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 8081 | 保留 8080 给 DSH Web GUI、8082 给 Java 基准 |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` | localhost / 3306 / root / — | |
| `DB_NAME` | **`workflow_v6`** | 见下方「数据库」一节 —— **不是** `workflow` |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB` | localhost / 6379 / 0 | P1 认证实现时启用 |
| `JWT_SECRET` | 与 Java 默认值一致 | base64，解码后 47 字节 → HS256 |
| `JWT_ACCESS_EXPIRE_MINUTES` / `JWT_REFRESH_EXPIRE_MINUTES` | 30 / 10080 | 与 Java 一致 |
| `JAVA_BASE_URL` | http://localhost:8080 | 录制黄金样本的目标 |
| `NODE_BASE_URL` | http://localhost:8081 | 契约比对的目标 |

## 数据库

**默认库是 `workflow_v6`，不是 `workflow`。**

原开发库 `workflow` 的 `flyway_schema_history` 只有两行（baseline + `V2__init.sql`，
checksum 84590707），而仓库里的文件已改名为 `V2__init_data.sql` 且内容不同 ——
V2 在被应用之后经历过重命名/修改，导致 `FlywayValidateException: Migration checksum mismatch`
且 **Java 后端完全无法启动**。这是既有问题，与本次迁移无关。

按要求**未修改 `workflow`**，另建了历史自洽的 `workflow_v6`：

| 内容 | 来源 |
|---|---|
| `ACT_*` / `FLW_*` / `event_publication` | 从 `workflow` 复制**结构与数据**（必须带数据 —— `ACT_GE_PROPERTY.common.schema.version` 是 Flowable 判断是否需要升级的依据，只复制结构会让它重复加列而报 `Duplicate column name`） |
| `sys_*` 8 张表 | `migrations/V1__baseline_schema.sql`（V2 的种子 INSERT 需要目标表存在） |
| V2..V31 | 由应用自身的 Flyway 应用一次，checksum 权威可信 |
| 业务数据 | 从 `workflow` 逐表同步，已核对 28 张表行数完全一致；两张动态表 `wf_biz_person` / `wf_biz_leave_apply_biz` 也已复制 |

验证结果：`Successfully validated 30 migrations` + 正常启动；
黄金样本响应体与开发库**逐字节一致**（仅 `recordedAt` 时间戳不同）。

现存数据库：`workflow`（原始，只读保留）、`workflow_v5`（早先的快照）、
`workflow_v6`（**当前使用**）、`workflow_node_test`（集成测试专用，会被测试重建）。

## 后端开发基准（Java oracle）

Java 基准跑在 **8082**（8080 被 DSH Web GUI 占用），指向 `workflow_v6`：

```powershell
pwsh -File ../docs/local/scripts/run-java-8082.ps1
# 然后：
$env:JAVA_BASE_URL='http://localhost:8082'; pnpm golden:record
```


## 约束（详见规格文档）

- **C1** REST 契约严格冻结，前端零改动
- **C2** 引擎用 `wfe_*` 自定义表，不碰 `ACT_*` / `flw_*`
- **C3** BPMN XML 是唯一真源
- **C4** `../backend` 只读不改
- **C5** `migrations/V2`–`V31` 原样保留，不得修改一个字符

## 目录约定

```
src/common      叶子模块：纯类型与纯函数（R / PageResult / 异常体系）
src/framework   基础设施：配置、数据库、Redis、认证、异常过滤器
src/engine      工作流引擎：流程、运行时、任务、表单、数据源、页面、租户
src/system      系统管理：用户、角色、组织、菜单、字典
src/notification 通知中心：通道、模板、订阅、投递
src/api         对外 REST 层：controller / dto / interceptor
tools           契约回归工具链（不得依赖 src —— 录制器必须独立于应用）
```

依赖方向 `api → engine → {system, notification} → framework → common`，
由 `eslint.config.mjs` 的 `no-restricted-imports` 强制。**新增代码前先看这条规则。**

## 数据库迁移

`migrations/V*.sql` 用 Node 侧运行器执行，语义与 Flyway 对齐：

- 复用 Flyway 的 `flyway_schema_history` 表 → 指向已有开发库时不会重复执行 V2–V31
- 支持 `out-of-order`（对齐 `spring.flyway.out-of-order: true`），但会显式告警
- `V1__baseline_schema.sql` 是从活库导出的 `sys_*` 表基线 —— 这 8 张表由 JPA
  `ddl-auto: update` 自动创建，**没有任何 SQL 来源**，不固化则新库无法从零建起
- `V32__create_engine_runtime_tables.sql` 是自研引擎的运行时表

## 已知环境注意事项

- **⚠️ 不要用 `tsx` 直接运行 `src/main.ts`。** NestJS 的依赖注入依赖
  `emitDecoratorMetadata` 产出的 `design:paramtypes` 元数据，而 **esbuild（tsx 的转译器）
  不支持该选项** —— 结果是构造参数被注入成 `undefined`，任何请求都返回 500，
  而 vitest + unplugin-swc 路径下（有元数据）测试却全绿，问题完全不可见。
  **开发与构建一律走 tsc 系工具链**：`pnpm dev`（`nest start --watch`）、`pnpm build`（`nest build`）、
  `pnpm start`（`node dist/main.js`）。`tsx` 仅用于 `tools/` 与迁移 CLI，它们不涉及 DI。
  `test/integration/built-app.spec.ts` 用真进程 + 真 HTTP 守护这条路径。
- **pnpm 11** 不再读取 package.json 的 `pnpm` 字段，设置迁到 `pnpm-workspace.yaml`
  （如 `allowBuilds`）。
- **Vite/Vitest 在 Windows 上需要能 spawn 管道子进程**（它内部调用 `net use` 探测网络驱动器）。
  若在受限沙箱中运行并报 `spawn EPERM`，需放宽沙箱或在非受限终端执行。
- **@swc/core 与 esbuild 的 postinstall 已显式拒绝执行**（见 `pnpm-workspace.yaml`）：
  二者通过平台可选依赖提供原生绑定，不需要安装后脚本；其 postinstall 在受限环境中
  会因管道 stdio 被拒而报 EPERM。
- Vitest 配置文件名是 `vitest.config.mts`（ESM），否则 Vite 会警告配置以 CommonJS 加载。
- **项目原有的 Flyway 历史不一致**：开发库 `workflow` 的 `flyway_schema_history` 只有
  baseline + `V2__init.sql`（checksum 84590707），而仓库里的文件已改名为
  `V2__init_data.sql` 且内容不同，导致 Flyway 校验失败、**Java 后端无法启动**。
  这是既有问题，不是迁移引入的。**已通过新建 `workflow_v6` 解决，未修改 `workflow`** ——
  详见下方「数据库」一节与规格文档的 R12 / U7。

## 契约实测事实（不可凭推测实现）

以下已由黄金样本实测确认，实现时**必须逐条遵守**（详见规格 §5.4）：

| 事实 | 内容 |
|---|---|
| 分页形状**不统一** | 列表端点返回 Spring Data `Page`：`{content, pageNumber, pageSize, totalElements, totalPages}`；而 `PageResult` 是 `{total, page, size, rows}`。**按端点各自的 golden 样本实现** |
| 租户缺失 | HTTP **400** + `{"code":400,"msg":"Tenant ID is not set. Ensure X-Tenant-Id header is provided.","data":null}` |
| 缺必填查询参数 | HTTP **500**（不是 400）+ `{"code":500,"msg":"Required request parameter 'assignee' for method parameter type String is not present","data":null}` |
| 密码错误 | HTTP **200** + `{"code":500,"msg":"用户名或密码错误","data":null}`（业务异常码是 500，不是 401） |
| 数据租户值 | `default`（少数数据源为 `system`） |

## 后端开发基准（Java oracle）

本机 8080 被 DSH Web GUI 占用，故 Java 基准跑在 **8082**：

```powershell
pwsh -File ../docs/local/scripts/run-java-8082.ps1
# 然后：
$env:JAVA_BASE_URL='http://localhost:8082'; pnpm golden:record
```

