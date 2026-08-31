# deferred-options-loading Specification

## Purpose

页面附属选项/定义数据延迟加载策略：将非首屏必需的选项数据（组织树、角色列表）与定义数据（VIEW 数据源定义）从"页面挂载即取"改为"首次使用时才取"，降低首屏请求数并保持功能完整。

## Requirements

### Requirement: 搜索树选项支持按需加载

查询字段类型 `tree-select` SHALL 支持可选的 `onExpand` 回调（SearchField 扩展字段，缺省为空）：当用户首次展开树形下拉且当前树数据为空时，系统 SHALL 调用该回调加载数据；展开时树数据非空则 SHALL 不重复调用；未配置 `onExpand` 的字段 SHALL 保持既有行为（直接使用 `treeProps.data`），向后兼容。

#### Scenario: 首次展开触发加载

- **WHEN** 查询区存在配置了 `onExpand` 的组织机构 tree-select 字段
- **AND** 页面挂载时树数据为空
- **AND** 用户首次展开该下拉
- **THEN** 系统 SHALL 调用 `onExpand` 加载树数据
- **AND** 加载完成后下拉展示树选项

#### Scenario: 数据已加载不重复触发

- **WHEN** 树数据已通过 `onExpand` 加载完成
- **AND** 用户再次展开该下拉
- **THEN** 系统 SHALL 不重复调用 `onExpand`

#### Scenario: 未配置 onExpand 保持原行为

- **WHEN** tree-select 字段未配置 `onExpand`
- **THEN** 系统 SHALL 直接使用 `treeProps.data` 渲染
- **AND** 不执行任何加载回调

### Requirement: 用户管理页组织树延迟加载

用户管理页面 SHALL 将组织树数据从挂载预取改为按需加载：首屏 SHALL 不发出 `/orgs/tree` 请求；搜索区组织树下拉首次展开或数据表单打开需要组织选项时 SHALL 才加载，且同一页面生命周期内 SHALL 只加载一次（带已加载/加载中标志，避免并发重复请求）。

#### Scenario: 首屏不请求组织树

- **WHEN** 打开用户管理页面
- **THEN** 系统 SHALL 不发起 /orgs/tree 请求

#### Scenario: 首次展开搜索树时加载一次

- **WHEN** 用户首次展开搜索区组织树下拉
- **THEN** 系统 SHALL 发起一次 /orgs/tree 请求
- **AND** 后续再次展开 SHALL 复用已加载数据

#### Scenario: 表单打开时补拉组织选项

- **WHEN** 用户打开新增/编辑用户表单且组织树尚未加载
- **THEN** 系统 SHALL 在表单需要组织选项前加载 /orgs/tree

### Requirement: 用户管理页角色列表缓存复用

用户管理页面 SHALL 保留首屏加载角色列表（`/roles?page=1&size=999`，角色列名称映射必需），角色列表请求 SHALL 声明使用 HTTP 短 TTL 缓存与并发去重，使同一会话内跨页面（角色管理、审批人选择器等）复用已加载数据。

#### Scenario: 角色列表请求可被缓存复用

- **WHEN** 用户管理页加载角色列表后，同会话内其他页面再次请求相同参数的角色列表
- **THEN** 后续请求 SHALL 命中缓存（TTL 内不重发网络请求）

### Requirement: VIEW 页数据源定义按需加载

VIEW 类型页面渲染时 SHALL 仅挂载加载数据源元数据（metadata，用于列排序与只读标记）；数据源定义（getDataSource，用于反查绑定表单 formKey）SHALL 延迟到首次打开详情/新增/编辑表单时加载，加载完成前相关入口 SHALL 保持可用并在打开时先确保定义就绪再渲染表单形态。

#### Scenario: 首屏不请求数据源定义

- **WHEN** 打开 VIEW 类型页面（如 emp_view_e2e）
- **THEN** 系统 SHALL 不发起 /data-sources/{id} 定义请求
- **AND** 首屏仅发起 definition、metadata 与数据列表请求

#### Scenario: 打开表单前确保定义就绪

- **WHEN** 用户在 VIEW 页点击新增/编辑/查看
- **THEN** 系统 SHALL 先加载数据源定义（若未加载）
- **AND** 依据定义（formKey）渲染对应表单形态后再打开