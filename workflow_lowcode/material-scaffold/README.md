# 物料开发教程（material-scaffold）

一句话：物料 = 你用 Vue 手写的**页面**或**组件**，构建成一个 ESM 单文件包上传到平台，之后就能像内置页面/内置组件一样被使用，还能整包导出到别的项目导入。

本 README 是物料开发的唯一文档（教程 + 场景判断 + 环境要求 + 硬性规范），随「工程模板 zip」一起分发。

---

## 1. 先判断：这个需求该不该写物料

平台的表达能力分三层，越往上越省事、也越受限：

| 层次 | 能做什么 | 边界 |
| --- | --- | --- |
| 设计器（零代码） | 拖组件 + 绑数据源 + 配动作（刷新/取记录/保存/开容器/联动筛选…） | 组件种类与交互形态固定，复杂交互做不出来 |
| 内置组件扩展 | 给平台提需求，把通用能力做成内置组件 | 要排平台版本节奏 |
| 远程物料（本教程） | 任意手写 Vue 逻辑，整页或单个组件 | 依赖面窄、任意 JS 执行、无中心维护 |

**适合写物料：**

- 设计器组件族覆盖不到的复杂交互或视觉：自定义图表组合、看板、多步向导、拖拽编排、富文本类编辑
- 同一段手写逻辑要在**多个页面 / 多个项目**重复出现，希望沉淀成可复用的资产（这正是本功能的原始动机）
- 整页替换：一个页面本来就是手写的 Vue，想直接挂进平台菜单，而不是改造成设计器 schema
- 设计器表达不了的性能手段：虚拟滚动、增量渲染、Web Worker

**不适合写物料（硬写只会更痛）：**

- 标准增删改查列表 + 表单 → 用页面设计器 + 数据源 + 动作总线。零代码，还能随平台升级白拿修复和新组件
- 缺的只是一个通用原子控件（比如"带单位的数字输入框"）→ 提内置组件需求。散在各项目里的物料会各自漂移，没人统一维护
- 需要跟宿主容器深度联动（读表单容器/数据容器的作用域、参与动作总线广播）→ 物料取数目前只走 SDK 的 `http`，容器级联动是尚未接线的开放项
- 强合规、强审计的页面 → bundle 走**免鉴权公开读**（见 8.3），不要把敏感逻辑或密钥放进去
- 期待"改一处所有项目立刻生效" → 物料是导出导入的**快照**，不是中央 CDN

**利：**

- 不受设计器能力边界限制，前端能写什么，物料就能做什么
- 跨项目复用：导出 zip → 另一个项目导入，配置、样式、bundle 一起走
- 发布节奏独立于平台版本，不用等平台发版
- 故障被隔离：加载不了的物料只把引用它的那**一个节点**降级成占位错误块，页面其余照常渲染
- 有 `sdkVersion` 协商，宿主 SDK 破坏性变更时是**拒绝加载**而不是静默出错

**弊（接受之前要看清）：**

- **任意 JS 执行**：上传/导入只对 `material:manage` 开放，多租户开放前还需补审核机制（当前登记为未来项）
- 依赖面极窄，只有 `vue` / `element-plus` / `@platform/sdk` 三个裸模块名可用（见 4.2）
- 与宿主 Element Plus 主题/版本会漂移：平台升级组件库不会来改你的物料，样式可能要跟着修
- **不存版本历史**：同 key 覆盖上传即版本 +1、旧 bundle 立即失效，回滚只能重传旧包
- 调试在浏览器里跑，没有宿主的 sourcemap 与 HMR 链路
- 注入的样式全局生效，脏选择器会污染宿主页面（见 4.3）

## 2. 开发环境与工具要求

| 项 | 要求 | 说明 |
| --- | --- | --- |
| Node | `^20.19.0` 或 `>=22.12.0` | vite 8 的 `engines` 下限，低版本装不上 |
| 包管理器 | pnpm（模板带 `pnpm-lock.yaml`） | 与平台仓库一致，避免装出不同小版本 |
| vite | `^8.1.5` | 模板 devDependency |
| @vitejs/plugin-vue | `^6.0.8` | 与 vite 8 匹配 |
| vue | `^3.5.40`，**只作 devDependency** | 产物里不打包，运行时用宿主那一份；装它只为 IDE 类型与本地试跑 |
| element-plus | `^2.14.3`，**同上只作 devDependency** | 同上 |
| SDK 主版本 | `sdkVersion` 必须等于宿主 `workflow.material.sdk-version`（当前 `1`） | 不一致：上传 400、导入预检标为不可导、运行时拒绝加载 |

