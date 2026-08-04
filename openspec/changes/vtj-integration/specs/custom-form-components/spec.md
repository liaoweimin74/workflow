# custom-form-components Delta Spec

## REMOVED Requirements

### Requirement: 自定义组件注册为 form-create 全局组件

**Reason**: form-create 依赖完全移除，不再需要 `formCreate.component()` 注册方式。

**Migration**: 自定义组件通过 XField 的 editor prop 传入组件对象，或通过 #editor 插槽使用。不再需要全局注册。

### Requirement: LookupPicker 适配 form-create

**Reason**: form-create 依赖移除，LookupPicker 不再需要 formCreateInject 注入和 api.setValue 回填机制。

**Migration**: LookupPicker 通过 XField 的 v-model 双向绑定同步数据，returnFields 回填通过 Vue 事件机制（emit）或 XForm 的 model 更新实现。

### Requirement: 自定义组件注册到 FcDesigner 设计器

**Reason**: FcDesigner 设计器被 VTJ 设计器替代，不再需要 `designerRef.addComponent()` 注册方式。

**Migration**: 自定义组件通过 VTJ 物料协议注册，或直接在 XField 的 editor prop 中使用组件对象。

## ADDED Requirements

### Requirement: 自定义组件通过 XField editor 接入

系统 SHALL 支持自定义组件作为 XField 的 editor 使用，通过 editor prop 传入组件对象或通过 #editor 插槽使用。

自定义组件作为 XField editor 时 SHALL 通过 v-model 与 XForm 的表单数据双向绑定。

自定义组件 SHALL 通过 XField 的 props prop 接收配置参数。

#### Scenario: LookupPicker 作为 XField editor

- **WHEN** 用户在 VTJ 设计器中为 XField 配置 editor 为 LookupPicker 组件
- **AND** 配置 props 为 `{ dictType: 'user_status' }`
- **THEN** 设计器画布中 XField 渲染为 LookupPicker
- **AND** 运行时 renderer 也能正确渲染 LookupPicker
- **AND** LookupPicker 的 v-model 与 XForm 表单数据双向绑定

#### Scenario: LookupPicker returnFields 回填

- **WHEN** 用户在 LookupPicker 中选中一行数据
- **AND** returnFields 配置为 `{ dictCode: 'dictCode' }`
- **THEN** LookupPicker 更新当前字段值
- **AND** 通过 emit 事件通知父组件回填其他字段
- **AND** 不依赖 formCreateInject 或 api.setValue

### Requirement: LookupPicker 解耦 form-create

LookupPicker SHALL 移除对 formCreateInject 的依赖。

LookupPicker SHALL 通过标准的 Vue v-model 和 props/emit 机制与 XField/XForm 交互。

LookupPicker SHALL 保留现有 props 契约（columns、fetchApi、returnFields、displayField、mode 等）。

#### Scenario: LookupPicker 独立使用

- **WHEN** LookupPicker 在 XField editor 中使用
- **THEN** 组件不注入 formCreateInject
- **AND** 组件通过 v-model 双向绑定数据
- **AND** returnFields 回填通过 emit 事件实现
