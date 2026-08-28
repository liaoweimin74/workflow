## Why

### 现况痛点
当前页面设计器中的数据表格（PageDataTable）和数据容器（formContainer）组件是独立的，缺乏联动能力。用户在表格中点击编辑/查看按钮时，无法自动加载对应记录到formContainer中进行编辑。这导致用户体验不佳，需要手动操作多个组件。

### 为什么现在处理
随着业务复杂度增加，用户对数据表格和表单的联动需求越来越强烈。现有架构已经具备事件总线（DsActionBus）和数据源绑定（DsBindingEngine）能力，可以在此基础上扩展实现联动功能。

### 预期收益
- 提升用户体验：一键编辑，自动加载
- 提高开发效率：复用现有架构，降低开发成本
- 增强系统灵活性：支持多种显示形式和自定义按钮

## What Changes

### 数据表格操作按钮增强
- From: 表格操作按钮仅有内置的编辑/查看功能
- To: 表格操作按钮支持触发事件流，可以配置联动动作
- Reason: 实现表格和formContainer的联动
- Impact: 非破坏性，现有功能不受影响

### formContainer显示形式扩展
- From: formContainer仅支持页面内嵌显示
- To: formContainer支持弹出窗口（默认）、新开页签、页面内嵌三种显示形式
- Reason: 满足不同场景下的显示需求
- Impact: 非破坏性，新增配置选项

### formContainer按钮配置增强
- From: formContainer仅有固定的按钮配置
- To: formContainer支持默认按钮（新增、取消、确定、删除、复制）+ 自定义按钮
- Reason: 满足不同业务场景下的操作需求
- Impact: 非破坏性，新增配置选项

### 事件流配置扩展
- From: 事件流仅支持基础的set-filter、refresh等操作
- To: 事件流支持表格-容器联动的专用事件和动作
- Reason: 实现事件驱动的联动方式
- Impact: 非破坏性，新增事件和动作类型

## Capabilities

### New Capabilities
- `table-container-linkage`: 数据表格和数据容器组件联动功能，支持事件流驱动的记录加载、编辑和保存
- `form-container-display-mode`: 数据容器组件的多种显示形式支持（弹出窗口、新开页签、页面内嵌）
- `form-container-button-config`: 数据容器组件的按钮配置功能（默认按钮+自定义按钮）

### Modified Capabilities
- `page-data-table`: 页面数据表格组件，新增事件触发能力
- `ds-action-bus`: 数据源事件总线，新增表格-容器联动事件和动作

## Impact

### 受影响代码
- `frontend/src/views/page/components/PageDataTable.vue`：新增事件触发逻辑
- `frontend/src/views/form/components/DsActionBus.ts`：新增事件和动作类型
- `frontend/src/views/form/components/formContainer.js`：新增显示模式和按钮配置
- `frontend/src/views/page/PageRendererPage.vue`：新增事件处理逻辑

### 受影响API
- 无新增API，仅扩展现有组件配置

### 受影响依赖
- 无新增依赖，复用现有架构
