# Data Source Field Metadata + Data Preview Design

## Purpose

Add field metadata viewing and data preview capabilities to the data source management page. Users can inspect column definitions and preview actual data rows from any data source.

## Background

The backend already provides the infrastructure:
- `DataSourceController` has `/metadata` and `/data` endpoints
- `UnifiedDataSourceAdapter` implements `metadata()` and `query()` for all types (FORM/SYSTEM/API/WORKFLOW)
- The frontend API client (`data-source.ts`) already has `getMetadata(id)` and `queryData(id, params)` methods

The missing piece is the **UI in `DataSourceListPage.vue`** to display these.

## Design

### Approach: Tabs in Detail Dialog (Approach A)

Add `el-tabs` to the existing detail dialog with three tabs:
1. **接口配置** — existing endpoint configuration display
2. **字段元数据** — column definitions from `getMetadata(id)`
3. **数据预览** — paginated data table from `queryData(id, params)`

### Field Metadata Tab

- Calls `dataSourceApi.getMetadata(id)` on tab activation
- Displays columns in an `el-table` with: key, label, columnType, length/scale, required, unique, indexed
- Shows `writable` flag as a tag (read-only sources show "只读")
- Loading state while fetching; error message on failure

### Data Preview Tab

- Calls `dataSourceApi.queryData(id, params)` on tab activation (default: page=1, size=20)
- Displays records in an `el-table`:
  - Columns dynamically generated from metadata columns
  - Each row is a `BizDataVO` with `data` as a `Record<string, unknown>`
  - Shows `id`, then all column keys from metadata
- Search box above table: keyword + keywordColumn (uses `DataSourceQueryParams.keyword`)
- Pagination below table: `el-pagination` with page/size options (10/20/50/100)
- Loading state while fetching; error message on failure

### Data Flow

1. User clicks "查看" on a data source row → opens detail dialog
2. Dialog loads data source detail → shows "接口配置" tab by default
3. User switches to "字段元态" tab → calls `getMetadata(id)` → renders column table
4. User switches to "数据预览" tab → calls `queryData(id, {page:1, size:20})` → renders data table + pagination
5. User searches or changes page → calls `queryData(id, {...updated params})` → refreshes data table

### Error Handling

- Metadata/query failure → `ElMessage.error` + empty state in table
- Read-only data sources (SYSTEM/WORKFLOW): metadata `writable=false`, data is read-only (no create/update/delete buttons in data preview)

### Component Structure

```
DataSourceListPage.vue (modified)
├── el-dialog (existing detail dialog)
    └── el-tabs (NEW)
        ├── el-tab-pane[name="config"] — existing endpoint config
        ├── el-tab-pane[name="metadata"] — NEW: column definitions table
        └── el-tab-pane[name="data"] — NEW: data preview table + search + pagination
```

### State Management (in component `setup`)

```typescript
// Metadata tab state
const metadata = ref<DataSourceMetadataDTO | null>(null)
const metadataLoading = ref(false)
const metadataError = ref<string | null>(null)

// Data preview tab state
const previewData = ref<BizDataVO[]>([])
const previewTotal = ref(0)
const previewPage = ref(1)
const previewSize = ref(20)
const previewKeyword = ref('')
const dataLoading = ref(false)
const dataError = ref<string | null>(null)
```

### Tab Activation Strategy

Use `@tab-click` handler to lazily load data:
- Track which tabs have been loaded (avoids refetching on tab switch)
- Metadata loaded once, cached
- Data preview loaded on first switch; subsequent switches reuse cached page, but search/page changes trigger refetch

## Testing

### Frontend Component Tests
- Tab switching renders correct content
- Metadata tab: shows column definitions after API call
- Data preview tab: shows paginated data, search triggers new API call, pagination works
- Error states: API failure shows error message

### Backend Tests
- Existing `DataSourceControllerTest` covers `/metadata` and `/data` endpoints
- No new backend tests needed (infrastructure already covered)

### E2E
- Click data source → 查看 → switch tabs → verify metadata/数据 display correctly
