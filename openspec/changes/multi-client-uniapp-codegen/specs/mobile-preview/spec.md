# mobile-preview（delta）

## ADDED Requirements

### Requirement: 布局级即时预览

设计器 SHALL 提供布局级即时预览：当端 Tab 切到移动端（MP_WEIXIN/H5/APP）时，画布 SHALL 呈现 375×667 设备框并以宿主组件按移动端映射近似渲染当前页面定义，保存草稿后无需构建即可刷新预览。预览界面 MUST 明确标注「布局预览」，说明观感以产物级预览为准。

#### Scenario: 移动端画布呈现设备框
- **WHEN** 用户在页面设计器将端切换为「小程序」
- **THEN** 画布切换为 375×667 手机壳并在其中渲染页面定义
- **AND** 组件按移动端布局映射排布（纵向流式，无桌面多列表格形态）

#### Scenario: 布局预览的保真边界明示
- **WHEN** 用户查看布局级预览
- **THEN** 界面标注「布局预览」及「观感以产物预览为准」提示

---

### Requirement: 产物级预览

设计器 SHALL 提供产物级预览：对当前页面定义执行 `emitUniApp` 出码并构建 uni-app H5 产物，在手机壳 iframe 中加载渲染；小程序端 SHALL 同时提供预览二维码引导进入微信开发者工具。产物级预览 SHALL 复用既有 codegen-lab 双渲染骨架（宿主 vs 产物同屏对照），构建 SHALL 按需触发而非常驻 watch。

#### Scenario: 产物预览加载 H5 构建
- **WHEN** 用户点击「产物预览」
- **THEN** 系统生成 uni-app 产物并完成 H5 构建
- **THEN** 预览面板在手机壳 iframe 中加载产物页面，且右侧可见产物源码
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