平台侧配套（部署确认，不是开发机要求）：bundle 大小上限默认 5MB（`workflow.material.max-size-mb`），落盘目录默认 `./data/materials`（`workflow.material.storage-path`）。

环境自检：

```bash
node -v            # 需 v20.19+ 或 v22.12+
corepack enable    # 或 npm i -g pnpm
pnpm -v
```

> **写 JS 还是 TS？** 示例里页面型组件用了 `<script setup lang="ts">`：plugin-vue 底层是 esbuild，只做**转译**，脚手架没装 vue-tsc 也没给 tsconfig，所以能构建但没有类型检查。要类型检查请自备 tsconfig + vue-tsc，并把 `types/platform-sdk.d.ts` 放进 `include`。

## 3. 工程模板从哪来

平台「物料管理」页 → **下载工程模板**（需要 `material:manage` 权限）。解压即得到本目录：

```
package.json             两条构建脚本（build / build:widget）
pnpm-lock.yaml
vite.config.js           页面型：entry src/index.js   → dist/page/bundle.js
vite.config.widget.js    组件型：entry src/widget.js  → dist/widget/bundle.js
scripts/gen-manifest.mjs 构建后校验 + 样式内联 + 生成 manifest.json
material.json            页面型示例的 manifest
material-widget.json     组件型示例的 manifest（带 meta）
src/index.js             页面型入口（默认导出一个组件）
src/DemoBoard.vue        页面型示例（SDK http 取数 + 本地响应式验证）
src/widget.js            组件型入口
src/StatCardWidget.vue   组件型示例（所有展示值来自属性面板写入的 props）
types/platform-sdk.d.ts  @platform/sdk 的类型声明
```

新物料请**复制整个目录改造成自己的工程**。同一个工程可以同时维护页面型与组件型两套产物（两条 build 命令、两个 outDir），但如果要做**两个同类型**的物料，请开两个目录，避免 key 与产物互相覆盖。

> **本地能不能单独预览？** 不能。物料的 `vue` / `element-plus` / `@platform/sdk` 全靠宿主 `index.html` 里的 import map 解析，脱离平台宿主这三个裸名就找不到模块。`pnpm dev` 只是 `vite build --watch`，用途是改代码时持续重出 bundle，验证仍然是「上传 → 在平台里看」。调试期反复覆盖上传同一个 key 没问题（每次版本 +1、旧包立即失效），但正式物料请用有意义的 key。

## 4. 物料契约（硬性规范，违反必被拒或白屏）

平台的加载方式是浏览器直接 `import()` 你上传的那个 JS 文件，**不经过宿主重新编译**。以下每条都是这个前提推出来的。

### 4.1 产物形态

- 上传两个文件：`bundle.js`（单文件 ESM，样式已内联）+ `manifest.json`
- bundle 扩展名只允许 `.js` / `.mjs`，大小 ≤ 5MB
- 只能是 ESM：`require()`、`module.exports`、`__non_webpack_import__` 之类的 CommonJS 写法在浏览器里不存在
- 不要在物料里 `import()` 其他裸模块名——import map 只登记了 4.2 那三个，解析不到就是加载失败

### 4.2 依赖范围（最容易出事的一条）

宿主 `index.html` 里的 import map 只把这三个裸名解析到宿主自身的模块 URL：

```
vue · element-plus · @platform/sdk
```

- 这三个必须保持 external（模板的 vite 配置已写好；`gen-manifest.mjs` 会复查，一旦发现被打包就**直接构建失败**）
- **不要 import 任何其他第三方库**（axios / lodash / dayjs / echarts / pinia / vue-router …）。脚手架没做依赖宿主化，第三方库会被真实打进包里：包体膨胀、样式冲突，最致命的是产生**第二个 Vue 实例**——`provide/inject`、全局状态、路由全部失联，典型症状是"看着渲染了但点了没反应"，而且宿主 Vue 与物料 Vue 的响应式对象互不认识
- **不要写子路径导入**（`element-plus/es/components/button/style/css`、`vue/runtime-core` 等）。子路径不在 external 白名单里会被打包，产物里出现 `element-plus/es` 或 `node_modules` 字样时 `gen-manifest.mjs` 判构建失败
- 需要的能力优先用 `@platform/sdk`（取数 `http`、权限 `auth`、跳转 `navigate`）；确实缺就提平台扩 SDK
- Element Plus 组件宿主已全局注册，模板里直接写 `el-card`、`el-button` 即可；确实要命令式 API 就 `import { ElMessage } from 'element-plus'`（走 external，合法）

### 4.3 样式

