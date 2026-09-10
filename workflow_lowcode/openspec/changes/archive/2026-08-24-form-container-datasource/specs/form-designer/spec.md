# form-designer Specification

## ADDED Requirements

### Requirement: FORM 容器组件注册

表单设计器组件面板 SHALL 注册 FORM 容器组件（`formContainer`），归类为布局/容器组件，支持拖拽到画布并接受子组件拖入。

FORM 容器组件属性面板 SHALL 提供数据源绑定配置（`dataSourceId` 下拉，选项来自已启用全局数据源）与记录定位配置（`recordLocator`，默认"当前表单记录"）。

FORM 容器组件 SHALL 复用 form-create 容器机制（`subForm: 'object'`），rule 序列化 SHALL 使用 `children ↔ props.rule` 互转（loadRule/parseRule），与现有 group/subForm 容器一致。

#### Scenario: 从组件面板拖入 FORM 容器
- **WHEN** 用户在表单设计器组件面板找到"FORM 容器"组件并拖入画布
- **THEN** 画布创建容器节点（type=formContainer）
- **AND** 容器 rule 的 props 包含 dataSourceId（空）与 recordLocator（默认当前表单记录）

#### Scenario: 配置容器数据源
- **WHEN** 用户选中画布中的 FORM 容器
- **AND** 在属性面板选择已启用数据源
- **THEN** 容器 rule 的 props.dataSourceId 写入所选数据源 ID
- **AND** 设计器调用 getMetadata 校验容器内子字段存在性

#### Scenario: 保存含容器的表单
- **WHEN** 用户保存含 FORM 容器的表单设计
- **THEN** schema 中容器节点以 formContainer 类型序列化
- **AND** 容器内子组件存储在 props.rule
- **AND** 重新加载表单时容器及子组件完整还原
