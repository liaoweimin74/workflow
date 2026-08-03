## ADDED Requirements

### Requirement: 表单定义 CRUD

系统 SHALL 提供表单定义的创建、查询、更新、删除接口。

表单定义 SHALL 包含以下属性：id（UUID）、tenant_id（租户）、name（表单名称）、key（表单标识，同租户唯一）、schema（form-create rule JSON）、version（版本号）、status（DRAFT/PUBLISHED/ARCHIVED）、published_version（当前发布版本号）、created_by、created_at、updated_at。

创建表单定义时，系统 SHALL 生成 UUID 作为 id，设置 version=1，status=DRAFT。

更新表单定义时，系统 SHALL 创建新版本（version 自增），保留旧版本记录。

删除表单定义时，系统 SHALL 执行软删除（标记 ARCHIVED），不物理删除。

#### Scenario: 创建表单定义
- **WHEN** 用户调用 POST /api/v1/form-definitions，提供 name 和 key
- **THEN** 系统创建表单定义记录
- **AND** id 为生成的 UUID
- **AND** version = 1，status = DRAFT
- **AND** 返回创建的表单定义

#### Scenario: 查询表单定义列表
- **WHEN** 用户调用 GET /api/v1/form-definitions，提供分页参数
- **THEN** 系统返回当前租户的表单定义列表（分页）
- **AND** 每条记录包含 id、name、key、version、status、created_at

#### Scenario: 获取表单定义详情
- **WHEN** 用户调用 GET /api/v1/form-definitions/{id}
- **THEN** 系统返回表单定义详情，包含完整 schema JSON

#### Scenario: 更新表单定义
- **WHEN** 用户调用 PUT /api/v1/form-definitions/{id}，提供新的 schema
- **THEN** 系统创建新版本记录（version 自增）
- **AND** 旧版本保留
- **AND** 返回新版本的表单定义

#### Scenario: 删除表单定义
- **WHEN** 用户调用 DELETE /api/v1/form-definitions/{id}
- **THEN** 系统将表单定义状态标记为 ARCHIVED
- **AND** 已归档的表单定义不出现在列表中

#### Scenario: key 唯一性校验
- **WHEN** 用户创建表单定义时使用已存在的 key
- **THEN** 系统返回 400 错误，提示"表单标识已存在"

### Requirement: 表单定义发布

系统 SHALL 支持发布表单定义，将 DRAFT 状态的表单变为 PUBLISHED。

发布时，系统 SHALL 将当前版本标记为 published_version。

已发布（PUBLISHED）版本的 schema 不可修改，修改已发布表单 SHALL 创建新的 DRAFT 版本。

#### Scenario: 发布表单定义
- **WHEN** 用户调用 POST /api/v1/form-definitions/{id}/publish
- **THEN** 系统将当前版本状态更新为 PUBLISHED
- **AND** published_version 更新为当前版本号
- **AND** 返回更新后的表单定义

#### Scenario: 修改已发布表单
- **WHEN** 用户对 PUBLISHED 状态的表单调用 PUT 更新
- **THEN** 系统创建新的 DRAFT 版本（version 自增）
- **AND** 原 PUBLISHED 版本保持不变

### Requirement: 表单定义版本管理

系统 SHALL 支持查询表单定义的版本历史。

系统 SHALL 支持获取特定版本的表单定义 schema。

系统 SHALL 在流程运行时根据 formDefId 加载 published_version 对应版本的 schema。

#### Scenario: 查询版本列表
- **WHEN** 用户调用 GET /api/v1/form-definitions/{id}/versions
- **THEN** 系统返回该表单定义的所有版本列表
- **AND** 每条记录包含 version、status、created_at、created_by
- **AND** 列表按版本号降序排列

#### Scenario: 获取特定版本
- **WHEN** 用户调用 GET /api/v1/form-definitions/{id}/versions/{version}
- **THEN** 系统返回该版本的完整表单定义，包含 schema JSON

#### Scenario: 获取已发布版本
- **WHEN** 流程运行时需要加载表单 schema
- **AND** 传入 formDefId
- **THEN** 系统返回 published_version 对应版本的 schema表单定义，包含该版本的 schema

#### Scenario: 修改已发布版本
- **WHEN** 用户尝试修改 PUBLISHED 状态的表单定义
- **THEN** 系统自动创建新 DRAFT 版本
- **AND** 已发布版本保持不变

### Requirement: 表单定义发布

系统 SHALL 支持将 DRAFT 状态的表单定义发布为 PUBLISHED。

发布时，系统 SHALL 将 published_version 更新为当前版本号。

同一表单定义同时只 SHALL 有一个 PUBLISHED 版本。新版本发布后，旧 PUBLISHED 版本 SHALL 变为 ARCHIVED。

#### Scenario: 发布表单定义
- **WHEN** 用户调用 POST /api/v1/form-definitions/{id}/publish
- **THEN** 系统将表单定义状态更新为 PUBLISHED
- **AND** published_version 更新为当前版本号
- **AND** 之前的 PUBLISHED 版本变为 ARCHIVED

#### Scenario: 运行时加载已发布版本
- **WHEN** 流程节点引用 formDefId 加载表单
- **THEN** 系统加载 published_version 对应的 schema
- **AND** 不加载 DRAFT 版本

### Requirement: 表单定义菜单与路由

系统 SHALL 在管理后台菜单中新增"表单管理"菜单项。

表单列表页 SHALL 通过懒加载路由访问，路径为 `/form`。

表单列表页 SHALL 显示表单定义列表，支持创建、编辑、删除、发布操作。

#### Scenario: 导航到表单列表页
- **WHEN** 用户点击"表单管理"菜单项
- **THEN** 系统懒加载 FormListPage.vue 组件
- **AND** 页面显示表单定义列表

#### Scenario: 从列表页进入设计器
- **WHEN** 用户在列表页点击某表单的"编辑"按钮
- **THEN** 系统跳转到 /form/designer?id={formDefId}
- **AND** 设计器加载该表单的最新版本 schema
