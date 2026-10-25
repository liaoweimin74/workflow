# 多端客户端支持（Client × Channel）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把客户端（Client）与渠道（Channel）做成数据模型与基础设施能力——新增一个端 = 配置 + 发布动作、不改平台代码——并分三期落地按端菜单树、角色挂端、字段级脱敏、登录泛化、桌面/移动双渲染器与三渠道交付。

**Architecture:** 活跃后端 `workflow_lowcode/backend-node`（NestJS 12 + Kysely + MySQL，Flyway 兼容迁移）承载端建模、作用域查询与授权链；管理端 `workflow_lowcode/frontend`（Vue3 + Element Plus）提供 A1–A5 配置界面；新增 uni-app Vue3 运行时工程共享移动渲染器（H5/APP 壳/小程序壳同源）。部署单服务器：`/` 管理端、`/m/` H5、`/api` 后端。

**Tech Stack:** backend-node：Node ≥24、pnpm、NestJS 12、Kysely、zod、vitest（swc，ESM）、MySQL8、jsonwebtoken；frontend：Vue3、Vite、Element Plus、axios、vitest + @vue/test-utils、Playwright；P2 追加 uni-app Vue3 CLI 工程与原生壳。

**Spec:** `openspec/changes/multi-client-support/`（design.md + specs/×9 + tasks.md）；设计母本 `workflow_lowcode/docs/designs/2026-10-25-多端客户端-菜单组织与页面原型.md`（线框 A1–A5/B1）。执行者读 plan + specs 双文档。

**范围与详略（writing-plans Scope Check 的显式处置）：** 用户拍板本变更覆盖 P0–P2 全部。P0（Task 1–11）写到可执行的 micro-step 级；P1（Task 12–15）写到文件锚点 + 接口契约级——其代码级细节依赖 Task 10 审计台账与 P0 落地的端上下文接口，**进入 P1 前必须先按本文件格式展开这些 Task 的步骤**；P2（Task 16–18）涉及原生/微信审核外部工具链，接口承诺入本文件，开工时单独展开。

## Global Constraints

- 活跃后端只有 `workflow_lowcode/backend-node`；Java `backend/` 为迁移期 oracle，**本变更零改动**（含 `backend-node/src/routes/*` 契约对齐层与 `_legacy`）
- 迁移文件：`backend-node/migrations/V{n}__snake_case.sql`，下一个编号 **V50**；执行 `pnpm migrate`（Flyway 兼容、CRC32 checksum）；同步 `src/framework/database/types.ts` 的 Kysely `Database` 接口
- 后端单测：`backend-node/test/**/*.spec.ts`（`pnpm test`，不需要 MySQL；当前仓库无既有 test/ 目录，本计划新建）；集成测试：`backend-node/test/integration/**/*.spec.ts`（`pnpm test:integration`，需 MySQL + .env）；lint：`pnpm lint`
- 前端测试：与组件同目录 `__tests__/*.test.ts`（`cd frontend; pnpm test`）；构建 `pnpm build`（tsc && vite build）
- API 形状：`R{code,msg,data}` + 控制器 `@JavaStatusOk()`；系统模块分页 `PageResult{total,page,size,rows}`；路由前缀 `/api`
- 模块边界（eslint import/no-restricted-paths）：api → engine → {system, notification} → framework → common；Client 相关全部进 `system` 模块
- 零破坏：新列一律 `NOT NULL DEFAULT 1`（= portal），存量 INSERT/查询不改；既有 path/权限码/`sys_role_menu` 授权行不动；权限码不加端前缀
- 权限模型对齐现状双轨（菜单可见性数据驱动 + 页面守卫）；**不引入**端点级权限装饰器新机制；所有新端点默认经全局 `JwtAuthGuard`
- 端上下文接口（P0 定义、P1 收敛）：HTTP 头 `X-Client-Id: <number>`，缺省 `1`（portal）；P1（Task 12）改由 token `client` claim 推导，header 过渡兼容
- Git 纪律：中文 conventional commit；新文件与其第一处引用同一提交；后端改动热部署仅需编译（`pnpm build`），前后端启动用独立 Windows 终端
- 冒烟账号：admin / admin123

## Review Focus

（规格隐含、无单一任务显式覆盖、最可能咬人的五类，逐条由标注任务钉测试）

