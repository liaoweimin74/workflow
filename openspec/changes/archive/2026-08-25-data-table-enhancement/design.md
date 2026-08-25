## Context

### 现状分析

当前项目中有两套数据表格组件：

| 组件 | 位置 | 用途 | 现状 |
|------|------|------|------|
| `PageDataTable` | `frontend/src/views/page/components/` | 页面设计器的数据展示组件 | 功能简单，仅支持基础CRUD和动作总线联动 |
| `SearchTable` | `frontend/src/components/business/` | 代码级数据表格组件 | 功能丰富，支持搜索、分页、操作列配置 |

### 核心问题

1. **PageDataTable 配置能力有限** - 仅支持 `columns`、`dataSourceId` 等基础配置
2. **操作列硬编码** - 编辑/删除按钮无法自定义
3. **事件类型单一** - 仅支持 `row-click` 事件
4. **与 SearchTable 配置方式不统一** - 两者配置逻辑重复

## Goals / Non-Goals

**Goals:**

1. 增强 PageDataTable 的属性配置能力，支持排序、筛选、分页、行选择等
2. 扩展事件绑定机制，支持更多交互场景
3. 实现操作列按钮的灵活配置，支持自定义按钮和条件显示
4. 复用 SearchTable 的配置逻辑，统一配置面板
5. 保持向后兼容，现有 schema 无需修改

**Non-Goals:**

1. 不重构现有组件结构
2. 不支持行内编辑（可后续扩展）
3. 不支持虚拟滚动（可后续扩展）
4. 不改变现有的动作总线机制

## Decisions

### 1. 采用混合方案

在现有 PageDataTable 基础上扩展属性和事件，同时引入通用配置面板复用 SearchTable 的配置逻辑。

**理由**：
- 改动范围可控，风险较低
- 复用现有配置逻辑，减少重复开发
- 分阶段实现，可快速迭代

### 2. 分层配置策略

- **第一层**：属性编辑栏直接配置（简单属性）
- **第二层**：弹窗配置（复杂配置：列配置、操作列、事件绑定）

**理由**：
- 简单属性直接配置，操作步骤少
- 复杂配置用弹窗，避免属性面板过长
- 与项目现有模式一致（DataSourceConfigPanel、DataPickerConfigDialog）

### 3. 通用配置组件

创建 `TableConfigPanel` 组件，支持：
- 列配置面板
- 操作列配置面板
- 搜索字段配置（可选）

**理由**：
- 与 SearchTable 复用配置逻辑
- 统一配置体验
- 减少重复代码

### 4. 操作列按钮支持条件显示

通过表达式控制按钮可见性：
```javascript
{
  label: '审批',
  action: 'custom',
  visible: '{row.status === "PENDING"}'
}
```

**理由**：
- 满足不同角色/状态下的按钮显示需求
- 表达式语法简单直观

### 5. 内置格式化器

提供常用格式化器：
- `currency` - 货币格式
- `date` / `datetime` - 日期格式
- `boolean` - 布尔显示
- `enum` - 枚举映射

**理由**：
- 覆盖常见数据格式化需求
- 减少用户重复配置

## Risks / Trade-offs

### 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 向后兼容性问题 | 现有页面功能异常 | 严格保持默认值，充分测试 |
| 配置面板复杂度 | 用户学习成本 | 分层设计，渐进式引导 |
| 性能影响 | 大数据量表格卡顿 | 虚拟滚动、分页优化（后续扩展） |

### Trade-offs

1. **功能丰富度 vs 复杂度**：选择适中的功能集，避免过度设计
2. **配置灵活性 vs 易用性**：分层配置，简单场景一步到位，复杂场景按需配置
3. **复用性 vs 独立性**：与 SearchTable 复用配置组件，但保持各自的独立性

## 技术实现要点

### 1. 组件结构

```
frontend/src/components/business/
├── TableConfigPanel.vue      # 通用配置组件
├── TableColumnConfig.vue     # 列配置子组件
├── TableActionConfig.vue     # 操作列配置子组件
└── SearchTable.vue           # 现有组件（适配）
```

### 2. 属性扩展

在 PageDataTable 的 props 中新增：
- 表格级属性：sortable、filterable、pagination 等
- 列级属性：sortable、filterable、fixed、formatter 等
- 操作列配置：actionColumn 对象

### 3. 事件扩展

新增组件事件：
- cell-click
- selection-change
- sort-change
- current-change

扩展动作总线操作：
- set-sort
- set-page
- get-selection
- clear-selection

### 4. 配置面板集成

在 PageDesigner.vue 的属性面板中添加配置入口：
- 列配置按钮
- 操作列配置按钮
- 事件绑定配置按钮

点击按钮打开 TableConfigPanel 弹窗。
