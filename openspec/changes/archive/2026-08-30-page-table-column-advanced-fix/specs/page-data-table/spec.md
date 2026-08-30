# page-data-table Delta Specification

## ADDED Requirements

### Requirement: PageDataTable 列配置 SHALL 在加载与保存时保留列高级配置字段

PAGE 页面数据表格的列配置弹窗（DsBindingConfigDialog 表格模式，其"显示列"页签复用 QueryColumnsConfig）SHALL 在加载（回填）与保存（确认）列配置时保留列高级配置字段：`contentType`、`contentValue`、`className`、`styleExpr`、`onCellClick`、`custom`、`hidden`。保存到页面 schema 的列对象 SHALL 包含这些字段，使 PageDataTable 渲染时能通过公共列渲染模块（buildCellRender）正确渲染模板/表达式/样式，并通过列级 `onCellClick` 分发点击事件，与 VIEW 链路行为一致。

#### Scenario: 回填已有列时保留高级配置

- **WHEN** 打开数据表格配置弹窗，绑定列配置含 `contentType: 'template'`、`contentValue: '${name}(${status})'`、`className`、`styleExpr`、`onCellClick`、`custom`、`hidden` 字段
- **THEN** 弹窗"显示列"页签中的列配置 SHALL 保留这些高级字段，可继续编辑

#### Scenario: 保存列配置时透传高级字段

- **WHEN** 用户在数据表格配置弹窗中为列配置了 `contentType/contentValue/className/styleExpr/onCellClick/custom/hidden` 后点击确定
- **THEN** 保存到页面 schema 的列对象 SHALL 包含全部高级字段

#### Scenario: 渲染时高级配置端到端生效

- **WHEN** 页面 schema 的列配置含 `contentType: 'template'`、`contentValue: '${name}'`，页面运行时渲染 PageDataTable
- **THEN** 单元格 SHALL 按模板插值渲染，而非显示原始值

#### Scenario: 隐藏列定义保留但不渲染

- **WHEN** 列配置 `hidden: true`（自定义列取消展示）
- **THEN** 保存后 schema 保留该列定义（含高级字段）
- **AND** PageDataTable 渲染时 SHALL 跳过该列（filter !hidden）
