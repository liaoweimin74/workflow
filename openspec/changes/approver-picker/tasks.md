## 1. 后端：UserQueryRequest 扩展 orgIds/roleIds

- [ ] 1.1 在 `UserQueryRequest.java` 中新增 `orgIds: List<Long>` 和 `roleIds: List<Long>` 字段（可选）
- [ ] 1.2 在 `UserServiceImpl.list()` 的 Specification 中新增 orgIds 处理：非空时 `root.get("orgId").in(orgIds)`
- [ ] 1.3 在 Specification 中新增 roleIds 处理：非空时 join sys_user_role 子查询 `roleId in roleIds`
- [ ] 1.4 orgIds 和 roleIds 同时存在时用 `cb.or` 合并两个 predicate
- [ ] 1.5 编写后端单元测试覆盖：单 orgIds、单 roleIds、合并 OR、与其他条件 AND 叠加、空值不影响

## 2. 后端：批量查用户接口

- [ ] 2.1 在 `UserService` 接口新增 `List<UserVO> findByIds(List<Long> ids)` 方法
- [ ] 2.2 在 `UserServiceImpl` 中实现 `findByIds`：调用 `userRepository.findAllById`，转 UserVO 列表，不存在的 ID 静默跳过
- [ ] 2.3 在 `UserController` 新增 `GET /users/batch?ids=1,2,3` 端点，返回 `{rows: UserVO[]}`
- [ ] 2.4 编写后端测试：批量查存在用户、含不存在 ID、空列表

## 3. 前端：类型与 API 层

- [ ] 3.1 在 `frontend/src/types/user.ts` 的 `UserQueryParams` 中新增 `orgIds?: number[]` 和 `roleIds?: number[]`
- [ ] 3.2 在 `frontend/src/types/user.ts` 中新增 `SelectedUser` 接口（`{id, nickname, username, orgName}`）
- [ ] 3.3 在 `frontend/src/api/user.ts` 中新增 `getUserBatch(ids: number[])` 函数，调用 `GET /users/batch`

## 4. 前端：ApproverPicker 组件骨架

- [ ] 4.1 新建 `frontend/src/components/business/ApproverPicker.vue`，定义 Props/Emits 接口（modelValue, disabled, multiple, placeholder, change）
- [ ] 4.2 实现触发器 `el-input`（只读，显示已选用户昵称，点击弹窗），复用 LookupPicker 触发器视觉风格
- [ ] 4.3 实现 `el-dialog`（900px）三栏布局骨架：左栏 200px / 中栏 1fr / 右栏 240px
- [ ] 4.4 实现底部取消/确定按钮，确定时 emit update:modelValue + change

## 5. 前端：左栏组织树 Tab

- [ ] 5.1 实现 Tab 切换（组织树 / 角色列表）
- [ ] 5.2 组织树 Tab：调用 `getOrgTree()` 加载，渲染 `el-tree` + `show-checkbox`
- [ ] 5.3 实现组织名搜索框，前端过滤 el-tree 节点
- [ ] 5.4 监听 tree check 事件，收集 checkedKeys，触发中栏用户查询

## 6. 前端：左栏角色列表 Tab

- [ ] 6.1 角色列表 Tab：调用 `getRoleList({size:999, status:1})` 加载，渲染 checkbox 列表
- [ ] 6.2 实现角色名搜索框，前端过滤角色列表
- [ ] 6.3 监听 checkbox 变化，收集 checkedRoleIds，触发中栏用户查询

## 7. 前端：中栏待选用户区

- [ ] 7.1 实现顶部全局搜索框（姓名/电话），回车+按钮触发，搜索时忽略左侧筛选
- [ ] 7.2 实现 `el-table` + checkbox 列（昵称、部门），分页 size=20
- [ ] 7.3 实现查询逻辑：有搜索关键字时全局搜；无搜索时按 orgIds+roleIds 合并查；无搜索无勾选时显示空态
- [ ] 7.4 实现 el-table selection 同步：已选用户行默认勾选，勾选/取消勾选同步到右栏已选集
- [ ] 7.5 实现待选区数据按用户 ID 去重（组织+角色合并可能产生重复）

## 8. 前端：右栏已选用户区

- [ ] 8.1 实现已选用户列表（昵称+部门+×删除），标题显示「已选 N 人」
- [ ] 8.2 实现 × 删除：从已选集移除，同步取消中栏对应行勾选
- [ ] 8.3 实现「清空」按钮：清空已选集，取消中栏所有勾选
- [ ] 8.4 实现已选区空态 `el-empty`「暂未选择」
- [ ] 8.5 实现打开弹窗时根据 modelValue 调 `getUserBatch` 初始化已选集

## 9. 前端：designerStore 与 UserTaskProperty 集成

- [ ] 9.1 修改 `designerStore.ts` 的 `NodeConfigData.approval`：`value: string` → `userIds: number[]`
- [ ] 9.2 修改 `UserTaskProperty.vue` 第 25-31 行：`el-input` 替换为 `<ApproverPicker v-model="approval.userIds" @change="saveConfig" />`
- [ ] 9.3 修改 `UserTaskProperty.vue` 的 `loadConfig`/`saveConfig`：适配 `userIds: number[]`
- [ ] 9.4 在 `frontend/src/components/business/index.ts` 中导出 `ApproverPicker`

## 10. 前端：组件测试

- [ ] 10.1 新建 `frontend/src/components/business/__tests__/ApproverPicker.test.ts`
- [ ] 10.2 测试：打开弹窗显示三栏布局，关闭不 emit
- [ ] 10.3 测试：勾选组织节点触发用户查询，合并 OR 去重
- [ ] 10.4 测试：全局搜索忽略左侧筛选
- [ ] 10.5 测试：勾选/取消勾选同步右栏已选集
- [ ] 10.6 测试：× 删除同步取消中栏勾选
- [ ] 10.7 测试：确定 emit update:modelValue（ID 数组）+ change（对象数组）
- [ ] 10.8 测试：触发器显示已选用户昵称（"X、Y 等3人"格式）

## 11. 验证与联调

- [ ] 11.1 后端启动，验证 `GET /users?orgIds=1,2&roleIds=3` 返回合并去重结果
- [ ] 11.2 验证 `GET /users/batch?ids=1,2,3` 返回正确用户列表
- [ ] 11.3 前端启动，在 BPMN 设计器打开用户任务节点属性面板
- [ ] 11.4 点击审批人选择器，验证三栏布局、组织树/角色列表筛选、全局搜索
- [ ] 11.5 验证已选区 × 删除、清空、同步勾选
- [ ] 11.6 验证确定后 designerStore 正确保存 userIds，重新打开节点配置能回显
