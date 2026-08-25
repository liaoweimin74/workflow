## ADDED Requirements

### Requirement: ViewDesigner SHALL 提供完整的视图配置能力

ViewDesigner SHALL 通过现有的 QueryColumnsConfig/ActionsConfig/EventsConfig 组件提供完整的视图配置能力。

#### Scenario: 配置查询条件和显示列
- **WHEN** 用户在 ViewDesigner 的"显示&查询"标签页中操作
- **THEN** ViewDesigner SHALL 支持配置查询条件（searchFields）和显示列（columns），包括新增的 formatter 和 fixed 属性

#### Scenario: 配置操作按钮
- **WHEN** 用户在 ViewDesigner 的"操作"标签页中操作
- **THEN** ViewDesigner SHALL 支持配置操作按钮（actions.buttons），包括新增的 visible 条件显示属性

#### Scenario: 配置事件动作链
- **WHEN** 用户在 ViewDesigner 的"事件"标签页中操作
- **THEN** ViewDesigner SHALL 支持配置事件动作链（events），包括新增的触发器和动作类型

---

### Requirement: ViewDesigner 配置 SHALL 通过 PageRenderer 渲染

ViewDesigner 中配置的所有功能 SHALL 在 PageRenderer 中正确渲染和执行。

#### Scenario: 配置保存后预览
- **WHEN** 用户在 ViewDesigner 中保存配置后预览
- **THEN** PageRenderer SHALL 根据配置正确渲染表格（格式化器、固定列、按钮条件显示、事件联动）

#### Scenario: 现有配置向后兼容
- **WHEN** 现有视图 schema 不包含新增配置项
- **THEN** PageRenderer SHALL 按原有行为渲染，不受新增功能影响
