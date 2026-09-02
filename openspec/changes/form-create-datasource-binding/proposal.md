## Why

现有 form-create 选项只能手工维护或单独配置远程请求，无法直接复用系统已经定义的 FORM、SYSTEM、API、WORKFLOW 数据源。用户需要重复配置接口、过滤和字段转换，且设计器中的数据源绑定能力与选择器选项能力割裂。增加前端数据源绑定可降低配置成本，并保持 form-create 源码不变。

## What Changes

- 在项目自有选项规则工厂中增加“数据源”选项类型。
- 增加可复用的数据源配置界面，支持数据源标识、过滤条件和 label/value 映射。
- 将数据源结果转换为普通、树形和级联组件可消费的选项结构。
- 将绑定接入选择器、级联选择器、穿梭框及共用选项规则的相关组件。
- 保留现有静态、文本、JSON、远程数据配置和未绑定时的行为。

## Capabilities

### New Capabilities

- `form-create-option-datasource`: 为 form-create 选项类组件提供可配置的数据源绑定、字段映射和运行时取数。

### Modified Capabilities

- 无。现有 OpenSpec capability 的既有要求不变，本变更通过新增能力提供兼容扩展。

## Impact

- 前端：`frontend/src/vendor/utils`、`frontend/src/vendor/components`、组件规则配置和 vendor 注册入口；可能抽取 DataPicker/LookupPicker 的共享配置逻辑。
- API：复用现有数据源查询接口，不新增后端端点。
- Schema：新增可序列化的 datasource 配置节点；已有 schema 无需改写。
- 测试：增加配置持久化、字段映射、普通/树形选项和旧配置回归覆盖。
