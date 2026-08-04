# Tasks: VTJ.PRO 替换 form-create

## 1. VTJ.PRO 基础设施集成

- [ ] 1.1 安装 VTJ.PRO 依赖包（@vtj/pro, @vtj/web, @vtj/renderer, @vtj/cli, @vtj/ui, @vtj/utils, @vtj/icons）
- [ ] 1.2 改造 vite.config.ts，添加 createDevTools() Vite 插件
- [ ] 1.3 改造 main.ts，使用 createProvider() 初始化 VTJ 引擎，移除 formCreate 注册
- [ ] 1.4 移除 @form-create/element-ui 和 @form-create/designer 依赖
- [ ] 1.5 验证项目能正常启动，VTJ 设计器入口可用

## 2. 流程表单设计器替换

- [ ] 2.1 改造 FormDesigner.vue，将 FcDesigner 替换为 VTJ 设计器组件
- [ ] 2.2 实现设计器加载逻辑：从后端 GET /api/v1/form-definitions/{id} 获取 DSL JSON 并加载到设计器
- [ ] 2.3 实现设计器保存逻辑：设计器导出 DSL JSON，调用 PUT /api/v1/form-definitions/{id} 存储
- [ ] 2.4 验证用户能拖拽 XForm/XField 组件搭建表单并保存到后端

## 3. 流程表单渲染器替换

- [ ] 3.1 改造 FormRenderer.vue，将 `<form-create>` 替换为 `@vtj/renderer` 的 Renderer 组件
- [ ] 3.2 实现 DSL 加载逻辑：从后端获取 FormDefinition.schema 解析为 VTJ DSL
- [ ] 3.3 实现表单数据加载逻辑：通过 processInstanceId 从后端加载已保存的表单数据
- [ ] 3.4 实现表单数据提交逻辑：保存/更新表单数据到后端
- [ ] 3.5 验证流程表单能正确渲染、填写、提交

## 4. 字段权限适配

- [ ] 4.1 改造 FormRenderer 的 applyPermissions 函数：遍历 VTJ DSL 节点树，找 XField 节点，设置 disabled/visible props
- [ ] 4.2 改造 FormPropertyTab.vue 的 loadFormFields 函数：从 VTJ DSL 中提取 XField 的 name 和 label 作为字段列表
- [ ] 4.3 验证字段权限 EDIT/VIEW/HIDDEN 三种状态在 VTJ renderer 下正确生效

## 5. 自定义组件适配

- [ ] 5.1 改造 LookupPicker.vue：移除 formCreateInject 依赖，改为标准 v-model + emit 机制
- [ ] 5.2 实现 LookupPicker 作为 XField editor 的接入方式（editor prop 传组件对象）
- [ ] 5.3 验证 LookupPicker 在 VTJ 设计器和 renderer 中都能正确渲染和交互
- [ ] 5.4 验证 LookupPicker 的 returnFields 回填功能通过 emit 机制正常工作

## 6. CRUD 页面重建

- [ ] 6.1 使用 VTJ 设计器搭建用户管理页面（UserPage），出码 Vue SFC
- [ ] 6.2 使用 VTJ 设计器搭建角色管理页面（RolePage），出码 Vue SFC
- [ ] 6.3 使用 VTJ 设计器搭建组织管理页面（OrgPage），出码 Vue SFC
- [ ] 6.4 使用 VTJ 设计器搭建菜单管理页面（MenuPage），出码 Vue SFC
- [ ] 6.5 使用 VTJ 设计器搭建字典管理页面（DictPage），出码 Vue SFC
- [ ] 6.6 验证每个 CRUD 页面的搜索、新增、编辑、删除功能正常

## 7. 清理废弃代码

- [ ] 7.1 删除 SearchTable.vue 组件
- [ ] 7.2 删除 DataSourcePanel.vue 组件（VTJ 设计器自带数据源配置）
- [ ] 7.3 删除 FormPageLayout.vue（如已被 VTJ 设计器布局替代）
- [ ] 7.4 清理 types.ts 中的 form-create Rule 类型定义
- [ ] 7.5 清理 router/index.ts 中的 form-create 相关路由配置
- [ ] 7.6 更新测试文件，移除 form-create 相关测试用例，新增 VTJ renderer 测试用例

## 8. 集成验证

- [ ] 8.1 验证前端项目编译构建无错误
- [ ] 8.2 验证所有页面路由可正常访问
- [ ] 8.3 验证流程表单设计→发布→渲染→填写→提交完整链路
- [ ] 8.4 验证 BPMN 设计器中字段权限配置→流程审批中权限生效完整链路
- [ ] 8.5 验证 5 个 CRUD 页面的完整 CRUD 操作
- [ ] 8.6 验证 package.json 中无 form-create 相关依赖
