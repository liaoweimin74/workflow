# multi-client-uniapp-codegen Implementation Plan

> **For agentic workers:** 按仓库 AGENTS.md 规则由主代理按 superpowers:executing-plans 逐任务实现（不派子代理）。Steps 使用 checkbox（`- [ ]`）追踪，任务号与 tasks.md 对齐。

**Goal:** 平台支持多客户端应用设计（Web/小程序/H5/APP，每端多应用、租户数据共享），以出码 UniAPP 路线交付移动端设计→预览→构建发布闭环。

**Architecture:** 数据层新增 App→Client 两层模型（页面归属 App、按 Client 分配）；设计器加「端」维度复用单一 schema；出码在既有 `parse→IR` 上挂 `emitUniApp(IR, TargetProfile)` 第二后端产出独立可编译 uni-app 工程；构建发布按 Client 由 Node 侧 app-builder 服务执行 uni build 与 miniprogram-ci 上传。

**Tech Stack:** Spring Boot 4 + Flyway + Flowable（后端）；Vue 3 + Vite + Vitest + Playwright（前端宿主）；uni-app Vue3 + uni-ui + lime-echart（移动产物）；Node（app-builder：uni build / miniprogram-ci）。

**Spec:** `openspec/changes/multi-client-uniapp-codegen/`（proposal.md / design.md / brainstorm.md / tasks.md / specs/*）；能力矩阵依据 `workflow_lowcode/docs/superpowers/specs/2026-10-23-mobile-target-capability-matrix.md`。

## Global Constraints

- 移动产物 MUST NOT 含 `new Function`/`eval`；MUST NOT 引 form-create 运行时；MUST NOT 依赖宿主 vite alias（独立可编译）。
- 不支持的动作/组件 MUST 登记 unsupported，不许假挂点；web 目标产物字节 MUST 保持 golden 不变。
- Flyway 迁移号 = 动工时 `backend/src/main/resources/db/migration/` 最新 V 号 +1；先迁移后代码。
- 业务 API 前缀 `/api/v1/**`，请求头 `X-Tenant-Id`；所有新表/查询带 `tenant_id` 隔离。
- 实现走 TDD（RED→GREEN→REFACTOR）；前端测试 `npx vitest run <path>`，后端 `JAVA_HOME=<JDK21> mvn -o test -Dtest=<Class>`。
- 中文注释与提交信息；新文件与第一处引用同笔提交。

## Review Focus

1. **产物运行时求值**：产物含 `new Function`/eval → 小程序直接崩。测试钉住：`__tests__/uni/no-eval.test.ts` 断言全部产物文件无 `new Function(`/`eval(`（Task 3.1）。
2. **web 目标 golden 字节回归**：新代码污染既有 emit → P2 产物漂移。测试钉住：既有 `__tests__/__snapshots__/golden-output.test.ts.snap` 全量跑（Task 10.4）。
3. **未分配页面泄漏进产物**：pages.json/导航出现未分配页面 → 数据暴露面。测试钉住：`__tests__/uni/pages-json.test.ts` 断言产物页清单 === 启用清单（Task 1.3/3.3）。
4. **迁移后存量页面不可见**：`app_id` 回填遗漏 → 全站页面丢失。测试钉住：迁移测试断言每租户默认应用存在且旧页归属（Task 1.1/1.5）。
5. **跨应用分配/跨租户越权**：错乱导航与数据越权。测试钉住：分配 API 跨应用 400、CRUD 跨租户 404（Task 1.2/1.3）。
6. **跨端错配**：web 页面分配给移动 Client（或反之）→ 交付面错乱。测试钉住：分配 API 设计类型兼容校验 400（Task 1.3）。

---

## File Structure（锁定命名与落点）

```
workflow_lowcode/backend/src/main/
  resources/db/migration/V{next}__multi_client_app_model.sql      # Task 1.1
  java/com/workflow/engine/app/entity/{AppDefinition,AppClient,AppClientPage,AppRelease}.java
  java/com/workflow/engine/app/repository/{AppDefinitionRepository,AppClientRepository,AppClientPageRepository,AppReleaseRepository}.java
  java/com/workflow/engine/app/{AppModelService,AppReleaseService}.java
  java/com/workflow/api/controller/{AppAdminController,AppReleaseController}.java
  java/com/workflow/engine/page/entity/PageDefinition.java         # +app_id
  java/com/workflow/engine/page/repository/PageDefinitionRepository.java  # 按 app 的唯一性/查询
workflow_lowcode/frontend/
  src/views/page/codegen/target-profile.ts                         # 端能力矩阵 + profiles
  src/views/page/codegen/uni/{emit-uni,component-map,project-files,action-emit-uni}.ts
  src/views/page/codegen/__tests__/uni/*.test.ts                   # uni 目标测试
  src/views/page/codegen/generate.ts                               # 不改（web 入口保持）
  src/stores/designerStore.ts                                      # +currentAppId；页面 design_type（web|uniapp，创建后不可变）
  src/views/page/PageDesigner.vue / PageListPage.vue               # 端 Tab/设备框/能力过滤/应用过滤
  src/views/page/components/DeviceFrame.vue                        # 手机壳
  packages/lc-runtime-uni/{package.json,src/{http,form,actions,charts}.ts}
  packages/ui-mobile/{package.json,src/theme.ts,src/components/*}    # @lc/ui-mobile 契约渲染画布组件包
  uni-shell/{package.json,vite.config.ts,src/{pages.json,manifest.json,App.vue}}
  uni-shell/src/pages/gen/<key>.vue                                # 生成产物落点
  uni-shell/src/uni-api/{request.ts,glue.ts}
workflow_lowcode/mini-services/app-builder/
  {package.json,src/{server.ts,uni-build.ts,mp-upload.ts}}
```

---

## Task 1.1: Flyway 迁移与实体（M1）

**Files:** Create `db/migration/V{next}__multi_client_app_model.sql`、`engine/app/entity/*.java`、`engine/app/repository/*.java`；Modify `engine/page/entity/PageDefinition.java`、`engine/page/repository/PageDefinitionRepository.java`
**Interfaces:** Produces `AppDefinition{getId,getId?,getTenantId,getName,getCode,getThemeJson,getStatus}`、`AppClient{getClientType,getRenderMode,getBuildConfigJson,getNavigationJson}`、`AppClientPage{getClientId,getPageId,getSort}`、`AppRelease{getClientId,getVersion,getSnapshotJson,getArtifactUrl,getStatus}`（id 均为 String，审计列 createdAt/updatedAt）；`PageDefinition.getAppId()`

- [ ] **Step 1（RED）:** 写迁移测试 `backend/src/test/java/com/workflow/engine/app/AppModelMigrationTest.java`：执行迁移后断言 4 表存在、`wf_page_def.app_id` 非空、每租户存在 code=`default` 的应用且旧页 `app_id` 归入；同 key 页面在两个 app 下可共存
- [ ] **Step 2:** `JAVA_HOME=<JDK21> mvn -o test -Dtest=AppModelMigrationTest` → FAIL（迁移不存在）
- [ ] **Step 3:** 写迁移 SQL：4 张表（含 `uk_app_tenant_code(tenant_id,code)`、`uk_client(tenant_id,app_id,client_type,name)`、`uk_client_page(client_id,page_id)`、`uk_release(client_id,version)`）+ `ALTER TABLE wf_page_def ADD app_id VARCHAR(64)` + 默认应用回填（`INSERT...SELECT...WHERE NOT EXISTS` 防重跑重复插入，沿用 V32 的 H2 幂等口径）+ 旧页 UPDATE 关联默认应用
- [ ] **Step 4:** 落 4 个实体（照 PageDefinition.java 风格：字段+getter/setter+@PrePersist/@PreUpdate）与 4 个 Repository（`findByTenantId...` 系列方法签名见 Interface）；PageDefinition 加 `app_id` 列与 getter/setter，Repository 加 `findFirstByTenantIdAndAppIdAndKeyOrderByVersionDesc` 等按 app 查询
- [ ] **Step 5（GREEN）:** 重跑 Step 2 → PASS；`git add` 迁移+实体+repository+测试同笔提交 `feat(app): 多端应用数据模型迁移与实体`

## Task 1.2: App/Client CRUD API（M1）

**Files:** Create `api/controller/AppAdminController.java`、`engine/app/AppModelService.java`；Test `api/controller/AppAdminControllerTest.java`
**Interfaces:** Consumes Task 1.1 实体；Produces `POST/PUT/DELETE /api/v1/apps`、`POST/PUT/DELETE /api/v1/apps/{appId}/clients`、`GET /api/v1/apps?keyword=&page=`，统一 `AppResponse/AppClientResponse` DTO

- [ ] **Step 1（RED）:** `AppAdminControllerTest`：创建 app（201 + code 租户内唯一，重复 400）；创建 client（client_type 枚举校验，非法 400）；跨租户 GET 返回 404
- [ ] **Step 2:** `mvn -o test -Dtest=AppAdminControllerTest` → FAIL
- [ ] **Step 3:** 实现 Service（唯一性校验、枚举校验、`client_type` 白名单 WEB/MP_WEIXIN/H5/APP、`render_mode` 默认：WEB→RUNTIME 其余→CODEGEN）与 Controller
- [ ] **Step 4:** 重跑 → PASS；提交 `feat(app): App/Client 管理 API`

## Task 1.3: 页面分配 API（M1）

**Files:** Create `engine/app/AppModelService` 分配方法 + Controller 端点；Test 追加 `AppAdminControllerTest`
**Interfaces:** Produces `PUT /api/v1/apps/{appId}/clients/{clientId}/pages`（body: `[{pageId, sort, navConfig}]` 全量替换）、`GET .../pages`

- [ ] **Step 1（RED）:** 测试：分配本 app 页面 200；分配其它 app 页面 400；分配不存在页面 400；web 页面分配给 MP_WEIXIN client → 400；uniapp 页面同时分配 MP_WEIXIN + H5 client → 200；全量替换后 GET 返回按 sort 排序清单
- [ ] **Step 2:** 运行 → FAIL
- [ ] **Step 3:** 实现：校验 pageId ∈ 本 app 页面；校验 page design_type ↔ client_type 兼容（后端维护最小枚举映射，与前端 target-profile 测试对账防漂移）；事务内 delete+insert 全量替换
- [ ] **Step 4:** → PASS；提交 `feat(app): 客户端页面启用清单 API`

## Task 1.4: 页面服务层 app 维度（M1）

**Files:** Modify `engine/page/PageDefinitionService`（key 唯一性、创建默认落 default app）、`api/controller` 页面创建/查询接口；Test `PageDefinitionServiceTest` 追加
**Interfaces:** Produces 页面查询响应新增 `appId` 字段；`findFirstByTenantIdAndAppIdAndKeyOrderByVersionDesc` 为唯一性判定口径

- [ ] **Step 1（RED）:** 测试：同 app 同 key 重复 → 既有版本规则；跨 app 同 key → 允许；创建未传 app → 落默认应用；列表按 app 过滤
- [ ] **Step 2:** → FAIL
- [ ] **Step 3:** 服务层把唯一性校验与查询改走 app 维度（原 tenant 级方法保留给系统内部调用处逐个核对替换）
- [ ] **Step 4:** → PASS；提交 `feat(page): 页面归属应用与 key 唯一性 app 维度`

## Task 1.5: 存量回归（M1）

- [ ] **Step 1:** 跑后端全量 `mvn -o test` 与前端 `npx vitest run` → 全绿（重点：page-menu、query-view-definition 相关既有用例）
- [ ] **Step 2:** 浏览器冒烟（终端窗口起前后端）：存量页面列表/设计器/渲染不变；提交（如有修复）`fix(page): 存量页面默认应用归入回归修复`

## Task 2.1: 设计器应用上下文与页面设计类型（M1）

**Files:** Modify `src/stores/designerStore.ts`、`src/views/page/PageDesigner.vue`、`src/api/`（新增 apps.ts）、页面创建/更新接口（design_type 参数）；Test `src/stores/__tests__/designerStore.test.ts` 追加
**Interfaces:** Produces `designerStore.currentAppId` 与 `setAppContext(appId)`；页面实体新增 `designType: 'web'|'uniapp'`（创建时确定，更新接口 MUST 拒绝变更）；保存/发布 payload 附 `appId`

- [ ] **Step 1（RED）:** store 测试：setAppContext 后保存 payload 携带 appId；创建默认 design_type 跟随进入上下文；更新接口改 design_type → 400
- [ ] **Step 2:** `npx vitest run src/stores/__tests__/designerStore.test.ts` → FAIL
- [ ] **Step 3:** 实现 store 字段与持久化；PageDesigner 顶部加应用下拉 + 设计类型徽标（无切换入口）
- [ ] **Step 4:** → PASS；提交 `feat(designer): 应用上下文与页面设计类型`

## Task 2.2: @lc/ui-mobile 契约渲染画布（M1）

**Files:** Create `packages/ui-mobile/{package.json,src/theme.ts,src/components/*}`、`src/views/page/components/DeviceFrame.vue`；Modify `PageDesigner.vue` 画布容器与渲染机组件解析
**Interfaces:** Produces `@lc/ui-mobile` 组件包（props/事件/插槽与 component-map 中 uni-ui 目标一一对应；theme.ts 克隆 uni-ui token 并锁定版本；独立编译测试对位 P2 runtime-package-build Gate）；`<DeviceFrame :design-type>`（web=桌面宽，uniapp=375×667 壳）；渲染机 `resolveComponent(type, designType)`

- [ ] **Step 1（RED）:** 包测试：@lc/ui-mobile 按 component-map uniapp 侧清单导出全部组件（约 18–20 个薄组件）且独立编译；渲染机 designType=uniapp 解析到 ui-mobile 实现、web 解析到宿主包
- [ ] **Step 2:** → FAIL；**Step 3:** 实现组件包骨架 + DeviceFrame（`--ds-*` 令牌）；**Step 4:** → PASS；提交 `feat(designer): @lc/ui-mobile 契约渲染画布`

## Task 2.3: 三区能力矩阵与面板过滤（M1）

**Files:** Create `src/views/page/codegen/target-profile.ts`；Modify 组件面板（PageDesigner 面板数据源）；Test `src/views/page/codegen/__tests__/target-profile.test.ts`
**Interfaces:** Produces `PROFILES: Record<'web'|'uniapp', TargetProfile>`、`type TargetProfile { platform, componentMap, styleRules, apiAdapter, routerAdapter, capabilities: Set<string> }`、`supports(profile, type): boolean`、`capabilityZone(type): 'web-only'|'universal'|'mobile-only'`（web-only: PageIframe/ExcelActions/PageDataTree/PageTreeTable；mobile-only V1 空集、仅机制预留）

- [ ] **Step 1（RED）:** 测试：`supports(PROFILES.uniapp,'PageIframe')===false` 且 `supports(PROFILES.web,'PageIframe')===true`；`capabilityZone('PageIframe')==='web-only'`；面板数据源按当前页面类型过滤且置灰项带原因文案
- [ ] **Step 2:** → FAIL；**Step 3:** 实现矩阵（依据能力矩阵文档 §2）；**Step 4:** → PASS；提交 `feat(codegen): 三区能力矩阵与设计器过滤`

## Task 2.4: 出码报告 per-target（M1）

**Files:** Modify `src/views/page/codegen/generate.ts`（report 加 target 维度）与 `report.ts`；Test `__tests__/generate-report.test.ts` 追加
**Interfaces:** Produces `generatePage(schema, {target})` → `report.bucketsByTarget: Record<'web'|'uniapp', {A,B,C}>`（web 默认值=现行为）

- [ ] **Step 1（RED）:** 测试：target=uniapp 时 PageIframe 进 unsupported；web 分桶数字与现状一致
- [ ] **Step 2:** → FAIL；**Step 3:** 实现（判定读 target-profile.capabilities）；**Step 4:** → PASS；**Step 5:** 跑 `__tests__/golden-output.test.ts` 确认 web golden 不变；提交 `feat(codegen): per-target 出码报告`

## Task 3.1: emitUniApp 骨架（M2）

**Files:** Create `uni/emit-uni.ts`、`uni/project-files.ts`；Test `__tests__/uni/emit-uni.test.ts`、`__tests__/uni/no-eval.test.ts`、`__tests__/uni/pages-json.test.ts`
**Interfaces:** Consumes Task 2.3 TargetProfile；Produces `generatePageUni(schema, {pageKey, pageName, client}): { files: Record<string,string>, report }`；`files` 键=相对 uni-shell 路径（`src/pages/gen/<key>.vue`、`src/pages.json`、`src/manifest.json`、`src/App.vue`）

- [ ] **Step 1（RED）:** 测试：语料页 schema → files 含四类产物；pages.json 页清单 === 传入启用清单；no-eval 测试遍历 files 断言无 `new Function(`/`eval(`
- [ ] **Step 2:** `npx vitest run src/views/page/codegen/__tests__/uni/` → FAIL
- [ ] **Step 3:** 实现 emit-uni 编排（复用 parse→IR）与 project-files 生成（pages.json 按 client 页面清单+navigation_json；manifest 按 build_config）
- [ ] **Step 4:** → PASS；提交 `feat(codegen): emitUniApp 工程骨架`

## Task 3.2: @lc/runtime-uni 包（M2）

**Files:** Create `packages/lc-runtime-uni/{package.json,src/{http,form,actions,charts}.ts}`、`vite.config.ts`（library 模式，uni/vue external）；Test `packages/lc-runtime-uni/__tests__/build.test.ts`（独立编译）
**Interfaces:** Produces `uniRequest({tenantHeader})`、`useUniForm(rule)`（v-model 后端+校验）、`runAction(op, ctx)`、`buildChartOption(config, rows)`（Task 7.3 复用）

- [ ] **Step 1（RED）:** 编译测试：在隔离 vitest 环境解析 `@lc/runtime-uni` 四入口（对位 P2 runtime-package-build Gate）
- [ ] **Step 2:** → FAIL；**Step 3:** 实现四模块骨架（http：uni.request+token+租户头；form：字段校验；actions：op→uni.navigateTo/toast 分发；charts：占位）；**Step 4:** → PASS；提交 `feat(runtime): @lc/runtime-uni 独立包`

## Task 3.3: uni-shell 工程（M2）

**Files:** Create `frontend/uni-shell/{package.json,vite.config.ts,src/{pages.json,manifest.json,App.vue},src/uni-api/{request.ts,glue.ts}}`
**Interfaces:** Consumes `generatePageUni().files`（写入 `src/pages/gen/`）；Produces `bun run build:h5` / `build:mp-weixin` 脚本

- [ ] **Step 1:** 建 uni-app Vue3 工程骨架（pages.json 初始空清单、manifest 读占位 appid）；`bun install` + `bun run build:h5` 成功
- [ ] **Step 2:** 提交 `feat(uni-shell): uni-app 产物宿主工程`

## Task 3.4: px→rpx 样式基线（M2）

**Files:** Modify `target-profile.ts`（styleRules）；Test `__tests__/uni/style.test.ts`
**Interfaces:** Produces `toRpx(px: number|string): string`（数值×2 出 rpx；375 基准）

- [ ] **Step 1（RED）:** 测试：`toRpx(16)==='32rpx'`、字符串带单位原样、0→'0'；**Step 2:** → FAIL；**Step 3:** 实现；**Step 4:** → PASS；提交 `feat(codegen): rpx 换算`

## Task 4.1–4.4: 字段族出码（M2，每项一个任务，模式相同）

**Files:** `uni/component-map.ts` + `uni/emit-field.ts`（字段节点→模板片段）；Test `__tests__/uni/emit-field-*.test.ts`
**Interfaces:** Produces `emitFieldNode(node: IrNode, profile): { template: string, script?: string }`（golden 先行：先写期望模板快照再实现）

- [ ] **Step 1（RED，每子项）:** 4.1 input/textarea/inputNumber/datePicker 期望模板快照（uni-easyinput/uni-number-box/uni-datetime-picker + precision 包装）；4.2 select 单选/多选/远程搜索三形态；4.3 group/subForm 嵌套块 + FormulaField（formulaEval 移植断言求值结果）；4.4 必填/校验规则落法
- [ ] **Step 2:** `npx vitest run src/views/page/codegen/__tests__/uni/` → FAIL
- [ ] **Step 3:** 按 component-map 表实现映射（映射表形如 `{ input: { tag: 'uni-easyinput', props: { placeholder: 1 } } }`）
- [ ] **Step 4:** → PASS；每子项独立提交 `feat(codegen): uni 字段族 <子项>`

## Task 5.1–5.3: 列表/详情/容器出码（M2，模式同上）

**Files:** `uni/emit-list.ts`、`uni/component-map.ts`；Test `__tests__/uni/emit-list-*.test.ts`
**Interfaces:** Consumes Task 3.2 `runAction`；Produces 列表节点 emit（uni-card+onReachBottom 触底）、容器 emit（uni-popup 三键）

- [ ] **Step 1（RED）:** 5.1 cards 期望模板 + 按钮/行点击 handler 出口；5.2 detail/steps/container 三组件模板 + 容器 open/close/confirmSave 函数；5.3 动作出口表：open-link→`uni.navigateTo({url:...})`、message→`uni.showToast`、export→unsupported 登记
- [ ] **Step 2:** → FAIL；**Step 3:** 实现；**Step 4:** → PASS；每子项提交 `feat(codegen): uni <列表/详情/动作> 出码`

## Task 6.1: uni-table spike（M3，先于 6.2）

- [ ] **Step 1:** 在 uni-shell 手写一页含 uni-table（固定列+横滚+20 列数据）跑真机/开发者工具，结论回填 design.md「Risks 第 1 条」； spike 代码不进主干（或进 `spike/` 分支）
- [ ] **Step 2:** 提交结论文档 `docs(uni): uni-table spike 结论`

## Task 6.2–6.4: uni-table 与降级件（M3）

**Files:** `uni/component-map.ts`、`uni/emit-table.ts`；Test `__tests__/uni/emit-table-*.test.ts`
**Interfaces:** Produces page-table→uni-table emit（列→uni-table-column、操作收 `···` uni-popup、搜索/分页适配）；fcTable→纵向堆叠（slot 单元按 row/col 排序输出，跨列格只渲染 home 格）；tableForm→卡片编辑器（行卡片+增删按钮沿用 config）

- [ ] **Step 1（RED）:** 6.2 page-table 期望模板（含 actionColumn 收纳）+ 链出口接线断言；6.3 fcTable 几何→堆叠顺序断言（用 V32 语料 fixture 的 2×3 表）；6.4 tableForm 行卡片模板 + min/max 约束
- [ ] **Step 2:** → FAIL；**Step 3:** 实现；**Step 4:** → PASS；每子项提交 `feat(codegen): uni <table/降级件> 出码`

## Task 7.1–7.3: 图表（M3）

**Files:** `packages/lc-runtime-uni/src/charts.ts`、`uni/component-map.ts`；Test `__tests__/uni/emit-chart.test.ts`
**Interfaces:** Consumes Web 端 `buildChartDataset`/`buildPieDataset`（从 `src/views/page/components/PageDataChart.vue` 抽纯函数到 `src/views/page/components/chart-dataset.ts` 供两侧引用——**抽离不改行为**，web golden 守护）；Produces `buildChartOption(config, rows)`（echarts option，与 Web 同源）；lime-echart 标签映射

- [ ] **Step 1:** 7.1 spike：uni-shell 引 lime-echart 渲染 bar/line/pie 各一，真机验证 canvas 2d；结论回填 design
- [ ] **Step 2（RED）:** 7.3 测试：语义 config（{type, dimension, measures}）+ rows → option 断言（series 聚合与 Web 一致）；7.2 kpi/notice/todo 模板快照；分包断言：图表页路径在 `src/pages/chart-sub/`（pages.json subPackages）
- [ ] **Step 3:** → FAIL → 实现（dataset 抽离 + chart-sub 分包）→ PASS；提交 `feat(codegen): uni 图表族出码（分包）`

## Task 8.1–8.3: 产物级预览（M2/M3，发布前核对）

**Files:** Modify `PageDesigner.vue` 预览弹窗（产物预览：H5 手机壳 iframe + 出码报告/源码/二维码页签 + 双渲染对照）；Create uni-shell 预览构建入口（`scripts/build-preview.mjs`：调 generatePageUni 落盘 uni-shell + uni build h5 + 本地静态服务端口 5301）；Test `__tests__/PageDesigner.artifact-preview.test.ts`、e2e `e2e/codegen/uni-preview.spec.ts`
**Interfaces:** Consumes generatePageUni（Task 3.1）；Produces 版本令牌重挂（preview=true 口径）；8.3 小程序二维码入口复用 Task 9 upload 返回的 qrUrl

- [ ] **Step 1（RED）:** 弹窗测试：uniapp 类型页面显示「产物预览」入口；构建完成后 iframe 加载产物页面；重复打开以版本令牌强制重挂不展示陈旧产物
- [ ] **Step 2:** → FAIL → 实现（build-preview 脚本 + 弹窗）→ PASS
- [ ] **Step 3:** e2e：语料页 → 生成+构建 → iframe 加载后核心文本断言（复用双渲染定位口径）；提交 `feat(designer): 产物级预览（发布前核对）`

## Task 9.1–9.4: 构建发布（M3）

**Files:** Create `api/controller/AppReleaseController.java`、`engine/app/AppReleaseService.java`、`mini-services/app-builder/{package.json,src/{server.ts,uni-build.ts,mp-upload.ts}}`；Modify `system/service/WechatMiniprogramClient.java`（实例工厂按 appId）
**Interfaces:** Produces `POST /api/v1/apps/{appId}/clients/{clientId}/releases`（建快照）、`POST .../releases/{id}/build`、`POST .../releases/{id}/upload`；app-builder HTTP：`POST /build {pagesManifest, clientConfig}` → `{artifactUrl}`、`POST /upload {artifactPath, appId}` → `{qrUrl}`；后端经 portal-bff 同端口约定调 app-builder

- [ ] **Step 1（RED）:** Release 测试：创建快照固化 published_version、version 递增、页面后续发版不影响快照（查 snapshot_json）
- [ ] **Step 2:** → FAIL → 实现快照 API → PASS；提交 `feat(release): AppRelease 快照`
- [ ] **Step 3:** app-builder：uni-build.ts shell 出 `uni build`（接收 generatePageUni files 落盘+构建），mp-upload.ts 用 miniprogram-ci（凭据入参）；Node 侧 vitest 测试（落盘/参数透传/失败态）
- [ ] **Step 4:** build/upload API 串接 + FAILED 状态机测试；提交 `feat(release): 构建与体验版上传`
- [ ] **Step 5:** WechatMiniprogramClient 改工厂（`forClient(AppClient)`），既有调用点改为按 Client 解析；提交 `refactor(wechat): 小程序凭证按客户端多实例`

## Task 10.1–10.4: 验证与 Gate（贯穿收口）

- [ ] **Step 1:** 10.1 e2e：`playwright.config.ts` 加 `uni-dual-render` project（宿主 vs uni-shell H5 产物，端口 5301，列表/表单容器/dashboard 三用例）
- [ ] **Step 2:** 10.2 语料体检：`__tests__/corpus-audit.test.ts` 加 uniapp 目标断言（C 桶 0、可出码率 ≥ 基线常量）
- [ ] **Step 3:** 10.4 全量回归：`npx vitest run` + web golden + `mvn -o test` 全绿
- [ ] **Step 4:** 10.3 真机清单人工执行（登录/列表/详情/提交/二维码），结果记 `docs/test-runs/`
- [ ] **Step 5:** 提交 `test(gate): 多端验证 Gate 与回归`
