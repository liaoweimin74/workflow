# Verify: approver-picker

## Overall Decision: PASS

---

## Spec: approver-picker

### Requirement: 三栏穿梭式选人弹窗
- **PASS** — `ApproverPicker.vue` 实现 900px 弹窗，三栏布局（左 200px / 中 flex / 右 240px），底部取消/确定按钮。
- 打开弹窗：点击 trigger div → `dialogVisible = true`，中栏空态提示，右栏根据 modelValue 初始化。
- 关闭弹窗：取消按钮 → `handleCancel()` 恢复快照，不 emit。

### Requirement: 左栏组织树多选筛选
- **PASS** — `el-tree` + `show-checkbox`，`getOrgTree()` 加载数据，搜索框 `orgFilter` 前端过滤。
- 勾选触发 `onOrgCheck()` → `getCheckedKeys(false)` → `fetchCandidateUsers()`。

### Requirement: 左栏角色列表多选筛选
- **PASS** — `el-checkbox-group` + `getRoleList({size:999, status:1})`，搜索框 `roleFilter` 过滤。
- 勾选触发 `onRoleChange()` → `fetchCandidateUsers()`。
- 组织+角色合并 OR：`fetchCandidateUsers` 中同时传 `orgIds` + `roleIds`，后端 `cb.or()` 合并。

### Requirement: 顶部全局搜索
- **PASS** — 搜索框回车/按钮触发 `onSearch()`，传 `nickname` 参数。
- 后端 `UserServiceImpl` 用 `cb.or(like(nickname), like(phone))` 模糊匹配。
- 有搜索关键字时忽略左侧筛选（`hasSearch` 分支独占）。

### Requirement: 中栏待选用户表格
- **PASS** — `el-table` + checkbox 列，分页 size=20。
- 空态：`el-empty`「请在左侧选择组织或角色，或使用顶部搜索」。
- 已选行同步勾选：`syncTableSelection()` 通过 `toggleRowSelection`。
- 勾选/取消勾选同步右栏：`onTableSelect` / `onTableSelectAll`。

### Requirement: 右栏已选用户管理
- **PASS** — 列表显示昵称+部门+×删除，标题「已选 N 人」，「清空」按钮。
- × 删除：`removeSelected()` → 同步 `syncTableSelection()`。
- 空态：`el-empty`「暂未选择」。

### Requirement: 确认选择并 emit
- **PASS** — `handleConfirm()` emit `update:modelValue`（ID 数组）+ `change`（对象数组）。
- 测试覆盖：`ApproverPicker.test.ts` 验证 emit 契约。

### Requirement: 触发器显示已选用户
- **PASS** — 改为 tag 展示：选中用户以 `el-tag` 形式显示在 trigger 区域，可直接删除。
- 0 人时显示 placeholder（small 字号 12px）。

---

## Spec: user-batch-query

### Requirement: 用户查询支持 orgIds 数组筛选
- **PASS** — `UserQueryRequest` 新增 `orgIds: List<Long>`，`UserServiceImpl` 用 `root.get("orgId").in(orgIds)`。
- 测试：`UserServiceQueryTest.list_byOrgIds_returnsUsersInThoseOrgs()`。

### Requirement: 用户查询支持 roleIds 数组筛选
- **PASS** — `UserQueryRequest` 新增 `roleIds: List<Long>`，`UserServiceImpl` 用子查询 `sys_user_role` 表。
- 测试：`UserServiceQueryTest.list_byRoleIds_returnsUsersWithThoseRoles()`。

### Requirement: orgIds 与 roleIds 合并 OR 查询
- **PASS** — `cb.or(orPredicates)` 合并 orgIds + roleIds。
- 测试：`UserServiceQueryTest.list_byOrgIdsAndRoleIds_returnsUnion()`。

### Requirement: 批量查询用户接口
- **PASS** — `GET /users/batch?ids=1&ids=2`，`UserController.batch()` → `findByIds()`。
- 测试：`UserServiceBatchTest`（3 tests：正常批量、含不存在 ID、空列表）。
- 路由顺序：`/batch` 在 `/{id}` 之前，无冲突。

---

## Test Evidence

| Suite | Tests | Result |
|-------|-------|--------|
| Backend (mvn test) | 14 | PASS |
| Frontend (vitest) | 81 | PASS |
| Type check (vue-tsc) | 0 new errors | PASS |

## Commit Evidence

9 commits on `feature/approver-picker` branch:
- `d11f7d8` feat: add orgIds/roleIds to UserQueryRequest
- `2dd010e` feat: add orgIds/roleIds/SelectedUser/getUserBatch to frontend types and api
- `70ccba8` feat: UserServiceImpl orgIds/roleIds OR query + GET /users/batch + findByIds with tests
- `d356548` feat: ApproverPicker component - three-panel transfer layout
- `e4b44f2` feat: integrate ApproverPicker into UserTaskProperty
- `6d35a39` test: ApproverPicker component tests + vitest @ alias config
- `d174663` fix: ProcessDesigner validation + axios paramsSerializer
- `9152873` feat: tag display + inline removal, dialogHeight prop, fuzzy search
- (latest) feat: placeholder small font, tasks.md checked
