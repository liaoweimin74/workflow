# form-designer Delta Specification

## ADDED Requirements

### Requirement: 数据引用组件

设计器组件面板 SHALL 提供"数据引用"（dataPicker）组件，用户可拖拽到画布。

选中 dataPicker 组件后，属性面板或双击 SHALL 打开数据源配置弹窗（见 data-picker 能力：目标表单/显示字段/列表列/单多选/返回字段映射/级联依赖）。

配置结果 SHALL 写入字段 rule props（sourceFormKey、displayField、columns、mode、returnFields、dependOn），随 schema 保存。

发布含 dataPicker 字段的业务表单时，列映射确认对话框 SHALL 自动为 dataPicker 字段生成两列草案（`<key>` 与 `<key>_text` 隐藏列）。

#### Scenario: 拖入数据引用组件

- **WHEN** 用户从组件面板拖入"数据引用"组件到画布
- **THEN** 画布创建 dataPicker 字段
- **AND** 属性面板显示数据源配置入口

#### Scenario: 打开数据源配置弹窗

- **WHEN** 用户双击 dataPicker 字段或点击其配置入口
- **THEN** 打开数据源配置弹窗
- **AND** 弹窗列出已发布业务表单供选择

#### Scenario: 发布列映射自动两列

- **WHEN** 用户发布含 dataPicker 字段的业务表单并打开列映射确认
- **THEN** 列映射草案包含 `<key>` 与 `<key>_text` 两行
- **AND** `<key>_text` 行标记为隐藏列（不可取消）