1. **存量行为零漂移**：加 `client_id` 后菜单树/角色列表/登录响应与迁移前逐字段一致（Task 1、4、5 的回归断言）
2. **角色挂端越权语义**：请求端 ≠ 角色所属端 ⇒ 空菜单 + 页面 API 403，任何组合都不得降级放行（Task 5 矩阵测试）
3. **脱敏三口径一致**：详情 / 导出 / 开放 API 同主体同字段必须同策略值，序列化层单点（Task 13）
4. **表现字段泄漏**：旧桌面属性（列宽/栅格/弹窗尺寸）进入移动渲染器必须被忽略且不报错（Task 10 台账 → Task 14 渲染器兜底）
5. **同浏览器跨端串态**：`/` 与 `/m/` 的 localStorage/session 键与登录态必须按端隔离（Task 12、14）

---

# 第一部分：P0（Task 1–11，全详）

### Task 1: sys_client / sys_client_channel 迁移（tasks.md 1.1）

**Files:**
- Create: `workflow_lowcode/backend-node/migrations/V50__create_sys_client.sql`
- Modify: `workflow_lowcode/backend-node/src/framework/database/types.ts`
- Test: `workflow_lowcode/backend-node/test/integration/client-schema.spec.ts`（新建目录首个文件）

**Interfaces:**
- Produces: 表 `sys_client(id BIGINT PK AI, code VARCHAR(64) UNIQUE, name VARCHAR(64), icon VARCHAR(128), status TINYINT NOT NULL DEFAULT 1, default_role_id BIGINT NULL, default_member_group_id BIGINT NULL, created_at/updated_at)`，seed：`INSERT … (id=1, code='portal', name='平台端', status=1)`；表 `sys_client_channel(id PK, client_id FK, channel_type VARCHAR(8) /*WEB|H5|APP|MP*/, enabled TINYINT DEFAULT 0, config_json TEXT NULL, UNIQUE(client_id, channel_type))`。`config_json` 形状：`{loginMethods: string[], appid?: string, secret?: string, minVersion?: string, forceUpdate?: boolean, downloadUrl?: string}`（secret 存密文，见 Task 2）
- Kysely：`SysClientTable` / `SysClientChannelTable` 接口 + `Database` 注册 `sys_client` / `sys_client_channel`

- [ ] **Step 1: 写失败集成测试** `test/integration/client-schema.spec.ts`：查询 `information_schema` 断言两表存在、`uk_client_code`/`uk_client_channel` 唯一键存在、`sys_client` 含 id=1/code=portal 行、channel 表初始 0 行且 `client_id=1` 的 WEB 行可插入
- [ ] **Step 2: 跑测试确认失败** Run: `pnpm test:integration`（backend-node 目录，需本地 MySQL + .env；若环境缺 MySQL，记录 blocked 并以 migrate 干跑 + SQL lint 为临时证据）Expected: FAIL（表不存在）
- [ ] **Step 3: 写 V50 迁移 SQL**：两张 CREATE TABLE（InnoDB/utf8mb4，对齐 `V1__baseline_schema.sql` 风格）+ portal seed + WEB 渠道行 `(1,'WEB',1,NULL)`；回填语义靠 DEFAULT 1 不需要 UPDATE
- [ ] **Step 4: `pnpm migrate` 后重跑测试** Expected: PASS
- [ ] **Step 5: 同步 types.ts**：两接口 + `Database` 注册；`pnpm lint` + `pnpm build`
- [ ] **Step 6: Commit** `git add workflow_lowcode/backend-node/migrations/V50__create_sys_client.sql workflow_lowcode/backend-node/src/framework/database/types.ts workflow_lowcode/backend-node/test && git commit -m "feat(client): sys_client/sys_client_channel 数据建模与 portal seed（V50）"`

### Task 2: Client CRUD 后端（tasks.md 1.2/1.3）

**Files:**
- Create: `backend-node/src/system/repository/client.repository.ts`、`src/system/service/client.service.ts`、`src/system/controller/client.controller.ts`、`src/framework/security/crypto.ts`
- Modify: `backend-node/src/system/system.module.ts`（controller/provider 注册）、`src/framework/config/env.ts`（新增 `crypto.secretKey`，取 env `CLIENT_CRYPTO_KEY`）
- Test: `backend-node/test/system/client.service.spec.ts`（单测，repository stub）、`test/integration/client-api.spec.ts`

