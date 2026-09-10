# 数据源保存即发布 + 数据源数据管理页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手动数据源（API/SQL）保存即发布（ENABLED）、发布态可编辑、删除放开（带页面引用保护）；数据源列表新增「数据管理」入口，跳转独立数据管理页按数据源经 adapter 渲染 SearchTable，绑定主表单时弹窗表单 CRUD。

**Architecture:** 后端小改 `DataSourceDefinitionService`（create→ENABLED、delete 放开+引用检查）；前端抽 `useDataSourceCrud` composable（迁移 PageDataTable 已验证的 metadata/formKey/formConfig 逻辑）供新 `DataSourceDataPage` 与 PageDataTable 复用；数据管理页用 SearchTable + formConfig 默认按钮合并（只读数据源无 formConfig → 纯列表）。

**Tech Stack:** Java 17 + Spring Boot（后端）；Vue 3 + TypeScript + Vitest + Element Plus（前端）。

## Global Constraints

- 所有代码变更在本 worktree（`.worktrees/form-join-sql-engine/`）中进行；`main` 分支保持干净
- 后端热部署（devtools）：改完编译即可，无需重启
- TDD：先写失败测试（RED）→ 运行确认失败 → 最小实现（GREEN）→ 重构 → 全量回归 → 提交
- 中文提交信息；每次任务独立提交
- 前端类型检查 `npm run type-check`（vue-tsc）；前端测试 `npm run test`（vitest run）
- 后端测试 `mvn test -Dtest=<TestClass>`；全量 `mvn test`
- 禁止使用子代理执行实现任务（项目 AGENTS.md 约定：所有任务由主代理自己完成）
- PowerShell 仅用于运行命令，不用于文件内容改写

---

### Task 1: 后端 create — API/SQL 保存即发布

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/datasource/DataSourceDefinitionService.java:106-120`（create 方法体）
- Modify: `backend/src/test/java/com/workflow/engine/datasource/DataSourceDefinitionServiceTest.java`

**Interfaces:**
- Consumes: 现有 `create(String name, String type, String formKey, String sourceKey, String params)` 签名不变
- Produces: `create` 对 API/SQL 类型返回 status=ENABLED 的数据源（其余类型维持 DRAFT 防御）

- [ ] **Step 1: 添加失败测试（RED）**

在 `DataSourceDefinitionServiceTest` 补两个测试 — API 与 SQL 创建后应为 ENABLED。参考既有 `create_apiSource_validParams_success`（L224）与 `create_sqlSource_success_withOptionalFormKey`（L540）写法：

```java
@Test
void create_apiSource_savesAsPublished() {
    DataSourceDefinition result = service.create("外部库存API", "API", null, "external-stock",
            "{\"action\":\"/api/v1/external/stock\",\"parse\":\"records\"}");
    assertEquals("ENABLED", result.getStatus());
}

