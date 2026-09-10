# 流程属性与审批人去重设计

## 背景

当前流程设计器的 `ProcessProperty.vue` 只有4个基本信息字段（名称、标识、分类、描述），缺少流程级的运行时行为配置。审批人去重作为跨节点的策略，需要在流程级设置。

## 目标

1. 扩展流程属性面板，增加审批策略和流程编号配置
2. 审批人去重作为流程级开关，支持范围和行为配置
3. 零数据库 schema 变更，复用现有 `wf_node_config` 表
4. 零 API 变更，复用现有保存/加载机制

## 现有架构

### 数据流

```
前端 designerStore.nodeConfigs (Record<nodeId, jsonString>)
  ↓ saveDesign API
后端 DesignSaveRequest { nodeConfigs: Record<string, string> }
  ↓ 逐条写入
wf_node_config 表 (process_def_id + node_id + config_json)
```

### 属性面板切换

`PropertyPanel.vue` 根据 `selectedNodeType` 切换组件：
- 点击画布空白 → `selectedNodeType = 'Process'` → `ProcessProperty.vue`
- 点击节点 → 显示对应节点属性组件

### 当前 ProcessProperty.vue

仅4个字段，且 `categoryId` 未正确保存（`handleSave` 硬编码 `categoryId: null`）。

## 设计

### 数据结构

流程级配置用固定 key `__PROCESS__` 存入 `nodeConfigs`，与节点配置隔离。

```typescript
// designerStore.ts 新增
export const PROCESS_CONFIG_KEY = '__PROCESS__'

export interface ProcessConfigData {
  // 基本信息（从 BPMN root element 读取/写入）
  name: string
  key: string
  categoryId: string | null
  description: string

  // 审批策略
  approvalPolicy: {
    // 审批人去重
    deduplication: {
      enabled: boolean
      scope: 'GLOBAL' | 'PHASE'    // 全流程 / 同一阶段
      action: 'AUTO_PASS' | 'SKIP' | 'ESCALATE'
    }
    // 发起人撤回
    allowRecall: boolean
    // 加签
    allowAddSigner: boolean
    // 转办
    allowDelegate: boolean
  }

  // 流程编号
  numberRule: {
    enabled: boolean
    pattern: string               // 如 {{year}}-{{seq:4}}
  }
}
```

### 默认值

```typescript
const DEFAULT_PROCESS_CONFIG: ProcessConfigData = {
  name: '',
  key: '',
  categoryId: null,
  description: '',
  approvalPolicy: {
    deduplication: {
      enabled: false,
      scope: 'GLOBAL',
      action: 'AUTO_PASS',
    },
    allowRecall: true,
    allowAddSigner: true,
    allowDelegate: true,
  },
  numberRule: {
    enabled: false,
    pattern: '{{year}}-{{seq:4}}',
  },
}
```

### UI 布局

`ProcessProperty.vue` 改为分区结构，使用 `el-divider` 分隔：

```
┌─ 属性配置 ──────────────────────┐
│ ── 基本信息 ──                   │
│ 流程名称：  [___________]        │
│ 流程标识：  [___________] (只读) │
│ 流程分类：  [树形选择 ▼]         │
│ 流程描述：  [textarea____]       │
│                                  │
│ ── 审批策略 ──                   │
│ 审批人去重                       │
│   ☑ 启用去重                     │
│   去重范围：○ 全流程 ○ 同一阶段  │
│   去重行为：○ 自动通过           │
│              ○ 跳过节点          │
│              ○ 转交上级          │
│   ☑ 允许发起人撤回               │
│   ☑ 允许加签                     │
│   ☑ 允许转办                     │
│                                  │
│ ── 流程编号 ──                   │
│   ☐ 启用自动编号                 │
│   编号规则：[{{year}}-{{seq:4}}] │
│   预览：2026-0001                │
└──────────────────────────────────┘
```

**交互规则**：
- 去重范围/行为字段在 `deduplication.enabled = false` 时禁用
- 编号规则字段在 `numberRule.enabled = false` 时禁用
- 流程分类从平铺 `el-select` 改为 `el-tree-select`（分类有树形结构）

### 存储读写

#### 加载时

`ProcessDesigner.vue` 的 `loadEditor` 已调用 `designerStore.setNodeConfigs(editorData.nodeConfigs)`，其中包含 `__PROCESS__` key。`ProcessProperty.vue` 的 `onMounted` 从 store 读取：

```typescript
const raw = designerStore.nodeConfigs[PROCESS_CONFIG_KEY]
const config = raw ? { ...DEFAULT_PROCESS_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_PROCESS_CONFIG }
```

基本信息（name/key）仍从 BPMN root element 读取，覆盖 config 中的值。

#### 保存时

`ProcessProperty.vue` 监听 config 变化，写入 store：

```typescript
watch(config, () => {
  designerStore.setNodeConfig(PROCESS_CONFIG_KEY, config)
}, { deep: true })
```

`handleSave` 已包含 `nodeConfigs: designerStore.nodeConfigs`，`__PROCESS__` 会随之一并保存。无需修改保存逻辑。

#### categoryId 修复

当前 `handleSave` 硬编码 `categoryId: null`，需改为从 `__PROCESS__` 配置中读取：

```typescript
const processConfig = designerStore.getNodeConfig(PROCESS_CONFIG_KEY) as any
await processDesignApi.saveDesign(designerStore.draftId, {
  name: designerStore.draftName || '',
  key: designerStore.draftKey || '',
  categoryId: processConfig?.categoryId || null,
  bpmnXml: xml,
  nodeConfigs: designerStore.nodeConfigs
})
```

### 后端（本次不实现运行时去重逻辑）

本次只做设计器侧的属性配置 UI + 存储。后端运行时去重执行逻辑在后续迭代实现，本次不涉及。

后端 `DesignSaveRequest` 和 `wf_node_config` 表无需变更——`__PROCESS__` 作为普通 node_id 存入，后端不区分。

## 实施范围

### 前端改动

1. **designerStore.ts**
   - 新增 `ProcessConfigData` 接口和 `PROCESS_CONFIG_KEY` 常量
   - 新增 `getProcessConfig()` / `setProcessConfig()` 便捷方法

2. **ProcessProperty.vue** — 重写
   - 改为分区布局（基本信息 / 审批策略 / 流程编号）
   - 从 `nodeConfigs['__PROCESS__']` 读写配置
   - 流程分类改为 `el-tree-select`
   - 去重配置：开关 + 范围 + 行为
   - 编号规则：开关 + pattern 输入 + 预览

3. **ProcessDesigner.vue**
   - `handleSave` / `handleDeploy` 中 `categoryId` 从 `__PROCESS__` 配置读取，不再硬编码 null

### 后端改动

无。

### 数据库改动

无。

## 不在本次范围

- 后端运行时去重执行逻辑（TaskListener 中查询历史、自动通过/跳过/转交）
- 流程编号后端生成逻辑
- 允许撤回/加签/转办的后端校验逻辑
- 通知提醒配置（站内信/邮件/催办）
