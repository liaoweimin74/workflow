# P0 多端建模端到端验收记录（Task 11）

- 日期：2026-10-26
- 变更：openspec `multi-client-support` P0（Task 1–11）
- 分支：`feature/multi-client-support`（worktree `.worktrees/multi-client-support`）
- 结论：**P0 全链验收通过**（自动化 3 层门禁 + 浏览器手工冒烟），发现并修复 1 个前端缺陷（见「缺陷记录 D1」）

## 1. 环境

| 项 | 值 |
| --- | --- |
| 后端 | worktree `node dist/main.js`，`PORT=8090`，DB=`workflow_v6`（本机 Java 占 8080/8081，避让） |
| 前端 | worktree `vite --port 3001 --force`，proxy 临时指向 8090（提交前已还原） |
| 账号 | admin / admin123 |
| 浏览器 | Chromium（Paseo 内嵌），1600×1000 |

启动注记：
- `nest start --watch` 因 687 个存量 tsc 错误（全在 `_legacy`，=基线）不 launch 应用，但 watch 仍 emit dist → 直接 `node dist/main.js` 起最新代码。
- worktree 前端 `@lc/runtime`（`file:packages/lc-runtime`）被 pnpm 实体复制进 `node_modules`，其源码内 `../../../src/utils/http` 越出包边界 → vite dep-optimization 崩溃（与 `vite build 6 错` 同源环境债）。冒烟期用 `mklink /J` 把 `node_modules/@lc/runtime` 换成指向 `packages/lc-runtime` 的 junction 修复；`pnpm install` 会打回复制态需重建。不属本次变更范围，记为环境债。

## 2. 自动化门禁（改动文件相关）

| 门禁 | 结果 |
| --- | --- |
| backend unit（`vitest run --exclude "**/integration/**"`） | 54/54 通过（含 client.service.spec 新增 3 个分区根播种例） |
| backend integration（含新 `p0-client-loop.spec.ts` 9 例） | 47/47 通过 |
| backend eslint（改动文件） | 0 错误 |
| backend `tsc --noEmit` | 687 = 基线（红全在 `_legacy`，无新增） |
| frontend `MenuPage.test.ts` + client 相关 spec | 37/37 通过 |
| frontend `tsc --noEmit` | 5 = 基线（无新增） |
| `pnpm contract`（Java oracle 8082） | blocked-and-continue（oracle 未运行，不阻塞 P0） |

`p0-client-loop.spec.ts` 覆盖：建端 → 开 H5 渠道（触发分区根播种）→ 移动端挂 Tab/GRID 节点 → 形态规则拒绝（Tab 上限/GRID 层级）→ 分区根 locked 拒绝改删 → 建角色挂端 → 角色分配本端菜单 → `X-Client-Id` 上下文下 userinfo/menus 端隔离 → portal 零破坏。

## 3. 浏览器手工冒烟步骤与证据