@Test
void create_sqlSource_savesAsPublished() {
    DataSourceDefinition result = service.create("员工查询SQL", "SQL", "emp_profile", "emp_profile_query",
            "{\"querySql\":\"SELECT * FROM wf_biz_emp_profile\"}");
    assertEquals("ENABLED", result.getStatus());
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn test -Dtest=DataSourceDefinitionServiceTest#create_apiSource_savesAsPublished+create_sqlSource_savesAsPublished`
Expected: FAIL — 断言 `ENABLED` 但实际为 `DRAFT`（`assertEquals` 红）

- [ ] **Step 3: 最小实现（GREEN）**

在 `DataSourceDefinitionService.create` 中，`ds.setStatus(STATUS_DRAFT)`（L118）改为：

```java
// API/SQL 为手动配置的数据源：创建即发布（ENABLED）；其余类型仍 DRAFT（防御：手动创建仅 API/SQL）
boolean manualPublish = TYPE_API.equals(type) || TYPE_SQL.equals(type);
ds.setStatus(manualPublish ? STATUS_ENABLED : STATUS_DRAFT);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn test -Dtest=DataSourceDefinitionServiceTest`
Expected: PASS — 新增 2 测试绿；既有 `create_apiSource_validParams_success` 等不受影响（其不断言 status）

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/datasource/DataSourceDefinitionService.java backend/src/test/java/com/workflow/engine/datasource/DataSourceDefinitionServiceTest.java
git commit -m "feat: API/SQL 数据源创建即发布（ENABLED）"
```

---

### Task 2: 前端移除启用/禁用按钮 + 新增数据管理入口

**Files:**
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue:1175-1239`（actionButtons）
- Modify: `frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts`

**Interfaces:**
- Consumes: `dataSourceApi`（仍用 enableDataSource/disableDataSource？否 — 按钮移除后不再调用，API 方法保留不动）、`router.push({ name: 'DataSourceData', params: { id } })`
- Produces: `actionButtons` 变为 查看 / 数据管理 / 编辑 / 删除（移除启用/禁用）；「数据管理」按钮 `show: (row) => row.type !== 'WORKFLOW'`

- [ ] **Step 1: 修改测试（RED）**

`DataSourceListPage.test.ts` 中现有「操作按钮」测试（L86 起）断言启用/禁用按钮存在。改为断言：
- 无「启用」「禁用」按钮
- 有「数据管理」按钮，`show` 对 FORM/SYSTEM/API/SQL 返回 true、WORKFLOW 返回 false
- 数据管理按钮 onClick 调用 `router.push({ name: 'DataSourceData', params: { id } })`

```ts
it('操作按钮：查看(全部) + 数据管理(非WORKFLOW) + 编辑/删除(API+SQL)', async () => {
  const stub = wrapper.findComponent(SearchTableStub)
  const actionButtons = stub.props('actionButtons') as any[]
  const viewBtn = actionButtons.find((b: any) => b.label === '查看')
  const dataBtn = actionButtons.find((b: any) => b.label === '数据管理')
  const editBtn = actionButtons.find((b: any) => b.label === '编辑')
  const delBtn = actionButtons.find((b: any) => b.label === '删除')
  expect(viewBtn).toBeTruthy()
  expect(actionButtons.some((b: any) => b.label === '启用')).toBe(false)
  expect(actionButtons.some((b: any) => b.label === '禁用')).toBe(false)
  expect(dataBtn).toBeTruthy()
  expect(editBtn).toBeTruthy()
  expect(delBtn).toBeTruthy()
  // show 范围：非 WORKFLOW 显示
  expect(dataBtn!.show({ type: 'FORM' })).toBe(true)
  expect(dataBtn!.show({ type: 'SYSTEM' })).toBe(true)
  expect(dataBtn!.show({ type: 'API' })).toBe(true)
  expect(dataBtn!.show({ type: 'SQL' })).toBe(true)
  expect(dataBtn!.show({ type: 'WORKFLOW' })).toBe(false)
  // 点击跳转数据管理页
  dataBtn!.onClick({ id: 'ds-1' })
  expect(mockRouterPush).toHaveBeenCalledWith({ name: 'DataSourceData', params: { id: 'ds-1' } })
})
```

同时删除/改写既有「启用/禁用按钮 show」与「点击 enableDataSource/disableDataSource」两个测试（L127 起），改为验证按钮已移除。

测试需 mock `useRouter`：若测试已 mock router，补 `name: 'DataSourceData'` 断言路径；若未 mock，在 mount 前 `vi.mock('vue-router', ...)` 提供 `useRouter → { push: mockRouterPush }`（参考该文件现有 `router` 处理方式）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts`
Expected: FAIL — 无「数据管理」按钮、仍有「启用/禁用」按钮

- [ ] **Step 3: 最小实现（GREEN）**

`DataSourceListPage.vue` 的 `actionButtons`（L1175-1239）：
- 删除「启用」按钮对象（L1181-1195）
- 删除「禁用」按钮对象（L1196-1210）
- 在「查看」之后、「编辑」之前插入「数据管理」按钮：

```ts
{
  label: '数据管理',
  icon: Grid,
  permission: 'data-source:manage',
  show: (row: any) => row.type !== 'WORKFLOW',
  onClick: (row: any) => router.push({ name: 'DataSourceData', params: { id: row.id } }),
},
```

- 头部 import 增补 `Grid` 图标（`@element-plus/icons-vue`）；若 `CircleCheck`/`CircleClose` 不再使用则移除其 import（消除 vue-tsc unused 告警）

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts`
Expected: PASS — 操作按钮断言更新后全绿

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/dataSource/DataSourceListPage.vue frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts
git commit -m "feat: 数据源列表移除启用/禁用按钮，新增数据管理入口"
```

---

### Task 3: 后端 delete — 放开状态限制 + 页面引用保护

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/datasource/DataSourceDefinitionService.java:216-223`（delete 方法）+ 构造器注入段（L48-67）
- Modify: `backend/src/main/java/com/workflow/engine/page/repository/PageDefinitionRepository.java`
- Modify: `backend/src/test/java/com/workflow/engine/datasource/DataSourceDefinitionServiceTest.java`

**Interfaces:**
- Consumes: `PageDefinitionRepository.countByTenantIdAndDataSourceId(String tenantId, String dataSourceId)`（本任务新增）
- Produces: `delete(id)` 语义变化 — 任意状态（DRAFT/ENABLED/DISABLED）可删，但被页面引用时 400

- [ ] **Step 1: Repository 新增计数查询**

`PageDefinitionRepository.java` 增加（Spring Data 方法名派生）：

```java
long countByTenantIdAndDataSourceId(String tenantId, String dataSourceId);
```

> 注意：`PageDefinition.dataSourceId` 字段需与实体一致（已确认实体有 `dataSourceId` 字段，`ViewDataSourceMigrator` 使用）。

- [ ] **Step 2: 添加失败测试（RED）**

`DataSourceDefinitionServiceTest` 中替换 `delete_enabled_rejected`（L323-331）语义，新增：

```java
@Test
void delete_enabled_success_whenNotReferenced() {
    DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
    ds.setStatus("ENABLED");
    when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
    when(pageRepository.countByTenantIdAndDataSourceId(TENANT_ID, DS_ID)).thenReturn(0L);

    service.delete(DS_ID);

    verify(dsRepository).delete(ds);
    verify(pageRepository).countByTenantIdAndDataSourceId(TENANT_ID, DS_ID);
}

@Test
void delete_referencedByPage_rejected() {
    DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
    ds.setStatus("ENABLED");
    when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
    when(pageRepository.countByTenantIdAndDataSourceId(TENANT_ID, DS_ID)).thenReturn(2L);

    BusinessException ex = assertThrows(BusinessException.class, () -> service.delete(DS_ID));
    assertTrue(ex.getMessage().contains("页面"));
    verify(dsRepository, never()).delete(any());
}
```

保留 `delete_draft_success`（L313），它需兼容新签名（若 delete 内部新增 pageRepository 调用，该 mock 测试会因 NPE 失败 → Step 4 一并处理：`delete_draft_success` 补 `when(pageRepository.countByTenantIdAndDataSourceId(...)).thenReturn(0L)`）。

测试类需注入 `PageDefinitionRepository pageRepository` mock：在 `setUp` 中 `@Mock PageDefinitionRepository pageRepository;` 并传入 service 构造器（仿真既有 dsRepository/formAdapter 注入方式）。

- [ ] **Step 3: 运行测试确认失败**

Run: `mvn test -Dtest=DataSourceDefinitionServiceTest`
Expected: FAIL — `countByTenantIdAndDataSourceId` 不存在（编译错误）或 delete 逻辑未变（`delete_enabled_rejected` 仍断言旧消息）

- [ ] **Step 4: 最小实现（GREEN）**

`DataSourceDefinitionService`：
- 字段增 `private final PageDefinitionRepository pageRepository;`，构造器加参并赋值（注意 `UnifiedDataSourceAdapterTest` 等其它直接 new service 的测试需同步加参）
- `delete` 方法体改为：

```java
@Transactional
public void delete(String id) {
    DataSourceDefinition ds = getById(id);
    long refCount = pageRepository.countByTenantIdAndDataSourceId(tenantProvider.getTenantId(), ds.getId());
    if (refCount > 0) {
        throw new BusinessException(400, "数据源已被 " + refCount + " 个页面引用，无法删除");
    }
    dsRepository.delete(ds);
}
```

- 更新 `delete_draft_success`、`delete_enabled_rejected` 等既有测试以适配新逻辑（`delete_enabled_rejected` 改为断言"页面引用"语义或直接替换为新测试；`delete_draft_success` 补 count mock）

- [ ] **Step 5: 运行测试确认通过**

Run: `mvn test -Dtest=DataSourceDefinitionServiceTest`
Expected: PASS

- [ ] **Step 6: 全量编译 + 相关回归**

Run: `mvn test -Dtest=DataSourceDefinitionServiceTest,UnifiedDataSourceAdapterTest,DataSourceControllerTest,DataSourceReadOnlyTest`
Expected: PASS（构造器签名变更影响面内无编译错误）

- [ ] **Step 7: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/datasource/DataSourceDefinitionService.java backend/src/main/java/com/workflow/engine/page/repository/PageDefinitionRepository.java backend/src/test/java/com/workflow/engine/datasource/DataSourceDefinitionServiceTest.java
git commit -m "feat: 数据源删除放开状态限制，增加页面引用保护"
```

---

### Task 4: 抽取 `useDataSourceCrud` composable

**Files:**
- Create: `frontend/src/composables/useDataSourceCrud.ts`（新目录）
- Modify: `frontend/src/views/page/components/PageDataTable.vue`（改用 composable，删内联实现）
- Test: `frontend/src/views/page/components/__tests__/PageDataTable.test.ts`（既有，验证不回归）

**Interfaces:**
- Consumes: `dataSourceApi`（getMetadata/queryData/getData/createData/updateData/deleteData）、`formApi.getFormDefinitionByKey`、`resolveOptionRules`/`hasOptionDatasource`（`@/vendor/option-datasource`）、`withArrayLabels`（`@/views/form/arrayValueLabel`）、`DataSourceBindingContext`（`@/components/business/types`）
- Produces:
  ```ts
  // frontend/src/composables/useDataSourceCrud.ts
  export interface UseDataSourceCrudOptions {
    dialogWidth?: Ref<string> | string
    dialogHeight?: Ref<string> | undefined
  }
  export function useDataSourceCrud(refId: Ref<string> | string, options?: UseDataSourceCrudOptions): {
    metaLoaded: Ref<boolean>
    metaColumns: Ref<MetaColumn[]>
    writable: Ref<boolean>
    formKey: Ref<string>
    formSchemaRule: Ref<Record<string, any>[]>
    formDataSources: Ref<DataSourceBindingContext[]>
    formRules: ComputedRef<Record<string, any>[]>
    formConfig: ComputedRef<FormConfig | undefined>
    loadFormSchema: () => Promise<void>
    loadMetadata: () => Promise<void>
  }
  // MetaColumn = { key; label; columnType?; componentType?; required?; scale?; sortable? }
  ```
  行为契约：`loadMetadata` 拉取 metadata → writable/formKey/metaColumns → `void loadFormSchema()`；`formConfig` 在 writable=false 时返回 undefined，否则组装 create/update/delete/get Api（dataSourceApi + withArrayLabels）与 rule（formSchemaRule 优先、buildFormRule 回退）。

- [ ] **Step 1: 新建 composable（完整迁移 PageDataTable 已验证逻辑）**

创建 `frontend/src/composables/useDataSourceCrud.ts`，内容迁移自 PageDataTable L625-633（buildFormRule）、L636-657（loadFormSchema）、L660-662（formRules）、L667-688（formConfig）、L690-694（inputTypeOf）、L959-984（loadMetadata）：

```ts
import { ref, computed, toRef, type Ref, type ComputedRef } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { formApi } from '@/api/form'
import { resolveOptionRules, hasOptionDatasource } from '@/vendor/option-datasource'
import { withArrayLabels } from '@/views/form/arrayValueLabel'
import type { FormConfig, DataSourceBindingContext } from '@/components/business/types'

export interface MetaColumn {
  key: string
  label: string
  columnType?: string
  componentType?: string
  required?: boolean
  scale?: number
  sortable?: boolean
}

export interface UseDataSourceCrudOptions {
  dialogWidth?: Ref<string> | string
  dialogHeight?: Ref<string> | undefined
}

function inputTypeOf(columnType?: string): string {
  if (columnType === 'INT' || columnType === 'INTEGER' || columnType === 'BIGINT' || columnType === 'TINYINT' || columnType === 'DECIMAL') return 'inputNumber'
  if (columnType === 'DATETIME' || columnType === 'DATE') return 'datePicker'
  return 'input'
}

export function useDataSourceCrud(refId: Ref<string> | string, options: UseDataSourceCrudOptions = {}) {
  const idRef = typeof refId === 'string' ? toRef({ v: refId }, 'v') : refId

  const metaColumns = ref<MetaColumn[]>([])
  const metaLoaded = ref(false)
  const writable = ref(false)
  const formKey = ref('')
  const formSchemaRule = ref<Record<string, any>[]>([])
  const formDataSources = ref<DataSourceBindingContext[]>([])

  function buildFormRule() {
    return metaColumns.value.map((c) => ({
      type: inputTypeOf(c.columnType),
      field: c.key,
      title: c.label,
      props: c.columnType === 'DECIMAL' ? { precision: c.scale || 2 } : {},
      validate: c.required ? [{ required: true, message: `${c.label}不能为空` }] : [],
    }))
  }

  async function loadFormSchema() {
    if (!formKey.value) {
      formSchemaRule.value = []
      formDataSources.value = []
      return
    }
    try {
      const res = await formApi.getFormDefinitionByKey(formKey.value)
      const raw = (res.data as any)?.schema
      const schema = JSON.parse(raw || '[]')
      const rules = Array.isArray(schema) ? schema : (schema.rule || [])
      formDataSources.value = !Array.isArray(schema) && Array.isArray(schema.dataSources) ? schema.dataSources : []
      formSchemaRule.value = hasOptionDatasource(rules)
        ? await resolveOptionRules(rules, formDataSources.value)
        : rules
    } catch {
      formSchemaRule.value = []
      formDataSources.value = []
    }
  }

  const formRules = computed(() =>
    formSchemaRule.value.length > 0 ? formSchemaRule.value : buildFormRule(),
  )

  const formConfig = computed<FormConfig | undefined>(() => {
    if (!writable.value) return undefined
    const rules = formRules.value
    return {
      rule: rules,
      labelWidth: '100px',
      dataSources: formDataSources.value,
      createApi: (data: any) => dataSourceApi.createData(idRef.value, withArrayLabels(data, rules)),
      updateApi: (id: string, data: any, row?: any) =>
        dataSourceApi.updateData(idRef.value, id, withArrayLabels(data, rules), row?.version),
      deleteApi: (id: string) => dataSourceApi.deleteData(idRef.value, id),
      getApi: async (id: string) => {
        const r = await dataSourceApi.getData(idRef.value, id)
        return r?.data?.data || {}
      },
      dialogWidth: typeof options.dialogWidth === 'string' ? options.dialogWidth : (options.dialogWidth?.value || '500px'),
      ...(options.dialogHeight ? { dialogHeight: typeof options.dialogHeight === 'string' ? options.dialogHeight : options.dialogHeight.value } : {}),
      dialogTitle: { create: '新增数据', edit: '编辑数据' },
    }
  })

  async function loadMetadata() {
    if (!idRef.value) return
    try {
      const res = await dataSourceApi.getMetadata(idRef.value)
      const meta = res.data as any
      writable.value = !!meta?.writable
      formKey.value = meta?.formKey || ''
      metaColumns.value = (meta?.columns || []).map((c: any) => ({
        key: c.key,
        label: c.label || c.key,
        columnType: c.columnType,
        componentType: c.componentType,
        required: c.required,
        scale: c.scale,
        sortable: c.sortable,
      }))
      void loadFormSchema()
    } catch {
      // 元数据加载失败不阻断表格展示
    }
    metaLoaded.value = true
  }

  return {
    metaLoaded, metaColumns, writable, formKey, formSchemaRule, formDataSources,
    formRules, formConfig, loadFormSchema, loadMetadata,
  }
}
```

> 注：`toRef({ v: refId }, 'v')` 仅当 `refId` 传入 string 时创建静态 ref；实际 PageDataTable 与数据管理页均传 `Ref<string>`（computed），因此 `idRef` 总是 `refId` 本身。若保留 string 兼容，用 `computed(() => (typeof refId === 'string' ? refId : refId.value))` 更稳 —— 采用此写法：

```ts
const idRef = computed(() => (typeof refId === 'string' ? refId : refId.value))
```

- [ ] **Step 2: PageDataTable 改用 composable（GREEN 目标：既有测试不回归）**

`PageDataTable.vue`：
- 引入 `import { useDataSourceCrud } from '@/composables/useDataSourceCrud'`
- 删除 L177-187 的 metaColumns/metaLoaded/writable/formKey/formSchemaRule/formDataSources ref 定义、L625-633 buildFormRule、L636-657 loadFormSchema、L660-662 formRules、L667-688 formConfig、L690-694 inputTypeOf、L959-984 loadMetadata — 替换为：

```ts
const crud = useDataSourceCrud(resolvedRefId, {
  dialogWidth: computed(() => props.viewDetail?.width || '500px'),
  dialogHeight: computed(() => props.viewDetail?.height || undefined),
})
const { metaLoaded, metaColumns, writable, formKey, formSchemaRule, formDataSources, formRules, formConfig, loadFormSchema, loadMetadata } = crud
```

- 保留下游引用点不变：formRules 供 detailRules/localFormRules；formConfig 供 SearchTable/处理；loadMetadata 供 onMounted/watch；metaColumns 供 resolvedColumns/fetchApi/resolveSearchColumn；formKey 供 fetchApi（如果用到）
- `idRef` 采用 computed 版本确保 `resolvedRefId` 变化时 formConfig 的 Api 目标随之更新（原实现直接读 `resolvedRefId.value`，行为一致）

- [ ] **Step 3: 运行 PageDataTable 测试确认通过**

Run: `npm run test -- frontend/src/views/page/components/__tests__/PageDataTable.test.ts`
Expected: PASS — 抽离后行为不变（既有 mock：metadata/formSchema/getData/createData/updateData/deleteData 路径）

- [ ] **Step 4: 类型检查**

Run: `npm run type-check`
Expected: 无新增错误（既有 `isViewMode` TS6133 为 pre-existing，忽略）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/composables/useDataSourceCrud.ts frontend/src/views/page/components/PageDataTable.vue
git commit -m "refactor: 抽取 useDataSourceCrud composable 供 PageDataTable 复用"
```

---

### Task 5: 新建数据源数据管理页 DataSourceDataPage

**Files:**
- Create: `frontend/src/views/dataSource/DataSourceDataPage.vue`
- Modify: `frontend/src/router/index.ts:143-148`（data-source/list 后新增路由）
- Test: `frontend/src/views/dataSource/__tests__/DataSourceDataPage.test.ts`（新建）

**Interfaces:**
- Consumes: `useDataSourceCrud(id)`（Task 4）、`dataSourceApi.getDataSource(id)`、`SearchTable`、`useRoute`/`useRouter`
- Produces: 路由 `data-source/:id/data`（name=DataSourceData）；页面行为：页头（返回 + 名称/类型/状态标签）+ SearchTable（列=metaColumns、fetchApi=adapter queryData、writable 时 formConfig=CRUD、只读时无操作列）

- [ ] **Step 1: 写页面测试（RED）**

新建 `frontend/src/views/dataSource/__tests__/DataSourceDataPage.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getDataSource: vi.fn(async () => ({ data: { id: 'ds-1', name: '员工查询', type: 'SQL', status: 'ENABLED' } })),
    getMetadata: vi.fn(async () => ({
      data: { writable: true, formKey: 'emp_profile', columns: [
        { key: 'id', label: 'ID', columnType: 'BIGINT' },
        { key: 'name', label: '姓名', columnType: 'VARCHAR', required: true },
      ] },
    })),
    queryData: vi.fn(async () => ({ data: { records: [{ id: 'r1', data: { id: 1, name: '张三' }, version: 1 }], total: 1 } })),
  },
}))
vi.mock('@/api/form', () => ({
  formApi: { getFormDefinitionByKey: vi.fn(async () => ({ data: { schema: '[]' } })) },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'ds-1' } }),
  useRouter: () => ({ back: vi.fn() }),
}))

// SearchTable stub：断言传入的 columns/fetchApi/formConfig
const SearchTableStub = {
  name: 'SearchTable',
  template: '<div><slot /></div>',
  props: ['columns', 'fetchApi', 'formConfig', 'searchFields', 'defaultPageSize', 'pageSizes'],
}

import DataSourceDataPage from '../DataSourceDataPage.vue'

describe('DataSourceDataPage', () => {
  let wrapper: any
  beforeEach(async () => {
    wrapper = mount(DataSourceDataPage, { global: { stubs: { SearchTable: SearchTableStub } } })
    await flushPromises()
  })

  it('页头显示数据源名称/类型/状态', () => {
    expect(wrapper.text()).toContain('员工查询')
    expect(wrapper.text()).toContain('SQL')
    expect(wrapper.text()).toContain('已启用')
  })

  it('可写数据源透传 formConfig 给 SearchTable（CRUD 弹窗）', async () => {
    const stub = wrapper.findComponent(SearchTableStub) as any
    expect(stub.props('formConfig')).toBeTruthy()
    expect(stub.props('formConfig').createApi).toBeTypeOf('function')
    expect(stub.props('formConfig').updateApi).toBeTypeOf('function')
    expect(stub.props('formConfig').deleteApi).toBeTypeOf('function')
    expect(stub.props('columns')).toHaveLength(2)
  })

  it('fetchApi 委托 dataSourceApi.queryData', async () => {
    const stub = wrapper.findComponent(SearchTableStub) as any
    const res = await stub.props('fetchApi')({ page: 1, size: 20 })
    expect(res.rows).toHaveLength(1)
    expect(res.total).toBe(1)
  })

  it('只读数据源（writable=false）formConfig 为 undefined（纯列表）', async () => {
    const { dataSourceApi } = await import('@/api/data-source')
    ;(dataSourceApi.getMetadata as any).mockResolvedValueOnce({
      data: { writable: false, formKey: '', columns: [{ key: 'id', label: 'ID', columnType: 'BIGINT' }] },
    })
    wrapper = mount(DataSourceDataPage, { global: { stubs: { SearchTable: SearchTableStub } } })
    await flushPromises()
    expect((wrapper.findComponent(SearchTableStub) as any).props('formConfig')).toBeUndefined()
  })
})
```

> 注：SearchTable 实际渲染由 stub 承接；真实列渲染逻辑已被 PageDataTable/BizDataListPage 测试覆盖，此处验证契约（columns/fetchApi/formConfig 透传）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- frontend/src/views/dataSource/__tests__/DataSourceDataPage.test.ts`
Expected: FAIL — 组件不存在（import 错误）

- [ ] **Step 3: 页面实现（GREEN）**

新建 `frontend/src/views/dataSource/DataSourceDataPage.vue`：

```vue
<template>
  <div class="ds-data-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" @click="router.back()">返回</el-button>
      <span class="page-title">{{ name || '数据源数据' }}</span>
      <el-tag v-if="type" :type="typeTagType(type)" size="small">{{ typeLabel(type) }}</el-tag>
      <el-tag v-if="status" :type="statusTagType(status)" size="small">{{ statusLabel(status) }}</el-tag>
    </div>

    <SearchTable
      v-if="crud.metaLoaded.value"
      :columns="columns"
      :fetch-api="fetchApi"
      :form-config="crud.formConfig.value"
      :default-page-size="20"
      :page-sizes="[10, 20, 50]"
    />
    <el-card v-else v-loading="!crud.metaLoaded.value" style="min-height: 200px" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'DataSourceData' })

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { TableColumn } from '@/components/business/types'
import { dataSourceApi } from '@/api/data-source'
import { useDataSourceCrud } from '@/composables/useDataSourceCrud'

