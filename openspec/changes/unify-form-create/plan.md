# Plan: unify-form-create

> 基于 tasks.md 和 design.md，按 TDD 方法分解为可执行微步骤。

## Phase 1: 后端基础设施（Task Group 1）

### Step 1.1: FormDefinition 实体加 formKey

**文件**: `backend/src/main/java/com/workflow/engine/form/entity/FormDefinition.java`

- [ ] RED: 编写测试 — `FormDefinitionTest.formKeyGetterSetter()` 验证 formKey 字段 get/set
- [ ] GREEN: FormDefinition 增加 `@Column(name = "form_key") private String formKey;` + getter/setter
- [ ] 运行: `mvn test -Dtest=FormDefinitionTest`
- **COMMIT**: `feat: FormDefinition 增加 formKey 字段`

### Step 1.2: 数据库迁移脚本

**文件**: `backend/src/main/resources/db/migration/V__add_form_key.sql`

- [ ] 创建迁移脚本: `ALTER TABLE form_definition ADD COLUMN form_key VARCHAR(100);`
- [ ] 创建唯一索引: `CREATE UNIQUE INDEX idx_form_key_published ON form_definition(form_key) WHERE status = 'PUBLISHED';`（如果数据库不支持 partial index，改为应用层校验）
- **COMMIT**: `feat: 数据库迁移 — form_definition 增加 form_key 列`

### Step 1.3: Repository 查询方法

**文件**: `backend/src/main/java/com/workflow/engine/form/repository/FormDefinitionRepository.java`

- [ ] RED: 编写测试 — 按 formKey 查询已发布版本
- [ ] GREEN: 增加 `Optional<FormDefinition> findFirstByFormKeyAndStatusOrderByPublishedVersionDesc(String formKey, FormStatus status)`
- [ ] 运行: `mvn test -Dtest=FormDefinitionRepositoryTest`
- **COMMIT**: `feat: FormDefinitionRepository 增加 byKey 查询`

### Step 1.4: Service 层

**文件**: `backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java`

- [ ] RED: 编写测试 — `getPublishedByKey("user-crud")` 返回已发布版本
- [ ] RED: 编写测试 — `getPublishedByKey("nonexistent")` 抛出 NotFoundException
- [ ] GREEN: 增加 `getPublishedByKey(String formKey)` 方法
- [ ] 运行: `mvn test -Dtest=FormDefinitionServiceTest`
- **COMMIT**: `feat: FormDefinitionService 增加 getPublishedByKey`

### Step 1.5: Controller 端点

**文件**: `backend/src/main/java/com/workflow/api/controller/FormDefinitionController.java`

- [ ] RED: 编写测试 — `GET /api/v1/form-definitions/by-key/user-crud` 返回 200
- [ ] RED: 编写测试 — `GET /api/v1/form-definitions/by-key/nonexistent` 返回 404
- [ ] GREEN: 增加 `@GetMapping("/by-key/{formKey}")` 端点
- [ ] 运行: `mvn test -Dtest=FormDefinitionControllerTest`
- **COMMIT**: `feat: FormDefinitionController 增加 by-key 端点`

---

## Phase 2: 前端 — 自定义组件注册（Task Group 2）

### Step 2.1: LookupPicker 适配 form-create

**文件**: `frontend/src/components/business/LookupPicker.vue`

- [ ] RED: 编写测试 — LookupPicker 接收 formCreateInject 并通过 api.setValue 回填 returnFields
- [ ] GREEN: 增加 `inject: ['formCreateInject']`，returnFields 回填改用 `api.setValue()`
- [ ] GREEN: 清除时通过 `api.setValue(targetField, null)` 清空
- [ ] 运行: `npx vitest run src/components/business/__tests__/LookupPicker.test.ts`
- **COMMIT**: `feat: LookupPicker 适配 form-create — returnFields 通过 api.setValue 回填`

### Step 2.2: 全局注册

**文件**: `frontend/src/main.ts`

- [ ] 注册: `formCreate.component('LookupPicker', LookupPicker)`
- [ ] 验证: 浏览器中 form-create 表单使用 `{ type: 'LookupPicker' }` 能渲染
- **COMMIT**: `feat: main.ts 注册 LookupPicker 为 form-create 全局组件`

### Step 2.3: FcDesigner 注册

**文件**: `frontend/src/views/form/FormDesigner.vue`

- [ ] onMounted 中 `designerRef.value?.addComponent({ label: '字典选择器', name: 'LookupPicker', rule: {...} })`
- [ ] 验证: 设计器面板出现 LookupPicker，可拖入设计区
- **COMMIT**: `feat: FcDesigner 注册 LookupPicker 到拖拽面板`

---

## Phase 3: 前端 — FormRenderer 改造（Task Group 3）

### Step 3.1: formKey prop + 加载逻辑

**文件**: `frontend/src/views/form/components/FormRenderer.vue`

