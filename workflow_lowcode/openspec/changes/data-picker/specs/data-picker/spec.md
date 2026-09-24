# data-picker Delta Specification

## ADDED Requirements

### Requirement: 数据引用组件可视化配置

表单设计器 SHALL 提供"数据引用"（dataPicker）组件，用户 SHALL 能通过可视化配置弹窗完成数据源配置。

配置弹窗 SHALL 支持：选择目标业务表单（仅列出已发布 BUSINESS 类型表单）、选择显示字段（目标表单非隐藏列）、选择弹窗列表列（目标表单非隐藏列）、选择模式（单选/多选）。

配置弹窗 SHALL 支持配置返回字段映射（目标表字段 → 当前表单字段），选中记录后自动回填到当前表单对应字段。

配置弹窗 SHALL 支持配置级联依赖（当前表单字段 + 目标表单列），级联依赖可选。

配置结果 SHALL 以 rule props 形式存入表单 schema，包含 sourceFormKey、displayField、columns、mode、returnFields、dependOn 字段。

#### Scenario: 配置数据引用组件

- **WHEN** 用户在设计器中拖入"数据引用"组件并打开配置弹窗
- **AND** 选择目标表单 emp_profile、显示字段 name、列表列 [name, dept]、单选模式
- **THEN** 组件 rule props 写入 sourceFormKey=emp_profile、displayField=name、columns=[name,dept]、mode=single

#### Scenario: 配置返回字段映射

- **WHEN** 用户在配置弹窗中添加返回字段映射 dept → emp_dept
- **THEN** rule props 的 returnFields 包含 {"dept":"emp_dept"}

#### Scenario: 配置级联依赖

- **WHEN** 用户在配置弹窗中配置级联依赖：当前表单字段 dept_field → 目标表列 dept
- **THEN** rule props 的 dependOn 包含 {"field":"dept_field","sourceColumn":"dept"}

#### Scenario: 配置弹窗仅列出已发布业务表单

- **WHEN** 用户打开配置弹窗选择目标表单
- **THEN** 下拉仅包含已发布（PUBLISHED）的 BUSINESS 类型表单

---

### Requirement: 数据引用运行时选择与级联

数据引用组件运行时 SHALL 渲染为可点击输入框，点击 SHALL 打开选择弹窗。

选择弹窗 SHALL 展示目标表单的数据列表（列与分页），SHALL 支持按显示字段关键词搜索，SHALL 支持单选（点击行选中）与多选（勾选后确认）。

单选模式下点击行 SHALL 立即选中并关闭弹窗；多选模式下 SHALL 提供确认按钮。

选中后 SHALL 触发返回字段回填：按 returnFields 配置将目标记录字段写入当前表单对应字段。

组件 SHALL 支持级联：配置了 dependOn 时，依赖字段值变化 SHALL 清空当前选择与回填字段，并刷新选项列表（以依赖字段值作为 filter 查询目标表）。

组件 SHALL 支持清除：清空选择时 SHALL 同时清空回填字段。

#### Scenario: 单选选择记录

- **WHEN** 用户打开选择弹窗并点击一条记录
- **THEN** 组件值更新为该记录 id
- **AND** 输入框显示该记录显示字段文本
- **AND** 弹窗关闭

#### Scenario: 多选选择记录

- **WHEN** 用户以多选模式勾选多条记录并点击确定
- **THEN** 组件值更新为多个 id（逗号分隔）
- **AND** 输入框显示多条显示文本（逗号分隔）

#### Scenario: 选中后回填

- **WHEN** 用户选中记录且配置了 returnFields
- **THEN** 按映射将目标记录字段值写入当前表单对应字段

#### Scenario: 级联依赖刷新

- **WHEN** 用户修改依赖字段的值
- **AND** 组件配置了 dependOn
- **THEN** 当前选择值被清空
- **AND** 回填字段被清空
- **AND** 选项列表按新依赖值重新查询

#### Scenario: 清除选择

- **WHEN** 用户点击输入框清除按钮
- **THEN** 组件值清空
- **AND** returnFields 对应的回填字段清空

---

### Requirement: 数据引用发布校验

发布含 dataPicker 字段的业务表单时，系统 SHALL 校验：目标表单存在且已发布（同租户），引用列（displayField、columns、dependOn.sourceColumn）仍存在于目标表单 column_config。

校验失败 SHALL 返回 400 并提示具体缺失项。

#### Scenario: 目标表单未发布

- **WHEN** 发布 schema 含 dataPicker（sourceFormKey=emp_profile）的业务表单
- **AND** emp_profile 不存在或未发布
- **THEN** 系统返回 400，提示目标表单不存在或未发布

#### Scenario: 引用列已删除

- **WHEN** 发布 schema 含 dataPicker（displayField=deleted_col）的业务表单
- **AND** deleted_col 不在目标表单 column_config
- **THEN** 系统返回 400，提示引用列已不存在
