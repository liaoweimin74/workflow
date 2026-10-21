## 1. 基线与 IR 层

- [ ] 1.1 固化基线：记录 tsc 错误数、全量 vitest 失败清单、语料可出码率（当前 55/98）、A/B/C 桶计数，写成测试常量
- [ ] 1.2 新增 `ir.ts`：定义 `IrPage` / `IrNode` / `IrTable` 与节点 `kind` 分类，不 import form-create
- [ ] 1.3 实现 `parseIr(schema)`，先把现有已登记类型逐一映射进 IR（列表/容器/字段/展示/dash/数据容器/group 族）
- [ ] 1.4 模板生成改为只读 IR（`emitTemplate(IR)`），既有 golden 产物字节不变
- [ ] 1.5 manifest 生成改为只读 IR，四张登记表语义不变
- [ ] 1.6 增加 IR 目标无关性测试：IR 模块依赖检查 + 模板生成不直接读 schema 节点
- [ ] 1.7 **Gate 1**：tsc、全量 vitest、语料体检（C=0、可出码率不低于 55/98）全部通过

## 2. fcTable（7C）

- [ ] 2.1 补合成样本：覆盖跨行/跨列合并、不同行列数与空单元格，确认 `layout` 语义
- [ ] 2.2 `contract.ts` 登记 `fcTable`：`props.rule` 几何、`children` 与 `slot` 地址、可丢弃/重命名键
- [ ] 2.3 `parseIr` 支持 fcTable：`row/col/style/class/layout` 与子节点 slot 进入 IR
- [ ] 2.4 生成静态表格模板：按几何计算 rowspan/colspan、列宽、边框样式，子节点放入对应单元格
- [ ] 2.5 `reverse.ts` 实现几何回读：从 td 坐标与锚点还原 slot 键与布局
- [ ] 2.6 变异用例：改错 slot、改错 colspan、删掉单元格，回读必须分别报差异
- [ ] 2.7 dashboard 页整页出码，语料体检更新（验证可出码率提升且 C 桶仍为 0）
- [ ] 2.8 真机 A/B：dashboard 产物与现网对比单元格结构、文本、几何
- [ ] 2.9 **Gate 2**：fcTable 回读零空洞、dashboard 进语料 Gate、真机 A/B 记录留档

## 3. @lc/runtime 独立包

- [ ] 3.1 新建 `frontend/packages/lc-runtime`：package.json、子路径 exports、vite library 构建
- [ ] 3.2 把 `src/lc-runtime` 的 16 个 shim 迁成包内真实导出（组件/取数/工具）
- [ ] 3.3 `vue` / `element-plus` / `@form-create/*` 设为 external，包不重复打包宿主库
- [ ] 3.4 宿主改为 `file:packages/lc-runtime` 依赖，删除 vite / vitest / tsconfig 三处 alias
- [ ] 3.5 产物侧声明并解析同一包，删除 alias 后独立执行类型检查与构建
- [ ] 3.6 增加构建冒烟：检查产物 chunk 不含宿主应用代码、element-plus 循环依赖未复现
- [ ] 3.7 宿主回归：`/codegen-probe` 与现网页面渲染、编辑、写回不受影响
- [ ] 3.8 **Gate 3**：删 alias 后产物可独立编译；宿主与产物共用同一实现；构建冒烟通过

## 4. 组件 emit 与动作链

- [ ] 4.1 盘点按钮链/列链/组件链载体与所需 emit，形成「触发器 → emit」白名单与缺口表
- [ ] 4.2 为 page-table / page-list-cards / page-form / page-data-container 等补齐缺失 emit，保持既有事件语义
- [ ] 4.3 扩展 `externalActions` 到列链与组件链载体：产物模式只 emit，关闭内部 `pageActionBus` 派发
- [ ] 4.4 IR 表达动作链：trigger、source、params、`$row` 上下文与目标地址
- [ ] 4.5 生成三类链 handler：按钮 `@button-click`、列事件、组件事件；参数在生成期解析
- [ ] 4.6 事件脚本出成普通函数：上下文白名单（form/row/rowIndex/page/message/http）+ 生成期扫描
- [ ] 4.7 脚本中出现白名单外能力时记 unsupported，不生成假 handler
- [ ] 4.8 合成样本覆盖：按钮链、列链、组件链各至少 1 条 + 读写字段脚本 1 条
- [ ] 4.9 防双执行用例：产物中每次触发副作用计数为 1；宿主不传 externalActions 时行为不回归
- [ ] 4.10 manifest `implementedBy` 与产物实际 case 对齐；无承载按钮的触发器保持 `not-wired` + unsupported
- [ ] 4.11 **Gate 4**：三类链与脚本在产物中真执行、无双执行、回读零空洞

## 5. 双渲染 e2e 与生成报告

- [ ] 5.1 定义 `GenerateReport`（可出码率、A/B/C 桶、unsupported、登记表计数）并从 `generatePage` 返回
- [ ] 5.2 语料体检测试消费报告：C>0 或可出码率低于基线即失败
- [ ] 5.3 搭 Playwright 脚手架：产物预览与宿主预览两个 webServer
- [ ] 5.4 列表页双渲染用例：行数、关键列文本、编辑按钮打开容器
- [ ] 5.5 表单容器页双渲染用例：字段回填、公式计算、LookupPicker 写回
- [ ] 5.6 dashboard 双渲染用例：dash 组件数量、筛选广播后的数据变化
- [ ] 5.7 接入 CI；若 CI 暂不具备浏览器条件，把 Gate 明确标为「未自动化」并记录人工步骤
- [ ] 5.8 收口：更新基线数字、清理临时探测产物与脚本、确认 spike 分支未被改动
- [ ] 5.9 **Gate 5（交付 Gate）**：三类 e2e 通过、C 桶 0、可出码率不低于基线、产物独立编译

## 6. 撤下 / 延后（不在本期实现）

- material 节点出码（业务页零引用，动态加载语义未定）
- 移动端目标与 P3 后端（依赖本变更的 IR 与运行时包）
- 任意 Vue 源码反向导入（不可判定）
- `@lc/runtime` 发布到 npm registry（部署阶段前置）