const route = useRoute()
const router = useRouter()

const dsId = computed(() => route.params.id as string)
const crud = useDataSourceCrud(dsId)

const name = ref('')
const type = ref('')
const status = ref('')

const columns = computed<TableColumn[]>(() =>
  crud.metaColumns.value.map((c) => ({
    prop: c.key,
    label: c.label,
    minWidth: 120,
    sortable: c.sortable ? 'custom' : false,
  })),
)

const fetchApi = async (params: { page: number; size: number; [key: string]: any }) => {
  const query: Record<string, any> = { page: Math.max(1, params.page), size: params.size }
  if (params.sort) query.sort = params.sort
  if (params.order) query.order = params.order
  const res: any = await dataSourceApi.queryData(dsId.value, query)
  const rows = (res?.data?.records || []).map((r: any) => ({ ...(r.data || {}), id: r.id, version: r.version }))
  return { rows, total: res?.data?.total || 0 }
}

onMounted(async () => {
  const ds = await dataSourceApi.getDataSource(dsId.value)
  name.value = (ds.data as any)?.name || ''
  type.value = (ds.data as any)?.type || ''
  status.value = (ds.data as any)?.status || ''
  await crud.loadMetadata.value()
})

function typeTagType(t: string): '' | 'primary' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'primary' | 'success' | 'warning' | 'info'> = {
    FORM: 'primary', WORKFLOW: 'primary', SYSTEM: 'success', API: 'warning', SQL: 'info',
  }
  return map[t] || ''
}
function typeLabel(t: string): string {
  const map: Record<string, string> = { FORM: '业务表单', WORKFLOW: '工作流表单', SYSTEM: '系统结构', API: '第三方 API', SQL: 'SQL 查询' }
  return map[t] || t
}
function statusTagType(s: string): '' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'info'> = { DRAFT: 'warning', ENABLED: 'success', DISABLED: 'info' }
  return map[s] || ''
}
function statusLabel(s: string): string {
  const map: Record<string, string> = { DRAFT: '草稿', ENABLED: '已启用', DISABLED: '已禁用' }
  return map[s] || s
}
</script>

