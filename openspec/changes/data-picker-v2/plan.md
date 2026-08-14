# 数据引用组件 v2（data-picker 能力补齐 + 引用感知）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 dataPicker 定位收敛为纯引用派（`_text` 降级展示缓存），补齐过滤条件双类型、级联保留已选值、允许新增、跳转查看、悬空降级，并实现引用感知三件套。

**Architecture:** 后端在 `BizDataService`/`BizDataController` 增加引用统计接口与 filters 发布校验，选项查询复用现有 `query(formKey, req)`（filter JSON 已支持 AND 条件）。前端在现有 `DataPicker.vue`/`DataPickerConfigDialog.vue` 上增量升级，新增 `DataPickerCreateDialog.vue` 承载"允许新增"，表单列表页消费 referenced-count 接口实现徽标与删除警告。运行时将 `dependOn` 归一化为 filters 单条 field 型，向后兼容已发布 schema。

**Tech Stack:** Spring Boot + Flowable（后端）、Vue 3 + Element Plus + form-create（前端）、MySQL、Vitest（前端测试）、Maven（后端测试）。

## Global Constraints

- 组件 schema 向后兼容：运行时同时识别 `dependOn` 与 `filters` 两种形态，`filters` 优先
- 存储模型不变：dataPicker 两列映射（`<key>` VARCHAR(64) id + `<key>_text` VARCHAR(1024) 展示缓存），无数据库结构变更
- 租户隔离：引用统计与 resolve 均限同租户
- 显示优先级：编辑态/审批实时 resolve 优先（失败回退 `_text`）；列表/只读直接用 `_text`
- 操作符 v2 仅支持 `=`（等值）
- 悬空引用不阻断表单提交
- 全部文本使用中文

---

