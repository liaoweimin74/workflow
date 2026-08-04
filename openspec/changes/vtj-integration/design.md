# Design: VTJ.PRO 替换 form-create

## Context

当前系统使用 form-create（@form-create/element-ui + @form-create/designer）作为表单设计器和渲染器。form-create 商用版价格过高，开源版功能欠缺。决定用 VTJ.PRO（MIT 协议开源低代码引擎）替换。

当前 form-create 影响面：
- **前端 18 个文件**：main.ts 全局注册、FormDesigner.vue 设计器、FormRenderer.vue 渲染器、SearchTable.vue CRUD 组件、5 个系统管理页面（User/Role/Org/Menu/Dict）、LookupPicker.vue 自定义组件、FormPropertyTab.vue 流程字段权限配置、types.ts 类型定义、3 个测试文件
- **后端 14 个文件**：FormDefinition/FormData 实体、Service/Controller/Repository/DTO

## Goals / Non-Goals

**Goals:**
- 完全移除 form-create 依赖（@form-create/element-ui 和 @form-create/designer）
- 引入 VTJ.PRO 作为可视化设计引擎
- 流程表单：在线设计器 + DSL 存储 + renderer 运行时渲染
- CRUD 页面：设计时出码 Vue SFC
- 字段权限（EDIT/VIEW/HIDDEN）通过 XField 原生 props 实现
- 自定义业务组件（LookupPicker）通过 XField editor 接入
- 后端 FormDefinition 表结构不变，schema 字段从 rule JSON 改为 DSL JSON

**Non-Goals:**
- 不迁移历史表单数据（系统无已上线流程表单数据）
- 不使用 VTJ Access 替换现有登录认证体系
- 不实现 VTJ RemoteService 对接后端（在线设计器通过自定义 API 存取 DSL）
- 不做 form-create rule → VTJ DSL 的 schema 转换器

## Decisions

### D1: VTJ 集成方式 — 现有项目集成

安装 @vtj/pro + @vtj/web + @vtj/cli 到 frontend/，改造 vite.config.ts 和 main.ts。

**vite.config.ts 改造**：
```typescript
import { createDevTools } from '@vtj/cli/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    createDevTools()
  ],
  // ...
})
```

**main.ts 改造**：
```typescript
import { createProvider } from '@vtj/web'
import { createApp } from 'vue'

const { app, router } = await createProvider({
  // VTJ 配置
})
app.mount('#app')
```

### D2: 流程表单设计器 — VTJ 设计器嵌入

替换 `FormDesigner.vue`，从 `<fc-designer>` 改为 VTJ 设计器组件。

**设计器职责**：
- 用户拖拽 XForm/XField 组件搭建表单
- 配置字段属性（label、name、editor 类型、校验规则）
- 配置数据源（fetch 远程选项数据）
- 保存时导出 DSL JSON，通过 API 存入后端 FormDefinition.schema

**与后端 API 交互**：
- 加载：`GET /api/form-definitions/{id}` → 返回 schema（DSL JSON）→ 设计器加载 DSL
- 保存：设计器导出 DSL → `PUT /api/form-definitions/{id}` → 后端存 schema 字段

### D3: 流程表单渲染器 — @vtj/renderer

替换 `FormRenderer.vue`，从 `<form-create>` 改为 `@vtj/renderer`。

```vue
<template>
  <div class="form-renderer" v-loading="loading">
    <Renderer v-if="dsl" :dsl="dsl" :components="components" :state="state" />
    <el-empty v-else-if="!loading" description="暂无表单" />
  </div>
</template>
```

**字段权限注入**：
- `fieldPermissions` 作为 renderer 的 state 传入
- DSL 节点中 XField 的 `disabled` 和 `visible` 绑定到 state 中的权限值
- renderer 渲染时自动求值，控制字段状态

**字段权限与 DSL 节点绑定**：
- 渲染前遍历 DSL 节点树，找到所有 XField 节点
- 从 XField 的 `name` prop 提取字段标识
- 根据 fieldPermissions 设置 XField 的 `disabled`（VIEW）和 `visible`（HIDDEN）prop
- 处理后的 DSL 交给 renderer 渲染

