# VTJ.PRO 替换 form-create 实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 用 VTJ.PRO 完全替换 form-create，实现流程表单在线设计器和 CRUD 页面设计时出码。

**Architecture:** VTJ 设计器嵌入前端应用，流程表单在线设计产出 DSL JSON 存后端 FormDefinition.schema，运行时用 @vtj/renderer 渲染。CRUD 页面通过 VTJ 设计器搭建后出码 Vue SFC 编译进产物。字段权限通过 XField 原生 props（disabled/visible）实现。

**Tech Stack:** Vue 3 + TypeScript + Vite + VTJ.PRO（@vtj/pro, @vtj/web, @vtj/renderer, @vtj/cli, @vtj/ui）+ Element Plus + Spring Boot

---

## Task 1: VTJ.PRO 基础设施集成

- [ ] **Step 1:** 在 frontend/ 目录执行 `npm install @vtj/pro @vtj/web @vtj/renderer @vtj/cli @vtj/ui @vtj/utils @vtj/icons`
- [ ] **Step 2:** 改造 vite.config.ts，import createDevTools from '@vtj/cli/vite'，添加到 plugins 数组
- [ ] **Step 3:** 改造 main.ts，使用 createProvider() 替代 createApp()，保留 router 和 Element Plus 集成
- [ ] **Step 4:** 执行 `npm uninstall @form-create/element-ui @form-create/designer` 移除旧依赖
- [ ] **Step 5:** 启动开发服务器验证 VTJ 设计器入口（右下角编辑图标）可用

## Task 2: 流程表单设计器替换

- [ ] **Step 1:** 改造 FormDesigner.vue，移除 FcDesigner 导入，引入 VTJ 设计器组件
- [ ] **Step 2:** 实现设计器加载逻辑：onMounted 时调用 formApi.getFormDefinition(id) 获取 DSL JSON，传入 VTJ 设计器
- [ ] **Step 3:** 实现设计器保存逻辑：保存按钮点击时从 VTJ 设计器导出 DSL JSON，调用 formApi.updateFormDefinition(id, { schema: dslJson })
- [ ] **Step 4:** 验证用户能拖拽 XForm/XField 搭建表单、配置字段属性、保存到后端

## Task 3: 流程表单渲染器替换

- [ ] **Step 1:** 改造 FormRenderer.vue，移除 formCreate 导入，引入 @vtj/renderer 的 Renderer 组件
- [ ] **Step 2:** 实现 loadSchema()：获取 FormDefinition.schema 解析为 VTJ DSL 对象
- [ ] **Step 3:** 实现 loadData()：通过 processInstanceId 获取已保存表单数据，填充到 renderer 的 state
- [ ] **Step 4:** 实现 submit()：从 renderer 获取表单数据，调用 formApi 保存/更新
- [ ] **Step 5:** 实现 getFormData()：从 renderer state 获取当前表单数据返回
- [ ] **Step 6:** 验证流程表单渲染、填写、提交完整链路

## Task 4: 字段权限适配

- [ ] **Step 1:** 改造 applyPermissions() 函数：递归遍历 VTJ DSL 节点树，匹配 XField 组件名的节点
- [ ] **Step 2:** 对匹配到的 XField 节点，根据 fieldPermissions 设置 props.disabled（VIEW）和 props.visible（HIDDEN）
- [ ] **Step 3:** 改造 FormPropertyTab.vue 的 loadFormFields()：遍历 DSL 节点树，提取 XField 的 name 和 label
- [ ] **Step 4:** 验证 EDIT/VIEW/HIDDEN 三种权限在 renderer 渲染时正确生效

## Task 5: 自定义组件适配

- [ ] **Step 1:** 改造 LookupPicker.vue：移除 formCreateInject 注入逻辑，移除 api.setValue 调用
- [ ] **Step 2:** LookupPicker 的 returnFields 回填改为通过 emit('returnFields', { field, value }) 事件通知父组件
- [ ] **Step 3:** 在 VTJ 设计器中验证 LookupPicker 可作为 XField editor 使用
- [ ] **Step 4:** 在 renderer 中验证 LookupPicker 的 v-model 双向绑定和 returnFields 回填正常

## Task 6: CRUD 页面重建

- [ ] **Step 1:** 用 VTJ 设计器搭建用户管理页面（搜索栏+表格+弹窗表单），出码替换 UserPage.vue
- [ ] **Step 2:** 用 VTJ 设计器搭建角色管理页面，出码替换 RolePage.vue
- [ ] **Step 3:** 用 VTJ 设计器搭建组织管理页面，出码替换 OrgPage.vue
- [ ] **Step 4:** 用 VTJ 设计器搭建菜单管理页面，出码替换 MenuPage.vue
- [ ] **Step 5:** 用 VTJ 设计器搭建字典管理页面，出码替换 DictPage.vue
- [ ] **Step 6:** 逐个验证 CRUD 页面的搜索、新增、编辑、删除功能

## Task 7: 清理废弃代码

- [ ] **Step 1:** 删除 SearchTable.vue
- [ ] **Step 2:** 删除 DataSourcePanel.vue
- [ ] **Step 3:** 清理 types.ts 中的 form-create Rule 类型定义和导入
- [ ] **Step 4:** 清理 router/index.ts 中 form-create 相关配置
- [ ] **Step 5:** 更新测试文件，移除 form-create 测试，新增 VTJ renderer 测试
- [ ] **Step 6:** 全局搜索 formCreate / @form-create / form-create 确认无残留引用

## Task 8: 集成验证

- [ ] **Step 1:** 执行 `npm run build` 验证编译构建无错误
- [ ] **Step 2:** 验证所有页面路由可正常访问
- [ ] **Step 3:** 验证流程表单设计→发布→渲染→填写→提交完整链路
- [ ] **Step 4:** 验证 BPMN 设计器字段权限配置→流程审批权限生效完整链路
- [ ] **Step 5:** 验证 5 个 CRUD 页面完整 CRUD 操作
- [ ] **Step 6:** 验证 package.json 中无 form-create 相关依赖
