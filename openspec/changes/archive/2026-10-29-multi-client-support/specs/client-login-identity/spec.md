# Spec Delta — client-login-identity

## ADDED Requirements

### Requirement: 登录方式按端×渠道配置
客户端设置（A2 登录方式区）SHALL 按已开通渠道勾选允许的登录方式（手机验证码、账密、openid 静默、绑定码等）；登录接口 MUST 校验所用方式在"该端 + 该渠道"已启用，未启用方式的登录请求一律拒绝。

#### Scenario: H5 验证码登录
- **WHEN** 司机端开通 H5 并勾选"手机验证码"，司机经 `/m/driver` 验证码登录
- **THEN** 登录成功并签发带端上下文的凭证

#### Scenario: 未开通方式拒绝
- **WHEN** 客户端仅勾选验证码登录，调用方以账密方式请求该端登录
- **THEN** 返回"该端未开通此登录方式"错误，不进入凭据校验

### Requirement: 端身份绑定泛化
系统 SHALL 将 V64 小程序 openid 绑定泛化为通用端身份模型：`sys_user_openid` / `sys_user_device` MUST 关联客户端维度；同一 openid 在不同客户端为不同身份记录。绑定码流程（管理端生成 → 端内首登输入 → 完成账号↔身份绑定）SHALL 保留并适用所有支持身份绑定的渠道。

#### Scenario: 绑定码首绑
- **WHEN** 管理员为张三生成绑定码，张三在司机端小程序静默登录后输入绑定码
- **THEN** 司机端 client 下 openid↔张三账号建立绑定，此后该小程序可静默登录

#### Scenario: openid 跨端隔离
- **WHEN** 同一微信用户在乘客端与司机端分别绑定
- **THEN** 两条 `sys_user_openid` 记录各挂各端，互不影响登录判定

### Requirement: 凭证携带客户端上下文
签发的 token SHALL 携带 client（及 channel）声明；认证过滤器链、菜单接口、`PageAccessGuard`、数据范围主体判定 MUST 依据该声明建立请求的端上下文。无端声明的历史凭证 MUST 按默认平台端解释（过渡兼容），该缺省在声明机制上线后收紧。

#### Scenario: 声明解析
- **WHEN** 司机端 H5 登录后调用 `/api/menus`
- **THEN** 返回司机端树（由 token 的 client 声明决定），而非平台端树

### Requirement: 用户端身份管理界面
用户详情 SHALL 提供"端身份"Tab（A4）：按端列出 openid / APP 设备（含推送状态、最近登录）/ H5 登录记录，并提供解绑、吊销、生成绑定码操作；操作 MUST 受 `system:user:*` 权限码管控。

#### Scenario: 吊销丢失设备
- **WHEN** 管理员对某司机丢失的 iPhone 设备执行"吊销"
- **THEN** 该设备凭证失效，再经该设备登录需重新绑定
