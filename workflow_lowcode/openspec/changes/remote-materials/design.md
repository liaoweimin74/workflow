## Context

手写 Vue 页面（如 system 下用户管理页）编译进前端 bundle、路由硬编码，无法跨项目沉淀。设计器产物已有资产机制（page-template-bundle、模块导出导入），但只覆盖配置 JSON，不含代码。本方案为"代码型页面/组件"建立物料体系：独立工程开发 → 打包上传 → 运行时动态加载 → 跨项目导入。

现有基础设施：
- 后端附件存储 `AttachmentService` / `SysAttachment`——**物料不走该通道**：其扩展名黑名单明确禁 `.js`（通用上传口的防脚本护栏），物料 bundle 是有意为之的可执行资产，故用物料专用存储目录 + 专用下载端点，护栏不被削弱
- 菜单 DB 驱动，`sys_menu.component` 为自由字符串（MenuPage 手工可填）
- 前端为 Vite 构建，运行环境为现代浏览器（原生支持 ESM 与 import map）
- `page-template-bundle` 的导出/导入模式可参照（kind + schemaVersion + 冲突处理）

## Goals / Non-Goals

**Goals:**
- 一期：页面型物料最小闭环——上传注册、菜单挂载、运行时加载渲染、启停管理
- 二期：组件型物料接入 PageDesigner（物料面板、meta 驱动属性面板、画布预览）
- 三期：material-bundle 跨项目导出/导入
- 物料与宿主共享同一 Vue 实例（provide/inject、全局状态可用）
- SDK 作为平台与物料的长期契约，带版本协商

**Non-Goals:**
- 沙箱隔离（iframe/Worker 隔离执行）——物料可信度由上传权限保证
- 物料市场/商店 UI、多租户审核流
- 样式隔离方案（物料自行约束类名前缀，文档约定而非机制强制）
- backend-node（Node 版后端）对齐，仅实现 Java 后端

## Decisions

### D1: 物料格式 = ESM 单文件 bundle + manifest.json

用 vite library mode 构建为单文件 ESM；manifest（type/name/version/sdkVersion/菜单建议/widget meta）上传时作为独立 JSON 提交。

- 备选 UMD + window 全局注入：无法 tree-shake、外部依赖注入约定脆弱，弃。
- 备选 Module Federation：webpack 生态，vite 插件（vite-plugin-federation）成熟度一般且引入运行时框架依赖，弃。
- ESM 原生 `import()` 零运行时依赖，manifest 独立于代码便于后端校验与版本管理。

### D2: 共享依赖走原生 import map

物料构建时 `external: ['vue', 'element-plus', '@platform/sdk']`，产物 import 裸模块名。宿主 index.html 注入 `<script type="importmap">`，将三个裸名映射到宿主自身拆出的 ESM chunk：

