## Context

当前项目中，表单设计器（FormDesigner）和页面设计器（PageDesigner）的数据源配置存在三层结构：

1. **全局数据源**（DataSourceDefinition）：注册 FORM/SYSTEM/API 类型的数据源，存储 formKey、params 等配置
2. **页面/表单级绑定**（DataSourceConfigPanel）：`{ id (页面内标识), refId (全局数据源ID), searchFields }` 的映射
3. **组件级独立配置**（LookupPicker/DataPicker）：组件自己维护 sourceType、sourceFormKey、apiUrl、headers、params 等

问题：组件级独立配置与页面级绑定功能重叠，导致配置分散、维护成本高、容易不一致。

## Goals / Non-Goals

**Goals:**
- 去除 LookupPicker 和 DataPicker 组件的独立数据源配置
- 组件通过 `dataSourceId`（页面内标识）引用页面数据源绑定
- 支持 filter 两层继承：数据源级 filter + 组件级 filter 覆盖
- 支持预览和运行期都能获取数据源数据
- 不需要兼容旧配置格式

**Non-Goals:**
- 不修改全局数据源定义（DataSourceDefinition）
- 不修改后端数据查询 API（PageQueryController 已有 dataSourceId → refId 解析）
- 不修改 DataSourceConfigPanel 组件
- 不处理 LookupPicker 的 returnFields 字段映射调整（后续单独评估）

## Decisions

### 1. DataSourceBinding 扩展 filter 字段

```typescript
interface DataSourceBinding {
  id: string            // 页面内标识
  refId: string         // 全局数据源ID
  searchFields?: string[]
  filter?: DataSourceFilter  // 新增
}

interface DataSourceFilter {
  logic: 'AND' | 'OR'
  conditions: FilterCondition[]
}

interface FilterCondition {
  column: string
  op: 'eq' | 'ne' | 'like' | 'in' | 'isEmpty' | 'isNotEmpty'
  source?: 'fixed' | 'field'
  value?: any           // source=fixed 时的值
  field?: string        // source=field 时的字段名（运行期从 formData 解析）
}
```

### 2. 组件配置简化

**LookupPicker 去除：**
- `sourceType`（form/api 选择）
- `sourceFormKey`（直接选表单）
- `action`、`method`、`headers`、`data`（API 配置）
- `parse`、`totalParse`、`searchParam`、`keywordColumn`、`pageBase`（fetch 配置）

**LookupPicker 保留/新增：**
- `dataSourceId`（页面内数据源标识）
- `displayField`（显示字段）
- `columns`（列表列）
- `returnFields`（字段映射）
- `filter`（组件级筛选）
- `idField`（ID 字段）

**DataPicker 去除：**
- `sourceFormKey`（直接选表单）

**DataPicker 保留/新增：**
- `dataSourceId`（页面内数据源标识）
- `displayField`（显示字段）
- `columns`（列表列）
- `searchColumns`（搜索列）
- `maxCount`（最多可选数）
- `filter`（组件级筛选）
- `clearOnCascadeChange`、`allowCreate`、`detailReadonly`（行为设置）

### 3. Filter 合并机制

```typescript
function mergeFilters(
  dsFilter?: DataSourceFilter,
  componentFilter?: DataSourceFilter
): DataSourceFilter | undefined {
  // 两层都没有 → undefined
  if (!dsFilter && !componentFilter) return undefined
  // 只有一层 → 用那一层
  if (!dsFilter) return componentFilter
  if (!componentFilter) return dsFilter
  // 两层都有 → AND 合并
  return {
    logic: 'AND',
    conditions: [
      ...(dsFilter.logic === 'AND' ? dsFilter.conditions : [{ logic: 'AND', conditions: dsFilter.conditions }]),
      ...(componentFilter.logic === 'AND' ? componentFilter.conditions : [{ logic: 'AND', conditions: componentFilter.conditions }]),
    ],
  }
}
```

### 4. 运行期数据流

```
组件(dataSourceId, componentFilter)
  ↓
查找 DataSourceBinding by id
  ↓
合并 filter = dsFilter + componentFilter
  ↓
解析 field 引用（从 formData 取值）
  ↓
调用后端 API（filter 作为参数）
  ↓
PageQueryController 解析 refId → 查询数据源
```

### 5. 预览支持

- 设计器预览需先保存页面（schema 持久化）
- 预览接口 `pageApi.getPageByKey(pageKey, preview=true)` 已支持
- 组件查询逻辑与运行期一致

## Risks / Trade-offs

### 风险
1. **已有表单配置迁移**：已发布的表单中 LookupPicker/DataPicker 的旧配置需要清理，但用户明确表示不需要兼容
2. **filter 合并复杂度**：两层 AND 合并在极端情况下可能产生冗余条件，但实际使用场景中不太可能出现

### 权衡
1. **灵活性 vs 集中管理**：选择集中管理优先，通过 filter 继承机制保留灵活性
2. **预览依赖保存**：预览前必须保存页面，增加了操作步骤，但确保了数据一致性
