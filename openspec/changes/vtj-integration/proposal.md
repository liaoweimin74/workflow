# Proposal: VTJ.PRO 替换 form-create

## Why

form-create 商用版价格过高，开源版功能欠缺。VTJ.PRO 是 MIT 协议开源低代码引擎，支持设计器-渲染器分离、DSL 双向编译、全页面可视化搭建。当前系统无已上线流程表单数据，替换窗口期最佳。

## What Changes

**表单设计器**
- From: 使用 @form-create/designer (FcDesigner) 嵌入 FormDesigner.vue，输出 form-create rule JSON
- To: 使用 VTJ.PRO 设计器嵌入，输出 VTJ DSL JSON
- Reason: form-create 开源版功能不足，商用版成本高
- Impact: breaking — 设计器 UI 和产物格式完全变更

**表单渲染器**
- From: FormRenderer.vue 使用 `<form-create>` 标签按 rule JSON 渲染
- To: FormRenderer.vue 使用 @vtj/renderer 按 DSL 渲染
- Reason: 配合设计器更换，统一渲染引擎
- Impact: breaking — 渲染器组件和 schema 格式变更

**字段权限**
- From: applyPermissions() 遍历 form-create rule 数组，设置 disabled/display 属性
- To: 遍历 DSL 节点树，设置 XField 的 disabled/visible props
- Reason: 渲染器更换，权限注入方式适配
- Impact: non-breaking — 字段权限功能和 API 不变，仅实现方式改变

**CRUD 页面**
- From: 5 个系统管理页面手写代码 + SearchTable.vue + form-create Rule[] 硬编码弹窗表单
- To: VTJ 设计器搭建页面，出码 Vue SFC，SearchTable.vue 废弃
- Reason: 全页面可视化搭建，统一使用 VTJ 体系
- Impact: breaking — 5 个页面代码完全重写

**自定义组件**
- From: LookupPicker 通过 formCreate.component() 全局注册，依赖 formCreateInject 注入
- To: LookupPicker 通过 XField editor prop 或 #editor 插槽接入，依赖 v-model 双向绑定
- Reason: 移除 form-create 依赖
- Impact: breaking — LookupPicker 接入方式变更

**后端存储**
- From: FormDefinition.schema 存 form-create rule JSON 字符串
- To: FormDefinition.schema 存 VTJ DSL JSON 字符串
- Reason: 配合设计器更换
- Impact: non-breaking — 表结构不变，仅存储内容格式变更

**前端依赖**
- From: @form-create/element-ui, @form-create/designer
- To: @vtj/pro, @vtj/web, @vtj/renderer, @vtj/cli, @vtj/ui, @vtj/utils, @vtj/icons
- Reason: 核心替换
- Impact: breaking — 依赖完全更换

## Capabilities

### New Capabilities
- `vtj-designer-integration`: VTJ.PRO 设计器嵌入前端应用，改造 vite.config.ts 和 main.ts，支持在线表单设计
- `vtj-page-scaffold`: CRUD 页面通过 VTJ 设计器搭建并出码 Vue SFC

### Modified Capabilities
- `form-designer`: 设计器从 form-create FcDesigner 更换为 VTJ 设计器，产物从 rule JSON 改为 DSL JSON
- `form-runtime`: 渲染器从 form-create 更换为 @vtj/renderer，字段权限注入方式适配 XField props
- `custom-form-components`: 自定义组件接入方式从 formCreate.component() 改为 XField editor
- `crud-form-binding`: CRUD 页面从 SearchTable + Rule[] 改为 VTJ 出码 SFC
- `form-definition`: schema 字段存储格式从 form-create rule JSON 改为 VTJ DSL JSON

## Impact

**前端代码**：
- 改造：main.ts, vite.config.ts, FormDesigner.vue, FormRenderer.vue, FormPropertyTab.vue, LookupPicker.vue, types.ts, router/index.ts
- 重写：UserPage.vue, RolePage.vue, OrgPage.vue, MenuPage.vue, DictPage.vue, FormListPage.vue
- 废弃：SearchTable.vue, DataSourcePanel.vue, FormPageLayout.vue
- 更新：3 个测试文件

**后端代码**：无改动（表结构和 API 不变）

**依赖变更**：
- 移除：@form-create/element-ui, @form-create/designer
- 新增：@vtj/pro, @vtj/web, @vtj/renderer, @vtj/cli, @vtj/ui, @vtj/utils, @vtj/icons

**构建配置**：vite.config.ts 新增 createDevTools() 插件
