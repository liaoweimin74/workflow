## ADDED Requirements

### Requirement: 卡片列表查询栏

ListCards SHALL 在启用查询且存在有效查询字段时渲染查询栏，并 SHALL 使用页面配置的字段标签和字段键收集查询值。

#### Scenario: 运行态显示查询栏
- **WHEN** PageDataCards 传入 `showSearch=true` 且 `searchFields` 至少包含一个字段
- **THEN** 卡片列表顶部显示与 SearchTable 一致的查询输入区域

#### Scenario: 无查询字段时隐藏查询栏
- **WHEN** `showSearch` 未启用或 `searchFields` 为空
- **THEN** 卡片列表不显示空查询栏

### Requirement: 卡片列表查询交互

ListCards SHALL 在执行查询时将查询字段值与当前 page/size 传给 `fetchApi`，查询 SHALL 将 page 重置为 1；重置 SHALL 清空查询字段并将 page 重置为 1。

#### Scenario: 查询提交
- **WHEN** 用户填写查询字段并点击查询
- **THEN** `fetchApi` 收到包含字段值、`page: 1` 和当前 `size` 的参数

#### Scenario: 重置查询
- **WHEN** 用户点击重置
- **THEN** 查询字段清空，`fetchApi` 收到 `page: 1` 且不包含已清空条件

### Requirement: 卡片列表分页交互

ListCards SHALL 在 `showPagination` 未禁用时渲染分页栏， SHALL 支持配置的 page size 选项，并 SHALL 在页码或 page size 变化后重新调用 `fetchApi`；page size 变化 SHALL 回到第 1 页。

#### Scenario: 切换页码
- **WHEN** 用户选择新的页码
- **THEN** `fetchApi` 使用新 page 和当前 size 请求数据

#### Scenario: 切换每页条数
- **WHEN** 用户选择新的 page size
- **THEN** `fetchApi` 使用新 size 且 page 为 1 请求数据

#### Scenario: 禁用分页
- **WHEN** PageDataCards 传入 `pagination=false`
- **THEN** 卡片列表不显示分页栏，并按现有全量数据约定请求数据

### Requirement: 卡片查询条件数据源适配

PageDataCards SHALL 将非空查询字段转换为与 PageDataTable 一致的 AND `like` filter JSON，并 SHALL 将该 filter 传给数据源查询接口；设计态 SHALL 隐藏查询栏和分页栏并保持最多 10 条预览限制。

#### Scenario: 透传非空查询条件
- **WHEN** 用户提交一个或多个非空查询字段
- **THEN** 数据源请求包含 `filter`，其 conditions 为对应字段的 `like` 条件，空值字段不进入 conditions

#### Scenario: 设计态预览
- **WHEN** 卡片列表处于 designMode
- **THEN** 查询栏和分页栏不显示，数据请求固定为首页且 size 不超过 10
