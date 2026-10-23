# Tasks — multi-client-uniapp-codegen

> 实现遵循 TDD（RED → GREEN → REFACTOR）；迁移号在动工时取 main 最新 Flyway 版本 +1。
> 里程碑对应 design.md：M1=组 1–2，M2=组 3–5+8.1，M3=组 6–7+8.2–8.3+9。

## 1. 数据模型与 API（M1）

- [ ] 1.1 Flyway 迁移：建 `wf_app` / `wf_app_client` / `wf_app_client_page` / `wf_app_release` 四表 + `wf_page_def` 加 `app_id` 与唯一键 `(tenant_id, app_id, key, version)` + 每租户「默认应用」回填；实体与 Repository 落地，唯一键约束测试先行（spec: app-client-model「页面应用归属与唯一性」）
- [ ] 1.2 App / Client CRUD API（TDD：controller/service 测试先行），含 `uk(tenant_id, code)`、`uk(tenant_id, app_id, client_type, name)` 校验与租户归属校验（spec: app-client-model「应用与客户端实例建模」）
- [ ] 1.3 页面分配 API：`wf_app_client_page` 启用清单 + sort 导航序 + 跨应用分配 400（spec: app-client-model「客户端页面启用清单」「应用管理接口」）
- [ ] 1.4 页面服务层 key 唯一性与查询接口加 app 维度；未显式指定应用时落「默认应用」的兼容路径（spec: custom-page-designer MODIFIED「自定义页面创建与保存」）
- [ ] 1.5 存量回归：既有页面路由、菜单挂载、渲染在默认应用归入后行为不变（回归测试）

## 2. 设计器端维度（M1）

- [ ] 2.1 设计器 App/端上下文：应用切换 + 端 Tab（WEB/MP_WEIXIN/H5/APP），页面保存/发布携带应用上下文（spec: custom-page-designer ADDED「设计器端维度与设备框画布」）
- [ ] 2.2 设备框画布：WEB 桌面 / 移动端 375×667 手机壳切换（spec: mobile-preview「布局级即时预览」的画布前提）
- [ ] 2.3 TargetProfile 能力矩阵：组件 × 端支持数据 + 组件面板按端过滤（web-only 置灰并提示原因）（spec: custom-page-designer ADDED 场景「切换端后面板能力过滤」）
- [ ] 2.4 出码报告 per-target 分桶：`generatePage` 报告扩展 web/uniapp 两套 A/B/C 桶与 unsupported 明细（spec: uniapp-codegen-target「per-target 可出码率 Gate」）

## 3. emitUniApp 骨架（M2 前置）

- [ ] 3.1 TargetProfile 结构定义（componentMap/styleRules/apiAdapter/routerAdapter/capabilities）与 `emitUniApp(IR, profile)` 工程骨架：pages.json / manifest.json / App.vue / pages/<key>.vue（design D6）
- [ ] 3.2 `@lc/runtime-uni` 仓库内 file 依赖包 + 独立编译测试 Gate（对位 P2 runtime-package-build）（design D6）
- [ ] 3.3 HTTP 适配层：uni.request 封装、token 拦截、`X-Tenant-Id` 注入，对位现有 api 模块语义（design D6）
- [ ] 3.4 px→rpx 换算与样式基线（375 画布基准），产物样式产出走 styleRules（design D6/Open Question 3）

## 4. 字段族出码（M2）

- [ ] 4.1 uni-easyinput（input/textarea）、uni-number-box（precision 封装）、uni-datetime-picker 映射 + emit 登记，golden 快照先行（spec: uniapp-codegen-target「组件映射保真口径」）
- [ ] 4.2 select：单选 picker / uni-data-select；multiple 与远程搜索自绘弹层（含 options config 常量消费）
- [ ] 4.3 group / subForm 块容器（v-model 前缀口径）与 FormulaField（formulaEval 纯函数移植 + form 数据后端）
- [ ] 4.4 字段校验：必填/规则在产物模板的落法与回填写入（对位 Web 产物 FIELD_SELF 口径）

## 5. 列表 / 详情 / 容器出码（M2）

