# Data Source Field Metadata + Data Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tabs to the DataSourceListPage.vue detail dialog to view data source field metadata (columns) and preview actual data rows.

**Architecture:** Frontend-only feature. The backend API (`/metadata`, `/data`) and frontend API client (`dataSourceApi.getMetadata`, `dataSourceApi.queryData`) are already implemented. We only need to add the UI tabs in `DataSourceListPage.vue`.

**Tech Stack:** Vue 3 + TypeScript + Element Plus + Vitest (frontend tests)

## Global Constraints

- Work in the existing worktree `feature/form-container-datasource` branch
- Follow existing patterns: `DataSourceListPage.vue` uses `el-dialog`, `el-form`, `SearchTable` component
- Use TDD: write failing tests first, watch them fail, implement minimal code, watch them pass
- Frontend uses Vitest for component tests with `@vue/test-utils` and Element Plus mocks
- No `@ts-ignore`, `as any`, or type suppression allowed
- Commit frequently (one commit per task)

---

## File Structure

- **Modify:** `frontend/src/views/dataSource/DataSourceListPage.vue`
  - Add `el-tabs` with 3 tabs (接口配置, 字段元数据, 数据预览)
  - Add metadata state + loading refs
  - Add data preview state + pagination + search
- **Test:** `frontend/src/views/dataSource/DataSourceListPage.spec.ts` (new file)
  - Tests for tab rendering, metadata display, data preview with pagination

## Task 1: Tab Structure + Metadata Tab

**Files:**
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue`
- Test: `frontend/src/views/dataSource/DataSourceListPage.spec.ts`

**Interfaces:**
- Consumes: `dataSourceApi.getMetadata(id)` → `R<DataSourceMetadataDTO>`
- Consumes: `dataSourceApi.queryData(id, params)` → `R<BizDataPageResult>`
- Produces: Tabbed UI in detail dialog

### Implementation Steps

#### Step 1: Write failing test — tab structure and metadata rendering

```typescript
// frontend/src/views/dataSource/DataSourceListPage.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DataSourceListPage from './DataSourceListPage.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getDataSources: vi.fn(),
    getMetadata: vi.fn(),
    queryData: vi.fn(),
  },
}))

vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinitions: vi.fn(),
  },
}))

vi.mock('@/components/business', () => ({
  SearchTable: {
    name: 'SearchTable',
    template: '<div><slot /></div>',
    methods: { fetchList: vi.fn() },
  },
}))

const mockMetadata = {
  columns: [
    { key: 'id', label: 'ID', columnType: 'VARCHAR', length: 64, required: true, unique: true, indexed: false },
    { key: 'name', label: '名称', columnType: 'VARCHAR', length: 128, required: true, unique: false, indexed: false },
  ],
  writable: true,
}

describe('DataSourceListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders three tabs in detail dialog: 接口配置, 字段元数据, 数据预览', async () => {
    const { dataSourceApi } = await import('@/api/data-source')
    vi.mocked(dataSourceApi.getDataSources).mockResolvedValue({
      code: 0,
      data: { content: [], totalElements: 0, number: 0, size: 20 },
    })
    vi.mocked(dataSourceApi.getMetadata).mockResolvedValue({ code: 0, data: mockMetadata })
    vi.mocked(dataSourceApi.queryData).mockResolvedValue({
      code: 0,
      data: { records: [], total: 0, page: 1, size: 20 },
    })

    const wrapper = mount(DataSourceListPage)
    await nextTick()

    // Open detail dialog by simulating row click
    // ... (simulate opening dialog)
    // Check tabs exist
    expect(wrapper.text()).toContain('接口配置')
    expect(wrapper.text()).toContain('字段元数据')
    expect(wrapper.text()).toContain('数据预览')
  })

  it('renders column metadata table after switching to 字段元数据 tab', async () => {
    const { dataSourceApi } = await import('@/api/data-source')
    vi.mocked(dataSourceApi.getMetadata).mockResolvedValue({ code: 0, data: mockMetadata })

    const wrapper = mount(DataSourceListPage)
    // ... open dialog, switch to metadata tab
    await nextTick()
    expect(dataSourceApi.getMetadata).toHaveBeenCalled()
    expect(wrapper.text()).toContain('ID')
    expect(wrapper.text()).toContain('名称')
  })
})
```

Expected failure: No tabs exist yet, no metadata rendering.

#### Step 2: Run test to verify it fails

```bash
cd frontend && npx vitest run src/views/dataSource/DataSourceListPage.spec.ts
```
Expected: FAIL — components not found

#### Step 3: Add tab structure to detail dialog

In `DataSourceListPage.vue`:
1. Wrap existing "接口操作" content in `el-tab-pane[name="config"]`
2. Add `el-tabs` with three panes
3. Add metadata state refs:
```typescript
const metadata = ref<DataSourceMetadataDTO | null>(null)
const metadataLoading = ref(false)
const metadataError = ref<string | null>(null)
```
4. Add handler for tab switch that loads metadata:
```typescript
async function onTabChange(tab: string) {
  if (tab === 'metadata' && !metadata.value && editingId.value) {
    metadataLoading.value = true
    try {
      const res = await dataSourceApi.getMetadata(editingId.value)
      metadata.value = res.data
      metadataError.value = null
    } catch (e) {
      metadataError.value = '加载字段元数据失败'
    } finally {
      metadataLoading.value = false
    }
  }
}
```

#### Step 4: Run test to verify it passes

```bash
cd frontend && npx vitest run src/views/dataSource/DataSourceListPage.spec.ts
```
Expected: PASS

#### Step 5: Commit

```bash
git add frontend/src/views/dataSource/DataSourceListPage.vue frontend/src/views/dataSource/DataSourceListPage.spec.ts
git commit -m "feat: 数据源详情弹窗添加元数据/预览标签页"
```

## Task 2: Metadata Tab UI

**Files:**
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue`
- Test: `frontend/src/views/dataSource/DataSourceListPage.spec.ts`