<style scoped>
.ds-data-page { padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.page-title { font-size: 16px; font-weight: 600; color: #303133; }
</style>
```

- [ ] **Step 4: 新增路由**

`frontend/src/router/index.ts` 中 `data-source/list`（L144-148）之后追加：

```ts
{
  path: 'data-source/:id/data',
  name: 'DataSourceData',
  component: () => import('@/views/dataSource/DataSourceDataPage.vue'),
  meta: { title: '数据源数据管理' }
},
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- frontend/src/views/dataSource/__tests__/DataSourceDataPage.test.ts`
Expected: PASS

- [ ] **Step 6: 类型检查**

Run: `npm run type-check`
Expected: 无新增错误

- [ ] **Step 7: 提交**

```bash
git add frontend/src/views/dataSource/DataSourceDataPage.vue frontend/src/router/index.ts frontend/src/views/dataSource/__tests__/DataSourceDataPage.test.ts
git commit -m "feat: 新增数据源数据管理页（SearchTable + 表单 CRUD）"
```

---

### Task 6: 全量回归 + 浏览器验证

**Files:**
- (none — 验证任务)

**Interfaces:**
- Consumes: Task 1-5 的全部产出

- [ ] **Step 1: 后端全量测试**

Run: `mvn test`
Expected: PASS（既有 1 个失败 `PageDefinitionPublishIntegrationTest.publish_sameContent_rejectedAsUnchanged` 为基线既有失败，与本次无关，记录说明）

- [ ] **Step 2: 前端全量测试 + 类型检查**

Run: `npm run test`
Expected: PASS（1008+ 测试全绿）

Run: `npm run type-check`
Expected: 无新增错误（仅既有 isViewMode TS6133）

- [ ] **Step 3: 浏览器端到端验证（后端热部署已生效）**

1. 登录（admin/admin123）→ 数据源管理
2. 新建 SQL 数据源 → 保存 → 列表状态直接为「已启用」，且无启用/禁用按钮
3. 打开该数据源「数据管理」→ 跳转数据管理页，列表展示 querySql 查询结果（绑定 emp_profile 表单时经 querySqlRaw 绕过 covering handler，返回真实记录）
4. 若数据源绑定了主表单：点击新增/编辑/删除 → 弹窗按表单 schema 渲染，CRUD 经 `/data-sources/{id}/data` 生效
5. 打开一个 WORKFLOW 数据源列表 → 无「数据管理」按钮
6. 删除一个被页面引用的数据源 → 后端返回 400「数据源已被 N 个页面引用，无法删除」
7. 删除一个未被引用的 ENABLED 数据源 → 删除成功

- [ ] **Step 4: 提交验证记录（如有发现问题则修复后回归）**

若 Step 3 发现问题：修复 → 重跑相关测试 → 回到 Step 1/2 回归 → 提交修复。

---

## Self-Review

**1. Spec 覆盖：**
- D1（API/SQL 保存即发布）→ Task 1 ✓
- D1（前端移除启用/禁用）→ Task 2 ✓
- D2（ENABLED 可编辑）→ 既有能力，无需改动（update 已允许非 bindChanged 编辑）✓
- D2（删除放开 + 页面引用保护）→ Task 3 ✓
- D3（数据管理按钮 + 路由 + 页面）→ Task 2（按钮/跳转）+ Task 5（页面/路由）✓
- D3（只读数据源纯列表）→ Task 5（writable=false → formConfig undefined → 无默认操作列）✓
- D4（useDataSourceCrud 抽取 + PageDataTable 复用）→ Task 4 ✓
- 测试（前端新页/composable/后端状态断言/回归）→ Task 1/4/5 测试步骤 + Task 6 ✓

**2. Placeholder 扫描：** 无 TBD/TODO；所有步骤含具体代码与命令 ✓

**3. 类型一致性：**
- `useDataSourceCrud` 返回字段名（metaLoaded/metaColumns/writable/formKey/formSchemaRule/formDataSources/formRules/formConfig/loadFormSchema/loadMetadata）贯穿 Task 4/5 一致 ✓
- `dataSourceApi` 方法名（getMetadata/queryData/getData/createData/updateData/deleteData）与真实 API（frontend/src/api/data-source.ts）一致 ✓
- `FormConfig`/`ActionButton`/`TableColumn`/`DataSourceBindingContext` 引用 `@/components/business/types` 既有类型 ✓
- `PageDefinitionRepository.countByTenantIdAndDataSourceId(tenantId, dataSourceId)` 签名在 Task 3 定义并被 delete 使用 ✓
- `SearchTable` props（columns/fetch-api/form-config/default-page-size/page-sizes）与 SearchTable 组件契约一致 ✓
- 路由 name `DataSourceData` 在 Task 2（push）与 Task 5（定义）一致 ✓