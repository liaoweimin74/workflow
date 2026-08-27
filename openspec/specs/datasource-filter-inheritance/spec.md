# datasource-filter-inheritance Specification

## Purpose
TBD - created by archiving change simplify-component-datasource-config. Update Purpose after archive.
## Requirements
### Requirement: DataSourceBinding SHALL support filter configuration

DataSourceBinding 类型 SHALL 包含可选的 `filter` 字段，类型为 `DataSourceFilter`，用于定义数据源级的筛选条件。

#### Scenario: DataSourceBinding 包含 filter 字段
- **WHEN** 创建或更新 DataSourceBinding 时提供 filter 字段
- **THEN** filter 字段 SHALL 被持久化到页面 schema 的 dataSources 数组中

#### Scenario: DataSourceBinding 不包含 filter 字段
- **WHEN** 创建或更新 DataSourceBinding 时未提供 filter 字段
- **THEN** filter 字段 SHALL 为 undefined，不影响现有行为

---

### Requirement: DataSourceFilter SHALL contain logic and conditions

DataSourceFilter SHALL 包含 `logic`（'AND' | 'OR'）和 `conditions`（FilterCondition 数组）两个必填字段。

#### Scenario: DataSourceFilter 结构验证
- **WHEN** 提供 DataSourceFilter 对象
- **THEN** 对象 SHALL 包含 logic 字段（值为 'AND' 或 'OR'）和 conditions 字段（数组类型）

---

### Requirement: FilterCondition SHALL support fixed and field sources

FilterCondition 的 `source` 字段 SHALL 支持 'fixed'（固定值）和 'field'（表单字段引用）两种模式。

#### Scenario: 固定值筛选条件
- **WHEN** FilterCondition 的 source 为 'fixed'
- **THEN** SHALL 使用 value 字段的值作为筛选条件

#### Scenario: 表单字段引用筛选条件
- **WHEN** FilterCondition 的 source 为 'field'
- **THEN** SHALL 使用 field 字段指定的表单字段值作为筛选条件（运行期从 formData 解析）

---

### Requirement: Filter inheritance SHALL merge dsFilter and componentFilter

运行期查询数据源时，SHALL 合并 DataSourceBinding.filter 和组件级 filter，形成最终查询条件。

#### Scenario: 仅数据源级 filter
- **WHEN** DataSourceBinding 有 filter，组件无 filter
- **THEN** SHALL 使用 DataSourceBinding.filter 作为查询条件

#### Scenario: 仅组件级 filter
- **WHEN** DataSourceBinding 无 filter，组件有 filter
- **THEN** SHALL 使用组件 filter 作为查询条件

#### Scenario: 两层 filter 都存在
- **WHEN** DataSourceBinding 有 filter，组件也有 filter
- **THEN** SHALL 以 AND 方式合并两层 filter，形成最终查询条件

#### Scenario: 两层都无 filter
- **WHEN** DataSourceBinding 无 filter，组件也无 filter
- **THEN** SHALL 不添加额外筛选条件

---

### Requirement: Filter field references SHALL be resolved at runtime

filter 中的 `field` 引用（source='field'）SHALL 在运行期从页面 formData 中解析实际值。

#### Scenario: 运行期 field 引用解析
- **WHEN** 查询数据源时 filter 包含 source='field' 的条件
- **THEN** SHALL 从 formData[field] 获取实际值，替换 field 引用

#### Scenario: field 引用的字段不存在
- **WHEN** formData 中不存在 filter 指定的 field
- **THEN** SHALL 跳过该条件或使用空值（不抛出异常）

