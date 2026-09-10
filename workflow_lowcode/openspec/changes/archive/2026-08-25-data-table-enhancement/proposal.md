## Why

ViewDesigner 已有完善的配置体系（QueryColumnsConfig/ActionsConfig/EventsConfig），但缺少列格式化器、固定列、按钮条件显示、更多事件触发器和动作类型。直接扩展现有配置组件并同步扩展 PageRenderer 渲染能力，是最自然且低风险的方式。

## What Changes

**QueryColumnsConfig 列配置扩展**
- From: 仅支持 width/align/sortable
- To: 新增 formatter（格式化器：currency/date/boolean/enum）和 fixed（固定列：left/right）
- Reason: 满足列值格式化和固定列需求
- Impact: 非破坏性，新增属性均有默认值

**ActionsConfig 按钮配置扩展**
- From: 仅支持 key/label/placement/style/icon/事件链
- To: 新增 visible（条件显示表达式，如 `$row.status === 'PENDING'`）
- Reason: 满足不同状态下按钮的显示/隐藏需求
- Impact: 非破坏性，未配置 visible 时按钮始终显示

**EventsConfig 触发器扩展**
- From: 仅支持 row-click/search/refresh/create-success
- To: 新增 cell-click（单元格点击）、selection-change（行选择变化）、current-change（当前行变化）
- Reason: 满足更丰富的交互场景
- Impact: 非破坏性，新增触发器不影响现有事件

**EventsConfig 动作扩展**
- From: 仅支持 set-filter/refresh/open-detail/script
- To: 新增 set-sort（设置排序）、set-page（设置分页）、clear-selection（清空选择）
- Reason: 满足排序/分页/选择控制需求
- Impact: 非破坏性，新增动作不影响现有动作

**PageRenderer 渲染扩展**
- From: 不支持 formatter/fixed/selection/cell-click 等
- To: 支持所有新增配置项的运行时渲染
- Reason: 配置和渲染必须匹配，否则配置无意义
- Impact: 非破坏性，新功能通过新配置项启用

## Capabilities

### New Capabilities

- `column-formatter`: 列值格式化能力，支持 currency/date/boolean/enum 内置格式化器
- `column-fixed`: 列固定能力，支持 left/right 固定列
- `button-visibility`: 按钮条件显示能力，通过 $row 表达式控制可见性
- `extended-event-triggers`: 扩展事件触发器，支持 cell-click/selection-change/current-change
- `extended-event-actions`: 扩展事件动作，支持 set-sort/set-page/clear-selection

### Modified Capabilities

- `view-designer`: 扩展 QueryColumnsConfig/ActionsConfig/EventsConfig 配置组件
- `page-renderer`: 扩展渲染能力支持新配置项

## Impact

### 受影响的代码

- `frontend/src/views/page/components/QueryColumnsConfig.vue` - 扩展列配置（formatter/fixed）
- `frontend/src/views/page/components/ActionsConfig.vue` - 扩展按钮配置（visible）
- `frontend/src/views/page/components/EventsConfig.vue` - 扩展触发器和动作
- `frontend/src/views/page/PageRenderer.vue` - 扩展渲染逻辑
- `frontend/src/views/page/ViewDesigner.vue` - 类型定义扩展

### 受影响的 API

- 无 API 变更，纯前端扩展

### 受影响的依赖

- 无新增依赖
