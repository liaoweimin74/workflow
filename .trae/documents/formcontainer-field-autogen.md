# 数据容器「按字段生成组件」功能计划

## Context

页面设计器与表单设计器中的「数据容器」（formContainer）目前只能在配置弹窗里选择数据源和按钮，容器内的子组件需要手动逐个拖入。用户希望：

1. 数据容器绑定数据源的配置界面显示所选数据源的字段列表
2. 勾选字段后自动在容器内生成与字段英文名（key）对应的表单组件
3. 容器内已存在同名字段时不重复生成
4. 勾选时明确标识字段是否已存在于容器，已存在的禁选

## 现状（已验证）

* 两个设计器**共用** [DsBindingConfigDialog.vue](d:/aicode/workflow_zai/workflow_lowcode/frontend/src/views/form/components/DsBindingConfigDialog.vue) 的容器模式（非 list 模式，template L202-256 的 `v-else` 分支）：

  * 表单设计器：L87-93 挂载，属性面板按钮注入见 `registerFormContainerProps`（L663-688），确认走 `handleContainerConfirm`（L926-930，直接 `Object.assign(activeRule.props, newProps)`）

  * 页面设计器：L112-113 挂载，`handleFormContainerConfirm`（L656-662，同样模式），`isContainerRule` 判定 L646-648

* 容器模式下 `dsColumns`（数据源字段 `ColumnConfigItem[]`）**已被加载**：`loadDsColumns()`（L406-414，`dataSourceApi.getMetadata(binding.refId)`）在打开弹窗（watch L564）和切换数据源（L416-423）时都会调用，只是容器模式 UI 未展示

* 字段类型 → 组件映射已存在：[useDataSourceCrud.ts](d:/aicode/workflow_zai/workflow_lowcode/frontend/src/composables/useDataSourceCrud.ts) 的 `inputTypeOf`（L34-38）+ `buildFormRule`（L53-61）：INT/DECIMAL 族→inputNumber（DECIMAL 带 precision）、DATE/DATETIME→datePicker、其余→input，required→validate

* 设计态容器子组件保存在画布 rule 的 `children`（vendor loadRule 把 `props.rule` 转为 children、type 转 FcRow；保存时 parseRule 写回 `props.rule`，见 [formContainer.js](d:/aicode/workflow_zai/workflow_lowcode/frontend/src/vendor/config/rule/formContainer.js) L19-28）

* 字段遍历工具：[formRuleWalk.ts](d:/aicode/workflow_zai/workflow_lowcode/frontend/src/views/form/formRuleWalk.ts) 的 `collectFieldKeys`（穿透布局容器 children 收集 field）

## 实施方案

### 1. 共享辅助：字段 rule 生成（useDataSourceCrud.ts）

在 [useDataSourceCrud.ts](d:/aicode/workflow_zai/workflow_lowcode/frontend/src/composables/useDataSourceCrud.ts) 导出独立函数：

```ts
export function buildFieldRule(col: { key: string; label?: string; columnType?: string; required?: boolean; scale?: number }): Record<string, any>
```

产物与 `buildFormRule` 单列一致（type/field/title/props/validate），并让 `buildFormRule` 内部复用它。两个设计器共用此映射，保证与数据表格运行时编辑弹窗的字段组件形态一致。

### 2. 弹窗：字段勾选区（DsBindingConfigDialog.vue 容器模式分支）

在容器模式 `v-else` 分支（数据源 select 之后、按钮配置之前）新增「按字段生成组件」区块：

* 新增 prop `containerFields?: string[]`（父组件传入：容器内已存在的字段 key 集合）；list 模式不受影响（区块只在 v-else 分支渲染）

* 复用已加载的 `dsColumns` 渲染勾选列表，每行显示：`label（key）` + 类型标签（columnType）

* `containerFields` 包含的 key：checkbox 禁用 + 追加「已存在」标签（el-tag）

* 新增状态 `genSelectedKeys: string[]`，打开弹窗时清空（现有 watch L546 处补一行）

* `handleConfirm` 容器分支（L639-647）：`result.generateColumns = dsColumns 中被勾选且未禁用的列`，随 confirm 事件输出；无勾选时不输出该键

* 边界：`dsColumns` 为空显示「该数据源暂无字段」占位；未选数据源时区块隐藏

### 3. 表单设计器接线（FormDesigner.vue）

* `handleContainerConfirm`（L926-930）扩展：

  1. 从 `newProps` 中取出 `generateColumns` 并 delete，其余照旧合并到 `active.props`
  2. 若有 generateColumns：`buildFieldRule` 生成 rule 数组，过滤掉 field 已存在于容器子树的，追加进画布 `activeRule.children`（`active.children = [...(active.children||[]), ...rules]`）
  3. 提示「已生成 N 个字段组件 / 跳过 M 个已存在」

* 新增 computed `containerFieldKeys`：取 `designerRef.value?.activeRule`（formContainer/FcRow 时），对子树收集 field —— 优先复用 `collectFieldKeys`（传入容器 children 数组），若其签名不适用于子树则写一个约 15 行的本地递归收集器（穿透 row/col/tabs 等布局 children）

* 容器弹窗（L87-93）传入 `:container-fields="containerFieldKeys"`

### 4. 页面设计器接线（PageDesigner.vue）

与步骤 3 完全同构：

* `handleFormContainerConfirm`（L656-662）扩展同样的生成逻辑（`isContainerRule` 已有）

* 新增 computed `containerFieldKeys`（复用/同款收集器）

* 容器弹窗（L112-113）传入 `:container-fields="containerFieldKeys"`

> 两设计器的生成追加逻辑相同（约 15 行），抽到共享辅助（与 buildFieldRule 同处导出，如 `appendGeneratedRules(activeRule, columns): {added, skipped}`）避免双份维护。

### 5. 持久化说明（无需改代码）

设计器保存时 vendor `parseRule` 自动把 children 写回 `props.rule`，运行时 `normalizeForRender` 再转回 children 渲染 —— 生成组件随现有保存/渲染管线生效，运行时 PageDataForm/FormRenderer 无需改动。

## 关键文件

| 文件                                                  | 改动                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| src/composables/useDataSourceCrud.ts                | 导出 `buildFieldRule` + `appendGeneratedRules`；buildFormRule 复用        |
| src/views/form/components/DsBindingConfigDialog.vue | 容器模式新增字段勾选区 + `containerFields` prop + confirm 输出 `generateColumns`  |
| src/views/form/FormDesigner.vue                     | `handleContainerConfirm` 扩展 + `containerFieldKeys` computed + 传 prop |
| src/views/page/PageDesigner.vue                     | 同上（handleFormContainerConfirm）                                       |

## 验证

1. `npx vue-tsc --noEmit`（存量错误之外无新增）
2. 浏览器手工验证（表单设计器）：

   * 拖入数据容器 → 属性面板「配置数据源」→ 选择已绑定的页面数据源 → 字段列表出现，已存在于容器的字段禁选并标「已存在」

   * 勾选 2 个字段 → 确定 → 画布容器内出现对应组件（field=key、标题=label、类型映射正确）

   * 重新打开弹窗 → 刚生成的字段变为「已存在」禁选

   * 保存表单 → JSON 中容器 `props.rule` 包含生成的子 rule；重新进入设计器回显正常
3. 页面设计器重复步骤 2；发布页面后通过 page-form 渲染验证生成的组件可正常录入提交
4. 回归：数据表格/卡片列表的 list 模式弹窗不受影响（确认 generateColumns 不出现在其 confirm 结果中）