- [ ] 5.1 page-list-cards：uni-card + 触底加载 + uni-search-bar + 筛选抽屉；按钮/行点击链真执行（spec: uniapp-codegen-target 场景「page-table 出码为 uni-table 简表」同口径的列表侧）
- [ ] 5.2 page-detail 堆叠详情 + page-steps（uni-steps）+ page-data-container（uni-popup 弹层，容器段 open/close/confirmSave）
- [ ] 5.3 动作出口适配：open-link→uni.navigateTo、message→uni.showToast、list-ref 族→ref、container 族→容器函数；export 整支 unsupported；脚本普通函数上下文（form/row/page/message/http）（spec: uniapp-codegen-target「动作出口按端适配」）

## 6. uni-table 与降级件（M3）

- [ ] 6.1 uni-table spike：固定列/横向滚动真机表现实测，1 天内出结论并回填 design（design Risks 第 1 条）
- [ ] 6.2 page-table → uni-table 简表：横向滚动 + 操作「···」弹层 + 搜索/分页适配；按钮/列/排序链出口按 ACTION_OPS 白名单接线（spec: uniapp-codegen-target 场景「page-table 出码为 uni-table 简表」）
- [ ] 6.3 fcTable 纵向堆叠降级（放弃合并单元格语义，slot 单元按行堆叠）（spec: uniapp-codegen-target「组件映射保真口径」）
- [ ] 6.4 tableForm 卡片式子列表编辑器（每行一张卡片、字段纵向排，增删/上下限沿用 config）（同上）

## 7. 图表（M3）

- [ ] 7.1 lime-echart spike：mp-weixin canvas 2d 兼容验证 + 分包落点结论（图表页 subpackage 规则），回填 design（design Risks 第 2 条）
- [ ] 7.2 dash-kpi / dash-notice / dash-todo 映射（自绘统计卡 / uni-notice-bar / 复用卡片列表）
- [ ] 7.3 page-chart / dash-chart：复用 buildChartDataset/buildPieDataset 语义聚合与 option 构造，lime-echart 渲染；echarts 按需注册沿用 useEcharts 清单（spec: uniapp-codegen-target「图表语义层映射」）

## 8. 预览（M2/M3）

- [ ] 8.1 布局级即时预览：375 设备框宿主渲染 + 「布局预览」标注（spec: mobile-preview「布局级即时预览」）
- [ ] 8.2 产物级预览：emitUniApp → uni-app H5 构建 → 手机壳 iframe + 双渲染对照（复用 codegen-lab 骨架）+ 草稿口径 preview=true（spec: mobile-preview「产物级预览」「预览读取口径」）
- [ ] 8.3 小程序预览二维码入口（依赖 9.3 上传链路）

## 9. 构建发布（M3）

- [ ] 9.1 AppRelease 快照 API：创建时固化各页 published_version、version 递增、不可原地变更（spec: app-release-pipeline「AppRelease 发布快照」）
- [ ] 9.2 构建触发与归档：`uni build -p mp-weixin | h5`、artifact_url 与 BUILDING/PUBLISHED/FAILED 状态机（spec: app-release-pipeline「按 Client 构建」）
- [ ] 9.3 miniprogram-ci 体验版上传 + 二维码回传（spec: app-release-pipeline「体验版上传」）
- [ ] 9.4 `WechatMiniprogramClient` 按 Client 配置多实例化（登录/推送/上传按 Client 凭证）（spec: app-release-pipeline「小程序凭证多实例」）

## 10. 验证与 Gate（贯穿）

- [ ] 10.1 双渲染 e2e 延伸：宿主 vs uni-app H5 产物（列表/表单容器/dashboard 三类，Playwright 对位 P2 D5 口径）（spec: uniapp-codegen-target / mobile-preview）
- [ ] 10.2 语料体检 uniapp 目标基线 Gate：C 桶 0、可出码率 ≥ 基线（spec: uniapp-codegen-target「per-target 可出码率 Gate」）
- [ ] 10.3 小程序真机人工校验清单：登录（wx.login→token）、列表、详情、提交、二维码预览
- [ ] 10.4 存量回归：web 目标 golden 产物字节不变 + Web 动态渲染主链路全量回归（design Migration Plan）
