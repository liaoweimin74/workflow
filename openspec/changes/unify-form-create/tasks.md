# Tasks: unify-form-create

## 1. 前端 — 自定义组件注册

- [ ] 1.1 LookupPicker.vue 改造：通过 `formCreateInject` 获取 api，`returnFields` 回填改用 `api.setValue()`
- [ ] 1.2 LookupPicker.vue 改造：保持标准 v-model 行为，确保现有单元测试通过
- [ ] 1.3 main.ts 注册 LookupPicker 为 form-create 全局组件（`formCreate.component('LookupPicker', LookupPicker)`）
- [ ] 1.4 FormDesigner.vue onMounted 注册 LookupPicker 到 FcDesigner 拖拽面板（`designerRef.addComponent()`）
- [ ] 1.5 编写 LookupPicker + form-create 集成测试（验证 returnFields 回填通过 api.setValue 工作）

## 2. 前端 — FormRenderer 改造

- [ ] 2.1 FormRenderer.vue 增加 `rule` prop（可选，与 formDefId 互斥，直接渲染不调后端）
- [ ] 2.2 FormRenderer.vue 增加 `initialValues` prop（用于 CRUD 编辑场景预填充数据）
- [ ] 2.3 FormRenderer.vue 暴露 `getFormData()` 方法供父组件调用
- [ ] 2.4 编写 FormRenderer rule 模式测试

## 3. 前端 — FormPageLayout 组件

- [ ] 3.1 创建 `FormPageLayout.vue` 组件（title prop + default/toolbar/footer 插槽）
- [ ] 3.2 定义统一样式（label-width、间距、底部按钮区对齐）
- [ ] 3.3 编写 FormPageLayout 单元测试

## 4. 前端 — SearchTable 改造

- [ ] 4.1 FormConfig 接口：`fields: FormField[]` → `rule: any[]`
- [ ] 4.2 SearchTable 弹窗内部：FormBuilder → FormRenderer（传入 rule prop）
- [ ] 4.3 SearchTable 提交逻辑：通过 FormRenderer `getFormData()` 获取数据，调用 `onCreate/onUpdate`
- [ ] 5.4 SearchTable 编辑场景：将当前行数据作为 `initialValues` 传入 FormRenderer
- [ ] 4.3 SearchTable 提交逻辑：通过 FormRenderer `getFormData()` 获取数据，调用 `onCreate/onUpdate`
- [ ] 4.4 SearchTable 编辑场景：将当前行数据作为 `initialValues` 传入 FormRenderer
- [ ] 4.5 SearchTable 保留 columns/searchFields/actionButtons 配置不变
- [ ] 4.6 编写 SearchTable + FormRenderer 集成测试

## 5. 前端 — 7 个 CRUD 页面迁移

- [ ] 5.1 迁移 UserPage：FormField[] → rule JSON（前端定义）
- [ ] 5.2 迁移 RolePage：FormField[] → rule JSON
- [ ] 5.3 迁移 OrgPage：FormField[] → rule JSON
- [ ] 5.4 迁移 DictPage：FormField[] → rule JSON（含 LookupPicker 验证）
- [ ] 5.5 迁移 MenuPage：FormField[] → rule JSON（含 onChange → update 迁移）
- [ ] 5.6 迁移 ProcessListPage：FormField[] → rule JSON
- [ ] 5.7 迁移 FormListPage：FormField[] → rule JSON
- [ ] 5.8 每个页面迁移后手动验证 CRUD 功能正常

## 6. 清理 — 删除 FormBuilder

- [ ] 6.1 删除 FormBuilder.vue（含 RenderField 子组件）
- [ ] 6.2 删除 types.ts 中 FormField 相关类型定义
- [ ] 6.3 删除 FormBuilder.test.ts 测试文件
- [ ] 6.4 删除 index.ts 中 FormBuilder 的 barrel export
- [ ] 6.5 确认无残留引用（grep FormBuilder / FormField / RenderField）

## 7. 端到端验证

- [ ] 7.1 运行全部前端单元测试，确认无回归
- [ ] 7.2 运行全部后端单元测试，确认无回归
- [ ] 7.3 手动验证 7 个 CRUD 页面的创建/编辑/删除功能
- [ ] 7.4 手动验证 DictPage 的 LookupPicker 选择 + returnFields 回填
- [ ] 7.5 手动验证 MenuPage 的 menuType 切换联动
- [ ] 7.6 手动验证流程表单（FormRenderer formDefId 模式）不受影响
- [ ] 7.7 手动验证 FcDesigner 中 LookupPicker 可拖拽
