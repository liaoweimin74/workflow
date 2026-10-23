# mobile-preview（delta）

## ADDED Requirements

### Requirement: 产物级预览（发布前核对）

系统 SHALL 提供产物级预览作为发布前核对手段：对当前页面定义执行 `emitUniApp` 出码并构建 uni-app H5 产物，在手机壳 iframe 中加载渲染；小程序端 SHALL 同时提供预览二维码引导进入微信开发者工具。产物级预览 SHALL 复用既有 codegen-lab 双渲染骨架（宿主 vs 产物同屏对照），构建 SHALL 按需触发而非常驻 watch。日常设计期所见即所得 SHALL 由设计器契约渲染画布承担（见 custom-page-designer「页面设计类型与契约渲染画布」），产物级预览 MUST NOT 被要求常驻运行。

#### Scenario: 产物预览加载 H5 构建
- **WHEN** 用户点击「产物预览」
- **THEN** 系统生成 uni-app 产物并完成 H5 构建
- **THEN** 预览面板在手机壳 iframe 中加载产物页面，且右侧可见产物源码与出码报告
- **AND** 宿主侧与产物侧可同屏对照（双渲染）

#### Scenario: 小程序端预览给出二维码
- **WHEN** 目标端为 MP_WEIXIN 且 Client 已配置 appid
- **THEN** 产物预览提供微信开发者工具预览二维码

---

### Requirement: 预览读取口径

产物级预览 SHALL 与既有 preview 语义对齐：读取当前最新定义（含 DRAFT，`preview=true` 口径），重新生成 SHALL 使用版本令牌强制重挂，避免缓存展示旧产物。

#### Scenario: 草稿变更反映到产物预览
- **WHEN** 用户修改页面草稿后再次打开产物级预览
- **THEN** 预览呈现修改后的定义渲染结果
- **AND** 不展示上一次构建的陈旧内容