SFC 里的 `<style>` 由 `gen-manifest.mjs` 在构建后内联成一段 `document.createElement('style')` 注入，并打 `data-material="<key>"` 标记（便于排查是谁注入的）。因此：

- `<style scoped>` 正常可用，示例都用了 scoped
- 但注入位置是全局的：类名请带物料前缀（`.stat-card__value`），**不要**写 `body {}`、`.el-card {}`、`.el-button { margin: 0 }` 这类会波及宿主的规则
- 颜色/间距请读宿主 CSS 变量（`var(--el-color-primary)`、`var(--el-text-color-secondary)`），别硬编码，平台换肤才不会花

### 4.4 manifest 字段

`material.json`（页面型）/ `material-widget.json`（组件型）在构建时原样拷贝为 `dist/*/manifest.json`，上传时随 bundle 一起提交。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `key` | 是 | 物料唯一标识。规则 `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`：字母或数字开头，只允许字母、数字、`.`、`_`、`-`，长度 ≤ 64。同 key 重复上传 = 版本 +1 覆盖；菜单 component 约定为 `material:<key>` |
| `name` | 是 | 显示名（物料列表、设计器面板项） |
| `type` | 是 | `PAGE` 或 `WIDGET`，其他值上传直接 400 |
| `sdkVersion` | 是 | 物料依赖的宿主 SDK **主版本**，必须与宿主配置一致（当前 `1`） |
| `meta` | 组件型必填 | 属性面板声明，见第 6 节；页面型不需要 |
| `menu.title` / `menu.icon` | 否 | 页面型物料挂菜单时的建议值 |

## 5. 页面物料（PAGE）：一步步做到能访问

以示例 `DemoBoard` 为底改造。

**步骤 1 — 改 manifest。** 编辑 `material.json`：

```json
{
  "key": "stock-board",
  "name": "库存看板",
  "type": "PAGE",
  "sdkVersion": "1",
  "menu": { "title": "库存看板", "icon": "Grid" }
}
```

key 一旦上传就长期占用（删除后记录仍占这个 key，见第 8 节），起个小写短横线、能长期读的名字。

**步骤 2 — 写页面组件。** 把你的整页组件放进 `src/`，在 `src/index.js` 里默认导出它：

```js
import StockBoard from './StockBoard.vue'

export default StockBoard
```

默认导出必须是**一个 Vue 组件定义**，不是 `{ components: {...} }` 这种包装对象。取数、权限、跳转一律走 SDK：

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { http, auth, navigate } from '@platform/sdk'

const rows = ref([])
const canExport = auth.hasPermission('stock:export')

