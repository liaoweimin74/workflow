# FORM 容器数据源绑定 — 技术设计

## Context

**背景**：系统已完成统一数据源建设——后端 `DataSourceAdapter` SPI（`supports/metadata/query/get/create/update/delete`，只读数据源继承 default 抛"不支持"）、统一 REST 六端点（`/api/v1/data-sources/{id}/{metadata,data,data/{rowId}}`）、前端 `dataSourceApi` 封装、数据源管理页（FORM/WORKFLOW/SYSTEM/API 多态）。页面设计器（PageDesigner）已有页面级 `dataSources[]` 绑定层 + 动作总线（`schema.actions`），表格/树组件通过属性面板 `dataSourceId` 下拉绑定。

**现状**：
- 表单设计器（FormDesigner）基于 form-create（`@form-create/designer` + `@form-create/element-ui`），vendor 目录定制了 `subForm.js`（`subForm: 'object'`）与 `group.js`（`subForm: 'array'`）两个容器组件，`loadRule/parseRule` 实现 `children ↔ props.rule` 互转，拖拽嵌套为原生能力。
- 表单渲染（FormRenderer）已处理容器内字段（`props.rule` 递归、字段权限、深禁用）。
- 特殊取数组件各自为政：DataPicker（数据引用，级联联动用 `formCreateInject.api.getValue` + 清空/保留刷新）、LookupPicker（查找带回）。
- 业务表单数据落 `biz_data`（BizDataService），工作流表单落 `wf_form_data`（WORKFLOW 数据源只读），API 数据源经 `HttpLogicExecutor`。

**约束**：
- form-create rule 的 `field` 在容器内作用域化（`subRuleData[group.id]` 独立子数据对象），容器自身 field 需全局唯一。
- 后端 SPI 已具备单条读/写能力，本设计原则上**不改后端**（或仅极小扩展）。
- 三端语义差异：业务表单=记录 ID（读写）、工作流表单=流程实例关联记录（只读）、页面=上下文变量（读 b 由动作总线驱动）。

## Goals / Non-Goals

**Goals:**
1. 新增 FORM 容器组件（`subForm: 'object'`），可绑定全局数据源（`dataSourceId`）+ 记录定位（`recordLocator`），基础组件可拖入，一个表单可含多个容器。
2. 渲染层数据源绑定引擎：读（记录上下文变化 → `getData` → 填充容器内组件）、写（组件值变化防抖 → 收集绑定字段 → `updateData` 乐观锁）。
3. 统一联动模型：事件总线（触发器 → 动作 → 目标）+ 模板变量，贯穿四层联动（L1 数据源→组件、L2 组件→数据源、L3 组件→组件、L4 组件→数据源→组件）。
4. 三端统一取数：业务表单（读写）、工作流表单（只读回显）、页面（动作总线驱动刷新）。
5. 容器内可嵌套 group 子表单（object 套 array），子组件字段平铺 = 数据源列 key。

**Non-Goals:**
- 不改 form-create 内核与后端 DataSourceAdapter SPI。
- 工作流表单写路径（WORKFLOW 数据源只读，写仍走流程变量）——第一版不做。
- 不引入轮询/WebSocket 数据推送（读 b 触发源=记录上下文变化）。
- 不做 API 数据源组件类型（componentType）编辑弹窗渲染（既有设计已排除）。
- 不改造已有 DataPicker/LookupPicker 为容器方案（保持兼容，后续可平滑迁移）。

## Decisions

### D1: FORM 容器组件注册（vendor 扩展）

仿照 `frontend/src/vendor/config/rule/subForm.js` 新增 `formContainer.js`：

```js
// 伪代码骨架
export default {
  menu: 'subform',
  label: '数据表单容器',
  name: 'formContainer',
  subForm: 'object',          // 一条记录 = 一个对象
  input: true,
  inside: false,
  drag: true,
  dragBtn: true,
  loadRule(rule) { rule.children = rule.props.rule || []; rule.type = 'FcRow'; delete rule.props.rule; },
  parseRule(rule) { rule.props.rule = rule.children; rule.type = 'formContainer'; delete rule.children; },
  rule({t}) { return { type: 'fcRow', field: uniqueId(), title: '数据表单容器', props: { dataSourceId: '', recordLocator: { type: 'current-record' } }, children: [] }; },
  props(_, {t}) { /* 属性面板：dataSourceId 下拉（全局数据源）+ recordLocator 配置 */ }
}
```

**rationale**：与现有 subForm/group 同构，设计器原生支持拖入子组件与序列化；`subForm: 'object'` 语义=容器值是一个对象（一条记录），子字段挂容器 field 下，天然命名空间隔离。

### D2: 字段命名空间（平铺）

- 容器自身 field 全局唯一（`uniqueId()` 生成，如 `fc_xxx`）。
- 容器内子组件 field = 数据源列 key（如 `name`、`amount`），**不加前缀**。
- 数据模型：`{ fc_xxx: { name: '张三', amount: 100, items: [...] } }`。
- 设计器属性面板"绑定字段"下拉复用 `FieldInput.getFieldList()` 的容器作用域字段列表（vendor 原生行为，向上遍历找最近 subForm 容器）。

**rationale**：平铺使提交/回显按列 key 对齐，metadata 校验字段是否存在直观；容器 field 唯一即保证全局不冲突。

### D3: 渲染层数据源绑定引擎

新增 `frontend/src/views/form/components/DsBindingEngine.ts`（组合式函数，FormRenderer 与 PageRendererPage 共用）：