### D4: CRUD 页面 — 设计时出码

5 个系统管理页面（User/Role/Org/Menu/Dict）用 VTJ 设计器重新搭建：
- 搜索栏（XQueryForm）
- 数据表格（XGrid）
- 新增/编辑弹窗表单（XDialogForm + XField）
- 删除确认（ElMessageBox）

出码导出 Vue SFC，替换现有手写代码。SearchTable.vue 组件废弃。

### D5: 自定义组件接入 — XField editor

**LookupPicker 作为 XField 自定义 editor**：

方式 1（editor prop 传组件对象）：
```vue
<XField label="字典选择" :editor="LookupPicker" :props="{ dictType: 'user_status' }" v-model="model.status" />
```

方式 2（#editor 插槽）：
```vue
<XField label="字典选择" v-model="model.status">
  <template #editor="{ editor }">
    <LookupPicker v-bind="editor" dict-type="user_status" />
  </template>
</XField>
```

实现时优先用方式 1，更简洁且 DSL 序列化友好。

### D6: FormPropertyTab 字段列表提取

改造 `FormPropertyTab.vue` 的 `loadFormFields` 函数：
- 从后端获取 FormDefinition.schema（VTJ DSL JSON）
- 遍历 DSL 节点树，找所有 XField 节点
- 从 XField 的 `name` prop 提取字段标识，`label` prop 提取显示名
- 返回 `{ field, label }[]`

### D7: LookupPicker 解耦 form-create inject

当前 LookupPicker 依赖 `formCreateInject`（form-create 的 api.setValue 等）。替换后：
- 移除 `formCreateInject` 注入逻辑
- XField 的 v-model 双向绑定天然提供数据同步
- LookupPicker 通过 `v-model` + `props` 与 XField 交互，不需要 form-create API

### D8: 后端无改动

FormDefinition 表结构不变：
- `schema` 字段从存 form-create rule JSON 改为存 VTJ DSL JSON
- 版本管理、发布流程、API 接口不变
- FormData.dataJson 存表单数据 JSON，与渲染器无关，不变

## Risks / Trade-offs

### 风险 1：VTJ 设计器嵌入现有项目的依赖冲突
- **风险**：VTJ 依赖 Element Plus / Axios 等库，可能与现有版本冲突
- **缓解**：VTJ 官方有 RuoYi-Vue3 集成示例，参考其依赖处理方式
- **影响**：中等 — 需要验证依赖兼容性

### 风险 2：VTJ 设计器改造 main.ts 入口
- **风险**：`createProvider()` 是异步初始化，改变 main.ts 启动流程
- **缓解**：参考 VTJ 官方集成文档和 RuoYi-Vue3 示例
- **影响**：中等 — 影响全局启动

### 风险 3：DSL 节点树遍历提取字段列表
- **风险**：VTJ DSL 结构复杂，嵌套层级深时字段提取可能遗漏
- **缓解**：递归遍历所有节点，匹配 XField 组件名
- **影响**：低 — 逻辑简单，可测试覆盖

### 风险 4：VTJ 单人维护
- **风险**：核心由一人维护（chenhuachun），巴士因子低
- **缓解**：MIT 协议，最坏可 fork 自维护；出码功能保证导出的 SFC 不依赖 VTJ 运行时
- **影响**：低 — 有兜底方案

### 风险 5：CRUD 页面出码后的维护
- **风险**：出码后的 SFC 是静态代码，修改需要重新出码或在代码中直接改
- **缓解**：VTJ 支持双向编译（DSL ↔ Vue 代码），代码修改后可反向解析回设计器
- **影响**：低 — 双向编译能力覆盖

### Trade-off：XForm vs ElForm
- 选择 XForm：零物料开发成本，原生支持权限控制，但增加 @vtj/ui 依赖
- 放弃 ElForm：需要自行开发 VTJ 物料，工作量大
- **取舍**：XForm 更适合在线设计器场景（用户拖拽），ElForm 更适合纯代码场景