onMounted(async () => {
  const res = await http.get('/stock', { params: { size: 50 } }) // baseURL 已是 /api，自动带登录态
  rows.value = res.data?.content ?? []
})
</script>
```

`http` 复用宿主 axios 实例：统一错误提示、401 跳登录都已经有了，物料里不要自己 catch 再弹一套。

**步骤 3 — 构建。**

```bash
pnpm install
pnpm build          # → dist/page/bundle.js + dist/page/manifest.json
```

构建脚本自带产物自检（manifest 必填字段与 type、宿主依赖是否被打包、样式内联），成功打印类似：

```
✓ 已内联样式 style.css (1.20 KB)
✓ dist/page/bundle.js (3.7 KB) + manifest.json 就绪，物料 key=stock-board
```

任何一条不合规这里就非 0 退出。**不要绕开这个脚本手工拼 bundle 上传**——脚本拦下的问题到了运行时就是白屏。

**步骤 4 — 上传。** 平台「物料管理」→「上传物料」→ 分别选 `dist/page/bundle.js` 与 `dist/page/manifest.json` → 上传。首次上传成功即版本 1 并默认启用。

**步骤 5 — 挂菜单（页面物料必须有入口才能被访问）。** 在该物料行的操作里点「挂到菜单」→ 填菜单名、选所属目录 → 挂接。它按约定新建一条菜单：访问路径 `/material/<key>`、组件路径 `material:<key>`（两者固定，弹窗里不可改）。若只是把某个旧入口换成当前物料，切到「覆盖已有菜单」选择目标即可：菜单名称、目录、排序与角色授权保留，只改指向（原页面的权限串会被清空）。

容易卡住的点：菜单本身要**启用**（停用项不进侧边栏），且当前登录用户的角色要**看得到**那条菜单。侧边栏出现入口点进去，`MaterialRenderer` 才会去拉 manifest 并 `import()` bundle。

**步骤 6 — 验收。** 页面能看到真实数据即通。顺手验一下"单 Vue 实例"：示例里那个本地计数按钮点得动，说明宿主的响应式和物料的是同一份。

**排查表：**

| 现象 | 根因 | 处理 |
| --- | --- | --- |
| 上传报 `manifest 缺少必填字段` / `type 非法` | 选错文件（选了 `src/` 里的源文件）或手工改坏了 JSON | 上传 `dist/*/` 里生成的那两个文件 |
| 上传报 `bundle 超过上限 5MB` | 第三方库被打包进来了 | 见 4.2，去掉第三方 import |
| 构建报 `产物把 vue 打进了包` / `包含宿主依赖源码片段` | external 被改坏，或写了子路径导入 | 恢复 `rollupOptions.external: ['vue','element-plus','@platform/sdk']`，去掉子路径 |
| 上传报 SDK 版本不符 | `sdkVersion` 写了别的值，或模板来自别的平台版本 | 对齐宿主 `workflow.material.sdk-version` |
| 页面显示"物料不存在 / 已停用" | 物料被停用，或菜单 component 与 key 对不上 | 物料管理确认启用；component 必须是 `material:<key>` |
| 红色占位错误块 + 控制台 `import()` 失败 | bundle 里 import 了未宿主化的模块，或语法不是 ESM | 看控制台第一个报错定位模块名，按 4.2 改 |
| 别的页面样式被搞乱 | 全局脏选择器 | 类名加物料前缀（4.3） |

## 6. 组件物料（WIDGET）：一步步做到设计器可拖

组件型物料进的是**页面设计器的画布**（节点类型 `material:<key>`），不是菜单。

**步骤 1 — 改 manifest，重点是 `meta`。** 编辑 `material-widget.json`：

```json
{
  "key": "stat-card",
  "name": "指标卡",
  "type": "WIDGET",
  "sdkVersion": "1",
  "meta": [
    { "field": "title",  "label": "标题",   "type": "text",     "default": "本月新增" },
    { "field": "value",  "label": "指标值", "type": "number",   "default": 128 },
    { "field": "trend",  "label": "趋势",   "type": "select",   "default": "up",
      "options": [ { "label": "上升", "value": "up" }, { "label": "下降", "value": "down" } ] },
    { "field": "remark", "label": "备注",   "type": "textarea", "default": "数据每日 06:00 更新" },
    { "field": "accent", "label": "强调色", "type": "color-picker", "default": "#2E73FF" }
  ]
}
```

`meta` 协议细则：

- **必须是数组**，数组顺序就是属性面板从上到下的顺序。用对象承载不行：`manifest_json` 落的是 MySQL 的 JSON 列，入库按（键长度, 字节序）重排对象键，面板顺序一定留不住——数组是唯一能带顺序过库的形态。
- 每项必须有 `field` 和 `type`，缺任一项上传 400。`field` 就是配置值写入页面 schema 的键名（落在该节点的 `rule.props.<field>`），组件从 props 读。
- `type` 支持 `text` / `number` / `switch` / `select` / `textarea`。平台**未识别的类型（如上例 `color-picker`）降级为文本输入**，不会拒绝上架——面板控件会变，但物料照样能配值。
- `label` 缺省用 `field`；`select` 的选项缺 `label` 时用 `value` 字符串；`default` 只在**新节点入画布**时作为初值，已有节点以 `rule.props` 为准。
- **只放展示参数**。用户身份、租户、权限、当前登录人一律由 SDK 在运行时提供，绝不进 `meta`——否则一条物料配置就能越权读别人的数据。
- 取数类参数（数据源标识等）目前也没有面板支持：组件要读业务数据请在组件内用 SDK 的 `http` 自行请求（是否给物料节点开放 `dataSourceId` 是三期后的未决项）。

**步骤 2 — 写组件，props 名与 `meta[].field` 一一对应。**

```vue
<script setup>
const props = defineProps({
  title: { type: String, default: '' },
  value: { type: Number, default: 0 },
  trend: { type: String, default: 'up' },
})
</script>
```

名字对不上就是"面板能配、组件读不到"，这是组件物料最常见的静默失效。入口照旧：`src/widget.js` 里 `export default StatCardWidget`。

**步骤 3 — 构建组件产物。**

```bash
pnpm build:widget    # → dist/widget/bundle.js + dist/widget/manifest.json
```

页面型与组件型是两套独立 outDir（`dist/page` / `dist/widget`），互不清除。两个物料分别从各自目录上传。

**步骤 4 — 上传。** 同第 5 节步骤 4，选 `dist/widget/` 里的两个文件。

**步骤 5 — 在设计器里使用。** 打开页面设计器 → 左侧面板出现「自定义物料」分组 → **点一下**分组里的项目即入画布（不必拖拽）→ 选中该节点，右侧属性面板按 meta 顺序生成控件 → 改值即写进该节点 `rule.props`。保存后 schema 里就是：

```json
{ "type": "material:stat-card", "field": "node_xxx", "props": { "title": "本月新增", "value": 128 } }
```

**步骤 6 — 运行页验收。** 该页面正常发布并挂菜单后，运行页渲染真实物料组件——画布预览与运行页共用同一条注册/加载链路，所以设计器里能看到的效果，运行页就应该是那个效果。

**停用/删除后的行为：** 停用的物料不进设计器面板（`GET /api/materials/widgets` 只返回启用项）；已引用它的页面，在设计器与运行页都把**那一个节点**降级成红色占位错误块，页面其余部分照常。删除时若仍有菜单引用会 409，需要强制删除。

## 7. SDK 能力（`@platform/sdk`）

```js
import { http, auth, navigate } from '@platform/sdk'

http.get('/materials', { params: { page: 1, size: 1 } }) // baseURL=/api，自动带 Authorization
http.post('/stock/batch', { ids: [1, 2] })
auth.currentUser()          // { username, name, roles, permissions } | null
auth.hasPermission('xxx')   // 管理员角色恒为 true
navigate.to('/page/some-key', { id: 1 })
navigate.back()
```

类型声明见 `types/platform-sdk.d.ts`。SDK 是宿主与物料之间的**长期契约**：破坏性变更会升主版本（当前 `HOST_SDK_VERSION = '1'`），届时所有旧物料因 sdkVersion 主版本不符被拒绝加载，需要按新 SDK 重传。

## 8. 版本、覆盖、跨项目复用与治理

### 8.1 覆盖与回滚

同 key 再上传 = 版本 +1 覆盖，旧 bundle 立即失效；**平台不存版本历史**，回滚只能把旧包重传一次。已经打开着旧版本的浏览器不会自动换新代码，发布前通知使用者刷新。

### 8.2 删除后重新上传

删除是软删，但这条记录**仍然占用 key 的唯一约束**。平台侧已处理成"同 key 重新上传/导入时复用原记录并恢复可见"，不会报错；只是版本号会继续累加，不会回到 1——导入预检上它显示的是"全新物料"，版本却是删除前的 +1，这是已知取舍。

### 8.3 跨项目导出导入

- 物料管理勾选若干 → 「导出选中」得到 zip（`kind=material-bundle`，内含每个物料的 manifest 与 bundle，manifest 逐字节保序入包）
- 另一个项目「导入物料包」→ 先看**预检表**（每项标为全新 / 已存在（附现有版本）/ 不可导（附原因））→ 冲突条目逐条选覆盖或跳过（**默认跳过**）→ 开始导入并得到结果报告
- SDK 主版本与目标平台不一致的物料判不可导；包内条目名与 `manifest.key` 不一致直接拒绝（防 key 伪装）
- 导入即启用，但菜单要在目标项目**单独挂**（物料是页面/组件资产，不携带菜单结构）

### 8.4 安全

物料是**任意 JS 执行**。上传 / 导出 / 导入 / 模板下载都要求 `material:manage`；全域唯一公开读的是 bundle 本身（`GET /api/materials/<key>/bundle`），因为浏览器的 `import()` 带不了 Authorization 头。因此：

- bundle 里**不要**放 token、密钥、内部环境地址——拿到包名就等于能拿到包内容
- 取数一律走 SDK 的 `http`（自动带宿主登录态），权限用 `auth.hasPermission(...)` 判断，靠平台 API 自己的鉴权兜底
- 不要把物料包当普通静态资源对外发布

## 9. 提交前自检清单

- [ ] manifest 四个必填齐全，`type` 为 PAGE/WIDGET，`sdkVersion` 与宿主一致
- [ ] WIDGET 的 `meta` 是数组，每项有 `field`/`type`，且每个 `field` 都能对上一个 props 名
- [ ] 只 import 了 `vue` / `element-plus` / `@platform/sdk` 三个裸名，无子路径、无第三方库
- [ ] 只用 ESM 语法，无 `require` / `module.exports`
- [ ] 样式类名带物料前缀，颜色走 `var(--el-*)`
- [ ] `pnpm build` / `pnpm build:widget` 通过（产物自检就是门禁，别绕）
- [ ] bundle ≤ 5MB
- [ ] 上传的是 `dist/*/` 里的 `bundle.js` + `manifest.json` 两个文件
- [ ] 页面物料已挂菜单且菜单启用、目标角色可见；组件物料已在设计器实测拖入并保存
