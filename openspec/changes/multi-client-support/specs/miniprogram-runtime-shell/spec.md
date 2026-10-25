# Spec Delta — miniprogram-runtime-shell

## ADDED Requirements

### Requirement: schema 解释器运行时壳
小程序渠道 SHALL 以 uni-app Vue3"运行时壳"交付：壳内固定页面结构（底部 Tab 容器 + 通用页容器），启动与导航时按端拉取菜单/schema，用 uni 内置组件在运行时渲染；业务页面的增改 MUST NOT 触发小程序重新出包审核（仅壳/映射表升级需要）。

#### Scenario: 改页面不发包
- **WHEN** 司机端某业务页面 schema 变更并发布（H5 同步生效）
- **THEN** 小程序端下次进入即呈现新 schema，微信侧无新提交版本

### Requirement: 一壳多端出包
同一壳代码 SHALL 支持按客户端出不同小程序包：以构建参数注入 clientKey 与 appid，运行时按 clientKey 拉取该端 Tab 配置、工作台与主题；乘客端与司机端 MUST 可各自独立提审、独立上下线。

#### Scenario: 两端各出一包
- **WHEN** 为司机端与乘客端分别构建小程序包
- **THEN** 两包共码不同配置，进入后各见本端菜单与数据

### Requirement: 小程序登录与身份绑定
小程序壳 SHALL 支持 openid 静默登录与绑定码首绑流程（复用 client-login-identity）：已绑定账号静默进入；未绑定引导输入绑定码；登录凭证 MUST 携带该端 client 声明。

#### Scenario: 静默登录
- **WHEN** 已绑定乘客打开乘客端小程序
- **THEN** 以绑定账号静默登录并呈现其端菜单与工作台

#### Scenario: 未绑定时引导
- **WHEN** 未绑定的司机首次打开司机端小程序
- **THEN** 提示输入绑定码完成绑定后进入

### Requirement: 审核合规约束
壳 MUST NOT 执行远程下发的可执行代码：schema 仅描述组件语义与数据，渲染限于打包内置的 uni 组件模板集；对超出小程序规范的能力（如部分桌面组件），按发布拦截规则在 Web 侧挡住，MUST NOT 在壳内做未声明的降级模拟。

#### Scenario: 纯数据下发
- **WHEN** 服务端向壳下发任意页面 schema
- **THEN** 壳只按内置模板渲染，schema 中不存在可执行代码路径

#### Scenario: 不支持组件不出现在小程序
- **WHEN** 含无移动等价组件的页面尝试发布到小程序端
- **THEN** 发布拦截生效，该页面不会进入小程序可见范围