- [ ] RED: 编写测试 — formKey 模式调用正确的 API
- [ ] RED: 编写测试 — formDefId 和 formKey 互斥，formDefId 优先
- [ ] GREEN: 增加 `formKey` prop，加载逻辑分支
- [ ] GREEN: 增加 `initialValues` prop，用于 CRUD 编辑预填充
- [ ] 运行: `npx vitest run src/views/form/components/__tests__/FormRenderer.test.ts`
- **COMMIT**: `feat: FormRenderer 支持 formKey 加载模式`

### Step 3.2: getFormData 方法

**文件**: `frontend/src/views/form/components/FormRenderer.vue`

- [ ] RED: 编写测试 — `getFormData()` 返回当前表单数据
- [ ] GREEN: 暴露 `getFormData()` 方法（通过 defineExpose）
- [ ] 运行: `npx vitest run`
- **COMMIT**: `feat: FormRenderer 暴露 getFormData 方法`

---

## Phase 4: 前端 — FormPageLayout（Task Group 4）

### Step 4.1: 创建组件

**文件**: `frontend/src/components/business/FormPageLayout.vue`

- [ ] RED: 编写测试 — 渲染 title、default slot、toolbar slot、footer slot
- [ ] GREEN: 创建 FormPageLayout.vue
- [ ] 运行: `npx vitest run src/components/business/__tests__/FormPageLayout.test.ts`
- **COMMIT**: `feat: 创建 FormPageLayout 统一外壳组件`

---

## Phase 5: 前端 — SearchTable 改造（Task Group 5）

### Step 5.1: FormConfig 接口改造

**文件**: `frontend/src/components/business/types.ts`

- [ ] 修改 FormConfig: `fields: FormField[]` → `formKey: string`
- [ ] 保留 SearchField / TableColumn / ActionButton 不变
- [ ] **COMMIT**: `refactor: FormConfig 接口 fields → formKey`

### Step 5.2: SearchTable 内部替换

**文件**: `frontend/src/components/business/SearchTable.vue`

- [ ] RED: 编写测试 — 弹窗使用 FormRenderer（formKey 加载）
- [ ] RED: 编写测试 — 提交时调用 getFormData + onCreate
- [ ] RED: 编写测试 — 编辑时传入 initialValues
- [ ] GREEN: 弹窗内 FormBuilder → FormRenderer
- [ ] GREEN: 提交逻辑改用 getFormData()
- [ ] GREEN: 编辑时传 initialValues
- [ ] 运行: `npx vitest run src/components/business/__tests__/SearchTable.test.ts`
- **COMMIT**: `feat: SearchTable 内部 FormBuilder → FormRenderer`

---

## Phase 6: 7 个 CRUD 页面迁移（Task Group 6）

### Step 6.1: 准备 rule JSON 种子数据

- [ ] 为 7 个页面各设计一份 rule JSON，存入后端 FormDefinition（formKey + schema）
- [ ] 可通过 FcDesigner 拖拽设计后导出，或手写
- [ ] **COMMIT**: `feat: 7 份 CRUD 表单 rule JSON 种子数据`

### Step 6.2-6.8: 逐页迁移

每个页面执行：
- [ ] 修改 formConfig: `fields: [...]` → `formKey: 'xxx-crud'`
- [ ] 删除 FormField 类型导入
- [ ] 手动验证创建/编辑/删除功能
- [ ] **COMMIT**: `refactor: 迁移 XxxPage 到 formKey`

页面顺序: UserPage → RolePage → OrgPage → ProcessListPage → FormListPage → DictPage（含 LookupPicker）→ MenuPage（含 onChange）

### Step 6.9: MenuPage onChange 迁移

- [ ] MenuPage 的 `onChange: (val) => { currentMenuType.value = val }` 改为 rule 的 `update` 回调
- [ ] 验证 menuType 切换时字段联动正常
- **COMMIT**: `refactor: MenuPage onChange 迁移到 form-create update 回调`

---

## Phase 7: 清理（Task Group 7）

### Step 7.1-7.5: 删除 FormBuilder

- [ ] 删除 `frontend/src/components/business/FormBuilder.vue`
- [ ] 删除 `frontend/src/components/business/__tests__/FormBuilder.test.ts`
- [ ] 删除 types.ts 中 FormField / FormLayout 相关类型
- [ ] 删除 index.ts 中 FormBuilder export
- [ ] grep 确认无残留: `grep -r "FormBuilder\|FormField\|RenderField" frontend/src/`
- [ ] 运行全量测试: `npx vitest run`
- **COMMIT**: `chore: 删除 FormBuilder 及相关代码`

---

## Phase 8: 端到端验证（Task Group 8）

- [ ] 8.1 `npx vitest run` — 全部前端测试通过
- [ ] 8.2 `mvn test` — 全部后端测试通过
- [ ] 8.3 手动验证 7 个 CRUD 页面
- [ ] 8.4 手动验证 DictPage LookupPicker
- [ ] 8.5 手动验证 MenuPage 联动
- [ ] 8.6 手动验证流程表单不受影响
- [ ] 8.7 手动验证 FcDesigner 拖拽 LookupPicker
- **COMMIT**: `test: 端到端验证通过`