## Task 1: 后端引用统计接口（referenced-count）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/BizDataController.java`
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java`（或现有同名测试类）

**Interfaces:**
- Consumes: `ColumnConfig.getPickerConfig()`（JSON 字符串，含 sourceFormKey）、`FormDefinitionRepository`（或等效取全部 BUSINESS 表单 column_config 的组件）
- Produces: `BizDataService.countReferencedBy(): Map<String, Map<String, Object>>`——`{ formKey: { count: N, referencedBy: [formKeyA, formKeyB] } }`；`GET /api/v1/biz-data/referenced-count` 返回同结构

- [ ] **Step 1: 写失败测试**

```java
@Test
void countReferencedBy_统计各表单被dataPicker引用次数() {
    // 准备：formA 的 column_config 含 dataPicker 引用 emp_profile；formB 同样引用 emp_profile；formC 无引用
    // 断言：result.get("emp_profile").get("count") == 2
    // 断言：result.get("emp_profile").get("referencedBy") 包含 formA、formB
    // 断言：result 不含 formC（count=0 的表不返回）
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -pl backend test -Dtest=BizDataServiceTest#countReferencedBy_统计各表单被dataPicker引用次数`
Expected: FAIL（方法不存在 / 编译失败）

- [ ] **Step 3: 实现 `countReferencedBy()`**

```java
public Map<String, Map<String, Object>> countReferencedBy() {
    // 1. 查询全部 BUSINESS 类型表单定义（type=BUSINESS），取其 columnConfig JSON
    // 2. 对每个 columnConfig 数组，遍历含 pickerConfig 的列，解析 pickerConfig.sourceFormKey
    // 3. 聚合 Map<String, Map<String,Object>>：
    //    target -> { "count": n, "referencedBy": [sourceFormKey...] }
    // 4. 仅返回 count > 0 的 target；同租户数据天然隔离（表单定义查询按租户）
    return result;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: 同 Step 2
Expected: PASS

- [ ] **Step 5: Controller 暴露接口**

```java
/**
 * 统计业务表单被 dataPicker 引用的情况（引用感知）。
 * 返回 { formKey: { count, referencedBy: [formKey...] } }。
 */
@GetMapping("/referenced-count")
public R<Map<String, Map<String, Object>>> referencedCount() {
    return R.ok(bizDataService.countReferencedBy());
}
```

- [ ] **Step 6: 运行测试 + 编译确认**

Run: `mvn -pl backend test -Dtest=BizDataServiceTest`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: 业务表单被引用统计接口（referenced-count）"
```

---

## Task 2: 后端 filters 发布校验 + dependOn 归一化

**Files:**
- Modify: 发布校验逻辑所在类（含 dataPicker 校验：目标表单存在/引用列存在性校验处，见 `openspec/changes/data-picker/design.md` D2/D3 的校验实现）
- Test: 该校验对应测试类

**Interfaces:**
- Consumes: rule props 中 `filters`（`[{column, operator, valueType, value}]`）、目标表单 `getBusinessColumnsByKey`
- Produces: 校验失败 400 提示"过滤条件引用列已不存在：<column>"；`normalizeFilters(props)` 内部工具（供前端测试镜像，后端校验时同步识别 dependOn 与 filters）

- [ ] **Step 1: 写失败测试**

```java
@Test
void publishValidate_dataPickerFilters引用列不存在时400() {
    // 准备：schema 含 dataPicker，filters=[{column:"gone_col", operator:"=", valueType:"static", value:"x"}]
    // 目标表单 column_config 无 gone_col
    // 断言：抛 BusinessException(400)，消息含 "过滤条件引用列已不存在"
}

@Test
void publishValidate_dataPickerFilters引用列存在时通过() {
    // 准备：filters 引用 dept（存在于目标表单 column_config）
    // 断言：不抛异常
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -pl backend test -Dtest=<校验测试类>`
Expected: FAIL（未校验 filters）

- [ ] **Step 3: 实现校验**

```java
// 在现有 dataPicker 校验逻辑中追加：
if (props.get("filters") instanceof List<?> filters) {
    for (Object f : filters) {
        if (f instanceof Map<?, ?> m && m.get("column") instanceof String col) {
            if (目标表单 column_config 中不存在 col 或 col 对应列 isHidden()) {
                throw new BusinessException(400, "过滤条件引用列已不存在：" + col);
            }
        }
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: 同 Step 2
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: dataPicker filters 引用列发布校验"
```

---

## Task 3: 前端 DataPicker.vue 运行时升级（filters/级联/悬空/跳转）

**Files:**
- Modify: `frontend/src/views/form/components/DataPicker.vue`
- Test: `frontend/src/views/form/components/__tests__/DataPicker.test.ts`（新建）

**Interfaces:**
- Consumes: 现有 props（modelValue/sourceFormKey/displayField/columns/mode/returnFields/dependOn/displayText）+ 新增 props（`filters?: FilterItem[]`、`clearOnCascadeChange?: boolean`（默认 false）、`allowCreate?: boolean`（默认 false）、`viewLink?: boolean`（默认 true））、`formCreateInject.api.getValue`、`bizDataApi`
- Produces: `FilterItem = { column: string; operator: string; valueType: 'static'|'field'; value: string }`；`normalizedFilters` 内部计算属性（dependOn → 单条 field 型）；emit `'update:modelValue'`/`'update:displayText'`/`'create-record'`

- [ ] **Step 1: 写失败测试（filters 归一化 + 级联保留）**

```ts
// filters 归一化：dependOn 存在时等价于单条 field 型 filter
// 级联保留：clearOnCascadeChange=false（默认）时依赖值变化 → modelValue 不被清空
// 级联清空：clearOnCascadeChange=true 时依赖值变化 → modelValue 清空 + 回填清空
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/form/components/__tests__/DataPicker.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 filters 归一化与查询构造**

```ts
interface FilterItem { column: string; operator: string; valueType: 'static' | 'field'; value: string }

// 归一化：dependOn 兼容
const normalizedFilters = computed<FilterItem[]>(() => {
  if (props.filters && props.filters.length > 0) return props.filters
  if (props.dependOn?.field && props.dependOn?.sourceColumn) {
    return [{ column: props.dependOn.sourceColumn, operator: '=', valueType: 'field', value: props.dependOn.field }]
  }
  return []
})

// 查询 filter：static 直接取值；field 从 formCreateInject.api.getValue(field) 取当前表单字段值（空值跳过该条件）
const queryFilter = computed(() => {
  const f: Record<string, unknown> = {}
  for (const item of normalizedFilters.value) {
    const v = item.valueType === 'field'
      ? formCreateInject?.api?.getValue?.(item.value)
      : item.value
    if (v === undefined || v === null || v === '') continue
    f[item.column] = v
  }
  return Object.keys(f).length > 0 ? f : undefined
})
// fetchData 中：params.filter = queryFilter.value（替代原 cascadeFilter）
```

- [ ] **Step 4: 实现级联保留行为**

```ts
// watch 依赖字段（normalizedFilters 中所有 field 型 value 的字段）变化：
// - clearOnCascadeChange === false（默认）：仅刷新选项（fetchData），不清空选择/回填
// - clearOnCascadeChange === true：清空 modelValue + displayText + resolvedDisplayText + clearReturnFields()，再刷新选项
// 监听字段集合：computed(() => normalizedFilters.value.filter(f => f.valueType==='field').map(f => f.value))
```

- [ ] **Step 5: 实现悬空降级**

```ts
// resolveDisplay 结果中：ids.map(id => map[id]) 出现 undefined 时
// - 编辑态（!readonly）：该 id 渲染为红色提示文本 "引用数据已删除（id）"（用 <span class="pick-ref-missing"> 包裹，CSS 红色）
// - 只读态：显示原始 id
// 不抛出、不阻断提交（emit 不变）
```

- [ ] **Step 6: 实现跳转查看**

```ts
// 有值且非编辑态（readonly && viewLink）且非空时，显示文本渲染为 <a @click="goView">
// goView(): router.push 目标记录详情（复用 BizDataListPage 详情路由，参数 formKey=sourceFormKey, id=当前选中 id；多选取第一个）
// viewLink=false 时渲染为普通文本
```

- [ ] **Step 7: 运行测试确认通过**

Run: 同 Step 2
Expected: PASS

- [ ] **Step 8: 新增 props 声明与默认值**

```ts
// withDefaults 追加：
// filters: () => [], clearOnCascadeChange: false, allowCreate: false, viewLink: true
// FilterItem 类型导出（供配置弹窗复用）
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/views/form/components/DataPicker.vue frontend/src/views/form/components/__tests__/DataPicker.test.ts
git commit -m "feat: DataPicker 运行时升级（filters/级联保留/悬空降级/跳转查看）"
```

---

## Task 4: 允许新增（DataPickerCreateDialog）

**Files:**
- Create: `frontend/src/views/form/components/DataPickerCreateDialog.vue`
- Modify: `frontend/src/views/form/components/DataPicker.vue`
- Test: `frontend/src/views/form/components/__tests__/DataPickerCreateDialog.test.ts`（新建）

**Interfaces:**
- Consumes: `sourceFormKey`、目标表单定义（`formApi.getFormDefinitionByKey` 取 schema 渲染）、`bizDataApi.create`
- Produces: DataPickerCreateDialog props：`{ sourceFormKey: string, visible: boolean }`，emit `'success'`（携带新记录 row）与 `'close'`；DataPicker 弹窗在 allowCreate=true 时显示"新增"按钮

- [ ] **Step 1: 写失败测试**

```ts
// 提交成功 → emit success 携带新记录；提交失败（必填缺失）→ 不 emit
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/form/components/__tests__/DataPickerCreateDialog.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 DataPickerCreateDialog.vue**

```ts
// 模板：el-dialog + 目标表单 schema 渲染（复用现有 form-create 渲染方式，如流程中心发起表单的渲染组件）
// 脚本：
//   props: { visible: boolean, sourceFormKey: string }
//   onMounted/visible 变化时：formApi.getFormDefinitionByKey(sourceFormKey) → 解析 schema 构建 rule
//   提交：bizDataApi.create(sourceFormKey, 表单值) → emit('success', row) → 关闭
```

- [ ] **Step 4: 集成到 DataPicker.vue**

```ts
// 弹窗 footer（或 toolbar）在 props.allowCreate 时显示 <el-button>新增</el-button>
// 点击 → createDialogVisible = true
// @success="(row) => { handleCreateSuccess(row) }"
// handleCreateSuccess(row): 刷新选项列表 → selectValue([row])（复用现有单选逻辑：更新值/文本/回填）→ 关闭创建弹窗
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/views/form/components/__tests__/DataPicker.test.ts src/views/form/components/__tests__/DataPickerCreateDialog.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/form/components/
git commit -m "feat: 数据引用允许新增（DataPickerCreateDialog + 自动选中回填）"
```

---

## Task 5: DataPickerConfigDialog.vue 配置升级

**Files:**
- Modify: `frontend/src/views/form/components/DataPickerConfigDialog.vue`
- Test: `frontend/src/views/form/components/__tests__/DataPickerConfigDialog.test.ts`（新建）

**Interfaces:**
- Consumes: 现有弹窗（目标表单/显示字段/列表列/单多选/返回映射/级联依赖）+ 表单分类数据（`formApi.getFormDefinitions` 分类字段）
- Produces: v2 rule props：`filters[]`、`clearOnCascadeChange`、`allowCreate`、`viewLink`；读取 v1 `dependOn` 时回填为一条 field 型 filter（迁移展示）

- [ ] **Step 1: 写失败测试**

```ts
// 编辑已有 v1 配置（含 dependOn）→ 弹窗展示为一条 field 型过滤条件，保存后产出 filters
// 添加 static 过滤条件（目标列+操作符+值）→ 保存后 props.filters 含该条
// 打开开关（级联清空/允许新增/跳转）→ 保存后 props 对应字段为 true
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/form/components/__tests__/DataPickerConfigDialog.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现过滤条件编辑器**

```ts
// 新增 Tab/区块"过滤条件"：动态行（el-form 循环）每行：
//   目标列 el-select（目标表单非 hidden 列）+
//   操作符 el-select（仅 "=" 一项）+
//   值类型 el-radio-group（static/field）+
//   值：static → el-input；field → el-select（当前表单 schema 字段）
// 添加/删除行按钮；空行不产出
// 回填：props.filters 读入；兼容 props.dependOn → 显示为一条 field 型行
// 保存时产出 filters 数组（dependOn 不再单独产出，由 filters 覆盖）
```

- [ ] **Step 4: 实现目标表单选择器增强 + 开关**

```ts
// 目标表单 el-select：filterable（关键字搜索）+ 按分类 el-option-group 分组
// 新增开关行：clearOnCascadeChange（el-switch，默认关）、allowCreate（el-switch，默认关）、viewLink（el-switch，默认开）
// 保存时并入 rule props
```

- [ ] **Step 5: 运行测试确认通过**

Run: 同 Step 2
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/form/components/DataPickerConfigDialog.vue frontend/src/views/form/components/__tests__/DataPickerConfigDialog.test.ts
git commit -m "feat: DataPicker 配置弹窗升级（过滤条件编辑器/目标表单搜索分组/行为开关）"
```

---

## Task 6: 引用感知 UI（徽标 + 删除警告）

**Files:**
- Modify: `frontend/src/api/bizData.ts`
- Modify: `frontend/src/views/form/FormListPage.vue`（或业务表单管理列表页）
- Modify: 列配置编辑弹窗（删除列入口所在组件）
- Test: `frontend/src/views/form/__tests__/FormListPage.test.ts`（或现有对应测试）

**Interfaces:**
- Consumes: `bizDataApi.referencedCount()`（新封装：`GET /v1/biz-data/referenced-count`）
- Produces: `referencedCount()` → `Promise<R<Record<string, { count: number; referencedBy: string[] }>>>`

- [ ] **Step 1: 写失败测试**

```ts
// referencedCount 接口封装：调用 GET /v1/biz-data/referenced-count
// 列表渲染：referencedCount 中命中该表单 key 时显示 "被 N 个表单引用" 徽标
// 删除被引用表单：确认框文案含 "被 N 个表单引用，删除后引用将无法解析"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/form/__tests__/FormListPage.test.ts`
Expected: FAIL

- [ ] **Step 3: 封装接口**

```ts
// api/bizData.ts 追加：
referencedCount(): Promise<R<Record<string, { count: number; referencedBy: string[] }>>> {
  return http.get('/v1/biz-data/referenced-count')
}
```

- [ ] **Step 4: 列表徽标**

```ts
// 表单列表 onMounted 拉取 referencedCount()，存 ref<Record<string, {count, referencedBy}>>( {})
// 列表列/卡片中：refMap[form.key]?.count > 0 时渲染
//   <el-tag type="warning" size="small">被 {{ refMap[form.key].count }} 个表单引用</el-tag>
```

- [ ] **Step 5: 删除警告**

```ts
// 删除确认：先查 refMap（已加载则直接用），命中时确认文案追加
//   `该表单被 ${n} 个表单引用，删除后引用将无法解析。确定删除？`
// 未命中（count=0）：维持原确认文案
```

- [ ] **Step 6: 列配置删除提示**

```ts
// 列配置编辑弹窗删除列时：若该列是被引用列（pickerConfig 目标或 displayField/columns 涉及），
// 调 referencedCount 校验引用方，命中则警告 "删除该列将导致 N 个表单的引用无法解析"
```

- [ ] **Step 7: 运行测试确认通过**

Run: 同 Step 2
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/bizData.ts frontend/src/views/form/
git commit -m "feat: 引用感知 UI（被引用徽标 + 删除/改列风险警告）"
```

---

## Task 7: 端到端验证与收尾

**Files:**
- 无新文件；验证项清单

- [ ] **Step 1: 后端全量测试**

Run: `mvn -pl backend test`
Expected: 全部 PASS（含新增 referenced-count/filters 校验测试）

- [ ] **Step 2: 前端全量测试**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 3: 静态检查**

Run: `npx vue-tsc --noEmit`（或项目现有类型检查命令）+ LSP diagnostics
Expected: 无错误

- [ ] **Step 4: 手动验收（浏览器）**

- 设计器：拖入数据引用 → 配置弹窗验证（目标表单搜索分组、过滤条件编辑器、三个开关、v1 dependOn 配置回填展示）
- 运行时：配置过滤条件后选项正确过滤；级联保留已选值（默认）；开启新增后现场创建并自动选中回填；悬空引用编辑态标红；只读态点击跳转详情
- 列表：被引用表单显示徽标；删除被引用表单弹出影响警告

- [ ] **Step 5: 提交剩余变更**

```bash
git add -A && git commit -m "chore: data-picker-v2 端到端验证收尾"
```

## Self-Review

- **Spec 覆盖**：过滤条件配置（Task 2 校验 + Task 3 运行时 + Task 5 配置）、级联保留（Task 3）、允许新增（Task 4）、跳转查看（Task 3）、悬空降级（Task 3）、展示缓存语义（Task 3 显示优先级 + 现有后端行为保留）、引用感知（Task 1 + Task 6）——全部覆盖。
- **占位符扫描**：所有 Step 均含具体实现内容或精确行为描述，无 TBD。
- **类型一致性**：`FilterItem` 在 Task 3 定义并被 Task 5 复用；`referencedCount` 返回结构在 Task 1（后端）/Task 6（前端）一致（`{count, referencedBy}`）。
