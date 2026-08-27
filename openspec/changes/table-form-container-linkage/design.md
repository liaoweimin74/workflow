## Context

### 背景
系统已完成统一数据源建设，页面设计器（PageDesigner）已有页面级 `dataSources[]` 绑定层 + 动作总线（`schema.actions`），表格/树组件通过属性面板 `dataSourceId` 下拉绑定。表单设计器（FormDesigner）基于 form-create，已有 `formContainer` 组件用于数据源绑定。

### 现状
- **PageDataTable**：数据表格组件，支持操作按钮（编辑、查看、删除等），有内置的详情弹窗
- **formContainer**：数据源绑定容器，通过DsBindingEngine从数据源读取和写入数据
- **DsActionBus**：事件总线，支持set-filter、refresh、reload-record、set-value、save-record等操作
- **PageRendererPage**：页面渲染器，管理组件引用和事件分发

### 约束
- 必须复用现有DsActionBus事件总线架构
- 必须支持事件流驱动的联动方式
- 必须支持多种显示形式（弹出窗口、新开页签、页面内嵌）
- 必须支持按钮自定义

## Goals / Non-Goals

**Goals:**
1. 实现数据表格和formContainer的联动功能
2. 支持事件流驱动的记录加载、编辑和保存
3. 支持多种显示形式（弹出窗口、新开页签、页面内嵌）
4. 支持按钮自定义（默认按钮+自定义按钮）
5. 支持智能数据同步（保存后同步表格）

**Non-Goals:**
- 不改造现有DsActionBus核心架构
- 不改造现有formContainer组件核心功能
- 不引入新的事件总线机制

## Decisions

### D1: 扩展DsActionBus事件流

**决策**：扩展现有的DsActionBus事件总线，增加表格-容器联动的专用事件和动作。

**理由**：
- 复用现有架构，降低开发成本
- 配置灵活，支持可视化+JSON
- 易于扩展其他联动场景

**新增事件类型**：
- `row-edit`：行编辑触发
- `row-view`：行查看触发
- `row-create`：新增触发

**新增动作类型**：
- `open-container`：打开formContainer（支持displayMode参数）
- `load-record`：加载记录到formContainer
- `save-container`：保存formContainer数据
- `close-container`：关闭formContainer

### D2: formContainer显示形式配置

**决策**：formContainer支持三种显示形式，默认为弹出窗口。

**配置方式**：
```javascript
{
  displayMode: 'dialog' | 'newTab' | 'inline',  // 默认 'dialog'
  dialogWidth: '800px',  // 弹出窗口宽度
  tabTitle: '编辑记录',  // 新开页签标题
  inlineHeight: '600px', // 页面内嵌高度
}
```

**事件覆盖**：通过事件流的`open-container`动作可以覆盖默认显示形式。

### D3: formContainer按钮配置

**决策**：formContainer支持默认按钮+自定义按钮。

**默认按钮**：
- 新增：创建新记录
- 取消：取消当前操作
- 确定：保存当前记录
- 删除：删除记录（默认隐藏）
- 复制：复制记录（默认隐藏）

**自定义按钮**：
- 支持配置自定义按钮和事件链
- 按钮位置：按钮区或工具栏

### D4: 智能数据同步

**决策**：保存后智能同步表格中的对应行。

**实现策略**：
1. 保存成功后，获取返回的记录数据
2. 在表格数据中查找对应行（通过ID匹配）
3. 如果找到，更新该行数据
4. 如果未找到，刷新整个表格

## Risks / Trade-offs

### 风险1：事件流配置复杂度
- **风险**：事件流配置可能过于复杂，用户难以理解
- **缓解**：提供可视化配置界面，同时支持JSON高级配置

### 风险2：性能影响
- **风险**：频繁的事件分发可能影响性能
- **缓解**：使用防抖机制，避免频繁触发

### 风险3：状态同步问题
- **风险**：表格和formContainer状态可能不同步
- **缓解**：使用乐观锁机制，冲突时提示用户刷新

### 风险4：兼容性问题
- **风险**：扩展现有事件总线可能影响现有功能
- **缓解**：向后兼容，现有配置不受影响

## Migration Plan

### 部署步骤
1. 扩展DsActionBus，增加新的事件和动作类型
2. 增强formContainer，支持多种显示模式
3. 在PageDataTable中触发联动事件
4. 在PageRendererPage中处理事件分发

### 回滚策略
- 如果新功能有问题，可以禁用新的事件类型
- 现有功能不受影响

## Open Questions

1. formContainer的弹出窗口样式和尺寸如何配置？
2. 新开页签的URL如何生成？
3. 页面内嵌的布局如何与现有页面集成？
4. 自定义按钮的事件链如何配置？
5. 智能同步的具体实现策略是什么？