**Interfaces:**
- Consumes: Task 1 两表
- Produces:
  - `ClientVO {id, code, name, icon, status, defaultRoleId, defaultMemberGroupId, channels: ClientChannelVO[]}`；`ClientChannelVO {channelType, enabled, config: Record<string, unknown> & {secret?: '******' | null}}`
  - `class ClientService { listPage(page,size,filter): Promise<PageResult<ClientVO>>; options(): Promise<ClientOptionVO[] /*[{id,code,name,channelTypes: string[],status}]*/>; create(dto): Promise<ClientVO>; update(id,dto): Promise<ClientVO>; setStatus(id,status): Promise<void>; upsertChannel(clientId, channelType, dto): Promise<ClientChannelVO>; testChannel(clientId, channelType): Promise<{ok: boolean, msg: string}> }`
  - 端点（`@Controller('api/clients')`，全部经全局 JwtAuthGuard）：`GET /`、`GET /options`、`POST /`、`PUT /:id`、`PUT /:id/status`、`PUT /:id/channels`、`POST /:id/channels/:type/test`
- 规则：`code` 重复 → `BusinessException('客户端编码已存在')`；`channelType ∈ {WEB,H5,APP,MP}` 否则 ValidationError；MP `enabled=1` 时 appid/secret 必填；`id=1`（portal）拒绝改名/改码/停用；secret 以 `crypto.ts` AES-256-GCM 加密存储（`encryptSecret(v)/decryptSecret(v)`），任何读出口固定掩码 `******`

- [ ] **Step 1: 写失败单测** `test/system/client.service.spec.ts`（注入 stub repository）：`create 重复 code 抛「客户端编码已存在」`、`upsertChannel MP 缺 appid 抛 ValidationError`、`options 停用端 status 透传且不含 config_json 原文`、`portal(id=1) setStatus(0) 抛 BusinessException`
- [ ] **Step 2: 跑单测确认失败** Run: `pnpm test` Expected: FAIL（模块不存在）
- [ ] **Step 3: 实现 crypto.ts + repository + service**：repository 用 Kysely（`selectFrom('sys_client')` join channel；对齐 `system.repository.ts` 风格）；secret 加解密只在 service 边界
- [ ] **Step 4: 实现 controller**：`@JavaStatusOk()` + zod 校验 dto；分页形状 PageResult
- [ ] **Step 5: system.module.ts 注册**；`pnpm test` Expected: PASS；`pnpm lint && pnpm build`
- [ ] **Step 6: 集成测试** `test/integration/client-api.spec.ts`：create→get→update channel→options→disable 全链路 + secret 读回为掩码 + DB 密文非明文；`pnpm test:integration` PASS
- [ ] **Step 7: Commit** `feat(client): 客户端 CRUD、渠道开通与 secret 加密存储`

### Task 3: sys_menu 加 client_id 迁移 + 端形态校验器（tasks.md 1.6/2.2）

**Files:**
- Create: `backend-node/migrations/V51__add_client_id_to_sys_menu.sql`、`backend-node/src/system/service/menu-shape.ts`
- Modify: `backend-node/src/framework/database/types.ts`（`SysMenuTable.client_id: number`）
- Test: `backend-node/test/system/menu-shape.spec.ts`、`test/integration/menu-client-scope.spec.ts`

**Interfaces:**
- Produces:
  - V51：`ALTER TABLE sys_menu ADD COLUMN client_id BIGINT NOT NULL DEFAULT 1, ADD INDEX idx_menu_client(client_id, parent_id);` 迁移尾附核对查询 `SELECT COUNT(*) FROM sys_menu WHERE client_id IS NULL` 必须为 0（写入 spec 断言）
  - `menu-shape.ts` 纯函数：`type MenuZone = 'WEB' | 'TAB' | 'GRID' | 'BUTTON'; assertMenuPlacement(input: {zone: MenuZone, nodeType: 0|1|2, depth: number, tabSiblingCount: number, mobile: boolean}): void`——WEB 保持现状三层规则；移动端：`TAB` 区子节点必须 menu_type=1 且总数 2~5（新增第 6 个拒绝）、`GRID` 区深度 ≤2、按钮节点必须挂菜单之下（现状规则）、两个 zone 根目录（`component='mzone:tabs'` / `'mzone:grid'`，locked：拒绝删除/移动/改名）
