# custom-form-components Specification

## Purpose
TBD - created by archiving change unify-form-create. Update Purpose after archive.
## Requirements
### Requirement: 自定义组件注册为 form-create 全局组件

系统 SHALL 通过 `formCreate.component()` 将项目自定义组件（LookupPicker 等）注册为 form-create 全局组件，使其可在所有 form-create 渲染的表单中使用。

注册 SHALL 在应用启动时（`main.ts`）完成，先于任何表单渲染。

注册后的组件 SHALL 在 rule JSON 中通过 `type` 字段引用（如 `{ type: 'LookupPicker', field: 'xxx' }`）。

#### Scenario: rule JSON 中使用 LookupPicker

- **WHEN** rule JSON 包含 `{ type: 'LookupPicker', field: 'dictType', props: { ... } }`
- **THEN** form-create 渲染 LookupPicker 组件
- **AND** 组件通过 `formCreateInject` 获取 form-create api
- **AND** 组件的 v-model 与 form-create 表单数据双向绑定

### Requirement: LookupPicker 适配 form-create

LookupPicker SHALL 保留现有 props 契约（columns、fetchApi、returnFields、displayField、mode 等）。

LookupPicker SHALL 通过 `formCreateInject` 获取 form-create api，用于实现 `returnFields` 回填。

当用户选中一行数据时，LookupPicker SHALL：
1. 通过 `update:modelValue` 更新当前字段的值
2. 遍历 `returnFields`，通过 `api.setValue(targetField, sourceValue)` 回填其他字段

LookupPicker SHALL 保持标准 v-model 行为，不破坏现有单元测试。

#### Scenario: 选中行并回填 returnFields

- **WHEN** 用户在 LookupPicker 弹窗中选中一行 `{ dictCode: 'DICT_001', dictName: '性别' }`
- **AND** returnFields 配置为 `{ dictCode: 'dictCode' }`
- **THEN** LookupPicker 更新当前字段值为选中行数据
- **AND** 通过 `api.setValue('dictCode', 'DICT_001')` 回填 dictCode 字段

#### Scenario: 清除选择

- **WHEN** 用户点击清除按钮
- **THEN** LookupPicker 清空当前字段值
- **AND** 通过 `api.setValue(targetField, null)` 清空所有 returnFields 对应的字段

### Requirement: 自定义组件注册到 FcDesigner 设计器

系统 SHALL 在 FormDesigner 组件挂载后，通过 `designerRef.addComponent()` 将自定义组件注册到设计器拖拽面板。

注册时 SHALL 提供：
- `label`：设计器面板中显示的组件名称
- `name`：组件标识（与 form-create 注册名一致）
- `rule`：拖入设计区时的默认 rule 模板（含默认 props）

注册后的组件 SHALL 出现在 FcDesigner 的拖拽面板中，用户可拖拽到设计区。

#### Scenario: 拖拽 LookupPicker 到设计区

- **WHEN** 用户从拖拽面板拖入 LookupPicker 组件
- **THEN** 设计区出现一个 LookupPicker 占位
- **AND** 默认 rule 为 `{ type: 'LookupPicker', field: '', title: '选择', props: { columns: [], fetchApi: null } }`
- **AND** 用户可在属性面板编辑 field、title、props

### Requirement: 自定义组件同时用于 CRUD 表单和工作流表单

自定义组件 SHALL 在 form-create 全局注册后，同时可用于：
- CRUD 表单（通过 FormRenderer 按 formKey 加载的 schema）
- 工作流表单（通过 FormRenderer 按 formDefId 加载的 schema）
- FcDesigner 设计器（拖拽设计）

三种场景下组件行为 SHALL 一致，无需为不同场景编写不同代码。

#### Scenario: LookupPicker 在 CRUD 表单中使用

- **WHEN** CRUD 表单的 rule JSON 包含 LookupPicker
- **THEN** FormRenderer 渲染 LookupPicker
- **AND** 用户选择后 returnFields 回填正常工作

#### Scenario: LookupPicker 在工作流表单中使用

- **WHEN** 工作流表单的 rule JSON 包含 LookupPicker
- **THEN** FormRenderer 渲染 LookupPicker
- **AND** 字段权限（EDIT/VIEW/HIDDEN）正常生效
- **AND** 用户选择后 returnFields 回填正常工作

