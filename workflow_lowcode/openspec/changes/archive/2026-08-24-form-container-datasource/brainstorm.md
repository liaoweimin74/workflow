# Design Summary

用户提出：工作流表单、业务表单、系统结构、API 已接入统一数据源，希望表单设计与页面设计的所有组件增加"数据源属性"，使组件可绑定数据源，业务表单/工作流表单/页面统一取数方式。

经 brainstorm 确认，最终设计采用 **FORM 容器组件方案**：新增一个可绑定数据源的 FORM 容器组件，基础组件拖入容器内继承其数据源上下文，一个表单可含多个 FORM 容器（各自绑定不同数据源）。相比"所有组件各自加数据源属性"，容器方案配置面小、语义清晰（FORM 容器 = 一条记录）、天然解决多数据源字段冲突（容器即命名空间）。

## 关键验证结论

1. **form-create 容器机制现成**：vendor 已有 `subForm.js`（`subForm: 'object'`）与 `group.js`（`subForm: 'array'`）两个容器先例，`loadRule/parseRule` 实现 `children ↔ props.rule` 互转，子组件拖入容器 + 序列化存储是设计器原生能力。FORM 容器只需照此注册 + 增加数据源绑定属性。
2. **平铺方案同名字段不冲突**：form-create 子表单机制（`core/src/handler/input.js` 的 `subRuleData[group.id]`）为每个容器建立独立子数据对象；`FieldInput.vue` 的 `getFieldList()` 向上遍历找最近 subForm 容器取容器作用域字段列表。数据模型为 `{ formA: { name, amount }, formB: { name, amount } }`，容器自身 field 唯一即可，容器内字段可重名。**子组件字段 = 数据源列 key，无需前缀**。
3. **容器可嵌套子表单**：`@form-create/component-subform`（fcSubForm）本身渲染独立 `<form-create>` 实例（`const Type = this.form; return <Type rule={this.rule} .../>`），rule 数组内放任何组件（含另一子表单容器）均可渲染。FORM 容器（object）内嵌 group（array）数据模型天然支持。
4. **数据联动四层**：L1 数据源→组件（读回显）、L2 组件→数据源（写保存）由绑定引擎内建；L3 组件→组件（显隐/计算/选项过滤）复用 form-create control/事件脚本/DataPicker 级联；L4 组件→数据源→组件将 PageDesigner 现有动作总线（`trigger → steps → target`）泛化到表单场景。

# Alternatives Considered

### 方案 A：渲染层"数据源绑定引擎"（原方案，被容器方案取代）
- **做法**：不动 form-create 核心，在渲染层（FormRenderer/PageRendererPage 共用）加绑定引擎；组件 rule 增加可选 `dataSourceField`，不配则继承表单级数据源；读：记录上下文变化 → `getData` → 填充；写：组件值变化防抖 → `updateData`。
- **優點**：组件侵入小（只加一个字段属性）；三端共用一套引擎；后端复用现成 SPI。
- **缺點**：每个组件都要配置数据源相关属性（N 次重复）；多数据源场景配置繁琐易错；"当前记录"语义在组件级重复表达。
- **為何未採纳**：用户提出 FORM 容器方案后对比，容器方案将"组件级重复配置"收敛为"容器级一次配置"，语义更清晰，且天然解决多数据源字段命名冲突。

### 方案 B：组件级自治
- **做法**：每个组件内部自己实现数据源加载/保存（类似现有 DataPicker/LookupPicker 各自为政）。
- **優點**：组件独立性强。
- **缺點**：N 个组件 N 套实现，代码重复、行为不一致；三端要各自适配；与"统一取数"目标背道而驰。
- **為何未採纳**：与统一取数目标直接冲突。

### 方案 C：后端"记录上下文服务" + 前端薄客户端
- **做法**：后端新增 record-context 解析（按业务表单 ID/流程实例 ID/页面参数解析当前记录），前端只声明绑定字段。
- **優點**：后端集中处理记录定位，多端一致。
- **缺點**：现有 SPI 的 `get(id)` 已够用；"记录定位"本质是前端上下文问题（树点击/路由变化在前端发生），后端抽象反而引入跨端同步复杂度，属过度设计。
- **為何未採纳**：过度设计，现有 SPI 已满足。