- Consumes: Task 1（channel 表判断端是否 mobile：`H5/APP/MP` 任一 enabled ⇒ 移动形态）

- [ ] **Step 1: 写失败单测** `menu-shape.spec.ts`：Tab 第 6 个子节点被拒 / 第 2~5 通过 / GRID 第 3 层被拒 / zone 根目录删除移动被拒 / WEB 树沿用现状（现规则用例从 `MenuServiceImpl` 行为抄）
- [ ] **Step 2: `pnpm test` 确认失败 → Step 3: 实现 menu-shape.ts → Step 4: PASS**
- [ ] **Step 5: V51 迁移 + types.ts client_id**；`pnpm migrate`；`pnpm test:integration`
- [ ] **Step 6: Commit** `feat(client): sys_menu 客户端作用域列与端形态校验器（V51）`

### Task 4: MenuController/Service/Repository 按端分树（tasks.md 2.1）

**Files:**
- Modify: `backend-node/src/system/controller/system.controller.ts:210-287`（MenuController）、`src/system/service/system.service.ts`（菜单方法）、`src/system/repository/system.repository.ts:320-375`（菜单查询段）
- Test: `test/integration/menu-client-scope.spec.ts`（补 Task 3 文件）、单测 `test/system/menu-scope.spec.ts`

**Interfaces:**
- Consumes: Task 3 `assertMenuPlacement`、Task 2 `ClientService.options`（判断 mobile 形态）
- Produces:
  - `GET /api/menus/tree?clientId=1`——缺省取请求端上下文（Task 5 的 `X-Client-Id`，最终缺省 1）；`MenuTreeVO` **新增** `clientId: number` 字段（增量，不破坏现有前端消费）
  - `POST /api/menus` body 新增 `clientId?`（缺省 1）；`PUT /api/menus/:id`、`PUT /api/menus/:id/move` 处理前按行 `client_id` 定位 zone/mobile 并调 `assertMenuPlacement`，违规 → 400 `BusinessException(端形态约束消息)`
  - repository：全部菜单 SQL 追加 `where('client_id','=',clientId)`（`sys_role_menu` 联查同步——授权行语义不变，菜单行本身分端）
- 零破坏断言（Review Focus 1）：不带任何参数的 `GET /api/menus/tree` 响应与迁移前逐字节一致

- [ ] **Step 1: 写失败集成测试**：A 端建树 B 端树不可见 / portal 树响应回归快照（列名集合与旧 VO 一致 + 增量 clientId 字段）/ move 到 Tab 第 6 位 400
- [ ] **Step 2: `pnpm test:integration` 确认失败**
- [ ] **Step 3: 实现 controller/service/repository 三段改造**（express 契约层 `routes/menus.ts` 不动）
- [ ] **Step 4: `pnpm test && pnpm test:integration && pnpm lint && pnpm build` 全 PASS**
- [ ] **Step 5: Commit** `feat(client): 菜单树按端作用域查询与端形态服务端校验`

### Task 5: sys_role 挂端 + 认证链端一致性（tasks.md 1.7/3.1/3.2/3.3）

**Files:**
- Create: `backend-node/migrations/V52__add_client_id_to_sys_role.sql`
- Modify: `src/framework/database/types.ts`、`src/system/controller/system.controller.ts:160-210`（RoleController）、`src/system/service/system.service.ts`（角色方法 + 权限聚合）、`src/system/controller/auth.controller.ts`（登录返回与 getInfo 的 roles/permissions 构建）、`src/framework/security/user-context.ts` 旁新增 `src/framework/security/client-context.ts`（ALS：`runWithClient(clientId)/tryGetClient(): number /* 缺省 1 */`）、`src/api/interceptors/client.interceptor.ts`（镜像 `user.interceptor.ts`，读 `X-Client-Id` 头解析为数字，非法值按 1）并注册进 `app.module.ts` APP_INTERCEPTOR 链（UserContext 之后）
- Test: `test/system/role-scope.spec.ts`（单测）、`test/integration/cross-client.spec.ts`

