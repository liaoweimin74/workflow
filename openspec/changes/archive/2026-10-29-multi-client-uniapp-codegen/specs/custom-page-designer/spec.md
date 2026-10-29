# custom-page-designer（delta）

## MODIFIED Requirements

### Requirement: 自定义页面创建与保存

系统 SHALL 支持创建 type=PAGE 的页面定义（复用 query-view-definition 的创建/更新/发布接口，type 传 PAGE）。
自定义页面 schema SHALL 为扩展 form-create 结构 `{rule, option, dataSources, actions}`，rule 中的组件类型 SHALL 来自已注册组件库，dataSources 为页面级数据源绑定层，actions 为页面级动作总线。
页面 schema 保存时，系统 SHALL 校验 rule 格式合法（可被 FormRenderer 解析）且 dataSources/actions 格式合法，非法 SHALL 返回 400。
页面 SHALL 归属应用：创建/更新接口 SHALL 携带应用上下文并将页面落到 `wf_page_def.app_id`；页面 key 唯一性 SHALL 按 `(tenant_id, app_id, key, version)` 校验；未显式指定应用时 SHALL 落入当前租户「默认应用」，保证存量调用方式兼容。

#### Scenario: 创建自定义页面（绑定多数据源）
- **WHEN** 用户创建 type=PAGE 的页面定义，schema 为 {rule: [树组件 + 表格组件], option: {}, dataSources: [{id:"ds-cats", refId:"ds_cat_tree_001"}, {id:"ds-products", refId:"ds_prod_list_002"}], actions: [...]}
- **THEN** 系统创建 version=1、status=DRAFT 的页面定义
- **AND** schema 原样保存

#### Scenario: 保存非法 schema
- **WHEN** 用户保存 schema 为非法 JSON 或 rule 非数组
- **THEN** 系统返回 400 错误
- **AND** 不保存

#### Scenario: 创建页面携带应用上下文
- **WHEN** 用户在应用「商户端」的设计上下文中创建页面 key=order-list
- **THEN** 页面 app_id 落为「商户端」的应用 id
- **AND** 同 key 页面在其它应用下仍可创建

---

## ADDED Requirements

### Requirement: 页面设计类型与契约渲染画布

页面设计器 SHALL 为页面提供设计类型 `design_type`（web | uniapp）：
- 页面创建时 SHALL 确定设计类型，创建后 MUST NOT 变更（设计器不提供类型切换入口，更新接口 SHALL 拒绝变更 design_type）；选错类型以新建页面替代；
- 设计器 SHALL 使用同一渲染机按 design_type 解析组件注册表：web→宿主组件包（现状），uniapp→`@lc/ui-mobile`（uni-ui 契约对齐的 web 封装组件，与出码共用同一 component-map）；两类页面 SHALL 使用同一 schema 存储结构，design_type MUST NOT 改变 schema 格式；
- 画布 SHALL 按类型呈现设备框：web 为桌面宽度，uniapp 为 375×667 手机壳；
- 组件面板 SHALL 按当前页面类型的三区能力矩阵（Web 专属 / 双端共享 / 移动专属）过滤：当前类型不支持的组件 SHALL 置灰并提示原因，MUST NOT 允许拖入后出码时静默丢弃；
- 页面保存/发布 SHALL 携带应用上下文；小程序/H5/APP 在设计期 SHALL 呈现同一 uniapp 画布（差异收敛于交付层）。

#### Scenario: 移动类型页面的画布与面板
- **WHEN** 用户打开 design_type=uniapp 的页面
- **THEN** 画布呈现 375×667 手机壳并以 @lc/ui-mobile（uni-ui 契约对齐）渲染页面定义
- **AND** 面板中 Web 专属组件（iframe、Excel 导入导出、树/树表族）置灰并提示「仅 Web 端可设计」

#### Scenario: 设计类型创建后不可变更
- **WHEN** 用户尝试变更已创建页面的设计类型
- **THEN** 设计器不提供切换入口，更新接口拒绝变更 design_type

#### Scenario: 页面保存携带应用上下文
- **WHEN** 用户在「商户端」应用上下文中保存页面
- **THEN** 页面归属「商户端」应用且 schema 与 Web 页面同构存储
- **AND** 交付归属记录在 Client 维度的启用清单中而非页面 schema

#### Scenario: 双端共享页面复用经分配实现
- **WHEN** 仅使用双端共享组件的 uniapp 页面被同时分配给小程序客户端与 H5 客户端
- **THEN** 两端从同一页面定义各自出码交付
- **AND** 画布始终按页面创建时的设计类型渲染，无需任何切换
