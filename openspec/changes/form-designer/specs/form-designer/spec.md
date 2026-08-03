## ADDED Requirements

### Requirement: 表单设计器页面

用户可通过管理后台导航进入表单设计器页面。

表单设计器 SHALL 集成在现有前端项目中，通过懒加载路由访问，路径为 `/form/designer`。

表单设计器页面 SHALL 采用三栏布局：
- 左侧组件面板（核心组件、扩展组件、布局组件）
- 中间设计画布（FcDesigner 拖拽区域）
- 右侧属性配置面板（基本属性、校验规则、高级属性、数据源配置、字段默认权限）

表单设计器页面 SHALL 提供顶部工具栏，包含保存、发布、预览、版本历史按钮。

#### Scenario: 导航到表单设计器
- **WHEN** 用户从表单列表页点击"新建表单"或"编辑表单"
- **THEN** 系统懒加载 FormDesigner.vue 组件
- **AND** 页面显示三栏布局
- **AND** 组件面板显示可拖拽的组件列表

#### Scenario: 创建新表单
- **WHEN** 用户从表单列表页点击"新建表单"
- **THEN** 系统创建一个 DRAFT 状态的表单定义
- **AND** 跳转到表单设计器页面
- **AND** 设计画布为空

### Requirement: 拖拽构建表单

设计器 SHALL 支持从组件面板拖拽组件到设计画布，构建表单结构。

设计器 SHALL 支持以下核心组件类型：单行文本、多行文本、数字输入、下拉选择（单选/多选）、单选、多选、日期、日期范围、文件上传、开关。

设计器 SHALL 支持以下扩展组件类型：人员选择、部门选择、数据引用组件、子表/表格、嵌套表单、分组容器、分割线。

设计器 SHALL 支持组件的拖拽排序、复制、删除操作。

设计器 SHALL 支持子表/嵌套表单内的递归拖拽构建。

#### Scenario: 拖拽组件到画布
- **WHEN** 用户从组件面板拖拽"单行文本"到设计画布
- **THEN** 画布上创建对应的表单字段
- **AND** 右侧属性面板显示该字段的配置项

#### Scenario: 拖拽子表组件
- **WHEN** 用户拖拽"子表/表格"组件到画布
- **THEN** 画布上创建子表容器
- **AND** 用户可继续向子表容器内拖拽其他组件

#### Scenario: 删除组件
- **WHEN** 用户选中组件后点击删除按钮或按 Delete 键
- **THEN** 该组件从画布中移除
- **AND** schema JSON 同步更新

#### Scenario: 拖拽排序组件
- **WHEN** 用户拖拽画布中的组件到新位置
- **THEN** 组件顺序更新
- **AND** schema JSON 中字段顺序同步更新

### Requirement: 组件属性配置

设计器 SHALL 支持配置选中组件的属性，属性面板按组件类型动态展示对应配置项。

属性面板 SHALL 包含以下配置分类：基本属性（标签、标识、占位提示、默认值）、校验规则（必填、最小/最大值、正则表达式）、高级属性（自定义属性）、字段默认权限。

#### Scenario: 配置基本属性
- **WHEN** 用户选中"单行文本"组件
- **THEN** 属性面板显示基本属性配置项：标签、字段标识、占位提示、默认值

#### Scenario: 配置校验规则
- **WHEN** 用户在属性面板中勾选"必填"
- **THEN** schema 中该字段添加 required 校验规则

#### Scenario: 配置字段默认权限
- **WHEN** 用户在属性面板中将字段默认权限设置为"只读"
- **THEN** schema 中该字段添加 permission.default = "VIEW" 标记

### Requirement: 数据源配置面板

设计器 SHALL 提供自研数据源配置面板，支持可视化配置组件的远程数据加载。

数据源配置面板 SHALL 支持配置以下属性：API 地址（action）、请求方法（method: GET/POST）、数据插入位置（to: options）、响应解析表达式（parse）、请求头（headers）、请求参数（query/data）。

数据源配置面板 SHALL 产出 form-create `fetch` 配置对象，注入到当前选中字段的 rule JSON 中。

#### Scenario: 配置下拉选择的数据源
- **WHEN** 用户选中"下拉选择"组件
- **AND** 在数据源配置面板中填写 API 地址为 `/api/v1/products`
- **AND** 选择请求方法为 GET
- **AND** 填写响应解析表达式
- **THEN** schema 中该字段的 rule JSON 注入 fetch 配置对象
- **AND** 运行时渲染时自动从 API 加载选项数据

#### Scenario: 数据源配置带请求头
- **WHEN** 用户在数据源配置面板中添加请求头 Authorization
- **THEN** fetch 配置对象中包含 headers 字段
- **AND** 运行时请求携带该请求头

### Requirement: 表单预览

设计器 SHALL 支持预览当前设计的表单。

预览模式下，设计器 SHALL 使用 form-create 渲染器以运行时方式渲染当前 schema，用户可填写表单验证交互效果。

#### Scenario: 预览表单
- **WHEN** 用户点击工具栏"预览"按钮
- **THEN** 设计器切换到预览模式
- **AND** 使用 form-create 渲染当前 schema
- **AND** 用户可填写表单字段

### Requirement: 保存表单设计

设计器 SHALL 支持保存当前表单设计到服务器。

用户点击"保存"按钮时，系统 SHALL 从 FcDesigner 获取当前 rule JSON，调用后端 API 保存。

每次保存 SHALL 创建新的表单定义版本。

#### Scenario: 保存表单设计
- **WHEN** 用户点击工具栏"保存"按钮
- **THEN** 系统从 FcDesigner 获取 rule JSON
- **AND** 调用 PUT /api/v1/form-definitions/{id} 保存
- **AND** 后端创建新版本记录
- **AND** 提示"保存成功"

#### Scenario: 保存时 schema 为空
- **WHEN** 用户未拖拽任何组件即点击保存
- **THEN** 系统提示"表单内容不能为空"
- **AND** 不调用保存接口
