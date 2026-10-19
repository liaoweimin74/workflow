# 物料规范（MATERIAL_SPEC）

平台加载物料的方式是：浏览器直接 `import()` 你上传的那个 JS 文件——**不经过宿主重新编译**。
所以物料必须满足下面这份契约，任何一条不符都会导致上传被拒、导入被拒、或运行时白屏。
本文件与工程模板一起分发（下载入口：物料管理 → 下载工程模板）。

## 1. manifest 字段

`material.json`（页面型）/ `material-widget.json`（组件型）构建时原样拷贝为 `dist/*/manifest.json`，上传时随 bundle 一起提交。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `key` | 是 | 物料唯一标识。规则 `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`：字母或数字开头，只允许字母、数字、`.`、`_`、`-`，长度 ≤ 64。同一 key 重复上传即版本 +1 覆盖；菜单 component 约定为 `material:<key>` |
| `name` | 是 | 显示名（列表、设计器面板项） |
| `type` | 是 | `PAGE` 或 `WIDGET`，其他值上传直接 400 |
| `sdkVersion` | 是 | 物料依赖的宿主 SDK **主版本**，必须与宿主配置一致（当前宿主为 `1`）。不一致时：上传 400、导入预检标为不可导、运行时拒绝加载 |
| `meta` | 组件型必填 | 见第 3 节 |
| `menu.title` / `menu.icon` | 否 | 页面型物料挂菜单时的建议值 |

## 2. 产物形态与依赖范围

产物只有两个文件：`bundle.js`（**单文件 ESM**）+ `manifest.json`。

- 只有 `vue`、`element-plus`、`@platform/sdk` 三个模块名是宿主提供的（宿主 `index.html` 里的 import map 把它们解析到宿主自身的模块 URL）。除这三个之外，**不要 import 任何其他第三方库**——脚手架没做依赖宿主化，第三方库会被真实打进包里：包体膨胀、样式冲突，最要命的是产生**第二个 Vue 实例**，`provide/inject`、路由、全局状态全部失联。
- 构建配置里 `rollupOptions.external` 必须保持 `['vue', 'element-plus', '@platform/sdk']`。`scripts/gen-manifest.mjs` 会检查产物：一旦发现这三个被打包，构建直接失败。
- Element Plus 组件宿主已全局注册，模板里可直接写 `el-card`、`el-button`。
- bundle 是浏览器 `import()` 的 ESM 模块：`require()`、`module.exports`、`__non_webpack_import__` 之类的 CommonJS 写法在浏览器里不存在，不要使用。
- 样式必须进同一个文件：SFC 里的 `<style>` 由 `gen-manifest.mjs` 在构建后内联成一段 `document.createElement('style')` 注入，并打 `data-material="<key>"` 标记。因此样式是**全局生效**的——请用带物料前缀的类名（如 `.stat-card__value`），不要写 `body {}`、`.el-card {}` 这类会波及宿主的选择器。
- 大小上限 5MB（宿主配置 `workflow.material.max-size-mb`）；扩展名只允许 `.js` / `.mjs`。

## 3. 组件型物料的 `meta`（属性面板协议）

`meta` **必须是数组**，数组顺序就是设计器属性面板的顺序：

```json
"meta": [
  { "field": "title", "label": "标题", "type": "text", "default": "本月新增" },
  { "field": "value", "label": "指标值", "type": "number", "default": 128 },
  { "field": "trend", "label": "趋势", "type": "select", "default": "up",
    "options": [{ "label": "上升", "value": "up" }] }
]
```

- 每一项必须有 `field` 和 `type`，缺任一项上传 400。`field` 即配置值写入页面 schema 的键名（落在节点的 `rule.props.<field>`），物料组件从 props 读取。
- `type` 支持 `text` / `number` / `switch` / `select` / `textarea`；平台未识别的类型（如 `color-picker`）**降级为文本输入**，不会拒绝上架。
- `label` 缺省用 `field`；`select` 的选项缺 `label` 时用 `value` 字符串；`default` 只在拖入新节点时作为初值，已有节点以 `rule.props` 为准。
- 为什么不能用对象（`{"title": {...}}`）承载：`manifest_json` 落的是 MySQL 的 JSON 列，入库会按（键长度, 字节序）重排对象键，面板顺序留不住。数组是唯一能带顺序过库的形态。
- 配置项只放**展示参数**。用户身份、租户、权限这类信息一律由宿主 SDK 在运行时提供，绝不进 `meta`——否则一个物料配置就能越权读别人的数据。

## 4. 构建环境版本限制

| 项 | 要求 | 依据 |
| --- | --- | --- |
| Node | `^20.19.0` 或 `>=22.12.0` | vite 8 的 `engines`，低版本装不上 |
| 包管理器 | pnpm（推荐），模板给出 `pnpm-lock.yaml` | 与平台仓库一致，避免装出不同版本 |
| vite | `^8.1.5`（锁到 8.x） | 模板 `package.json` |
| @vitejs/plugin-vue | `^6.0.8` | 与 vite 8 匹配 |
| vue / element-plus | `^3.5.40` / `^2.14.3`，**仅作开发依赖用于类型与本地验证**，产物里不打包 | 宿主版本；物料运行时用宿主的那一份 |
| SDK 主版本 | `sdkVersion` 必须等于宿主的 `workflow.material.sdk-version`（当前 `1`） | 不一致即加载失败 |

命令：页面型 `pnpm build` → `dist/page/`；组件型 `pnpm build:widget` → `dist/widget/`。产物目录里的 `bundle.js` + `manifest.json` 就是上传的两个文件。

## 5. 安全与治理

- 物料是**任意 JS 执行**，上传/导入接口只开放给持有 `material:manage` 的管理员。不要把物料包当作普通静态资源对外发布。
- 不要把 token、密钥、环境地址硬编码进 bundle；取数一律走 `@platform/sdk` 的 `http`（baseURL `/api`，自动带宿主登录态），权限用 `auth.hasPermission(...)` 判断。
- 导入物料包（zip）时，平台逐条按包内 `manifest.key` 落库，条目名与 `manifest.key` 不一致会被拒绝；同 key 已存在时默认跳过，需显式选择覆盖。