- 宿主 vite 配置 `manualChunks` 拆出 `vendor-vue`（vue + @vue/*）、`vendor-element`（element-plus）、`platform-sdk`（SDK 实现）chunk，import map 指向 `/assets/xxx.js`。
- 效果：物料与宿主 import 同一份 Vue chunk → 单实例；SDK 由平台实现而非物料自带。
- 备选（运行时 import 拦截/别名注入）需改物料产物或加载器复杂化，弃。

注意：dev 模式（vite dev server）下 import map 需指向 dev 可达的模块 URL；脚手架与加载器各自处理 dev/prod 映射差异。

### D3: bundle 下载接口公开读，管理接口鉴权

`import()` 无法携带 Authorization 头，因此物料 bundle 下载接口不做请求鉴权（与静态资源同级的信任模型）：泄露的只是代码本身，不含数据；数据访问仍由物料运行时的 API 调用鉴权兜底。上传/启停/删除/导出导入均要求 `material:manage` 权限（管理员）。

- 备选（短时签名 URL）：import map/菜单渲染需先换票，加载链路复杂化，一期弃；多租户开放时再评估。

### D4: 同源约束 + dev 代理

ESM `import()` 受 CORS 约束。生产部署物料文件由后端服务（或反代）与前端同源提供；dev 环境走 vite proxy（`/api` 已代理，物料下载路径同样代理）。跨源部署需反代层保证同源，方案文档明示。

### D5: 数据模型与版本策略

`sys_material`：id、material_key（唯一）、name、type（PAGE/WIDGET）、version（整数递增）、sdk_version、manifest_json、attachment_id、status（1 启用/0 停用）、创建/审计字段。

- 同 key 重新上传 = 版本 +1 覆盖（保留最新，不存历史版本链）；需要回滚时重新上传旧包。
- 备选（多版本并存 + 按版本加载）：菜单与设计器引用复杂化，一期弃。

### D6: 页面型物料挂载 = 静态路由 `/material/:materialKey` + 菜单 component `material:<key>`

菜单 component 记录 `material:<key>`（与既有 `page/PageRenderer` 形态并列的约定），前端路由解析 path 中的 materialKey → MaterialRenderer（与 PageRenderer 同机制：defineOptions name=MaterialRenderer，keep-alive 由 `<component :key="route.path">` 按路径隔离实例）。加载内容：按 key 拉 manifest、校验 sdkVersion、`import()` bundle、渲染默认导出组件。加载失败/停用/key 不存在 → 错误态（ElResult），不白屏。

- 不引入新的挂接 API，复用现有 sys_menu 配置能力（与 proposal「无 Modified Capabilities」一致）。
- 本项目菜单只驱动导航（path），组件解析全在静态路由表，故不采用"动态 addRoute"方案：与 PageRenderer 一致的路由更符合现状，且免去路由与权限刷新的一致性问题。

### D7: sdkVersion 协商规则

宿主声明当前 SDK 主版本（如 1）。物料 manifest.sdkVersion 的主版本号必须等于宿主主版本，否则拒绝加载并明确提示（次版本宿主 ≥ 物料要求即可）。SDK 包随平台发版，破坏性变更必须升主版本。

### D8: SDK 能力边界（一期）

`@platform/sdk` 一期仅暴露：`http`（自动带 Authorization、统一错误处理）、`auth`（当前用户/权限判断）、`navigate`（站内路由跳转）。取数容器/动作总线的深度集成随二期 widget 需求再评估——页面型物料本质是整页 Vue 组件，直接用 http 调业务 API 已够用。

### D9: 组件型物料接入设计器 + meta 协议（二期）

物料组件在画布/运行页的类型名为 `material:<key>`（`MATERIAL_TYPE_PREFIX`），组件由
`loadWidgetComponent`/`registerWidgetComponents` 用与页面型物料**同一**加载器与 sdkVersion
校验逻辑注册进 form-create，加载失败只把该节点降级为占位错误块，绝不向外抛错——设计器画布
与运行页因此共用一条渲染链路（spec「设计器侧物料加载 SHALL 复用运行时同一加载器」）。

设计器侧 `GET /api/materials/widgets`（登录即可，不校验 `material:manage`）返回启用 WIDGET 物料，
每项带 `meta` 配置项列表；`registerMaterialWidgetsToDesigner` 用 `addMenu` 建「自定义物料」分组、
`addComponent` 填面板项、`setComponentRuleConfig` 把 meta 映射成属性面板控件，配置值落该节点
`rule.props`。拖入的 rule 只带 `props` 默认值，身份（key）由 type 前缀承载，不进配置项。

**meta 协议（定稿）**：`manifest.meta` 是**有序数组**，数组顺序就是属性面板的顺序：

```json
"meta": [
  { "field": "title",  "label": "标题",       "type": "text",   "default": "本月新增" },
  { "field": "trend",  "label": "趋势",       "type": "select", "default": "up",
    "options": [ { "label": "上升", "value": "up" } ] },
  { "field": "accent", "label": "强调色",     "type": "color-picker", "default": "#2E73FF" }
]
```

- `field` 即写入 `rule.props` 的键；`label` 缺省回落 `field`。
- `type` ∈ `text` / `number` / `switch` / `select` / `textarea`；未识别类型（如上例 `color-picker`）
  降级为文本输入，物料照样能配值。
- `default` 缺省时面板不留初值；`select` 的选项缺 `label` 时用 `value` 兜底，非数组选项忽略。
- 上传侧 `MaterialService.requireWidgetMeta` 硬校验：WIDGET 的 meta 必须是数组，且每项含
  非空 `field` 与 `type`，否则 400 并给出示例形状。

两个平台级约束是这个形状的成因，后续改动务必知道：

1. **`sys_material.manifest_json` 是 MySQL `JSON` 列**：入库按（键长度, 字节序）重排对象键，
   所以「用对象键序表达面板顺序」在存储层就丢了，只有数组能承载顺序。
2. **HTTP 响应体由 Jackson 3（`tools.jackson`）序列化**（Spring Boot 4），而应用代码与
   `JacksonConfig` bean 都是 Jackson 2（`com.fasterxml`）。控制器把 Jackson 2 的 `JsonNode`
   直接塞进响应会被当 POJO 输出成 `{"array":false,"containerNode":true,…}`，原文全失真；
   必须 `convertValue` 成 Map/List 等纯 Java 结构（`MaterialController.toPlainJson`）。
   回归护栏：测试里用 Jackson 3 的 `JsonMapper` 生成断言用的 JSON，别用 Jackson 2。

前端 `parseMaterialMeta` 仍兼容旧的对象形态 meta（历史上已上传的物料），只是顺序不保证。

- 备选（物料自己提供 form-create 规则 JSON）：把设计器内部格式变成对外契约，物料作者要懂
  form-create rule 结构，升级即破坏所有物料，弃。

### D10: 物料包格式与导入策略（三期 6.1/6.2）

包格式沿用模块导出导入的 zip 范式（`ModulePackageCodec` 的对应物是 `MaterialPackageCodec`）：
根 `manifest.json` 写 `{kind:"material-bundle", schemaVersion:1, exportedAt, materials:[{key,name,type,sdkVersion,version,manifestFile,bundleFile}]}`，
载荷放 `materials/<key>.manifest.json` + `materials/<key>.bundle.js`，上限 64MB 包 / 16MB 单文件 / 2000 条目。
三条与模块包不同的取舍：

1. **manifest 原文逐字节入包**，不解成对象再 pretty——`meta` 的数组顺序就是属性面板顺序（D9），
   重排一次就把契约磨掉了。
2. **条目路径一律服务端按 key 生成**，key 过 `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` 才允许写/读，
   读包时再拒一次 `../`：包是外部输入，不能让作者决定落盘位置。
3. **物料之间没有依赖**，所以不需要模块导入那套拓扑排序与 id 重写（`idMap`）——逐条独立判定即可。

导入语义（`MaterialService.importPackage`）：

- 冲突处置 `OVERWRITE` / `SKIP`，**未显式选择的冲突条目默认 SKIP**（保守：导入不该悄悄换掉别人正在用的物料）。
- **SDK 主版本不符直接判不可导**，与加载器的零容忍一致（D7）——放进来也是个加载不了的死记录。
- 校验类失败（manifest 形状、条目名与 `manifest.key` 不一致）只把该条标 `FAILED` 并带消息，其余条目照常入库；
  系统级异常（JPA/落盘）仍然整批 `@Transactional` 回滚，避免"报告说成功了一半、实际半信半疑"。
- `manifest.key` 与包内条目名不一致时以 **manifest 为准拒绝该条**，绝不按包内条目名落库：
  否则一个包就能借条目名往别的 key 上覆盖。
- 导入成功即 `status=1`（启用），结果消息提醒：页面型需自行挂菜单，组件型在设计器面板即时可见。

预检 `POST /materials/inspect` 不落库、不落盘，逐条回 `{conflict, existingVersion, importable, reason}`，
前端据此渲染「处置」下拉（仅冲突且可导的条目可选覆盖/跳过）。

- 备选（重命名策略 RENAME）：模块导入有，但物料 key 是菜单 component 与 `/material/:key` 路由的锚点，
  改名等于造出一条没人引用的孤儿物料，一期不做。

### D11: 删除后同 key 复用记录（三期导入踩出的缺陷）

`sys_material.material_key` 建的是 **全表唯一键** `uk_sys_material_key`（V57），而删除是软删
（`is_deleted=1`，bundle 文件保留供审计）。于是 `register()` 原先按 `findByMaterialKeyAndIsDeleted(key, 0)`
判断"是不是新物料"——软删记录查不到，就按新记录插一行，直接撞唯一键 500。
踩中路径不止导入：删除物料后重新上传同 key 同样炸，而「导出 → 删除 → 导入」正是 6.4 的验收路径。

改法：写入侧（`register`）按 **key 全表查**（`findByMaterialKey`，含软删行），命中即复用该行——
版本继续 +1、`is_deleted` 归 0、`status=1`；读取侧（列表/详情/加载/冲突判定）仍按
`is_deleted=0` 过滤，所以软删记录对外仍是"不存在"。冲突提示因此略有出入：包内条目的 key 若对应一条
已删除记录，预检显示"全新物料"，实际导入后版本是 `删除前 +1`——诚实反映数据事实，不做粉饰。

### D12: 工程模板 zip 与真源单一（三期附带需求）

`GET /api/materials/scaffold-template` 返回 zip：工程骨架（`package.json`/`pnpm-lock.yaml`/两份 vite 配置/
`scripts/gen-manifest.mjs`/`.gitignore`）+ 两类物料示例源码与 manifest + SDK 类型声明 +
`README.md`（教程）+ `MATERIAL_SPEC.md`（规范：manifest 字段、依赖 external 白名单与范围、产物与语法限制、
Node/vite/plugin 版本下限、meta 数组协议、安全约定）。

真源是仓库根的 `material-scaffold/`（可本地 `pnpm build` 验证），`scripts/sync-material-scaffold.mjs`
把它同步进 `backend/src/main/resources/material-scaffold/`；打包侧 `MaterialScaffoldService`
按**写死的清单**逐个读 classpath 资源（不扫目录：jar 内枚举不可靠），任一文件读不到就整体失败——
宁可下载报错，也不给一个跑不起来的残缺工程。脚本会拿这份清单与 `TEMPLATE_FILES` 比对，两处不一致直接退出，
防止"改了脚手架忘了同步"和"加了打包项忘了搬文件"两种漂移。

## Risks / Trade-offs

- [远程物料 = 任意 JS 执行] → 上传限管理员；方案与 UI 明示风险；多租户开放前需补审核机制（Non-Goal，登记为未来项）。
- [import map 与宿主 chunk 文件名（带 hash）耦合] → import map 由构建脚本生成（vite 插件或构建后注入），不手工维护。
- [物料包与平台 Element Plus 主题/版本漂移] → sdkVersion 协商拦截主版本错配；样式漂移属物料自身维护责任，文档约定。
- [import() 无法带鉴权头] → 见 D3，公开读信任模型。
- [物料加载失败影响菜单可用性] → MaterialLoader 统一错误态（不存在/停用/版本不符/网络失败），可重试。
- [跨源部署配置遗漏] → 部署文档明示同源/反代要求。

## Migration Plan

1. 后端建表（`sys_material`）随 Flyway/项目 SQL 惯例；新增接口默认对既有功能零影响（新增能力，无 Modified）。
2. 前端 import map 与 chunk 拆分为构建配置变更，需回归验证主应用加载无回归。
3. 回滚：停用物料功能 = 停用全部物料记录 + 移除菜单引用；表与新接口保留无副作用。

## Open Questions

- ~~二期 widget 的属性面板 meta 协议细则~~ 已定稿，见 D9（有序数组 + 五种控件类型 + 未识别降级文本）。
- WIDGET 物料的**取数**能力尚未接线：面板只配静态值，物料要读业务数据目前靠 `@platform/sdk` 的
  `http` 自行请求。是否给物料节点开放 `dataSourceId`（复用容器寻址与取数），随三期后评估。
- ~~三期 material-bundle 的冲突处理策略（覆盖/跳过/重命名）参照 module-export-import 现有交互再定。~~
  已定稿，见 D10：只做覆盖/跳过，冲突默认跳过；重命名不做——物料 key 是菜单 component 与
  `/material/:key` 路由的锚点，改名只会造出无人引用的孤儿物料。
- 工程模板目前按「同步脚本 + classpath 清单」维护（D12）。若后续模板要支持多语言/多 SDK 版本，
  再评估是否改成构建期产物或独立模板仓库。
