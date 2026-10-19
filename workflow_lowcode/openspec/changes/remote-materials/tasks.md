## 1. 物料开发脚手架（一期前置）

- [x] 1.1 创建 `material-scaffold/` 模板工程：vite library mode 构建，external vue/element-plus/@platform/sdk，产物为单文件 ESM bundle + manifest.json
- [x] 1.2 脚手架内置 `@platform/sdk` 类型声明（http/auth/navigate）与示例页面物料
- [x] 1.3 构建脚本验证：产物 import 裸模块名、无平台代码打入 bundle

## 2. 后端物料注册与存储（一期）

- [x] 2.1 Flyway/SQL 新增 `sys_material` 表（material_key 唯一、type、version、sdk_version、manifest_json、stored_name/storage_path、status、审计字段）
- [x] 2.2 实体 + repository + MaterialService：上传注册（manifest 校验、同 key 版本+1 覆盖、bundle 落物料专用存储目录）、403/400 语义（TDD：先写 service 测试）
- [x] 2.3 MaterialController：POST /materials、GET /materials（分页筛选）、GET /materials/{id}、PUT /{id}/status、DELETE /{id}（引用菜单检查返回 409）
- [x] 2.4 bundle 下载通道：`GET /api/materials/{key}/bundle` 免鉴权公开读、Content-Type=application/javascript、停用/缺失 404（TDD：下载不带 Authorization 可达 + 管理接口仍鉴权）
- [x] 2.5 权限接入：material:manage 权限标识与菜单/权限初始化数据

## 3. 前端运行时加载（一期）

- [x] 3.1 vite 配置 manualChunks 拆 vendor-vue / vendor-element / platform-sdk chunk，构建期生成 import map 注入 index.html
- [x] 3.2 新增 `@platform/sdk` 实现（http 带 Authorization、auth、navigate），同时作为 chunk 供物料共享
- [x] 3.3 物料加载器：按 key 取 manifest+下载地址、sdkVersion 主版本校验、原生 import()、错误态（不存在/停用/版本不符/网络）+ 重试（TDD：加载器纯函数部分）
- [x] 3.4 MaterialRenderer 页面组件（静态路由 `/material/:materialKey`，name 与路由一致供 keep-alive）+ 错误态与重试
- [x] 3.5 MenuPage 支持物料形态：component 输入提示 material:<key> 约定

## 4. 一期端到端验证

- [x] 4.1 脚手架示例物料上传 → 菜单挂载 → 浏览器渲染全链路验证（内置浏览器走查）

> 4.1 说明：上传→渲染全链路已实测通过；「菜单挂载」这一环当时被平台既有缺陷卡住
> （MenuCreateRequest.menuType 标了 @NotBlank，Integer 不支持该约束，POST /api/menus 必 500），
> 已修复（改 @NotNull + 校验单测）并以「物料管理页 → 挂到菜单」实测跑通，见 6.3。

- [x] 4.2 异常路径走查：停用后访问错误态、版本不符提示、key 不存在
- [x] 4.3 主应用回归：chunk 拆分与 import map 注入后既有页面加载无回归

## 5. 组件型物料与设计器（二期）

- [x] 5.1 WIDGET 物料加载注册：formCreate.component 注册进 PageRendererPage 与 PageDesigner 画布，物料缺失时占位错误块
- [x] 5.2 设计器物料面板"自定义物料"分组与拖入画布
- [x] 5.3 manifest.meta 驱动属性面板：文本/数字/开关/下拉/文本域控件、默认值、写入 rule.props、未识别控件降级文本（TDD：meta→控件映射纯函数）
- [x] 5.4 画布预览复用运行时加载器（含 sdkVersion 校验）与失败占位

> 5.x 说明：物料节点类型名为 `material:<key>`，画布与运行页共用 `loadWidgetComponent`/
> `registerWidgetComponents`；面板分组由 `registerMaterialWidgetsToDesigner` 接线，
> 属性面板字段来自 `manifest.meta`，配置值落在该节点 `rule.props`。
> `meta` 协议为**有序数组** `[{field,label,type,default,options}]`（数组顺序即面板顺序），
> 详见 design.md「meta 协议」。已实测：面板分组与图标、点击入画布渲染真实物料、
> 面板 8 项顺序与默认值全对、保存后 schema 落 `type=material:stat-card` + `props`、
> 运行页渲染、停用后仅该节点变占位错误块且页面其余部分正常。
>
## 6. 跨项目导出导入（三期）

- [x] 6.1 导出 POST /materials/export：按 id 打包 zip（kind=material-bundle、schemaVersion、manifest+bundle）
- [x] 6.2 导入 POST /materials/import：预检同 key 冲突、覆盖/跳过选择、结果报告
- [x] 6.3 管理界面：物料列表页（上传 bundle+manifest、启停、删除含 409 强制删除、挂到系统菜单）
- [x] 6.4 跨项目端到端验证：A 项目导出 → B 项目导入 → 菜单挂载可用
- [x] 6.5 导出模块附带「物料工程模板 zip」下载：骨架 + 示例源码 + README 教程 + MATERIAL_SPEC 规范

> 6.3 说明：导出/导入入口随 6.1/6.2 一并补上；挂菜单走通用 `POST /api/menus`
> （component=material:<key>、path=/material/<key>），已在浏览器实测
> 「挂接 → 侧边栏出现入口 → 点击渲染物料 → SDK 调用正常」全链路。
>
> 6.1/6.2 说明：包格式沿用模块导出的 zip 范式（`MaterialPackageCodec`），但物料之间无依赖，
> 故导入逐条独立判定——校验类失败只把该条标 FAILED，其余照常入库；系统异常整批回滚。
> 冲突默认 SKIP（保守），SDK 主版本不符直接判不可导（与加载器的零容忍一致），导入即启用。
> 条目名一律由服务端按 key 生成，包内路径不接受越界路径；`manifest.key` 与条目名不一致拒绝。
>
> 6.4 实测：导出（manifest 原文 + bundle 逐字节）→ 删除 → 预检（全新/冲突判定）→
> 导入（默认跳过 / 选择覆盖版本 +1）→ 设计器与运行页复现。过程中修掉一个真实缺陷：
> `sys_material.material_key` 是全表唯一键，软删记录仍占位，删除后同 key 再上传/导入会撞约束
> （register 改为按 key 查含软删行并复用，见 design D11）。
>
> 6.5 说明：模板真源是 `material-scaffold/`，`scripts/sync-material-scaffold.mjs` 同步进
> `backend/src/main/resources/material-scaffold/`，运行时由 `MaterialScaffoldService` 按写死的
> 清单组 zip（清单缺文件直接失败，不给残缺工程）；脚本会比对两边清单，防两处各说各话。

