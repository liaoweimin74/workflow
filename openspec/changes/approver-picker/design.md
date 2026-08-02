## Context

当前 `UserTaskProperty.vue`（BPMN 设计器用户任务属性面板）中审批人配置是纯文本输入框：
- 「审批用户」：`<el-input v-model="approval.value" placeholder="用户ID，多个用逗号分隔">`
- 「审批角色」：`<el-input v-model="approval.value" placeholder="角色编码，多个用逗号分隔">`

用户需手动记忆并输入用户 ID / 角色编码，无筛选、无多选、无反馈，体验差且易错。

**现有资产**：
- 前端：Element Plus + Vue 3 + TS。已有 `LookupPicker`/`ReferencePicker`（单表格弹窗选人）、`getOrgTree()`、`getRoleList()`、`getUserList()` API。
- 后端：Spring Boot + JPA。`SysUser`（含 orgId、roles）、`SysOrganization`（树）、`SysRole`、`SysUserRole`（关联表）。`UserQueryRequest` 支持 username/nickname/orgId/status 单值筛选。
- `designerStore.NodeConfigData.approval.value` 当前是 `string`（逗号分隔 ID）。

**约束**：
- 组件需可复用（不仅服务于 BPMN 设计器）。
- 后端 `UserQueryRequest` 不支持 roleId 筛选，不支持多组织/多角色合并查询。
- 组织是树结构，角色是扁平列表。

## Goals / Non-Goals

**Goals:**
- 新建独立 `ApproverPicker.vue` 三栏穿梭式选人组件（左 Tab 组织树/角色列表 + 中待选用户 + 右已选用户）。
- 支持多选组织节点 + 多选角色，合并 OR 查询用户，去重，分页。
- 顶部全局搜索（姓名/电话），回车+按钮触发，搜索时忽略左侧筛选。
- 右栏已选用户 × 删除 + 中栏待选区同步勾选，双向同步。
- 后端 `UserQueryRequest` 扩展 `orgIds`/`roleIds` 数组字段，Specification 支持 OR 合并查询。
- 新增 `GET /users/batch?ids=` 批量查用户接口。
- 替换 `UserTaskProperty.vue` 审批用户输入框为 `ApproverPicker`。

**Non-Goals:**
- 不实现单选模式（当前只做多选，`multiple` prop 预留但默认 true）。
- 不做 `maxSelected` 限制逻辑（prop 预留，本期不实现校验）。
- 不兼容旧 `approval.value: string` 数据（开发期，直接改 `userIds: number[]`）。
- 不改动「审批角色」配置（角色作为筛选维度，不作为审批人配置类型）。
- 不做组件的 i18n（沿用项目现有中文硬编码风格）。

## Decisions

### D1：三栏穿梭式布局，不复用 LookupPicker

**选择**：新建 `ApproverPicker.vue`，900px 弹窗，三栏 `200px : 1fr : 240px`。

**理由**：`LookupPicker` 是单表格弹窗，无法承载左树+角色多选+穿梭三栏。强行扩展会破坏其通用性。独立组件更清晰、可复用。

**替代方案**：复用 LookupPicker 加筛选条（方案 B，见 brainstorm）——组织树无法用下拉体现，已选无独立区域，否决。

### D2：modelValue 用 number[]，change 事件带完整对象

**选择**：
```ts
modelValue: number[]                          // v-model 绑定 ID 数组
emit('update:modelValue', number[])
emit('change', SelectedUser[])                // {id, nickname, username, orgName}[]
```

**理由**：BPMN 配置存 ID（轻量、稳定），但父组件展示需昵称。change 事件带对象避免父组件二次查询。触发器输入框显示文本由组件内部根据 modelValue 批量拉详情生成（"张三、王五 等3人"）。

### D3：组织树 + 角色列表 Tab，均多选，合并 OR 查询

**选择**：
- Tab 1 组织树：`el-tree` + `show-checkbox`，数据 `getOrgTree()` 一次性加载。
- Tab 2 角色列表：`el-checkbox-group`，数据 `getRoleList({size:999, status:1})` 一次性加载。
- 两 Tab 勾选独立保留，合并生效：待选区 = ∑(orgIds 用户) ∪ ∑(roleIds 用户)，去重。

**理由**：用户明确要求可同时按组织和角色筛选，合并两个维度。OR 语义符合"选了这些组织或这些角色下的人"。

### D4：后端 UserQueryRequest 扩展 orgIds/roleIds 数组 + 批量查接口

**选择**：
- `UserQueryRequest` 加 `orgIds: List<Long>`、`roleIds: List<Long>`。
- `UserServiceImpl.list()` Specification：orgIds 非空时 `root.get("orgId").in(orgIds)`，roleIds 非空时 `join sys_user_role where roleId in roleIds`，两者用 `cb.or` 合并（若同时存在）。
- 新增 `UserService.findByIds(List<Long>)` + `GET /users/batch?ids=1,2,3`。

**理由**：前端拉全量合并（方案 B）在用户量大时性能差、分页丢失。后端一次 OR 查询分页准确。批量查接口避免前端 Promise.all 多次请求。

### D5：待选区初始空态，不预加载

**选择**：打开弹窗时，左侧无勾选且无搜索 → 中栏显示 `el-empty`「请在左侧选择组织或角色，或使用顶部搜索」。

**理由**：全量用户可能很大，预加载无意义且慢。引导用户先筛选。

### D6：旧数据不兼容

**选择**：`NodeConfigData.approval.value: string` → `userIds: number[]`，直接改。

**理由**：项目开发期，无生产旧数据需迁移。

## Risks / Trade-offs

- **[组织树 + 角色合并查询性能]** 当勾选大量组织和角色时，后端 OR 查询可能慢。→ **Mitigation**：Specification 用 `in()` 批量而非逐个 OR；监控慢查询。前端无勾选数上限（YAGNI，后续按需加）。
- **[组件复杂度高]** 三栏 + Tab + 双向同步逻辑复杂，测试覆盖需充分。→ **Mitigation**：TDD，先写组件测试（勾选同步、去重、emit）再实现。
- **[el-tree checkbox 全选语义]** 勾选父节点会自动勾选子节点，可能导致 orgIds 包含大量节点。→ **Mitigation**：用 `el-tree` 的 `check-strictly` 或收集 `leafOnly` 节点，需在实现时确认。倾向 `leafOnly: true`（只查叶子组织下用户），但若组织层级中非叶子也有直属用户则需 `check-strictly`。实现时验证后端 orgId 是直属还是含子组织。
- **[批量查接口 ids 过多]** `GET /users/batch?ids=` URL 长度限制。→ **Mitigation**：已选人数通常 <100，URL 可承载。若超限改 POST，本期 YAGNI。
- **[角色全量加载]** `getRoleList({size:999})` 假设角色 <100。→ **Mitigation**：可接受，企业角色量级通常很小。