```ts
interface RecordContext { dataSourceId: string; recordId: string | (() => string | undefined) }

// 引擎职责
useDsBindingEngine(ruleTree, formApi, bus) {
  // 1. 扫描 ruleTree 找 formContainer 节点，收集容器绑定配置（dataSourceId + recordLocator）
  // 2. 读：订阅 bus 'record-change' → 解析 recordId → dataSourceApi.getData(dsId, recordId)
  //        → 按容器 children 的 field 映射 setValue（含子表 items 数组赋值）
  // 3. 写：订阅 formApi 'change'（组件值变化）→ 防抖 300ms
  //        → 收集容器内字段 → dataSourceApi.updateData(dsId, recordId, patch, version)
  // 4. 容器内嵌套 group：patch 中 items 以数组整体提交
}
```

**读路径**：
- `record-change` 触发源：页面树点击/路由参数/动作链 `set-filter`（L4）、容器 `recordLocator` 求值变化。
- 加载时 `v-loading` 容器级，避免整表闪烁。

**写路径**：
- 防抖 300ms；乐观锁：`updateData` 带 version，冲突时后端 400 → 提示"数据已被修改，请刷新"并 `reload-record`。
- 只读数据源（WORKFLOW/SYSTEM）：容器自动隐藏写动作，仅回显（复用 `DataSourceMetadata.writable`）。

### D4: 统一联动模型（事件总线）

新增 `frontend/src/views/form/components/DsActionBus.ts`：

```ts
interface DsAction { trigger: 'field-change' | 'record-change' | 'data-source-change'
                     steps: { op: 'set-filter' | 'refresh' | 'reload-record' | 'set-value' | 'save-record'
                             target: string  // 目标容器 field 或数据源 id
                             field?: string; value?: string /* 模板变量 */ }[] }
```

- 模板变量解析器 `resolveTemplate(str, ctx)`：`{node.id}` `{row.xxx}` `{field.xxx}` `{record.xxx}` `{param.xxx}`。
- 动作执行统一走 `dataSourceApi`（queryData/getData/updateData）。
- 表单场景联动配置存于表单 schema（`schema.links` 或容器 props），页面场景复用现有 `schema.actions`（PageDesigner 动作总线原样保留，仅泛化触发器类型）。
- **L3 组件→组件联动不重复造**：显隐/计算/选项过滤继续用 form-create control + 事件脚本；本总线只处理"涉及数据源"的联动。

**rationale**：复用并泛化 PageDesigner 已验证的动作总线模型，避免新造机制；模板变量系统统一 L1/L2/L4 的上下文传递。

### D5: 三端接入

| 端 | 接入方式 | 读写 |
|---|---|---|
| 业务表单（FormRenderer） | 容器渲染 + 引擎挂载；打开时按记录 ID 回显，提交/实时写 | 读 + 写 |
| 工作流表单（FormRenderer 同） | 容器只读回显（`writable=false` 自动隐藏写） | 只读 |
| 页面（PageRendererPage） | 容器作为页面组件注册；读 b 由动作总线 `record-change` 驱动 | 读 + 写（按动作） |

**rationale**：三端共用 FormRenderer 渲染 + 引擎，实现"统一取数方式"目标，差异仅在 recordLocator 与 writable 配置。

## Risks / Trade-offs

- **[实时写冲突]** 多端同时编辑同记录 → 乐观锁 version 冲突 400 → 提示 + 强制 `reload-record` 刷新，不覆盖写。
- **[防抖丢失]** 300ms 内值变化频繁（如数字输入）→ 防抖合并，提交前 flush 一次；表单提交（save-record）前强制同步等待写完成。
- **[N 次请求]** 多容器实时刷新并发 N 次 getData → 容器级加载 + 请求合并（同 recordId 去重），或按需（容器可见才加载）。
- **[容器滥用]** 配置面扩大、配错风险 → 设计器 metadata 校验字段存在性（`getMetadata` 列比对），非法字段标红。
- **[只读误写]** 工作流表单误配写 → 后端 SPI default 抛"该数据源不支持XX"400 + 前端 writable 预检双保险。
- **[schema 兼容]** 存量表单无 formContainer → 引擎扫描空集合即跳过，零迁移成本；`parseRule/loadRule` 往返保证 rule 可序列化。

## Migration Plan

1. **前端 vendor**：新增 `formContainer.js` 规则配置 + 注册到 `frontend/src/vendor/config/index.js`（照 subForm 方式）。
2. **前端引擎**：新增 `DsBindingEngine.ts` + `DsActionBus.ts` + 模板变量解析器；FormRenderer 挂载引擎（无容器则 no-op）。
3. **前端设计器**：FormDesigner 属性面板支持容器数据源下拉（复用 PageDesigner 的 `setComponentRuleConfig` 注入模式）+ recordLocator 配置 UI。
4. **页面端**：PageRendererPage 注册容器组件 + 引擎；动作总线泛化触发器（`field-change`）。
5. **测试**：组件测试（引擎读/写/防抖/乐观锁冲突）、容器渲染（含嵌套 group）、字段命名空间、联动总线；E2E 业务表单编辑回显 + 左树右表联动。
6. **回滚**：纯前端增量，容器组件未使用即无影响；引擎 no-op 兜底，可整体回退 vendor 与引擎文件。

## Open Questions

1. 实时写与表单整体提交（业务表单保存）的优先级与合并策略——引擎 flush 时机待实现时定。
2. 联动总线的表单场景配置 UI 形态（属性面板内嵌 vs 独立弹窗）——实现时按 PageDesigner 弹窗模式对齐。
3. recordLocator 的上下文变量来源（页面路由参数、动作链传递）统一命名与解析——实现时定。