**Interfaces:**
- Produces:
  - V52：`ALTER TABLE sys_role ADD COLUMN client_id BIGINT NOT NULL DEFAULT 1, ADD INDEX idx_role_client(client_id);`
  - `RoleVO.clientId: number`（增量字段）；`GET /api/roles?clientId=` 过滤；`POST/PUT /api/roles` body `clientId?` 缺省 1；**portal 内置角色集（ROLE_ADMIN 等既有内置）拒绝改端**
  - 权限聚合：getInfo/登录构建 permissions 的 SQL 加 `AND r.client_id = :ctx`（ctx = `tryGetClient()`）；角色不匹配 → `roles=[]、permissions=[]`（**不是报错**——空即权限关闭，页面守卫自然 403）
  - `ClientService.upsertChannel` 无关；`PUT /api/clients/:id` 保存 `defaultRoleId` 时 service 校验 `role.client_id === client.id`，否则 400「默认角色必须属于本端」（tasks 3.3）
- Consumes: Task 4 的 tree?clientId、Task 3 mobile 判定

- [ ] **Step 1: 写失败单测** role-scope：跨端 defaultRole 被拒 / 内置角色改端被拒 / 列表过滤；cross-client 集成矩阵（Review Focus 2）：admin 角色属 portal → `X-Client-Id: 2` 调 getInfo → roles=[]；同请求头调 `/api/menus/tree` → 空数组；用户仅有 2 端角色时 portal 头 → 空
- [ ] **Step 2: `pnpm test && pnpm test:integration` 确认失败**
- [ ] **Step 3: V52 + client-context.ts + interceptor 注册 + SQL 改造 + defaultRole 校验实现**
- [ ] **Step 4: 全量测试 PASS（含 Task 3/4 回归）；不带头的存量请求行为与迁移前一致（回归断言）**
- [ ] **Step 5: Commit** `feat(client): 角色挂端与认证链端一致性校验（V52）`

### Task 6: 前端 A1 客户端管理页（tasks.md 1.4）

**Files:**
- Create: `frontend/src/types/client.ts`、`frontend/src/api/client.ts`、`frontend/src/views/system/client/ClientPage.vue`、`frontend/src/views/system/client/__tests__/ClientPage.test.ts`
- Modify: `frontend/src/router/index.ts`（`/system/client` 路由，component 懒加载，静态注册模式对齐同目录既有项）
- Create: `backend-node/migrations/V53__client_manage_menu.sql`（开发管理目录下插菜单行"客户端管理"：menu_type=1、path `/system/client`、permission `system:client:list`、icon、sortOrder 追加值 + 按钮行 `system:client:create/update/delete` + `sys_role_menu` 授 ROLE_ADMIN；照 `V44__process_draft_box_menu.sql` 模式）

**Interfaces:**
- Consumes: Task 2 REST 形状
- Produces: `api/client.ts`：`listClients(params): Promise<R<PageResult<ClientVO>>>`、`clientOptions()`、`createClient(dto)`、`updateClient(id,dto)`、`setClientStatus(id,status)`、`upsertChannel(id,dto)`、`testChannel(id,type)`（模式对齐 `api/menu.ts`：`http.get<any, R<...>>('/clients', {params})`）
- `types/client.ts`：ClientVO/ClientChannelVO/ClientSaveDTO 与后端 VO 字段逐一对齐（camelCase）

- [ ] **Step 1: 写失败组件测试** ClientPage.test.ts（@vue/test-utils + stub api）：列表渲染名称/编码/已开通渠道徽标/用户数列占位；搜索过滤触发 api 参数；无 `system:client:create` 时新建按钮不渲染（v-permission 指令现状用法）；"＋新建"点击 emit 抽屉事件
- [ ] **Step 2: `cd frontend; pnpm test` 确认失败**
- [ ] **Step 3: types + api + ClientPage.vue 实现；router 注册；V53 迁移 `pnpm migrate`**
- [ ] **Step 4: `pnpm test && pnpm build` PASS**
- [ ] **Step 5: Commit** `feat(client): A1 客户端管理列表页与菜单种子（V53）`

### Task 7: 前端 A2 客户端设置抽屉（tasks.md 1.5 + 3.3 联动）

**Files:**
- Create: `frontend/src/views/system/client/ClientSettingDrawer.vue`、`__tests__/ClientSettingDrawer.test.ts`
- Modify: `ClientPage.vue`（接入抽屉 + ⚙ 入口）、`api/client.ts`（如需补 `rolesByClient` 查询用 `GET /roles?clientId=`）

