# form-runtime Specification Delta

## ADDED Requirements

### Requirement: 映射数据预填

FormRenderer SHALL 接收 `mappedData` prop（`Record<string, unknown>`），在表单
渲染时将 `mappedData` 的条目合并到表单数据（`formData`）中作为预填值：

- 仅 `mappedData` 中存在的目标字段被预填；本表单已有数据 SHALL 不被覆盖
  （本表单数据优先于映射数据）
- 映射字段的可编辑性 SHALL 由 `fieldPermissions` 统一控制（与普通字段一致）：
  - VIEW：渲染为只读（disabled）
  - HIDDEN：不渲染
  - EDIT：可编辑（映射值作为初始值）
- `submit()` / `getFormData()` SHALL 将映射字段作为本表单数据的一部分参与保存
  （保存语义由调用方按字段权限决定；只读场景下值不变，天然不回写源表单）
- 未传入 `mappedData` 时 SHALL 不产生任何预填行为

#### Scenario: mappedData 预填字段

- **WHEN** FormRenderer 接收 `mappedData = { "applicantName": "张三" }`
- **THEN** 表单 `applicantName` 字段 SHALL 显示为"张三"

#### Scenario: 本表单数据优先

- **WHEN** 本表单已存在数据（从后端加载/initialValues）且与 `mappedData` 目标字段重叠
- **THEN** 目标字段值 SHALL 以本表单数据为准
- **AND** `mappedData` SHALL 不覆盖本表单数据

#### Scenario: 映射字段只读

- **WHEN** 映射字段在 `fieldPermissions` 中为 VIEW
- **THEN** 该字段 SHALL 渲染为只读并显示映射值

#### Scenario: 未传入 mappedData

- **WHEN** FormRenderer 未接收 `mappedData`（或为空对象）
- **THEN** 表单 SHALL 按现有行为渲染，不产生任何映射预填