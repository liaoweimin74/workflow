# material-scaffold 物料脚手架

用 Vue 手写自定义页面/组件，构建为平台物料包，上传后即可作为资产复用（跨项目导入导出）。

> 规范（依赖范围、`meta` 协议、产物形态、Node/构建版本限制、安全约定）见 [MATERIAL_SPEC.md](MATERIAL_SPEC.md)。
> 这份 README 与 MATERIAL_SPEC.md、示例源码一起作为「工程模板 zip」由平台物料管理页提供下载。

## 开发流程

1. 复制本目录作为新物料工程起点，改 `material.json`（key/name/type/sdkVersion，WIDGET 需 `meta`）。
2. 编写物料：`src/index.js` 默认导出必须是一个 Vue 组件；页面型直接放整页组件。
3. `pnpm install && pnpm build` → 产物 `dist/page/bundle.js`（单文件 ESM，含内联样式）+ `dist/page/manifest.json`。
4. 平台「物料管理」上传两个文件；页面型物料配一条菜单，路径 `/material/<key>`、component 填 `material:<key>`。

## 组件型物料（WIDGET）

组件型物料不进菜单，而是作为页面设计器里的可拖拽组件（`material:<key>`），组件属性面板由 `manifest.meta` 声明。脚手架内置示例：`src/StatCardWidget.vue` + `material-widget.json`，构建走 `pnpm build:widget` → `dist/widget/`。

`meta` 是**数组**，每一项的 `field` 就是写入节点 `rule.props` 的字段名，数组顺序即属性面板顺序：

```json
"meta": [
  { "field": "title",  "label": "标题", "type": "text", "default": "本月新增" },
  { "field": "value",  "label": "指标值", "type": "number", "default": 128 },
  { "field": "trend",  "label": "趋势", "type": "select", "default": "up",
                      "options": [{ "label": "上升", "value": "up" }] },
  { "field": "remark", "label": "备注", "type": "textarea" },
  { "field": "accent", "label": "强调色", "type": "color-picker", "default": "#2E73FF" }
]
```

- 不用对象承载：`manifest_json` 落 MySQL 的 JSON 列后，对象键会按（长度,字节序）重排，面板顺序留不住。
- 每项必须有 `field` 与 `type`；`type` 支持 `text` / `number` / `switch` / `select` / `textarea`，
  平台未识别的类型（如上例 `color-picker`）降级为文本输入，物料仍可上架。
- `default` 只在拖入新节点时作为初值；已有节点的配置以 `rule.props` 为准。
- `label` 缺省用 `field`，`select` 选项缺 `label` 用 `value` 字符串。
- 物料被停用或删除后，引用它的页面在设计器与运行页都渲染红色占位错误块，页面其余部分照常。


## 依赖约定（重要）

`vue`、`element-plus`、`@platform/sdk` 一律 external，由宿主 import map 提供，**不要 import 其他第三方库**——脚手架未做依赖宿主化，打进包会产生第二个 Vue 实例并使包体膨胀。确需第三方能力时，用 `@platform/sdk` 的 http 调平台 API，或提平台扩充 SDK。

Element Plus 组件在物料模板里可直接使用（宿主已全局注册），如 `el-card`、`el-button`。

## SDK 能力

```js
import { http, auth, navigate } from '@platform/sdk'
http.get('/materials', { params: { page: 1, size: 1 } }) // baseURL=/api，自动带 Authorization
auth.currentUser()          // { username, name, roles, permissions } | null
auth.hasPermission('xxx')
navigate.to('/page/some-key', { id: 1 })
```

SDK 主版本变更即物料失效：`material.json` 的 `sdkVersion` 需与宿主一致，宿主加载时校验。