**Interfaces:**
- Consumes: Task 2 渠道端点、Task 5 角色 `clientId` 过滤
- Produces: 抽屉三 Tab【渠道开通 | 登录方式 | 初始授权】；渠道区：WEB/H5/APP/MP 四开关 + 条件参数（MP→appid/secret+连通测试按钮调 `POST /clients/:id/channels/MP/test`；APP→minVersion/forceUpdate/downloadUrl）；登录方式区：按已开通渠道渲染勾选项（SMS/PWD/OPENID_SILENT/BIND_CODE → `config.loginMethods`）；初始授权区：默认角色下拉数据源 `GET /api/roles?clientId=<当前端>&page=1&size=200`（本端限定，tasks 3.3 的 UI 侧）、默认成员组同理 `/member-groups`；保存 → `PUT /clients/:id` + 逐渠道 `PUT /clients/:id/channels`；portal 抽屉渠道区 WEB 锁定不可停

- [ ] **Step 1: 写失败组件测试**：勾选 MP 未填 appid 保存 → 表单校验阻断；角色下拉断言请求带 `clientId`；portal 数据 WEB 开关 disabled；保存调用 payload 形状快照
- [ ] **Step 2: 确认失败 → Step 3: 实现 → Step 4: `pnpm test && pnpm build` PASS**
- [ ] **Step 5: Commit** `feat(client): A2 客户端设置抽屉（渠道/登录/初始授权）`

### Task 8: 前端 A3 菜单管理端 Tab（tasks.md 2.3/2.4/2.5）

**Files:**
- Modify: `frontend/src/api/menu.ts`（`getMenuTree(clientId?)` 等加参）、`src/views/system/menu/MenuPage.vue`、`src/views/system/menu/menuDrop.ts` + `useMenuTreeDrag.ts`（zone 带与锁定节点处理）、`src/types/menu.ts`（clientId 字段）、`__tests__/MenuPage.test.ts` 及两 drag 测试增补

**Interfaces:**
- Consumes: `GET /api/clients/options`（Task 2）、tree?clientId（Task 4）、服务端 400 形态错误（Task 3）
- Produces: 页面顶部 `端: (●平台端)(司机端)…＋去新建端` （el-tabs，切 Tab 重拉树，URL query `?clientId=` 保持）；移动形态树把 `mzone:*` 渲染为分区带标题（锁定 handle-disabled）；拖入 TAB 带被服务端拒时 `ElMessage.error(后端消息)` 并回滚本地顺序；空端树 → 现状空态

- [ ] **Step 1: 写失败测试**：切 Tab 二次请求带 clientId / mzone 节点拖拽手柄禁用 / 400 回滚行为 / "去新建端"路由跳转
- [ ] **Step 2: 确认失败 → Step 3: 实现 → Step 4: `pnpm test && pnpm build` PASS**
- [ ] **Step 5: Commit** `feat(client): A3 菜单管理端作用域切换与移动端分区`

### Task 9: 前端角色管理端维度（tasks.md 3.4）

**Files:**
- Modify: `frontend/src/views/system/role/RolePage.vue`、`src/types/role.ts`、`src/api/role.ts`、`__tests__/RolePage.test.ts`（如无则新建）

**Interfaces:**
- Consumes: `RoleVO.clientId`、`GET /roles?clientId=`（Task 5）
- Produces: 列表"所属端"列（clientOptions 映射名称）+ 筛选下拉；新建/编辑表单所属端选择（缺省当前 Tab 上下文或 portal；portal 内置角色该项 disabled）；权限码不变（无端前缀，Review Focus 1）

- [ ] **Step 1: 失败测试 → Step 2: 实现 → Step 3: `pnpm test && pnpm build` PASS → Step 4: Commit** `feat(client): 角色管理所属端列与表单挂端约束`

### Task 10: Schema 语义/表现审计 spike（tasks.md 4.1–4.3）

**Files:**
- Create: `backend-node/tools/schema-audit.ts`（只读遍历 `wf_page_def.config_json` / `wf_form_def`，按组件类型聚合属性键及出现资产数；输出 stdout JSON，仿 `tools/` 现有脚本 tsx 运行模式）
- Create: `workflow_lowcode/docs/designs/2026-10-26-schema语义表现分拣台账.md`（表头：组件 × 属性键 × 语义|表现|待议 × 实例数 × 处置[迁入渠道 profile / 渲染器忽略 / 保留]）
- Modify: `openspec/changes/multi-client-support/design.md` Open Questions #4 回填"清单见台账"

