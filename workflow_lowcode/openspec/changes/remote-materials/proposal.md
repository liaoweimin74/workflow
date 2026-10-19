## Why

低代码设计器能满足常规 CRUD 页面，但复杂交互（特殊图表、第三方嵌入、精细排版）用户仍需手写 Vue 页面（如 system 下的用户管理页）。这类页面目前编译进前端 bundle、路由硬编码（`router/index.ts`），完全无法沉淀：换一个项目就要重写一遍。需要把"手写代码页面/组件"纳入资产体系——打包上传后成为平台物料，跨项目导入即用，与设计器产物（页面模板、模块导出）形成互补。

## What Changes

1. **物料包格式约定**：物料 = ESM 单文件 bundle（vite library mode 构建）+ manifest（type: page/widget、name、version、sdkVersion、页面型附菜单建议、组件型附属性面板 meta）。Vue、Element Plus、平台 API 一律 external，由宿主运行时提供，避免多 Vue 实例与包体膨胀。
2. **平台物料 SDK（`@platform/sdk`）**：平台与物料之间的长期契约——封装带鉴权的 http、权限判断、取数/动作总线访问入口。SDK 版本化，manifest 声明所需 sdkVersion，宿主加载时校验兼容性。
3. **后端物料注册与存储**：新增物料注册表（key、版本、类型、manifest、文件引用、启停状态）；bundle 存物料专用目录（通用附件通道黑名单禁 `.js`，不适用）；上传/列表/启停/删除管理接口，上传权限收窄至管理员（远程物料 = 任意 JS 执行，方案明示此风险）。
4. **运行时动态加载**：前端加载器以原生 `import(url)` 加载物料 ESM。页面型物料：菜单 `component` 字段约定 `material:<key>` 形态，动态路由解析挂载，加载失败显示错误态不白屏；组件型物料：加载后 `formCreate.component(name, comp)` 注册进渲染器与设计器画布。
5. **设计器接入**：PageDesigner 组件面板新增"自定义物料"分组（widget 型），属性面板按 manifest meta 渲染配置项。
6. **跨项目复用**：参照 `page-template-bundle` 机制打 `material-bundle` 导出/导入（记录 + 附件文件），下一个项目导入即用。
7. **物料开发脚手架**：提供物料模板工程（vite 配置 + SDK 类型声明 + 构建脚本），用户在其上开发、构建、上传。

**分期**：一期为 1-4、7（页面型最小闭环，不动设计器）；二期为 5（组件型 + 设计器）；三期为 6（跨项目导出导入）。

## Capabilities

### New Capabilities

- `remote-material`: 物料包格式与 SDK 契约、上传注册与存储、版本/启停管理、页面型物料菜单挂载与运行时动态加载、跨项目 material-bundle 导出导入。
- `remote-material-widget`: 组件型物料接入设计器——物料面板分组、manifest meta 驱动属性面板、画布预览与渲染注册。

### Modified Capabilities

（无——菜单挂载走现有 sys_menu 配置能力，物料解析是前端加载器新增行为，不改变既有菜单/页面规约。）

## Impact

**后端：**
- 新增 `SysMaterial` 实体 + repository + service + `MaterialController`（上传/列表/详情/启停/删除/export/import）
- bundle 存物料专用目录 `workflow.material.storage-path`（不走通用附件通道：AttachmentService 扩展名黑名单禁 `.js`），下载端点公开读；上传/启停/删除要求 `material:manage`

**前端：**
- 新增物料加载器（`import()` 动态加载 + sdkVersion 校验 + 错误态）
- 动态路由支持 `material:<key>` component 解析；MenuPage 组件路径提示物料形态
- PageDesigner 物料面板与属性面板 meta 渲染（二期）
- 新增 `@platform/sdk` 包（http 封装、权限、取数入口）

**新工程：**
- `material-scaffold/` 物料模板工程（vite library mode、external 配置、构建产物 = bundle + manifest.json）

**依赖与风险：**
- ESM 原生 `import()` 需现代浏览器（项目已要求，无新增兼容负担）
- 远程物料为任意代码执行：上传限管理员；内网部署可控，多租户开放前需补审核机制
- SDK 为长期契约，破坏性变更需走版本协商（manifest.sdkVersion）
