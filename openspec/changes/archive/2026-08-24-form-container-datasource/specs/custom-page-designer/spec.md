# custom-page-designer Specification

## ADDED Requirements

### Requirement: 页面注册 FORM 容器组件

页面设计器组件库 SHALL 注册 FORM 容器组件（`formContainer`），页面可将容器作为"表单区"组件使用，容器绑定数据源后由绑定引擎负责读回显与写保存。

页面场景下容器的记录定位 SHALL 由页面上下文提供（路由参数/动作总线传递），读刷新由 `record-change` 触发器驱动。

#### Scenario: 页面拖入 FORM 容器
- **WHEN** 用户在页面设计器中拖入 FORM 容器组件
- **AND** 配置 dataSourceId 与记录定位
- **THEN** 页面 schema 包含 formContainer 节点
- **AND** 页面渲染时容器按记录上下文加载数据回显

### Requirement: 页面动作总线触发器泛化

页面动作总线（`schema.actions`）触发器 SHALL 在既有 `node-click`、`row-click` 基础上支持 `field-change`（表单组件值变化）、`record-change`（记录上下文变化）。

动作步骤 SHALL 支持 `reload-record`（重新加载当前记录回显容器）与 `save-record`（写回数据源），与既有 set-filter/refresh 动作共存。

#### Scenario: 字段变化触发表单区刷新
- **WHEN** 页面含下拉组件与 FORM 容器组件
- **AND** actions 配置 field-change 触发器 → set-filter + refresh 目标容器数据源
- **THEN** 下拉值变化后容器按新过滤条件重新加载记录
- **AND** 容器内组件值刷新

#### Scenario: 记录变化触发容器回显
- **WHEN** 页面树节点点击触发 record-change
- **AND** 动作链包含 reload-record（目标=FORM 容器）
- **THEN** 容器按新记录 ID 重新加载数据源记录
- **AND** 容器内组件值更新为记录字段值