**Interfaces:**
- Produces: 台账文档 = Task 14（覆盖层实现）与 schema 校验器拦截清单的唯一输入

- [ ] **Step 1: 写 tools/schema-audit.ts**（键提取规则：`width|minWidth|span|colSpan|dialog|height|px|offset` 等候选表现模式先粗筛，人工复核分类）
- [ ] **Step 2: `pnpm tsx tools/schema-audit.ts > tmp/schema-audit.json` 跑真实库数据**（临时目录 `C:\Users\foxwe\AppData\Local\Temp\opencode` 亦可）
- [ ] **Step 3: 人工分类成台账 md**；每条"表现"字段给处置列
- [ ] **Step 4: 设计器侧扩展点调研写入台账末节**（form-create rule 与 VIEW config 两个入口的拦截位置草图）
- [ ] **Step 5: Commit** `chore(spike): 存量 schema 语义/表现审计台账`

### Task 11: P0 端到端验收（tasks.md 4.4）

**Files:**
- Create: `backend-node/test/integration/p0-client-loop.spec.ts`
- Create: `workflow_lowcode/docs/test-runs/2026-10-p0-multi-client.md`

**Interfaces:** Consumes: Task 1–10 全部

- [ ] **Step 1: 写全流程集成测试**：`POST /clients 司机端 → PUT channels(H5,APP,MP+参数) → PUT roles 新建「司机」挂新端 → PUT clients defaultRoleId=新角色 → POST menus(tree?clientId=新端) 建 TAB 带 3 节点+GRID 若干 → 以仅新端角色用户 getInfo(X-Client-Id=新端) 得非空、X-Client-Id=1 得空 → X-Client-Id=新端 调 portal 页面 API 403`；全程零平台代码修改路径断言 = 测试即验收
- [ ] **Step 2: 全量门禁**：`pnpm test`、`pnpm test:integration`、`pnpm lint`、`pnpm build`（backend-node）+ `pnpm test`、`pnpm build`（frontend）+ `pnpm contract`（oracle 650 步一致性不得回退；oracle 不可用时记录 blocked）
- [ ] **Step 3: 手动冒烟**（独立 Windows 终端起前后端；admin/admin123：A1 建端→A2 配渠道→A3 切端建树→角色页挂端），截图与步骤记 test-runs 文档
- [ ] **Step 4: Commit** `test(client): P0 多端建模端到端验收与测试记录`

---

# 第二部分：P1（Task 12–15，锚点级；开工前展开 micro-steps）

### Task 12: 登录泛化与端身份（tasks.md 5.x；spec: client-login-identity）

**Files（锚点）:** Create `migrations/V54__generalize_client_identity.sql`（`sys_user_openid` 加 `client_id NOT NULL DEFAULT 1`、uk 改 `(openid,client_id)`；新表 `sys_user_device(id,user_id,client_id,device_token,platform,last_login_at,revoked,…)`）；Modify `src/system/controller/auth.controller.ts`（`miniprogramLogin/miniprogramBind` 泛化为 `POST /api/auth/client/login|bind|unbind` + 绑定码服务）、`framework/security/jwt-token.provider.ts`（签发 payload 加 `client`,`channel`）、`JwtAuthGuard`（读 claim 灌 `runWithClient`，X-Client-Id 头降为过渡兼容）；Modify `frontend/src/views/system/user/`（A4 端身份 Tab 组件 + 测试）。
**关键接口:** `BindCodeService.issue(userId, clientId): string`（一次性码，Redis/表 TTL）；登录校验 A2 `config.loginMethods`；token claim 缺省 = 1（存量会话不破，Review Focus 1/5）。
**钉测试:** 方式未开通拒绝 / openid 跨端隔离 / 历史 token 按 portal / A4 吊销。localStorage 命名空间方案在此展开时定稿（Open Question 3 关闭点）。

### Task 13: 数据范围字段策略与脱敏（tasks.md 6.x；spec: data-field-masking）

