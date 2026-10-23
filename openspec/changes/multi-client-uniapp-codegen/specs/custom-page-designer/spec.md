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

### Requirement: 设计器端维度与设备框画布

页面设计器 SHALL 增加「端」维度：
- 顶部 SHALL 提供应用切换与端 Tab（WEB / MP_WEIXIN / H5 / APP），页面保存/发布 SHALL 携带当前应用上下文；
- 画布 SHALL 按端呈现设备框：WEB 为桌面宽度，移动端为 375×667 手机壳；
- 组件面板 SHALL 按 TargetProfile 端能力矩阵过滤：移动端不支持的组件（如 PageIframe、Excel 导入导出、树/树表族）SHALL 置灰并提示原因，MUST NOT 允许拖入后出码时静默丢弃；
- 端维度 SHALL NOT 引入第二套 schema 格式：移动端页面与 Web 页面 SHALL 使用同一 schema 存储结构。

#### Scenario: 切换端后面板能力过滤
- **WHEN** 用户将端切换为「小程序」
- **THEN** 组件面板中移动端不支持的能力矩阵项（如 iframe、Excel）置灰并显示原因提示
- **AND** 受支持组件（字段族、卡片列表、图表等）保持可拖入

#### Scenario: 页面保存携带应用上下文
- **WHEN** 用户在「商户端」+「小程序」上下文中保存页面
- **THEN** 页面归属「商户端」应用且 schema 与 Web 页面同构存储
- **AND** 端信息记录在 Client 维度的启用清单中而非页面 schema

#### Scenario: 同一页面在设计器内跨端复用为独立定义
- **WHEN** 商户端 Web 与小程序需要不同的列表布局
- **THEN** 用户在应用下分别创建两个页面并各自分配给对应 Client
- **AND** 两个页面在各自端画布中独立设计与预览
