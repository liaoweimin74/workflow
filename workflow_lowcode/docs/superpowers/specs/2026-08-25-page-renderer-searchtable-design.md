# PageRenderer 基于 SearchTable 改造设计

**日期**: 2026-08-25
**状态**: 已批准（方案A）
**关联**: 数据表格组件增强（data-table-enhancement）

---

## 1. 背景

当前存在三套表格实现：

| 场景 | 渲染组件 | 状态 |
|------|----------|------|
| ViewDesigner 视图 | PageRenderer.vue（原生 el-table + 手写操作列/事件） | 需要改造 |
| 代码页面（12 个） | SearchTable（成熟封装） | 保持 |
| PageDesigner 页面 | PageDataTable（已改为包装 SearchTable） | 已改造 |

PageRenderer 的手写操作列渲染（visible/按钮/icon/confirm）与 SearchTable 重复，且维护成本高。

## 2. 方案（方案A：表格主体用 SearchTable）

PageRenderer 的**表格渲染/操作列/分页**改用 SearchTable；**保留视图级能力**（schema 解析、查询区、双轨详情弹窗、事件动作链、脚本执行）。

### 2.1 能力边界

| 能力 | 归属 | 说明 |
|------|------|------|
| 表格渲染、操作列、分页 | SearchTable | 统一 |
| 工具栏按钮（toolbar） | SearchTable（新增） | 统一 |
| 查询区 | PageRenderer | 保留（schema 编译产物生成） |
| 双轨详情弹窗 | PageRenderer | 保留（FORM/KV） |
| 事件动作链 dispatchAction | PageRenderer | 保留（onClick 注入 SearchTable） |
| 脚本执行 | PageRenderer | 保留 |

### 2.2 关键设计

操作按钮 onClick 由 PageRenderer 生成（注入 dispatchAction 逻辑），SearchTable 只负责渲染与触发：

```typescript
// PageRenderer 生成 ActionButton
const searchTableActionButtons = computed<ActionButton[]>(() =>
  rowActionButtons.value.map((b) => ({
    label: b.label,
    type: b.type,
    link: b.style === 'text',
    icon: b.style === 'icon' ? b.icon : undefined,
    show: b.style === 'icon' ? undefined : (row: any) => isButtonVisibleForRow(b.origin, row),
    onClick: (row: any) => b.onClick(row),
  })),
)
```

### 2.3 SearchTable 增强（向后兼容）

新增 `toolbarButtons?: ToolbarButton[]`，渲染在表格上方工具栏：

```typescript
export interface ToolbarButton {
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  icon?: Component
  link?: boolean
  circle?: boolean
  onClick: () => void
}
```

模板中在表格前渲染工具栏（v-if="toolbarButtons.length"）。

## 3. PageRenderer 改造点

1. **模板**：替换 `<el-table>` 区块为 `<SearchTable>`，删除手写操作列模板
2. **按钮配置**：
   - `actionButtonsConfig`（编译产物）不变
   - `toolbarButtons` → SearchTable `toolbarButtons`
   - `rowActionButtons` → SearchTable `actionButtons`（onClick 绑定原逻辑）
3. **fetchApi**：包装 `loadData` 为 SearchTable 协议 `(params) => Promise<{rows, total}>`
4. **保留**：查询区、详情弹窗、编辑弹窗、dispatchAction/triggerEvents/脚本、cellValue
5. **行点击事件**：SearchTable `@row-click` → 原 handleRowClick + triggerEvents

## 4. 向后兼容

- 现有视图 schema 无需修改（编译产物解析不变）
- SearchTable 增强均有默认值，12 个既有页面零影响

## 5. 测试

- 现有视图（VIEW）预览：表格/操作列/分页/搜索/详情/编辑/事件链正常
- 只读数据源：隐藏写操作按钮
- visible 条件显示
- toolbar 按钮（新增/导出等）

## 6. 实施步骤

1. SearchTable 新增 `toolbarButtons` 支持
2. PageRenderer 模板表格区块改为 SearchTable
3. PageRenderer script：生成 SearchTable 的 columns/actionButtons/fetchApi
4. 移除手写操作列渲染逻辑
5. 构建 + 类型检查 + 预览验证
