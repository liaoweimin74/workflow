# Plan: unify-form-create

> 基于 tasks.md 和 design.md，按 TDD 方法分解为可执行微步骤。
> **修订**: CRUD 表单 schema 前端定义，不走后端持久化。后端零改动。

## Phase 1: 前端 — 自定义组件注册（Task Group 2）

### Step 1.1: LookupPicker 适配 form-create

**文件**: `frontend/src/components/business/LookupPicker.vue`

- [ ] RED: 编写测试 — LookupPicker 接收 formCreateInject 并通过 api.setValue 回填 returnFields
- [ ] GREEN: 增加 `inject: ['formCreateInject']`，returnFields 回填改用 `api.setValue()`
- [ ] GREEN: 清除时通过 `api.setValue(targetField, null)` 清空
- [ ] 运行: `npx vitest run src/components/business/__tests__/LookupPicker.test.ts`
- **COMMIT**: `feat: LookupPicker 适配 form-create — returnFields 通过 api.setValue 回填`

### Step 1.2: 全局注册

**文件**: `frontend/src/main.ts`

- [ ] 注册: `formCreate.component('LookupPicker', LookupPicker)`
- [ ] 验证: 浏览器中 form-create 表单使用 `{ type: 'LookupPicker' }` 能渲染
- **COMMIT**: `feat: main.ts 注册 LookupPicker 为 form-create 全局组件`

### Step 1.3: FcDesigner 注册

**文件**: `frontend/src/views/form/FormDesigner.vue`

- [ ] onMounted 中 `designerRef.value?.addComponent({ label: '字典选择器', name: 'LookupPicker', rule: {...} })`
- [ ] 验证: 设计器面板出现 LookupPicker，可拖入设计区
- **COMMIT**: `feat: FcDesigner 注册 LookupPicker 到拖拽面板`

---

## Phase 2: 前端 — FormRenderer 改造（Task Group 3）

### Step 2.1: rule prop + initialValues + getFormData

**文件**: `frontend/src/views/form/components/FormRenderer.vue`

- [ ] RED: 编写测试 — 接收 `rule` prop 时直接渲染（不调后端 API）
- [ ] RED: 编写测试 — 接收 `initialValues` prop 时预填充表单数据
- [ ] RED: 编写测试 — `getFormData()` 返回当前表单数据
- [ ] GREEN: 增加 `rule` prop（可选，与 `formDefId` 互斥）
- [ ] GREEN: 增加 `initialValues` prop，watch 后填充到 formData
- [ ] GREEN: 暴露 `getFormData()` 方法（通过 defineExpose）
- [ ] 运行: `npx vitest run src/views/form/components/__tests__/FormRenderer.test.ts`
- **COMMIT**: `feat: FormRenderer 支持 rule prop + initialValues + getFormData`

---

## Phase 3: 前端 — FormPageLayout（Task Group 4）

### Step 3.1: 创建组件

**文件**: `frontend/src/components/business/FormPageLayout.vue`

- [ ] RED: 编写测试 — 渲染 title、default slot、toolbar slot、footer slot
- [ ] GREEN: 创建 FormPageLayout.vue
- [ ] 运行: `npx vitest run src/components/business/__tests__/FormPageLayout.test.ts`
- **COMMIT**: `feat: 创建 FormPageLayout 统一外壳组件`

---

## Phase 4: 前端 — SearchTable 改造（Task Group 5）

### Step 4.1: FormConfig 接口改造

**文件**: `frontend/src/components/business/types.ts`

- [ ] 修改 FormConfig: `fields: FormField[]` → `rule: any[]`（form-create Rule 类型）
- [ ] 保留 SearchField / TableColumn / ActionButton 不变
- [ ] **COMMIT**: `refactor: FormConfig 接口 fields → rule`

### Step 4.2: SearchTable 内部替换

**文件**: `frontend/src/components/business/SearchTable.vue`

- [ ] RED: 编写测试 — 弹窗使用 FormRenderer（传入 rule）
- [ ] RED: 编写测试 — 提交时调用 getFormData + onCreate
- [ ] RED: 编写测试 — 编辑时传入 initialValues
- [ ] GREEN: 弹窗内 FormBuilder → FormRenderer（传入 rule prop）
- [ ] GREEN: 提交逻辑改用 getFormData()
- [ ] GREEN: 编辑时传 initialValues
- [ ] 运行: `npx vitest run src/components/business/__tests__/SearchTable.test.ts`
- **COMMIT**: `feat: SearchTable 内部 FormBuilder → FormRenderer`

---

## Phase 5: 7 个 CRUD 页面迁移（Task Group 6）

### Step 5.1: 逐页迁移

每个页面执行：
- [ ] 将原 FormField[] 转为 form-create rule JSON，定义在页面文件内
- [ ] 修改 formConfig: `fields: [...]` → `rule: [...]`
- [ ] 删除 FormField 类型导入
- [ ] 手动验证创建/编辑/删除功能
- [ ] **COMMIT**: `refactor: 迁移 XxxPage 到 form-create rule`

页面顺序: UserPage → RolePage → OrgPage → ProcessListPage → FormListPage → DictPage（含 LookupPicker）→ MenuPage（含 onChange）

### Step 5.2: MenuPage onChange 迁移

- [ ] MenuPage 的 `onChange: (val) => { currentMenuType.value = val }` 改为 rule 的 `update` 回调
- [ ] 验证 menuType 切换时字段联动正常
- **COMMIT**: `refactor: MenuPage onChange 迁移到 form-create update 回调`

---

## Phase 6: 清理（Task Group 7）

### Step 6.1: 删除 FormBuilder

- [ ] 删除 `frontend/src/components/business/FormBuilder.vue`
- [ ] 删除 `frontend/src/components/business/__tests__/FormBuilder.test.ts`
- [ ] 删除 types.ts 中 FormField / FormLayout 相关类型
- [ ] 删除 index.ts 中 FormBuilder export
- [ ] grep 确认无残留: `grep -r "FormBuilder\|FormField\|RenderField" frontend/src/`
- [ ] 运行全量测试: `npx vitest run`
- **COMMIT**: `chore: 删除 FormBuilder 及相关代码`

---

## Phase 7: 端到端验证（Task Group 8）

- [ ] 7.1 `npx vitest run` — 全部前端测试通过
- [ ] 7.2 `mvn test` — 全部后端测试通过（确认无回归）
- [ ] 7.3 手动验证 7 个 CRUD 页面的创建/编辑/删除功能
- [ ] 7.4 手动验证 DictPage 的 LookupPicker 选择 + returnFields 回填
- [ ] 7.5 手动验证 MenuPage 的 menuType 切换联动
- [ ] 7.6 手动验证流程表单（FormRenderer formDefId 模式）不受影响
- [ ] 7.7 手动验证 FcDesigner 中 LookupPicker 可拖拽
- **COMMIT**: `test: 端到端验证通过`