**Files（锚点）:** Create `migrations/V55__grant_field_policy.sql`（如 `wf_ds_grant_field(grant_id, column_key, policy('VISIBLE'|'MASKED'|'HIDDEN'), rule_key NULL)`）；Create `engine` 侧 `field-mask.rules.ts`（内置规则枚举：MOBILE/NAME/IDCARD/PLATE/GEO500，纯函数 `applyRule(value, ruleKey)`）+ 序列化出口单点（bizdata 查询结果 → 渲染/数据/导出/开放 API 四路共用的 formatter 层——锚点 `routes/bizdata.ts` 对应 Nest 实现与 engine datasource 出参处理，展开时先定位唯一收口函数）；Modify 数据权限页 `frontend/src/views/system/row-permission/` 增字段策略区。
**钉测试（Review Focus 3）:** 同一 grant 详情/导出/开放 API 三出口同值；行过滤先于列收紧；基线缺省不变。

### Task 14: uni 移动渲染器与 /m/ 部署（tasks.md 7.x；spec: multi-client-rendering）

**Files（锚点）:** Create `workflow_lowcode/mobile/`（uni-app Vue3 CLI 工程，pnpm workspace；渲染器核复用/参照 `frontend/packages/lc-runtime` 的 schema 解释接口——展开第一步：评估 @lc/runtime 对 uni 编译管线的可移植性，必要时抽 `packages/schema-core` 双端共用）；Create 覆盖层 `migrations/V56__page_client_override.sql`（`wf_page_client_override(page_id, channel_type, override_json)`：槽位/显隐/排序三键制）；Modify 设计器 `views/designer|page/` 加 [桌面]/[移动] 预览（iframe → `/m/preview?token=`）；Create nginx 配置样例与 `frontend/vite.config` base 检查（`/m/` 产物、SPA fallback）；表现字段忽略兜底（读 Task 10 台账）。
**钉测试（Review Focus 4/5）:** 遗留桌面属性渲染不报错用例 / iframe 预览与生产同产物冒烟 / 两端存储隔离。

### Task 15: 发布目标端与双闸（tasks.md 8.x；spec: client-targeted-publishing）

**Files（锚点）:** `page_client_target` 表建表迁移（建模 P0 未建，展开时并入 V5x）；Modify Nest 页面发布 service（目标端数组写入 + 停用语义拒绝）；Modify `src/modules/page/page.ts` `assertPageAccess` → `(client, page)`（先兼容无端声明按 portal）；无移动等价清单 = Task 10 台账 + 映射表缺项联查（A5 拦截数据接口 `GET /pages/:key/client-affinity`）；Modify 前端发布对话框组件。
**P1 验收（tasks.md 8.5）:** 司机端类应用 H5 端到端 + 乘客跨端读取受策略——test-runs 记录 + `p1-e2e.spec.ts`。

---

# 第三部分：P2（Task 16–18，接口承诺；开工时单独展开）

### Task 16: APP 原生壳（tasks.md 9.x；spec: app-native-shell）
交付物：壳工程（WebView 容器加载 `/m/` + JSBridge 四能力 + 版本比对阻断）；接口承诺：Bridge 协议 `{action, payload, callbackId}` 与渲染器侧 `window.__bridge` 注入约定；推送绑定 `sys_user_device`（Task 12 表）。原生工程在本仓外（HBuilderX/Capacitor 选型开工时定），仓内落 `docs/ops/app-shell.md` + 协议单测。

### Task 17: 小程序运行时壳（tasks.md 10.x；spec: miniprogram-runtime-shell）
交付物：`mobile/` 工程 `dev:mp-weixin` 目标 + 固定页面（Tab 容器/通用页容器）+ `project.config.json` clientKey/appid 注入脚本；合规红线：schema 数据仅组件描述符、无 eval 路径（lint 规则钉死）。

### Task 18: 按渠道制品管线（tasks.md 11.x）
交付物：发布 action 按渠道分派（H5 直发确认 / MP 出包任务记录表+提审指引 / APP 版本 manifest）+ 三端同 schema 一致性回归 + 文档收尾（tasks.md 11.3）。**P2 验收 = 三渠道各自出包/发布。**

---

## 执行顺序与提交点

Task 1→2→3→4→5 严格串行（接口依赖）；6→7→8→9 前端链依赖 2/4/5 完成后并行可做；10 独立可提前；11 收口 P0。每 Task 自带 commit 点（中文 conventional）。实现全程 TDD：先失败测试后实现；后端热部署只编译不重启（`pnpm build` 即验证）。
