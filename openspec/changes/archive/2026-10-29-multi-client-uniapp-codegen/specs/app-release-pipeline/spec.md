# app-release-pipeline（delta）

## ADDED Requirements

### Requirement: AppRelease 发布快照

系统 SHALL 提供「页面发布 → AppRelease 快照 → 按 Client 构建 → 归档」的发布链路。创建 Release 时系统 SHALL 固化该 Client 启用清单中各页面的 `published_version`（snapshot），Release 一经创建 MUST NOT 原地变更——定义更新后的重新发布 SHALL 通过新建 Release（version 递增）表达。

#### Scenario: 快照固化页面版本
- **WHEN** 页面 A 已发布 v3，管理员为小程序客户端创建 Release
- **THEN** 快照记录 pageKey=A → publishedVersion=3
- **AND** 此后页面 A 发布 v4 不影响该 Release 的内容与构建产物

#### Scenario: 重新发布表现为新 Release
- **WHEN** 页面修改并重新发布后再次创建 Release
- **THEN** 新 Release version 递增且快照指向 v4
- **AND** 历史 Release 记录与产物保留可查

---

### Requirement: 按 Client 构建

构建 SHALL 由 Client 配置驱动：`build_config_json` 提供小程序 appid / H5 域名 / APP 包名等；构建执行 `uni build -p mp-weixin | h5`，产物 SHALL 归档到后端静态目录并记录 `artifact_url` 与构建状态（BUILDING/PUBLISHED/FAILED）。V1 构建触发 SHALL 为接口同步调用。

#### Scenario: 构建产物归档
- **WHEN** 对小程序客户端的某 Release 触发构建
- **THEN** 系统以该 Client 的 appid 与快照内页面版本生成 mp-weixin 产物
- **AND** 产物归档并回写 artifact_url 与 PUBLISHED 状态

#### Scenario: 构建失败可追溯
- **WHEN** 构建过程出错
- **THEN** Release 状态置为 FAILED 且记录错误信息
- **AND** 已有历史产物不受影响

---

### Requirement: 体验版上传

小程序 Release 构建成功后，系统 SHALL 支持经 miniprogram-ci 以该 Client 的 appid 上传体验版并回传预览二维码；上传凭据 SHALL 按 Client 配置，MUST NOT 复用全局单例配置。

#### Scenario: 上传体验版并回传二维码
- **WHEN** 对构建成功的 Release 触发上传
- **THEN** 系统使用该 Client 的 appid 与私钥完成 miniprogram-ci 上传
- **AND** 返回体验版二维码供设计器展示

---

### Requirement: 小程序凭证多实例

`WechatMiniprogramClient` SHALL 从单 appId Bean 改为按 Client 配置的多实例解析：登录、消息推送与 ci 上传 SHALL 使用对应 Client 的 appId/appSecret；不同 Client 的凭证变更 SHALL 互不影响。

#### Scenario: 不同小程序客户端使用各自凭证
- **WHEN** 租户内两个小程序客户端分别配置不同 appid
- **THEN** 各客户端的上传与登录会话使用各自 appid 对应的配置
- **AND** 一方凭证变更不影响另一方
