## Why

**现况痛点：**
当前低代码平台中，只有页面设计器有数据源配置功能（在 `PageDesigner.vue` 中的弹窗），其他设计器（如表单设计器）缺乏这个能力。这导致：
1. 配置逻辑分散，不利于维护和复用
2. 用户在不同设计器中需要使用不同的配置方式
3. 新增设计器时需要重复实现数据源配置功能

**为什么现在处理：**
1. 用户明确指出了"其他表单设计器里好像没有页面数据源的配置"
2. 这是一个真实存在的需求缺口，影响平台的可扩展性
3. 现在处理可以为后续的设计器开发奠定基础

**预期收益：**
1. 统一所有设计器的数据源配置体验
2. 降低新设计器的开发成本
3. 提高代码复用性和可维护性

## What Changes

**数据源配置界面**
- From: 数据源配置功能分散在各个设计器中，只有页面设计器有完整的配置弹窗
- To: 创建通用的 `DataSourceConfigPanel.vue` 组件，提供统一的数据源绑定配置界面
- Reason: 统一配置体验，提高代码复用性
- Impact: non-breaking，不影响现有功能，只增加新的配置方式

**设计器集成**
- From: 各个设计器需要自行实现数据源配置功能
- To: 各个设计器可以复用 `DataSourceConfigPanel.vue` 组件
- Reason: 降低开发成本，提高一致性
- Impact: 需要重构现有设计器以使用新组件，但接口保持兼容

## Capabilities

### New Capabilities
- `datasource-config-panel`: 通用的数据源配置面板组件，提供统一的数据源绑定配置界面

### Modified Capabilities
- `page-designer`: 页面设计器将使用新的通用数据源配置组件替代现有的弹窗配置
- `form-designer`: 表单设计器将集成新的通用数据源配置组件

## Impact

**受影响的代码：**
1. `frontend/src/components/business/DataSourceConfigPanel.vue`（新增）
2. `frontend/src/views/page/PageDesigner.vue`（重构，使用新组件）
3. 其他设计器组件（后续集成）

**API 影响：**
- 无 API 变更，保持现有接口兼容

**依赖影响：**
- 无新增依赖，使用现有的 Element Plus 组件库

**系统影响：**
- 无系统级影响，只影响前端组件层面
