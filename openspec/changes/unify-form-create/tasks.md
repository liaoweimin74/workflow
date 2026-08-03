# Tasks: unify-form-create

## 1. 后端基础设施

- [ ] 1.1 FormDefinition 实体增加 `formKey` 字段（nullable String，唯一约束作用于 status=PUBLISHED 的记录）
- [ ] 1.2 创建数据库迁移脚本（增加 `form_key` 列到 `form_definition` 表）
- [ ] 1.3 FormDefinitionRepository 增加按 `formKey` 和 `status=PUBLISHED` 查询最新版本的方法
- [ ] 1.4 FormDefinitionService 增加 `getPublishedByKey(String formKey)` 方法
- [ ] 1.5 FormDefinitionController 增加 `GET /api/v1/form-definitions/by-key/{formKey}` 端点
- [ ] 1.6 FormDefinitionController 增加按 formKey 查询的单元测试

## 2. 前端 — 自定义组件注册

- [ ] 2.1 LookupPicker.vue 改造：通过 `formCreateInject` 获取 api，`returnFields` 回填改用 `api.setValue()`
- [ ] 2.2 LookupPicker.vue 改造：保持标准 v-model 行为，确保现有单元测试通过
- [ ] 2.3 main.ts 注册 LookupPicker 为 form-create 全局组件（`formCreate.component('LookupPicker', LookupPicker)`）
- [ ] 2.4 FormDesigner.vue onMounted 注册 LookupPicker 到 FcDesigner 拖拽面板（`designerRef.addComponent()`）
- [ ] 2.5 编写 LookupPicker + form-create 集成测试（验证 returnFields 回填通过 api.setValue 工作）

## 3. 前端 — FormRenderer 改造

- [ ] 3.1 FormRenderer.vue 增加 `formKey` prop
- [ ] 3.2 FormRenderer.vue 加载逻辑：`formKey` 模式调用 `GET /api/v1/form-definitions/by-key/{formKey}`
- [ ] 3.3 FormRenderer.vue 加载逻辑：`formDefId` 和 `formKey` 互斥，formDefId 优先
- [ ] 3.4 FormRenderer.vue 暴露 `getFormData()` 方法供父组件调用
- [ ] 3.5 FormRenderer.vue 增加 `initialValues` prop（用于 CRUD 编辑场景预填充数据）
- [ ] 3.6 编写 FormRenderer formKey 模式测试

## 4. 前端 — FormPageLayout 组件

- [ ] 4.1 创建 `FormPageLayout.vue` 组件（title prop + default/toolbar/footer 插槽）
- [ ] 4.2 定义统一样式（label-width、间距、底部按钮区对齐）
- [ ] 4.3 编写 FormPageLayout 单元测试

## 5. 前端 — SearchTable 改造

- [ ] 5.1 FormConfig 接口：`fields: FormField[]` → `formKey: string`
- [ ] 5.2 SearchTable 弹窗内部：FormBuilder → FormRenderer（通过 formKey 加载 schema）
- [ ] 5.3 SearchTable 提交逻辑：通过 FormRenderer `getFormData()` 获取数据，调用 `onCreate/onUpdate`
- [ ] 5.4 SearchTable 编辑场景：将当前行数据作为 `initialValues` 传入 FormRenderer
- [ ] 5.5 SearchTable 保留 columns/searchFields/actionButtons 配置不变
- [ ] 5.6 编写 SearchTable + FormRenderer 集成测试

## 6. 前端 — 7 个 CRUD 页面迁移

- [ ] 6.1 准备 7 份 rule JSON 种子数据（UserPage、RolePage、OrgPage、DictPage、MenuPage、ProcessListPage、FormListPage）
- [ ] 6.2 迁移 UserPage：formConfig.fields → formConfig.formKey
- [ ] 6.3 迁移 RolePage：formConfig.fields → formConfig.formKey
- [ ] 6.4 迁移 OrgPage：formConfig.fields → formConfig.formKey
- [ ] 6.5 迁移 DictPage：formConfig.fields → formConfig.formKey（含 LookupPicker 验证）
- [ ] 6.6 迁移 MenuPage：formConfig.fields → formConfig.formKey（含 onChange → update 迁移）
- [ ] 6.7 迁移 ProcessListPage：formConfig.fields → formConfig.formKey
- [ ] 6.8 迁移 FormListPage：formConfig.fields → formConfig.formKey
- [ ] 6.9 每个页面迁移后手动验证 CRUD 功能正常

## 7. 清理 — 删除 FormBuilder

- [ ] 7.1 删除 FormBuilder.vue（含 RenderField 子组件）
- [ ] 7.2 删除 types.ts 中 FormField 相关类型定义
- [ ] 7.3 删除 FormBuilder.test.ts 测试文件
- [ ] 7.4 删除 index.ts 中 FormBuilder 的 barrel export
- [ ] 7.5 确认无残留引用（grep FormBuilder / FormField / RenderField）

## 8. 端到端验证

- [ ] 8.1 运行全部前端单元测试，确认无回归
- [ ] 8.2 运行全部后端单元测试，确认无回归
- [ ] 8.3 手动验证 7 个 CRUD 页面的创建/编辑/删除功能
- [ ] 8.4 手动验证 DictPage 的 LookupPicker 选择 + returnFields 回填
- [ ] 8.5 手动验证 MenuPage 的 menuType 切换联动
- [ ] 8.6 手动验证流程表单（FormRenderer formDefId 模式）不受影响
- [ ] 8.7 手动验证 FcDesigner 中 LookupPicker 可拖拽
