# query-page-renderer Specification

## Purpose

TBD - created by archiving change query-view-designer. Update Purpose after archive.

## MODIFIED Requirements

### Requirement: 通用页面渲染

系统 SHALL 提供页面渲染入口 `GET /page/:pageKey`（前端路由），由 PageRenderer 组件承载。
PageRenderer SHALL 按 pageKey 加载已发布页面定义（type=VIEW 加载编译产物并注入单一隐式数据源；type=PAGE 加载原始 schema 并按 dataSources 绑定层实例化 DataSourceRegistry），并通过 FormRenderer 渲染。
页面不存在、未发布或 schema 无法解析时，PageRenderer SHALL 展示错误提示，不得白屏崩溃。
PageRenderer SHALL 在渲染时注入数据源 API 到 form-create 运行时（扩展 formCreateInject 机制）。
type=PAGE 时，PageRenderer SHALL 将已加载的页面定义通过 props（`definition`）下传给 PageRendererPage 组件；PageRendererPage SHALL 在收到 `definition` props 时直接使用、不再自行发起页面定义请求；未收到 props 时（直接挂载场景）SHALL 回退按 pageKey 自行加载定义。同一页面渲染链路中，页面定义请求 SHALL 最多发起一次。

#### Scenario: 渲染已发布视图

- **WHEN** 用户访问 /page/leave-query
- **AND** leave-query 对应已发布 type=VIEW 的视图定义（编译产物完好）
- **THEN** 页面渲染查询条件区与数据表格
- **AND** 页面绑定 wf_biz_leave 物理表数据

#### Scenario: 渲染未发布页面

- **WHEN** 用户访问 /page/unknown-page
- **AND** 该 pageKey 不存在或未发布
- **THEN** 页面展示错误提示
- **AND** 不抛出未捕获异常

#### Scenario: 渲染畸形 schema

- **WHEN** 发布记录存在但 schema 无法被 FormRenderer 解析
- **THEN** 页面展示"页面配置异常，请联系管理员"
- **AND** 页面其余部分正常渲染

#### Scenario: PAGE 页定义仅请求一次

- **WHEN** 用户访问 type=PAGE 的页面（如 /page/page2）
- **THEN** 系统 SHALL 仅发起 1 次页面定义请求
- **AND** PageRenderer SHALL 将定义通过 props 下传给 PageRendererPage
- **AND** PageRendererPage SHALL 不再发起第 2 次定义请求

#### Scenario: 直接挂载 PageRendererPage 回退自行加载

- **WHEN** PageRendererPage 在无 `definition` props 的情况下被直接挂载（如单元测试）
- **THEN** PageRendererPage SHALL 按 pageKey 自行加载页面定义
- **AND** 正常渲染页面

---

## ADDED Requirements

### Requirement: VIEW 页数据源定义按需加载

VIEW 类型页面渲染时 SHALL 仅挂载加载数据源元数据（metadata），数据源定义（getDataSource，反查绑定表单 formKey）SHALL 延迟到首次打开详情/新增/编辑表单时加载。PageRenderer SHALL 提供 `ensureBoundDataSource()` 能力，在打开表单入口执行前确保数据源定义已就绪（未加载时先加载再继续），避免表单形态渲染依赖未就绪的定义。

#### Scenario: 首屏不请求数据源定义

- **WHEN** 打开 VIEW 类型页面（如 emp_view_e2e）
- **THEN** 系统 SHALL 不发起 /data-sources/{id} 定义请求
- **AND** 挂载时仅加载 definition、metadata

#### Scenario: 打开表单前确保定义就绪

- **WHEN** 用户在 VIEW 页点击新增/编辑/查看按钮
- **THEN** PageRenderer SHALL 先确保数据源定义已加载（未加载则先请求）
- **AND** 依据定义（formKey）渲染对应表单形态后再打开详情/表单

#### Scenario: 定义已加载不重复请求

- **WHEN** 数据源定义已在首次打开表单时加载完成
- **AND** 用户再次打开其他行的详情/编辑
- **THEN** 系统 SHALL 复用已加载定义
- **AND** 不重复发起 /data-sources/{id} 请求