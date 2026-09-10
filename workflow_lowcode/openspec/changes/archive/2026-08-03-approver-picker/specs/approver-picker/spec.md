## ADDED Requirements

### Requirement: 三栏穿梭式选人弹窗

系统 SHALL 提供一个可复用的 `ApproverPicker` Vue 组件，点击触发器弹出 900px 宽的三栏穿梭式选人弹窗：左栏 Tab 切换「组织树」「角色列表」，中栏显示待选用户表格，右栏显示已选用户列表，底部为取消/确定按钮。

#### Scenario: 打开弹窗显示三栏布局
- **WHEN** 用户点击 ApproverPicker 触发器输入框
- **THEN** 弹出弹窗，左栏显示组织树/角色列表 Tab，中栏显示空态提示「请在左侧选择组织或角色，或使用顶部搜索」，右栏显示已选用户（根据 modelValue 初始化）

#### Scenario: 关闭弹窗不保留临时选择
- **WHEN** 用户点击取消按钮或关闭图标关闭弹窗
- **THEN** 弹窗关闭，不 emit 任何更新，已选集恢复为打开时的 modelValue 状态

---

### Requirement: 左栏组织树多选筛选

系统 SHALL 在左栏「组织树」Tab 中展示组织树（数据来自 `getOrgTree()`），每个节点带 checkbox 支持多选，并提供组织名搜索框对树节点进行前端过滤。

#### Scenario: 加载组织树
- **WHEN** 弹窗打开，切换到「组织树」Tab
- **THEN** 调用 `getOrgTree()` 加载组织树并渲染为带 checkbox 的 el-tree

#### Scenario: 勾选组织节点触发用户查询
- **WHEN** 用户勾选一个或多个组织节点
- **THEN** 中栏待选区根据勾选的 orgIds 合并查询用户（OR 语义），结果去重并分页

#### Scenario: 组织名搜索过滤树
- **WHEN** 用户在组织搜索框输入关键字
- **THEN** 树节点按名称前端过滤显示，匹配的节点及其父节点展开可见

---

### Requirement: 左栏角色列表多选筛选

系统 SHALL 在左栏「角色列表」Tab 中展示启用角色列表（数据来自 `getRoleList({size:999, status:1})`），每个角色带 checkbox 支持多选，并提供角色名搜索框过滤。

#### Scenario: 加载角色列表
- **WHEN** 弹窗打开，切换到「角色列表」Tab
- **THEN** 调用 `getRoleList({size:999, status:1})` 加载角色并渲染为带 checkbox 的列表

#### Scenario: 勾选角色触发用户查询
- **WHEN** 用户勾选一个或多个角色
- **THEN** 中栏待选区根据勾选的 roleIds 合并查询用户（OR 语义），结果去重并分页

#### Scenario: 组织和角色合并查询
- **WHEN** 用户同时在组织树勾选了组织 A、在角色列表勾选了角色 R
- **THEN** 中栏待选区显示「组织 A 下用户」∪「角色 R 下用户」的去重合并结果

---

### Requirement: 顶部全局搜索

系统 SHALL 在弹窗顶部提供姓名/电话搜索框，搜索时忽略左侧组织/角色筛选，全局查询用户。搜索通过回车键或点击搜索按钮触发。

#### Scenario: 全局搜索用户
- **WHEN** 用户在顶部搜索框输入关键字并按回车或点击搜索按钮
- **THEN** 中栏待选区执行全局用户搜索（按姓名/电话匹配），忽略左侧勾选的筛选条件

#### Scenario: 搜索时左侧筛选不生效
- **WHEN** 顶部搜索框有关键字且左侧有勾选的组织/角色
- **THEN** 搜索结果为全局匹配用户，不限于左侧勾选范围

---

### Requirement: 中栏待选用户表格

系统 SHALL 在中栏以 `el-table` + checkbox 列展示待选用户，包含昵称、部门列，支持分页（size=20），已选用户行默认勾选。

#### Scenario: 待选区空态
- **WHEN** 左侧无勾选且顶部无搜索关键字
- **THEN** 中栏显示 `el-empty`「请在左侧选择组织或角色，或使用顶部搜索」

#### Scenario: 已选用户行同步勾选
- **WHEN** 待选区加载用户数据，其中部分用户已在已选集中
- **THEN** 这些已选用户行默认勾选

#### Scenario: 取消勾选移出已选集
- **WHEN** 用户取消中栏某行的勾选
- **THEN** 该用户从右栏已选集移除

#### Scenario: 勾选加入已选集
- **WHEN** 用户勾选中栏某行
- **THEN** 该用户加入右栏已选集（按 ID 去重）

---

### Requirement: 右栏已选用户管理

系统 SHALL 在右栏显示已选用户列表（昵称+部门+×删除），标题显示已选人数，底部提供「清空」按钮。× 删除时同步取消中栏对应行勾选。

#### Scenario: 显示已选用户
- **WHEN** 已选集非空
- **THEN** 右栏列出每个已选用户的昵称、部门，每行带 × 删除图标，标题显示「已选 N 人」

#### Scenario: × 删除同步取消勾选
- **WHEN** 用户点击右栏某用户的 ×
- **THEN** 该用户从已选集移除，且中栏待选区对应行取消勾选

#### Scenario: 清空已选
- **WHEN** 用户点击「清空」按钮
- **THEN** 已选集清空，中栏所有勾选取消

#### Scenario: 已选区空态
- **WHEN** 已选集为空
- **THEN** 右栏显示 `el-empty`「暂未选择」

---

### Requirement: 确认选择并 emit

系统 SHALL 在用户点击「确定」时，emit `update:modelValue`（用户 ID 数组）和 `change`（完整用户对象数组），然后关闭弹窗。

#### Scenario: 确定后 emit ID 数组和对象数组
- **WHEN** 用户点击「确定」按钮
- **THEN** emit `update:modelValue` 为已选用户 ID 数组，emit `change` 为 `[{id, nickname, username, orgName}]` 数组，弹窗关闭

---

### Requirement: 触发器显示已选用户

系统 SHALL 在弹窗关闭后，触发器输入框显示已选用户昵称，多个用顿号分隔，超过 2 人显示「X、Y 等N人」。

#### Scenario: 显示已选用户昵称
- **WHEN** modelValue 为 `[1, 2, 3]` 且对应用户为张三、李四、王五
- **THEN** 触发器输入框显示「张三、李四 等3人」

#### Scenario: 无已选用户显示占位
- **WHEN** modelValue 为空数组
- **THEN** 触发器输入框显示 placeholder「请选择审批人」

---

### Requirement: 组件 Props 与 Emits 契约

`ApproverPicker` 组件 SHALL 遵循以下接口契约：

**Props**:
- `modelValue: number[]`（必填，用户 ID 数组）
- `disabled?: boolean`（默认 false）
- `multiple?: boolean`（默认 true）
- `placeholder?: string`（默认「请选择审批人」）
- `maxSelected?: number`（可选，预留）

**Emits**:
- `update:modelValue: [number[]]`
- `change: [SelectedUser[]]`（SelectedUser = `{id, nickname, username, orgName}`）

#### Scenario: v-model 双向绑定
- **WHEN** 父组件通过 `v-model="userIds"` 绑定
- **THEN** 确定选择后组件 emit `update:modelValue`，父组件 userIds 更新为选中 ID 数组

#### Scenario: disabled 禁用
- **WHEN** `disabled` prop 为 true
- **THEN** 触发器输入框禁用，点击不弹出弹窗
