## ADDED Requirements

### Requirement: 组件型物料注册进设计器与渲染器

前端 SHALL 在物料（type=WIDGET）启用后被加载器按需加载并注册：渲染侧以 `formCreate.component(name, comp)` 注册进 PageRendererPage 与 PageDesigner 画布，使 widget 可被页面 schema 引用渲染。设计器组件面板 SHALL 出现"自定义物料"分组，展示全部启用的 WIDGET 型物料，支持拖入画布。物料 key 与 schema 中引用的组件名不一致（物料被删除/停用后打开旧页面）SHALL 在画布与渲染侧呈现占位错误块，SHALL NOT 抛出未捕获异常。

#### Scenario: 设计器面板出现物料分组
- **WHEN** 管理员进入 PageDesigner 且存在 2 个启用的 WIDGET 物料
- **THEN** 组件面板出现"自定义物料"分组，含 2 个物料项（名称取 manifest.name）

#### Scenario: 拖入画布并保存 schema
- **WHEN** 用户将物料 stock-chart 拖入画布并保存页面
- **THEN** schema 记录该组件节点（组件名对应物料 key）
- **AND** 画布内渲染物料真实组件

#### Scenario: 物料被删除后打开引用页面
- **WHEN** 页面 schema 引用 stock-chart 但该物料已删除
- **THEN** 画布与渲染侧该节点位置渲染占位错误块（标注物料缺失）
- **AND** 页面其余部分正常渲染

---

### Requirement: manifest meta 驱动属性面板

WIDGET 物料的 manifest.meta SHALL 声明可配置项（字段名、标题、控件类型、默认值、可选项来源），PageDesigner 选中该物料节点时属性面板 SHALL 按 meta 动态渲染配置控件，配置值 SHALL 存入该节点的 rule.props。meta 声明的控件类型 SHALL 至少覆盖：文本、数字、开关、下拉（静态选项）、文本域；未识别的控件类型 SHALL 降级为文本输入。meta SHALL 为**有序数组**（每项含 `field`），属性面板 SHALL 按数组声明顺序渲染——平台不得以对象键序承载顺序，因为 manifest 落库的 MySQL `JSON` 列会重排对象键。上传 WIDGET 物料时 meta 非数组、或某项缺 `field`/`type`，SHALL 返回 400 并说明期望形状。

#### Scenario: 按 meta 渲染配置项
- **WHEN** 选中物料节点，其 meta 声明 refreshInterval（数字）与 theme（下拉，选项 light/dark）
- **THEN** 属性面板渲染数字输入与下拉控件，默认值取 meta 缺省
- **AND** 修改后值写入该节点 rule.props.refreshInterval / rule.props.theme

#### Scenario: 面板顺序跟随 meta 数组
- **WHEN** 物料 meta 为 `[{"field":"title",…},{"field":"value",…},{"field":"unit",…}]`
- **THEN** 属性面板自上而下依次为 标题、指标值、单位
- **AND** 与设计器保存、接口下发各环节的顺序一致

#### Scenario: 未识别控件类型降级
- **WHEN** 物料 meta 声明了平台未实现的控件类型 color-palette
- **THEN** 属性面板以文本输入呈现该配置项
- **AND** 不阻塞属性面板其余配置项渲染

#### Scenario: 上传时 meta 形状不合法
- **WHEN** WIDGET 物料的 manifest.meta 是对象，或数组某项只有 label 没有 field
- **THEN** 上传返回 400，错误信息给出 ` [{"field":"title","type":"text"}] ` 形式的示例
- **AND** 不写库、不落 bundle

---

### Requirement: 画布预览使用真实物料组件

PageDesigner 画布 SHALL 加载 WIDGET 物料的真实组件进行预览（与渲染侧同一注册通道），物料加载失败时对应节点 SHALL 显示错误占位且不影响画布其他节点。设计器侧物料加载 SHALL 复用运行时同一加载器与 sdkVersion 校验逻辑。

#### Scenario: 画布内预览物料组件
- **WHEN** 物料 stock-chart 启用且被拖入画布
- **THEN** 画布节点内渲染真实 stock-chart 组件（非占位图）

#### Scenario: 画布内物料加载失败
- **WHEN** stock-chart 的 bundle 加载失败（网络错误）
- **THEN** 该节点显示错误占位
- **AND** 画布其余节点与保存功能不受影响