| # | 步骤 | 预期 | 实测 |
| --- | --- | --- | --- |
| A1 | 系统管理 → 客户端管理 → 新建「司机端」（code=driver） | 列表出现新行 | ✅ id=2；侧栏出现「客户端管理」入口且 portal 存量菜单树零破坏 |
| A2 | 司机端「⚙设置」→ 渠道开通勾选 H5 → 登录方式勾 手机验证码+账密 → 保存并生效 | toast「已保存并生效」 | ✅ channels=[{H5, enabled:1, config:{loginMethods:[PWD,SMS]}}] |
| A2+ | 开 H5 后校验分区根播种 | `menus/tree?clientId=2` 返回两个 locked 根 | ✅ 454「底部 Tab 区」(mzone:tabs) + 455「工作台宫格区」(mzone:grid) |
| A3 | 菜单管理 → 端 Tab 出现「平台端/司机端」+「去新建端」入口 | 切司机端显示两条锁定分区带 | ✅ 「锁定」徽标渲染；平台端树与改前一致 |
| A3 | 司机端 Tab 区「新增子菜单」→ 工作台（/driver/home, driver:home） | 创建成功挂入 Tab 区 | ✅ id=457（修复 D1 后 UI 路径通过） |
| A3 | GRID 区「新增子菜单」→ 排班表（/driver/schedule） | 创建成功挂入宫格区 | ✅ id=458 |
| A3 | 分区根行「删除」→ 确认 | 服务端拒绝 toast | ✅「工作台宫格区为锁定根目录，不允许删除」，根保留 |
| R1 | 角色管理 → 新增「司机」（ROLE_DRIVER，所属端=司机端） | 列表出现，所属端列正确 | ✅ id=187；存量 ROLE_ADMIN/ROLE_USER 显示「平台端」（V52 回填） |
| R2 | 司机角色「分配菜单」 | 弹窗树只含司机端 5 节点 | ✅ 勾选 我的/工作台/排班表 → toast「分配菜单成功」→ `GET /roles/187/menus` 回读 [456,457,458] |
| A2' | 设置抽屉 → 初始授权 → 注册默认角色下拉 | 只列本端角色；保存后 defaultRoleId 生效 | ✅ 下拉仅「司机」；保存后 `clients` 列表 defaultRoleId=187 |
| S1 | `GET /api/auth/userinfo` + `X-Client-Id: 2` | 端不匹配 = 该端无角色（非报错） | ✅ HTTP 200，roles=[]、permissions=[]；`/api/auth/menus` 返回空 |
| S2 | 同请求缺省（portal） | admin 全量绕过不破坏 | ✅ roles=[ROLE_ADMIN]、permissions 全量 |

## 4. 缺陷记录

### D1（已修复，随本次提交）：A3 非 portal 端新建菜单必失败
- 现象：司机端 Tab 区新增子菜单，服务端拒绝「不能跨客户端移动菜单」（断言消息复用，实际是创建时跨端校验）。
- 根因：`MenuPage.vue` 的 `createApi` 载荷不含 `clientId` → 服务端 `createMenu` 缺省按 portal(1) 处理 → `assertPlacement` 发现 parentId=454 属于端 2 → 拒绝。集成测试显式传 clientId 故未拦截，属测试盲区。
- 修复：`createApi: (data) => createMenu({ ...stripClientOnly(data), clientId: activeClientId.value })`；TDD 补回归用例「非 portal 端新建：载荷必须携带当前端 clientId」（RED→GREEN，19/19）。
- 教训：跨端校验消息「不能跨客户端移动菜单」在 create 路径同样触发，文案易误导定位（后续可细化为「菜单不属于当前端」）。

### D2（裁定增补，随 Task 11 提交）：移动端分区根无生成路径 → 开渠道时幂等播种
- 发现：4.4「零代码链」死锁——`assertPlacement` 要求移动端菜单必挂分区根，但存量无任何 API 能创建分区根（parentId=null 在移动端被拒）。
- 裁定：`ClientService.upsertChannel` 在渠道 enabled=1 且 channelType≠WEB 时，幂等播种 `mzone:tabs` + `mzone:grid` 两分区根（`ClientRepository.countZoneRoot/insertZoneRoot`）。
- 验证：A2+ 步骤实测播种 ✓；单测 3 例（首次播种/幂等不重复/WEB 渠道不播种）✓。

### E1（环境债，不修复）：`@lc/runtime` file: 依赖复制态导致 vite dev/build 解析失败
- 见「1. 环境」启动注记。建议后续将依赖改为 `link:` 或将 runtime 源码纳入 tsconfig paths。

## 5. 数据清理

冒烟在 `workflow_v6` 产生的数据已 SQL 清理：`sys_client` id=2、`sys_client_channel` client_id=2、`sys_menu` client_id=2（454–458）、`sys_role` id=187、`sys_role_menu` role_id=187。`workflow_node_test` 库由集成测试自行幂等管理。

## 6. Open 项（带入 P1/终检报告）

- tasks.md 1.3：客户端/角色缓存失效无落点（当前每请求查库，无缓存层，暂不构成缺陷）
- tasks.md 2.5：PageAccessGuard 端不感知——`loadRolesAndPermissions` 查全量角色/权限码、`findMenusByPath` 不带 client_id；修复涉及与 Java 引擎行为对齐 → P1「端运行时数据隔离」议题
- `pnpm contract`：待 Java oracle 8082 可用后补跑
