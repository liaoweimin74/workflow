# query-view-definition Specification

## Purpose
视图定义的管理能力：CRUD、发布（不建表 + 绑定/字段校验）、ViewCompiler 编译为 form-create rule、双层事件机制（声明式动作链 + ScriptSandbox 沙箱脚本）。视图绑定已发布 BUSINESS 表单（`wf_biz_<formKey>` 物理表）作为数据源，发布动作不触发任何 DDL。

## Requirements

### Requirement: 视图定义创建

系统 SHALL 提供创建视图定义的接口 `POST /api/v1/pages`，请求包含：name（名称）、key（视图标识，租户内唯一）、type（VIEW）、form_key（绑定的业务表单 key）。
创建时，系统 SHALL 设置 version=1、status=DRAFT、schema="{}"。
系统 SHALL 校验 key 在租户内唯一，重复 SHALL 返回 400。

#### Scenario: 创建视图定义
- **WHEN** 用户调用 POST /api/v1/pages 创建 type=VIEW 的视图定义，name="请假查询"、key="leave-query"、form_key="leave"
- **THEN** 系统创建 version=1、status=DRAFT 的视图定义
- **AND** 返回创建成功的视图定义（含 id）

#### Scenario: 重复 key 创建失败
- **WHEN** 用户调用 POST /api/v1/pages 创建视图定义
- **AND** key 与同租户内已有视图定义重复
- **THEN** 系统返回 400 错误
- **AND** 不创建记录

---

### Requirement: 视图定义更新与删除

系统 SHALL 提供更新接口 `PUT /api/v1/pages/{id}`（原地更新 name、key、schema）与删除接口 `DELETE /api/v1/pages/{id}`。
系统 SHALL 软删除（status=ARCHIVED），已发布（status=PUBLISHED）的视图定义 SHALL 拒绝删除并返回 400。

#### Scenario: 更新视图定义
- **WHEN** 用户调用 PUT /api/v1/pages/{id} 更新 schema（调整 searchFields/columns/events）
- **THEN** 系统原地更新 schema
- **AND** 状态保持 DRAFT

#### Scenario: 删除已发布视图定义失败
- **WHEN** 用户调用 DELETE /api/v1/pages/{id}
- **AND** 该视图定义为 PUBLISHED 状态
- **THEN** 系统返回 400 错误
- **AND** 不改变记录状态

---

### Requirement: 视图定义发布（不建表）

系统 SHALL 提供发布接口 `POST /api/v1/pages/{id}/publish`。
发布时，系统 SHALL 使用悲观锁串行化发布；同 key 的旧 PUBLISHED 记录 SHALL 降为 ARCHIVED；schema 与上次发布内容相同 SHALL 拒绝发布（400）。
发布过程 SHALL NOT 调用 DynamicTableManager，SHALL NOT 执行任何 DDL。
系统 SHALL 对发布后的记录设置 status=PUBLISHED、published_version=version。

#### Scenario: 发布视图定义（不执行 DDL）
- **WHEN** 用户调用 POST /api/v1/pages/{id}/publish
- **AND** 视图定义为 DRAFT 状态且 schema 与上次发布不同
- **THEN** 系统将该记录状态改为 PUBLISHED
- **AND** 系统不执行任何 CREATE TABLE / ALTER TABLE 语句
- **AND** 同 key 旧 PUBLISHED 记录降为 ARCHIVED

#### Scenario: 内容未变化拒绝发布
- **WHEN** 用户调用 POST /api/v1/pages/{id}/publish
- **AND** schema 与上次发布的版本内容相同
- **THEN** 系统返回 400 错误
- **AND** 提示"页面内容未变化，无需发布"

---

### Requirement: 视图发布绑定校验

发布 type=VIEW 的视图定义时，系统 SHALL 校验：
- 绑定的 form_key 对应的业务表单存在且 status=PUBLISHED，否则返回 400
- searchFields/columns/detail 引用列的 key 均存在于绑定表单的 column_config，否则返回 400
- 搜索字段（searchFields）不得引用 column_config 中标记为隐藏的列，不得引用 column_type 为 JSON/TEXT 的列，否则返回 400
- detail 引用的列存在于 column_config（可含隐藏列，供详情展示）