### Implementation Steps

#### Step 1: Write failing test — metadata columns rendering

Add test verifying:
- Column key/label/type/length displayed in `el-table`
- Required/unique/indexed badges visible
- Writable flag shown as tag

```typescript
it('shows writable tag when metadata.writable is true', async () => {
  // ... mock metadata with writable=true
  // verify tag "可写" or similar shown
})
```

#### Step 2: Run test to verify failure

#### Step 3: Implement metadata tab UI

Add in the "字段元数据" tab-pane:
```vue
<el-table :data="metadata?.columns || []" v-loading="metadataLoading" style="width: 100%">
  <el-table-column prop="key" label="字段名" />
  <el-table-column prop="label" label="显示名" />
  <el-table-column prop="columnType" label="类型" />
  <el-table-column prop="length" label="长度" />
  <el-table-column prop="required" label="必填" />
  <el-table-column prop="unique" label="唯一" />
  <el-table-column prop="indexed" label="索引" />
</el-table>
<el-tag v-if="metadata?.writable" type="success">可写</el-tag>
<el-tag v-else type="info">只读</el-tag>
```

#### Step 4: Run tests, verify pass

#### Step 5: Commit

```bash
git add frontend/src/views/dataSource/DataSourceListPage.vue frontend/src/views/dataSource/DataSourceListPage.spec.ts
git commit -m "feat: 字段元数据标签页渲染列定义表格"
```

## Task 3: Data Preview Tab

**Files:**
- Modify: `frontend/src/views/dataSource/DataSourceListPage.vue`
- Test: `frontend/src/views/dataSource/DataSourceListPage.spec.ts`

### Implementation Steps

#### Step 1: Write failing test — data preview table and pagination

```typescript
it('fetches and displays data preview when switching to 数据预览 tab', async () => {
  const mockRecords = [
    { id: '1', data: { id: '1', name: '测试行1' }, version: 1, createdAt: '', updatedAt: '' },
    { id: '2', data: { id: '2', name: '测试行2' }, version: 1, createdAt: '', updatedAt: '' },
  ]
  vi.mocked(dataSourceApi.queryData).mockResolvedValue({
    code: 0,
    data: { records: mockRecords, total: 2, page: 1, size: 20 },
  })

  const wrapper = mount(DataSourceListPage)
  // ... open dialog, switch to data tab
  await nextTick()
  expect(dataSourceApi.queryData).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ page: 1, size: 20 })
  )
  expect(wrapper.text()).toContain('测试行1')
  expect(wrapper.text()).toContain('测试行2')
})
```

#### Step 2: Run test to verify failure

#### Step 3: Implement data preview tab UI

Add state refs:
```typescript
const previewData = ref<BizDataVO[]>([])
const previewTotal = ref(0)
const previewPage = ref(1)
const previewSize = ref(20)
const previewKeyword = ref('')
const dataLoading = ref(false)
const dataError = ref<string | null>(null)
```

Add in "数据预览" tab-pane:
```vue
<div class="preview-toolbar">
  <el-input v-model="previewKeyword" placeholder="搜索关键词" style="width: 200px" />
</div>
<el-table :data="previewData" v-loading="dataLoading" style="width: 100%">
  <el-table-column :prop="col.key" v-for="col in metadata?.columns" :key="col.key" :label="col.label" />
</el-table>
<el-pagination
  layout="total, prev, pager, next"
  :page-size="previewSize"
  :total="previewTotal"
  @size-change="onSizeChange"
  @current-change="onPageChange"
/>
```

Add data fetch function:
```typescript
async function fetchPreviewData() {
  if (!editingId.value) return
  dataLoading.value = true
  try {
    const res = await dataSourceApi.queryData(editingId.value, {
      page: (previewPage.value - 1), // backend uses 0-indexed
      size: previewSize.value,
      keyword: previewKeyword.value || undefined,
    })
    previewData.value = res.data.records
    previewTotal.value = res.data.total
    dataError.value = null
  } catch (e) {
    dataError.value = '加载数据失败'
  } finally {
    dataLoading.value = false
  }
}
```

#### Step 4: Run tests, verify pass

#### Step 5: Commit

```bash
git add frontend/src/views/dataSource/DataSourceListPage.vue frontend/src/views/dataSource/DataSourceListPage.spec.ts
git commit -m "feat: 数据预览标签页支持分页查询和搜索"
```

## Task 4: Integration + E2E Verification

**Files:** None (verification)

### Steps

1. Run full frontend build:
```bash
cd frontend && npm run build
```

2. Run all frontend tests:
```bash
cd frontend && npx vitest run
```

3. Verify the complete flow works (manually or via E2E if available)

## Spec Coverage Check

| Requirement | Task |
|---|---|
| View field metadata in detail dialog | Task 1 + Task 2 |
| Preview data with pagination | Task 3 |
| Search/filter data preview | Task 3 |
| Read-only indicator for metadata | Task 2 |
| Tab-based navigation | Task 1 |

All requirements covered.
