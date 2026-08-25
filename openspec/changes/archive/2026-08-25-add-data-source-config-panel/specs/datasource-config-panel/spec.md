## ADDED Requirements

### Requirement: DataSourceConfigPanel 组件 SHALL 提供数据源绑定配置功能
DataSourceConfigPanel 组件 SHALL 提供完整的数据源绑定配置功能，包括添加、编辑和删除数据源绑定。

#### Scenario: 添加数据源绑定
- **WHEN** 用户点击"添加数据源"按钮
- **THEN** 系统 SHALL 在列表中添加一个新的数据源绑定行，包含页面内标识输入框和全局数据源选择下拉框

#### Scenario: 删除数据源绑定
- **WHEN** 用户点击某个数据源绑定行的删除按钮
- **THEN** 系统 SHALL 从列表中移除该数据源绑定

#### Scenario: 编辑页面内标识
- **WHEN** 用户修改某个数据源绑定的页面内标识
- **THEN** 系统 SHALL 更新该数据源绑定的 id 属性

#### Scenario: 选择全局数据源
- **WHEN** 用户从下拉框中选择一个全局数据源
- **THEN** 系统 SHALL 更新该数据源绑定的 refId 属性为选中的全局数据源ID

### Requirement: DataSourceConfigPanel 组件 SHALL 显示已启用的全局数据源列表
组件 SHALL 在下拉框中显示所有已启用的全局数据源，供用户选择绑定。

#### Scenario: 加载全局数据源
- **WHEN** 组件挂载时接收到 enabledDataSources prop
- **THEN** 系统 SHALL 在下拉框中显示所有已启用的全局数据源

#### Scenario: 全局数据源为空
- **WHEN** enabledDataSources prop 为空数组
- **THEN** 系统 SHALL 在下拉框中显示"暂无可用数据源"提示

### Requirement: DataSourceConfigPanel 组件 SHALL 支持数据验证
组件 SHALL 支持数据验证，包括页面内标识唯一性、必填项验证等。

#### Scenario: 页面内标识重复
- **WHEN** 用户输入的页面内标识与已有标识重复
- **THEN** 系统 SHALL 显示错误提示"页面内标识已存在"

#### Scenario: 页面内标识为空
- **WHEN** 用户清空页面内标识输入框
- **THEN** 系统 SHALL 显示错误提示"页面内标识不能为空"

#### Scenario: 未选择全局数据源
- **WHEN** 用户未选择全局数据源就尝试保存
- **THEN** 系统 SHALL 显示错误提示"请选择全局数据源"

### Requirement: DataSourceConfigPanel 组件 SHALL 通过事件通知父组件配置变更
组件 SHALL 在配置变更时通过事件通知父组件，确保数据同步。

#### Scenario: 配置变更
- **WHEN** 用户添加、删除或修改数据源绑定
- **THEN** 系统 SHALL 触发 update:dataSources 事件，传递更新后的数据源绑定配置数组

---

## MODIFIED Requirements

（无修改的现有需求）

---

## REMOVED Requirements

（无删除的现有需求）

---

## RENAMED Requirements

（无重命名的现有需求）
