# bizdata-handler-extension Specification

## Purpose
TBD - created by archiving change bizdata-extension-examples. Update Purpose after archive.
## Requirements
### Requirement: Handler 覆盖声明

BizDataHandler 接口 SHALL 提供覆盖声明方法（overridesCreate、overridesUpdate、overridesDelete、overridesQuery）及对应的强类型方法（create、update、delete、query），覆盖方法签名 SHALL 不含 formKey 参数（handler 绑定即专属）。

当 handler 对某操作的覆盖声明返回 true 时，系统 SHALL 将对应 CRUD 操作完整交接给该 handler 的强类型方法，并返回其返回值，不再执行通用实现。

handler 未声明覆盖的操作 SHALL 继续走通用实现，行为与现状一致。

#### Scenario: 覆盖查询交接

- **WHEN** formKey=emp_profile 的 handler 声明 overridesQuery() 返回 true
- **AND** 客户端调用 GET /api/v1/biz-data/emp_profile
- **THEN** 系统调用该 handler 的 query 方法
- **AND** 返回该方法的返回值（分页结构）

#### Scenario: 未声明覆盖走通用实现

- **WHEN** handler 对全部四个操作的覆盖声明均为 false
- **AND** 客户端调用任意 CRUD 端点
- **THEN** 系统执行通用实现
- **AND** 行为与覆盖机制引入前一致

### Requirement: 覆盖声明冲突检测

系统 SHALL 在应用启动阶段收集所有 handler 的覆盖声明；同一 formKey 存在 2 个及以上有效覆盖声明（对同一操作）时，系统 SHALL 抛出 IllegalStateException 并阻止应用启动。

#### Scenario: 重复覆盖声明导致启动失败

- **WHEN** 两个 handler 均声明 formKey 相同且 overridesQuery() 返回 true
- **THEN** 应用启动时抛出 IllegalStateException
- **AND** 应用不进入就绪状态

#### Scenario: 单一覆盖声明正常启动

- **WHEN** 每个 formKey 至多一个 handler 声明覆盖同一操作
- **THEN** 应用正常启动
- **AND** 覆盖映射在启动后生效

### Requirement: 覆盖接管时装饰钩子不自动执行

当 handler 覆盖某操作时，系统 SHALL 不再为该操作自动执行装饰钩子链（beforeCreate/afterCreate/beforeUpdate/beforeDelete）；覆盖实现全权负责所需校验与副作用。

#### Scenario: 覆盖更新时装饰钩子不执行

- **WHEN** handler 覆盖 update 操作（overridesUpdate() 返回 true）
- **AND** 客户端调用 PUT /api/v1/biz-data/{formKey}/{id}
- **THEN** 系统仅调用该 handler 的 update 方法
- **AND** beforeUpdate 装饰钩子不再被自动调用

### Requirement: BizDataSupport 复用面

系统 SHALL 提供独立的 BizDataSupport 组件，暴露复用能力：表上下文加载（loadContext）、单行查询（findById）、必填校验（validateRequired）、选项值解析（resolvePickerValues），以及通用实现委托点（createGeneric、updateGeneric、deleteGeneric、queryGeneric）。

覆盖 handler 与业务服务 SHALL 能注入 BizDataSupport 以复用能力或部分委托通用实现，且依赖方向不形成循环。

#### Scenario: 覆盖创建委托通用插入

- **WHEN** handler 覆盖 create 且其实现调用 createGeneric 委托通用插入
- **AND** 客户端调用 POST /api/v1/biz-data/{formKey}
- **THEN** 系统通过通用插入写入 wf_biz_<formKey>
- **AND** 返回新记录（含 id、version=1）

#### Scenario: 复用必填校验

- **WHEN** 覆盖实现调用 validateRequired 校验必填字段
- **AND** 请求体缺失必填字段
- **THEN** 校验失败并返回 400 错误

### Requirement: 门面统一入口

BizDataService SHALL 保持现有对外 API（端点、请求/响应结构）不变，四个 CRUD 入口 SHALL 按统一顺序路由：覆盖检测 → 守卫检查（update/delete）→ 装饰钩子链 → 通用委托。

#### Scenario: 统一端点兼容

- **WHEN** 客户端调用既有的 POST/GET/PUT/DELETE /api/v1/biz-data/{formKey}[/{id}] 端点
- **THEN** 请求与响应结构与覆盖机制引入前保持一致
- **AND** 无覆盖表单的响应内容与现状一致