### 方案 D：FORM 容器组件（采纳）
- **做法**：新增 FORM 容器组件（`subForm: 'object'` 语义），属性含 `dataSourceId`（绑定全局数据源）+ `recordLocator`（记录定位：当前表单记录/上下文变量）；基础组件拖入容器，子组件 field = 数据源列 key（平铺）；容器自身 field 全局唯一。渲染层绑定引擎按容器加载/写回；一个表单可含多个 FORM 容器。
- **優點**：数据源在容器配一次，子组件继承；一个表单多个容器 = 天然多数据源区域；语义清晰（FORM 容器 = 一条记录）；基础组件基本不动；可复用为页面"表单区"组件；命名空间问题从"全局唯一"降维为"容器内唯一"。
- **缺點**：需注册新容器组件 + 绑定引擎；实时写（防抖/乐观锁）有工程复杂度；"当前记录"语义在三端不一致（业务表单=记录ID、工作流=流程实例关联记录只读、页面=上下文变量）。

# Agreed Approach

**FORM 容器组件 + 渲染层数据源绑定引擎 + 统一联动模型**，分层实施：

1. **第一层（容器注册）**：仿照 vendor `subForm.js` 注册 FORM 容器组件（`subForm: 'object'`），属性面板增加 `dataSourceId`（全局数据源下拉，来自 `getEnabledDataSources`）+ `recordLocator`（记录定位）。子组件拖入容器，field 平铺 = 数据源列 key，容器内可嵌套 group 子表单（object 套 array）。
2. **第二层（绑定引擎）**：渲染层（FormRenderer/PageRendererPage 共用）维护引擎——读：记录上下文变化（树点击/路由参数/动作链）→ `getData(dsId, recordId)` → 按字段映射填充容器内组件；写：组件值变化防抖（300ms）→ 收集容器绑定字段 → `updateData(dsId, recordId, patch)`（乐观锁 version）。
3. **第三层（统一联动模型）**：事件总线 + 模板变量 + 动作链，贯穿四层联动：
   - 触发器：`field-change`（组件值变化）、`record-change`（记录上下文变化）、`data-source-change`
   - 动作：`set-filter`（目标数据源加查询参数）、`refresh`（重取数）、`reload-record`（重载当前记录回显）、`set-value`（设置组件值）、`save-record`（写回）
   - 模板变量：`{node.id}`、`{row.xxx}`、`{field.xxx}`、`{record.xxx}`、`{param.xxx}`
4. **三端接入**：业务表单（读写）、工作流表单（仅只读回显，WORKFLOW 数据源只读）、页面（读 b 由动作总线驱动）。工作流表单写路径后续再议。

# Key Decisions

| 决策点 | 结论 |
|---|---|
| 绑定载体 | FORM 容器组件（`subForm: 'object'`），而非所有组件加属性 |
| 记录定位 | 按当前表单记录（业务表单编辑时用当前记录 ID 回显/保存） |
| 配置粒度 | 混合：容器持有数据源，子组件继承；容器外组件可独立配置 |
| 字段命名 | 平铺：子组件 field = 数据源列 key，容器 field 全局唯一，容器即命名空间 |
| 读写时机 | B+B：读——记录上下文变化实时刷新（触发源=记录上下文变化，不引入轮询/WebSocket）；写——组件值变化防抖实时写 |
| 嵌套能力 | 容器内可嵌套 group 子表单（object 套 array，form-create 原生支持） |
| 联动实现 | 统一事件总线 + 模板变量 + 动作链（泛化 PageDesigner 动作总线到表单场景） |
| 后端改动 | 极小：复用现成 DataSourceAdapter SPI（metadata/query/get/create/update/delete），仅前端为主 |

# Open Questions

1. 实时写的防抖策略与乐观锁冲突处理细节（version 冲突时提示/重试策略）——实现时细化
2. 工作流表单写路径（当前 WORKFLOW 数据源只读）——第一版不做，后续再议
3. 联动动作总线的可视化配置 UI 形态（表单场景 vs 页面场景）——实现时设计