#### Scenario: 绑定表单未发布
- **WHEN** 用户发布 type=VIEW 的视图定义
- **AND** 绑定的 form_key 对应业务表单不存在或未发布
- **THEN** 系统返回 400 错误
- **AND** 提示绑定的业务表单不存在或未发布

#### Scenario: 引用不存在的列
- **WHEN** 用户发布视图定义
- **AND** searchFields 引用了 binding form column_config 中不存在的列 key
- **THEN** 系统返回 400 错误
- **AND** 不发布该视图

#### Scenario: JSON/TEXT 列作为搜索条件
- **WHEN** 用户发布视图定义
- **AND** searchFields 引用了 column_type 为 JSON 或 TEXT 的列
- **THEN** 系统返回 400 错误
- **AND** 提示该列不支持作为搜索条件

---

### Requirement: 视图编译为 form-create rule

发布 type=VIEW 的视图定义时，系统 SHALL 通过 ViewCompiler 将视图配置（searchFields/columns/actions/detail/events）编译为标准 form-create rule 结构 `{rule, option}`。
编译产物 SHALL 随发布持久化（运行时直接加载）。
编译规则 SHALL 包括：searchFields → 查询条件组件 rule；columns → el-table 列配置；actions → 操作按钮 rule；detail → 详情弹窗 rule；events → 目标组件 rule 的 on 处理器绑定。

#### Scenario: 视图编译产物持久化
- **WHEN** 视图定义发布成功（含有效的 searchFields/columns/actions/events）
- **THEN** 系统保存编译后的 `{rule, option}` 结构
- **AND** 编译后的 rule 可被 FormRenderer 解析渲染
- **AND** 编译产物中的组件类型均为已注册的 form-create 组件

#### Scenario: 编译失败拒绝发布
- **WHEN** 视图配置包含无法映射到 form-create 组件的配置（如未知 matchType）
- **THEN** 系统返回 400 错误
- **AND** 不发布该视图

---

### Requirement: 视图声明式事件

视图 schema 的 events 数组 SHALL 支持触发器：rowClick、rowDoubleClick、selectionChange、actionClick、beforeQuery、afterQuery、detailOpen、detailClose。
每个事件 SHALL 包含 actions 动作链，动作类型 SHALL 限白名单：openDetail、openLink、openCreate、edit、delete、refresh、export、message。
声明式动作参数 SHALL 支持模板变量 `$row.xxx`（当前行字段）与 `$param.xxx`（当前查询参数）。
编译时，系统 SHALL 将事件 actions 绑定到 target 组件 rule 的 on 处理器。

#### Scenario: 行点击打开详情
- **WHEN** 视图定义 events 包含 {trigger: "rowClick", target: "mainTable", actions: [{type: "openDetail"}]}
- **THEN** 编译后的 mainTable rule 的 on 处理器包含行点击动作
- **AND** 运行时点击表格行打开详情弹窗

#### Scenario: 模板变量替换
- **WHEN** 事件动作 openLink 的 params 包含 {"id": "$row.id"}
- **THEN** 运行时触发该事件
- **AND** 跳转链接的 id 参数替换为当前行 id 的实际值

---

### Requirement: 视图脚本事件（沙箱执行）

视图事件动作 SHALL 支持 type="script"，source 为 JS 代码片段。
脚本 SHALL 在 ScriptSandbox 中执行，不得访问全局作用域之外的资源。
脚本上下文 SHALL 注入白名单对象：row、params、selectedRows、ds（数据源 API：query/detail/create/update/remove）、api（form-create api：setValue/getValue/refresh）、actions（声明式动作执行器）、$（受限工具）。
脚本执行异常 SHALL 被捕获并记录，不得中断页面其他功能。
视图脚本事件 SHALL 默认关闭（可通过配置按需开启）。

#### Scenario: 脚本事件执行
- **WHEN** 视图事件 action 为 {type: "script", source: "api.setValue('detailName', row.name)"}
- **AND** 点击表格行触发该事件
- **THEN** 脚本在沙箱中执行
- **AND** 页面中 detailName 组件的值被设置为当前行 name

#### Scenario: 脚本异常不中断页面
- **WHEN** 视图脚本执行抛出异常
- **THEN** 系统捕获异常并记录日志
- **AND** 页面其余功能正常运行