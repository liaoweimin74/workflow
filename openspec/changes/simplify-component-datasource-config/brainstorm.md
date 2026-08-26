## Design Summary

简化表单设计器和页面设计器中查找带回（LookupPicker）和数据引用（DataPicker）组件的数据源配置，去除组件级独立数据源配置，统一使用页面/表单级数据源绑定。同时将 filter 条件支持两层继承机制（数据源级 + 组件级覆盖）。

## Alternatives Considered

### 方案 A：完全去除组件级配置（仅保留 dataSourceId）
- **做法**：组件只存储 `dataSourceId`，所有数据源相关配置（包括 filter）都在 DataSourceConfigPanel 中管理
- **优点**：配置完全集中，维护简单
- **缺点**：不同组件需要不同筛选条件时无法满足（如表格 A 显示"待处理"，表格 B 显示"已完成"）
- **为何未采用**：灵活性不足，无法满足同一数据源多组件不同筛选的需求

### 方案 B：组件级 filter 覆盖数据源级 filter（推荐）
- **做法**：DataSourceBinding 增加 filter 字段（数据源级），组件也保留 filter 字段（组件级）。运行期合并：组件 filter 为空时继承数据源级，有值时两层 AND 合并
- **优点**：兼顾集中管理与灵活覆盖，大多数场景只配一次，特殊场景可组件级覆盖
- **缺点**：合并逻辑需要实现，filter 优先级需要文档说明
- **为何未采用**：无，此为最终方案

### 方案 C：filter 只放组件级（当前模式）
- **做法**：保持现状，filter 配置在每个组件内部
- **优点**：无需改动现有架构
- **缺点**：配置分散，同一数据源多个组件引用时重复配置，容易不一致
- **为何未采用**：不符合简化配置的目标

## Agreed Approach

采用**方案 B：组件级 filter 覆盖数据源级 filter**。

核心设计：
1. **DataSourceBinding 扩展 filter**：`{ logic, conditions: [{ column, op, source, value, field }] }`
2. **组件简化**：去除 `sourceType`、`sourceFormKey`、`action`、`method`、`headers` 等独立配置，保留 `dataSourceId` + 组件级 `filter`
3. **Filter 合并机制**：`mergeFilters(dsFilter, componentFilter)` — 两层 AND 连接
4. **运行期 field 引用解析**：filter 中的 `field` 引用从 `formData[field]` 取值
5. **预览支持**：设计器预览需先保存页面，查询逻辑与运行期一致

## Key Decisions

1. **Filter 两层继承**：数据源级 filter 为基础，组件级 filter 可覆盖（AND 合并）
2. **不需要旧格式兼容**：直接替换原有配置结构，不做向后兼容
3. **全局数据源已有 headers/params**：API 类型数据源的配置已在 DataSourceDefinition 中，组件无需重复配置
4. **预览需先保存**：设计器预览依赖已保存的 schema，确保 dataSources bindings 持久化

## Open Questions

1. LookupPicker 的 `returnFields`（字段映射）是否也需要调整？
2. DataPicker 的 `searchColumns`（搜索列）是否需要从数据源元数据动态获取？
