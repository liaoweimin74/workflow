# Spec Delta — app-native-shell

## ADDED Requirements

### Requirement: 原生壳容器复用 H5 渲染
APP 渠道 SHALL 以原生壳（WebView 容器）交付：加载同源 `/m/` H5 渲染产物作为运行态界面，复用其登录态、端上下文与移动模板集；原生壳 MUST NOT 内嵌业务页面逻辑（业务仍由 schema 驱动）。

#### Scenario: 壳内打开工作台
- **WHEN** 司机安装司机端 APP 并登录
- **THEN** WebView 呈现 B1 工作台与页面内容，与 H5 渠道同源同 schema

### Requirement: JSBridge 原生能力集成
原生壳 SHALL 向渲染层暴露 JSBridge 能力集：推送注册与点击跳转、定位上报、相机/相册、支付；页面 schema 以语义动作声明能力需求，MUST NOT 直接书写平台原生调用。桥接调用 MUST 经过该端渠道开通与权限校验。

#### Scenario: 接单页定位上报
- **WHEN** 司机端接单页面触发"上报位置"语义动作且司机端已开通 APP
- **THEN** 壳经 JSBridge 取得定位并回传业务 API

#### Scenario: 未开通能力拒绝
- **WHEN** 页面请求支付能力但该端未开通 APP 渠道
- **THEN** 调用被拒绝并提示能力不可用，不影响页面其余部分

### Requirement: 版本与更新策略
客户端 APP 渠道参数（A2）SHALL 支持最低版本、强制更新开关与下载/升级地址；壳启动时 MUST 比对当前版本与端配置：低于最低版本按策略阻断进入或引导升级。

#### Scenario: 强制更新阻断
- **WHEN** 司机端配置最低版本 1.2.0，安装 1.0.0 的壳启动
- **THEN** 壳进入升级引导页，未升级前不可使用业务功能

### Requirement: 推送按端投递
推送 SHALL 绑定"客户端 × 设备身份"（`sys_user_device`）：消息仅投递到目标端已注册且未吊销的设备；设备吊销后 MUST 停止推送。

#### Scenario: 吊销设备停推
- **WHEN** 管理员吊销某丢失手机的设备身份后触发应向该司机推送的消息
- **THEN** 该设备不再收到推送，同用户其他端设备正常
