## ADDED Requirements

### Requirement: Tab State Preservation
系统 SHALL 在用户切换页签时保持之前页签的完整组件状态，包括表单输入、查询条件、分页、排序、弹窗状态等。

#### Scenario: User switches between tabs
- **WHEN** 用户打开多个页签并切换到另一个页签
- **THEN** 之前的页签组件状态完整保留，再次切换回来时显示之前的输入和数据

#### Scenario: Component state includes form inputs
- **WHEN** 用户在某个页签中填写表单但未提交
- **THEN** 切换到其他页签再切回时，表单输入仍然保留

#### Scenario: Component state includes query results
- **WHEN** 用户在某个页签中执行查询并获得结果
- **THEN** 切换到其他页签再切回时，查询结果仍然显示，无需重新请求

#### Scenario: Component state includes dialog/drawer state
- **WHEN** 用户在某个页签中打开了弹窗或抽屉
- **THEN** 切换到其他页签再切回时，弹窗或抽屉状态保持

---

### Requirement: Memory Management
系统 SHALL 限制缓存的组件实例数量，防止内存无限增长。

#### Scenario: Maximum cached tabs limit
- **WHEN** 用户打开超过 15 个页签
- **THEN** 系统自动销毁最久未访问的页签组件实例，保持缓存数量不超过 15

#### Scenario: LRU eviction
- **WHEN** 缓存数量达到上限且用户打开新页签
- **THEN** 系统按照最近最少使用（LRU）策略销毁一个实例，为新页签腾出空间

#### Scenario: Tab close triggers cache cleanup
- **WHEN** 用户关闭一个页签
- **THEN** 对应的组件实例从缓存中移除，释放内存

---

### Requirement: Force Refresh
系统 SHALL 支持用户主动刷新页签数据，即使组件被缓存。

#### Scenario: Menu click same item triggers refresh
- **WHEN** 用户在左侧菜单中点击当前已打开页签对应的菜单项
- **THEN** 系统触发该页签的数据重新加载，但保留其他状态（如搜索条件）

#### Scenario: Refresh preserves form state
- **WHEN** 用户触发强制刷新
- **THEN** 表单输入、筛选条件等状态保留，仅重新拉取列表数据

---

### Requirement: Shared Component Isolation
系统 SHALL 为使用同一组件但不同参数的路由创建独立的缓存实例。

#### Scenario: Different pageKey routes isolated
- **WHEN** 用户打开 /page/test-view-1 和 /page/test-view-2 两个页签
- **THEN** 两个页签各自维护独立的组件状态，互不影响

#### Scenario: Same component different params
- **WHEN** 多个页签使用相同的 PageRenderer 组件但不同 pageKey 参数
- **THEN** 每个页签有独立的缓存实例，切换时显示正确的页面内容

---

## MODIFIED Requirements

无（此为新功能，不修改现有 spec）

## REMOVED Requirements

### Requirement: Page Query State Cache

**Reason**: keep-alive 已完整保留组件状态，手动缓存 query/sort 冗余

**Migration**: 删除 getPageQueryState/setPageQueryState/clearPageQueryState 函数，删除 pageQueryState reactive 对象，删除 menuPathMap 相关函数。组件直接从自身状态构建请求。

---

## RENAMED Requirements

无
