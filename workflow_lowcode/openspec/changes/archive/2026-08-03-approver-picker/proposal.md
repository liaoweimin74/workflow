## Why

当前 BPMN 设计器的用户任务属性面板中，审批人配置是纯文本输入框，用户需手动输入"用户ID，多个用逗号分隔"。无筛选、无多选、无反馈，体验差且易错。需开发可视化选人组件，支持按组织树和角色多选筛选、穿梭式多选用户，并配套后端合并查询与批量查接口。

## What Changes

**审批人选择交互**
- From: `UserTaskProperty.vue` 审批用户配置为 `<el-input>` 纯文本输入"用户ID，多个用逗号分隔"
- To: 替换为 `ApproverPicker` 组件，点击弹出三栏穿梭式选人弹窗（左 Tab 组织树/角色列表 + 中待选用户 + 右已选用户）
- Reason: 可视化选人、按组织/角色筛选、多选，替代手动输入 ID
- Impact: breaking（`approval.value: string` → `approval.userIds: number[]`，不兼容旧数据）

**后端用户查询能力**
- From: `UserQueryRequest` 支持单个 orgId 筛选，不支持 roleId
- To: 支持 `orgIds: number[]` + `roleIds: number[]` 数组，Specification 用 OR 合并查询
- Reason: 前端需多选组织/角色合并查用户，单值无法满足
- Impact: non-breaking（新增可选字段，旧调用不受影响）

**后端批量查用户**
- From: 无批量查用户接口，前端需 Promise.all 逐个查
- To: 新增 `GET /users/batch?ids=1,2,3` 批量查
- Reason: ApproverPicker 打开时根据已选 ID 数组批量拉详情
- Impact: non-breaking（新增接口）

## Capabilities

### New Capabilities

- `approver-picker`: 可复用的三栏穿梭式审批人选择前端组件，支持组织树多选、角色列表多选、合并查询用户、全局搜索、已选区双向同步
- `user-batch-query`: 后端用户批量查询与多维度合并筛选能力（orgIds/roleIds 数组 + batch 接口）

### Modified Capabilities

（无现有 spec 需修改——`openspec/specs/` 目前为空，本期全部为新增 capability）

## Impact

**前端**：
- 新建 `frontend/src/components/business/ApproverPicker.vue`
- 新建 `frontend/src/components/business/__tests__/ApproverPicker.test.ts`
- 修改 `frontend/src/types/user.ts`（UserQueryParams 加 orgIds/roleIds，加 SelectedUser 类型）
- 修改 `frontend/src/api/user.ts`（加 getUserBatch）
- 修改 `frontend/src/views/designer/properties/UserTaskProperty.vue`（替换审批用户输入框）
- 修改 `frontend/src/stores/designerStore.ts`（NodeConfigData.approval.value → userIds）
- 修改 `frontend/src/components/business/index.ts`（导出 ApproverPicker）

**后端**：
- 修改 `backend/.../domain/dto/UserQueryRequest.java`（加 orgIds/roleIds）
- 修改 `backend/.../service/impl/UserServiceImpl.java`（Specification OR 逻辑 + findByIds）
- 修改 `backend/.../service/UserService.java`（加 findByIds 接口方法）
- 修改 `backend/.../controller/UserController.java`（加 GET /users/batch 端点）

**依赖**：无新增第三方依赖，复用 Element Plus el-tree/el-table/el-checkbox-group/el-dialog。
