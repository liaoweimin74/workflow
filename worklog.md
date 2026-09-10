# 工作交接文档 (worklog)

---
Task ID: 1
Agent: 主控 (Z.ai Code)
Task: 后端配置为不需要 Redis（用户指定用 yml 配置方式，不移除 pom 依赖）

Work Log:
- 排查发现 `spring-boot-starter-data-redis` 仍在 pom.xml 中（用户明确要求不移除），`RedisConfig`/`RedisCache` 均已是 `@ConditionalOnBean` 条件装配
- 确认 Spring Boot 4.0.7 的 Redis 自动配置类全限定名（SB4 改过包名，从 `spring-boot-data-redis-4.0.7.jar` 的 `AutoConfiguration.imports` 提取）：
  - `org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration`
  - `org.springframework.boot.data.redis.autoconfigure.DataRedisReactiveAutoConfiguration`
  - `org.springframework.boot.data.redis.autoconfigure.DataRedisRepositoriesAutoConfiguration`
  - `org.springframework.boot.data.redis.autoconfigure.health.DataRedisHealthContributorAutoConfiguration`
  - `org.springframework.boot.data.redis.autoconfigure.health.DataRedisReactiveHealthContributorAutoConfiguration`
  - `org.springframework.boot.data.redis.autoconfigure.observation.LettuceObservationAutoConfiguration`
- 修改 `backend/src/main/resources/application.yml`：新增 `spring.autoconfigure.exclude` 排除以上 6 个自动配置类
- 修改 `backend/src/main/java/com/workflow/framework/config/FlowableEngineConfig.java`：`processEngineConfigurer` 中增加 `configuration.setDatabaseType("mysql")`
- 用 JDK21（`/home/z/tools/jdk21`，系统 JRE 无 javac，maven 需 `JAVA_HOME` 指向它）重新打包：`JAVA_HOME=/home/z/tools/jdk21 /home/z/tools/maven/bin/mvn -o package -DskipTests`
- 清空损坏的 H2 数据目录（旧半成品 schema 已备份到 `/home/z/backup/`，可删）
- 通过 `/api/portal/services` 触发服务监督器（Next.js 子进程常驻 + 20s 看门狗）拉起后端

Stage Summary:
- **Redis 已通过 yml 配置彻底排除**：启动日志中 Redis 相关输出 0 条，不创建任何 Redis Bean，运行期零 Redis 依赖。`NotificationCache`（null 安全降级）与 `AuthServiceImpl`（logout no-op）无需改动即可正常工作
- **顺带修复了后端启动崩溃循环**（148 次重启的根因）：Flowable 8 的 H2 方言建表脚本使用 `identity` 列类型，而 H2 2.x（含 2.3.232/2.4.240）在 `MODE=MySQL` 下不识别该类型（`Unknown data type: "IDENTITY"`），导致首次建库失败、残留半成品 schema 后每次重启 NPE。实测验证 Flowable 的 MySQL 方言脚本（4 个共 1170 行、45 张表）可在 H2 MODE=MySQL 完整执行，故强制 `databaseType=mysql`（对真实 MySQL 环境同样正确）
- **验证结果**：两次完整启动均成功（全新库 18.7s 启动：Hibernate 建表 → Flyway 全量迁移 V2-V31 → Flowable 建表 → Tomcat；二次启动直接复用库）。登录 API 正常签发 token（admin/admin123），`/api/auth/menus` 返回完整菜单树
- **环境备忘**：后端 jar 由 Next.js 服务监督器管理（`src/lib/service-supervisor.ts`），看门狗 20s 巡检自动拉起；日志 `/home/z/tools/backend.log`；H2 库文件 `backend/data/workflow.mv.db`
- 风险提示：H2 沙箱库仅单实例可用；若换真实 MySQL 环境，`databaseType=mysql` 依然正确，无需回退

---
Task ID: 2 (待办池，供后续巡检任务参考)
Agent: -
Task: 下一步候选工作项

候选事项:
- 前端 Vite (5173) 与后端 (8080) 联调冒烟：通过浏览器验证登录页 → 首页 → 流程中心主链路
- H2 沙箱库的 `workflow.trace.db` 会积累告警日志，可关注体积增长
- `AuthServiceImpl` 中残留未使用的 Redis 相关 import（可编译，建议后续顺手清理）
- `GenHash.java` 位于 backend 根目录（工具类），可考虑移入合适位置或删除

---
Task ID: 3
Agent: 主控 (Z.ai Code) — 定时巡检轮次 2026-09-10 13:35 (Asia/Shanghai)
Task: 浏览器 QA 巡检 + 端到端流程链路验证 + 首页数据看板实装

Work Log:
- **全站浏览器 QA（agent-browser）**：登录页 → 登录成功跳转 /lowcode/dashboard；遍历 首页/用户管理/流程定义/流程中心/待办处理，页面渲染全部正常、前端 console 零错误、多标签页导航正常、API 全部 200（SSE 为正常挂起）
- **端到端流程链路验证（API 驱动，验证 databaseType=mysql 运行期表现）**：
  1. 创建草稿 `POST /api/v1/process-definitions/drafts?name=请假审批&key=leave-bill`
  2. 保存示例 BPMN `PUT /{draftId}/design`（`example/leave-bill.bpmn20.xml`）
  3. 部署 `POST /{draftId}/deploy` ✅
  4. 发起实例 `POST /api/v1/process-instances`（variables: manager=1）→ 提交节点被 InitiatorNodeResolver 自动完成 ✅
  5. 待办出现（部门经理审批，assignee=1）✅
  6. 完成 `POST /api/v1/tasks/{taskId}/complete` → `processFinished: true` ✅
  - 注意：所有 `/api/v1/**` 业务接口需带 `X-Tenant-Id: default` 请求头（前端 http.ts 已统一添加）；`/api/v1/tasks` 必须显式传 `assignee` 参数
- **新功能：首页数据看板实装（前后端）**
  - 后端新增 `api/controller/DashboardController.java`：`GET /api/v1/dashboard/stats?userId=`，聚合 Flowable 实时查询（我的待办/已办、进行中实例、最新版流程定义数、我发起的、近 7 日发起趋势、状态占比 running/finished），已重打包并重启生效
  - 前端新增 `src/api/dashboard.ts`；重写 `DashboardPage.vue`：KPI 卡片接真实数据（我的待办任务/我的已办任务/进行中流程/已部署流程定义）、近 7 日趋势柱状图数据驱动（7 柱均分栅格与日期标签对齐，含合计/空态/tooltip）、流程状态占比环形图（分段弧长计算 + 中心总数 + 图例）、加载骨架屏、失败降级显示 "--"、卡片 hover 阴影过渡
  - 修复自测发现的对齐 bug：趋势柱沿用旧 10 柱坐标导致与 7 个日期错位，改为 7 柱均分 + grid-cols-7 日期栅格
  - 浏览器验证：KPI 显示 0/2/0/1（已办 2 = 自动提交 + 经理审批），9/10 趋势柱正确对齐，占比环 "已完成 1"
- **异常排查**：后端日志共 3 条 ERROR——2 条为测试期参数缺失（非 bug）；1 条 `NoClassDefFoundError: ReactiveTypeHandler$CollectedValuesList`（05:43:08）发生在后端 kill/重启窗口期 + SSE 长连接断连时刻，正常导航后零复现，判定为重启窗口期瞬时现象

Stage Summary:
- **平台已具备完整可演示的端到端能力**：库中现有 请假审批 v1 流程定义 + 1 个已完成实例（businessKey=demo-001），流程中心卡片、待办/已办、首页看板均有真实数据
- H2 + MySQL 方言在 Flowable 运行期（部署/发起/任务流转/历史查询/趋势统计）全部验证通过
- 未解决问题/观察项：
  - SSE 断线重连在服务重启窗口可能触发一次 `ReactiveTypeHandler$CollectedValuesList` NoClassDefFoundError（仅记录，暂不处理；如复现于正常运行需排查 spring-webmvc 依赖完整性）
  - DashboardController 每次统计发起 ~12 次 Flowable 查询，数据量增大后可考虑缓存
- 建议下一阶段优先事项：
  1. 表单视图管理（表单列表/页面列表）链路 QA + 低代码表单设计与流程绑定演示
  2. 系统管理其余页面（角色/菜单/组织机构/字典）QA
  3. 消息中心（通知/SSE 推送）实测：发起流程给他人审批，验证站内消息
  4. 清理 `AuthServiceImpl` 残留 Redis import；`GenHash.java` 归位

---
Task ID: 4
Agent: 主控 (Z.ai Code) — 定时巡检轮次 2026-09-10 14:35~15:10 (Asia/Shanghai)
Task: 浏览器全站 QA + 修复 3000 入口白屏 + 工作流→通知中心桥接实装

Work Log:
- **【严重 bug】3000 端口访问 /lowcode 全站白屏（用户预览面板实际入口！此前 QA 走 5173 直连未发现）**
  - 现象：资源全部 200 但模块不执行，`import()` 报 `SyntaxError: Unexpected token '.'`，二分定位到 Vue SFC 样式模块 `*.vue?vue&type=style&index=0&lang.css`
  - 根因：Next.js 服务器在 middleware 之前把 query 无值参数 `k` 重序列化为 `k=`（`?vue&type=...&lang.css` → `?vue=&type=...&lang.css=`），Vite 不再将其识别为样式模块（URL 不以 `.css` 结尾），返回原始 CSS 而非 JS 包装模块
  - 排障期间用回显服务器证实：即使 middleware 里还原好 query，`NextResponse.rewrite` 执行层仍会再次改写 → middleware 层无解
  - 修复：新增 `src/app/lowcode/[...path]/route.ts` 手动反代（restoreRawSearch 还原 query + 手动 fetch 源站流式透传），middleware 的 `/lowcode/*` 分支改为放行。修复后字节级 md5 与直连一致，浏览器全站渲染正常
- **【bug】`v-permission` 指令从未注册**：`directives/permission.ts` 存在但 main.ts 未 `app.directive` → 全部按钮权限控制失效 + Vue 告警。已注册
- **【bug】`el-option` value=undefined prop 告警**：Role/User 页 `{label:'全部', value:undefined}`；SearchTable.fetchList 改为剔除 ''/null/undefined 再下发（后端语义不变），选项值改 `''`
- **【bug】ElTag type='' 无效告警 ×9 处**：FormList/Menu/DataSource×2/FormDesigner/ViewDesigner/PageDesigner/PageList 的 `|| ''` 回退与三元，统一改 `'info'`/`'primary'`
- **【新功能】工作流 → 通知中心桥接（打通两个既有子系统）**
  - 缺口：引擎无任何监听器推送业务消息（TASK_ASSIGNED/PROCESS_COMPLETED 无感知，催办仅 log），消息中心永远为空
  - 后端新增 `notification/bridge/WorkflowNotifier`（模板优先→自由内容兜底、吞异常不阻断流程、租户上下文自恢复、HistoryService 用 ObjectProvider 延迟解析破循环依赖）+ `WorkflowNotificationListener`（TASK_ASSIGNED/PROCESS_COMPLETED）
  - 接线：FlowableEngineConfig.setEventListeners 注册双监听器；TaskRemindController 催办成功后推送
  - 种子：Flyway `V32__seed_workflow_notification.sql`（3 事件定义 + 3 站内信模板）；FlywayConfig 全局 `placeholderReplacement(false)`（模板正文 `${taskName}` 撞 Flyway 占位符语法）+ V32 加入 H2_REPLAY_VERSIONS
  - H2 幂等坑：Hibernate 先建表无唯一键 → `INSERT IGNORE` 每次启动重复插入 → `findByTemplateCodeAndTenantId` 非唯一结果抛错。改 `INSERT...SELECT...FROM DUAL WHERE NOT EXISTS` + 一次性 H2 Shell 去重
  - 发起人解析：startUserId 为 null（平台未调 Flowable Authentication API）→ 回退历史变量 `initiator`（ProcessInstanceController 发起时写入）
  - **端到端验证全通过**：发起 → user2 收"您有新的待办任务：部门经理审批"✅；审批完成 → 发起人收"您的流程「请假审批」已办结"✅；催办 → user2 收"催办提醒：部门经理审批"✅；浏览器 test 用户登录：铃铛角标 4、消息中心 4 条未读（◉ 未读标记/分类"工作流"）✅
- **【细节打磨】** 消息中心 WORKFLOW 类消息新增"去处理"按钮（仅工作流消息显示，点击直达待办处理页，已验证跳转）
- **【清理】** AuthServiceImpl 移除残留 Redis/TimeUnit import；GenHash.java 归位至 `system/util` 并补 package 声明
- 运维事件：期间 Next.js dev 进程崩溃一次（bun run dev 存活但 next-server 子进程死亡），已手动 `bun x next dev -p 3000` 拉起，监督器随之恢复；一次 jar 替换竞态导致的启动失败自动恢复

Stage Summary:
- **平台主链路完整度大幅提升**：工作流通知（待办/办结/催办）全自动推送 + 站内信 + SSE 铃铛实时角标，消息中心从"永远空"变为生产可用
- **用户预览入口（3000）从白屏修复为完全可用**，这是本轮最关键的修复——此前所有经 3000 的访问都是坏的
- 全站 QA：登录/首页/系统管理 4 页/流程 4 页/表单/页面/数据源/消息中心 6 子页/个人中心，控制台 0 error 0 warning
- 未解决问题/风险：
  - Next.js 对无值 query 参数的规范化是平台级行为，`route.ts` 反代仅覆盖 /lowcode/*；/api/* 走 middleware rewrite（后端对 `k` vs `k=` 语义等价，暂无影响），若未来后端出现 query 格式敏感接口需同样处理
  - Next.js dev 进程本轮曾自行崩溃，原因未查明（疑 OOM），若复现需关注内存
  - V32 在本沙箱 H2 已预置成功记录，本轮修复的 SQL 只影响全新库；当前库数据已通过 API/去重补齐
- 建议下一阶段优先事项：
  1. 表单设计器 → 表单绑定流程（FormPropertyTab）端到端演示：设计表单 → 发布 → 流程节点引用 → 发起时渲染表单
  2. 页面设计器/数据源管理链路深度 QA（本轮仅浅测）
  3. 消息中心详情抽屉增加流程上下文展示（businessKey/发起人），"去处理"精确跳转到具体 taskId
  4. Dashboard 环比指标、流程定义使用排行（候选需求池）

---
Task ID: 5
Agent: 主控 (Z.ai Code) — 定时巡检轮次 2026-09-10 15:11~15:45 (Asia/Shanghai)
Task: 浏览器 QA + 修复 3000 入口回归与流程图空白 + 消息中心→流程精确跳转实装

Work Log:
- **【严重 bug】3000 预览入口 `/lowcode/` 又白屏（回归）**：Next.js 服务器把 `/lowcode/` 308 重定向为 `/lowcode`（尾斜杠规范化，发生在 middleware 之前无法拦截），middleware 原 rewrite 目标也是无尾斜杠的 `/lowcode`，Vite（base=`/lowcode/`）对其返回 404/"did you mean" 页。修复：middleware `/lowcode` 分支 rewrite 目标显式带尾斜杠 `${FRONTEND_ORIGIN}/lowcode/${search}`（rewrite 是服务端内部直连，不再经过 Next.js 尾斜杠规范化）。Task 4 的 QA 只测了深层路径未复测根入口，本轮补上
- **【bug】流程跟踪页流程图永远空白**：示例 `leave-bill.bpmn20.xml` 缺少 BPMNDI 图形信息（无节点坐标/连线），bpmn-js 导入成功但 0 元素可渲染。修复：源文件补全 `<bpmndi:BPMNDiagram>`（4 节点 Bounds + 3 连线 waypoints）并经 草稿→设计→部署 发布为 v2；后端重新打包（example 资源随 jar）
- **【细节】BpmnViewer 组件无 DI 空态**：importXML 的 warnings 含 "no diagram" 时显示友好空态（图标+标题+说明"重新发布新版后可显示"），旧 v1 实例跟踪页不再白屏困惑；importXML 抛错同样置空态
- **【新功能】消息中心 → 流程精确跳转（端到端）**
  - 后端：`WorkflowNotificationListener` 传 `task.getId()`；`WorkflowNotifier` 三类通知（TASK_ASSIGNED/PROCESS_FINISHED/TASK_REMINDED）统一经新增 `putProcessContext()` 写入 `processInstanceId`/`taskId`/`businessKey` 到消息 `content.variables`（仅附加变量，模板校验不受影响）；`TaskRemindController` 催办调用同步传 taskId
  - 前端 `MessageCenter.vue`："去处理"三级跳转——`taskId` → `/process/todo/{taskId}` 任务处理页；无 taskId 有 `processInstanceId` → `/process/instance/{id}` 流程跟踪页；都无（历史消息）→ 兜底待办列表
  - 前端 `MessageDetailDrawer.vue`：WORKFLOW 消息新增"流程上下文"区块（流程名称/任务节点/发起人/业务单号/等宽字体实例ID，占位"-"字段自动隐藏）+ "去处理该任务"（primary）/"查看流程跟踪"双按钮，点击关闭抽屉后跳转
- **端到端验证（API+浏览器）全通过**：admin 基于 v2 发起（businessKey=e2e-diagram-002）→ test 收待办消息（variables 含 taskId/instanceId/businessKey）→ 浏览器点"去处理"直达 `/process/todo/{taskId}` 任务处理页（流程编号/发起人/变量全对）→ 完成审批 `processFinished:true` → admin 收办结通知（含上下文）→ 点"去处理"正确兜底跳流程跟踪页 → v2 流程图 4 节点+3 连线渲染、已完成/当前节点蓝色高亮 ✅
- 回归：登录/首页/消息中心/待办/流程跟踪 console 0 错误；当前后端进程（PID 随监督器管理）启动后 0 ERROR

Stage Summary:
- 平台演示主闭环再升级：**消息 →（精确）→ 任务处理/流程跟踪 →（流程图高亮）** 全链路可演示；历史遗留的"流程图空白"彻底解决
- 库内数据：leave-bill 现有 v1（无 DI，7 实例）与 v2（含 DI）两个版本；v2 已有 1 个已完成实例（e2e-diagram-002）可作演示
- 未解决问题/风险：
  - v1 历史实例的跟踪页永远显示空态（数据缺陷不可追溯修复，属预期行为；如需干净演示库可 terminate v1 在途实例）
  - TaskDetailPage 对"任务已被处理"场景仅 toast"加载任务详情失败"，可考虑友好引导回待办列表（低优先）
  - rg 查询参数 `-rn` 会把匹配文本替换显示为 "n"（`-r` 是 replace 标志），排障时需用 `-n`，本轮曾误导排查方向数分钟
- 建议下一阶段优先事项：
  1. 表单设计器 → 表单绑定流程（FormPropertyTab）端到端：设计表单 → 发布 → 流程节点引用 → 发起时渲染表单（worklog Task 4 建议项，仍未启动）
  2. Dashboard 环比指标 + 流程定义使用排行（候选需求池）
  3. 铃铛下拉也接入精确跳转（复用 goToProcess 逻辑）
  4. v1 在途实例清理脚本/terminate（演示库卫生）

---
Task ID: 5b/5c
Agent: 主控 (Z.ai Code) — 会话续接：JSON 双重编码修复验证 + 浏览器端到端 + OOM 治理
Task: 重跑表单↔流程绑定链路端到端验证；浏览器验证发起页/待办页动态表单渲染

Work Log:
- **【5b 完成】JSON 双重编码修复的 API 级端到端验证（五条腿全过）**
  1. FormDefinition 详情 schema：返回干净单层 JSON 字符串（无转义引号/双重编码），可正常 parse
  2. NodeConfig.config_json → formDefId/fieldPermissions/formKey 解析：`GET /api/v1/deployed-processes/{id}` 返回 formDefId 正确、fieldPermissions 为干净 dict
  3. FormData 草稿回环：POST/GET draft 往返，含引号/HTML 特殊字符完全无损，days 保持 int
  4. 发起带 formDefId → FormData 快照创建，dataJson 读取干净（前端 ProcessStartPage 发起时传 formDefId，控制器 save 到 form_data）
  5. mappedData 变量映射（form:initiator 源）值干净无编码问题
- **【新 bug 发现并修复】单人审批节点依赖未设置的 `${manager}` 启动变量**
  - 症状：发起后 submitTask 自动完成失败 `FlowableException: Unknown property ${manager}`（v2 实例卡死在发起节点，审批人永远收不到任务）
  - 根因：`MultiInstanceBpmnRewriter` 已支持按节点配置 `approval.userIds` 在部署时把 assignee 改写为字面量，但 leave-form-flow/leave-bill 草稿的 managerApproval 节点配置缺少 approval 段，部署出的 BPMN 仍是 `${manager}` 表达式
  - 修复：经设计器 API（PUT /design）给 managerApproval 补 `approval.userIds:["2"]`（test 用户）→ 重新部署为 **v3** → 部署 XML 中 assignee 已写死 `flowable:assignee="2"`；免启动变量发起成功，自动流转 ✅
  - 注意：v2 的两个卡死实例（e2e-jsonfix-001/002）留在库中，属数据卫生问题可 terminate
- **【重要运维问题确诊】next-server 反复静默死亡 = 系统 OOM（4.1Gi 沙箱）**
  - dmesg 实锤：next-server（anon-rss ~1GB）被 oom-killer 反复击杀（pid 1745/31463），同批 chrome 也被杀；内存水位：Java 612MB + Vite 519MB + Turbopack ~1GB + Chrome QA 会话 > 4.1Gi
  - 治理（三服务全加内存上限）：
    - `scripts/start-services.sh`：java 加 `-Xmx448m -XX:MaxMetaspaceSize=192m`；Vite 加 `NODE_OPTIONS=--max-old-space-size=512`
    - `package.json` dev 脚本：next dev 加 `NODE_OPTIONS=--max-old-space-size=614`
  - **启动方式约定（重要）**：必须用 `(cd dir && nohup ... &)` 子壳分离模式启动（worklog 已验证可存活数小时）；`bun run dev` 的 `tee dev.log` 管道模式在会话清理时 tee 被杀 → next-server SIGPIPE 静默死亡；`setsid` 单独启动也活不过 ~90s
  - 已知竞态：start-services.sh 的 port_open 探测与旧后端优雅关闭撞车（SSE 长连接拖住端口）→ 误判"已在运行"跳过启动；如遇 8080 未起需手动按新参数补启
- 【杂项】test 用户密码重置为平台默认 123456（GlobalConstant.DEFAULT_PASSWORD，此前口令失传）；agent-browser 访问 3000 需 `--proxy-bypass "localhost,127.0.0.1"`（Chromium 代理设置）
- **【5c 完成】浏览器端到端（agent-browser，console 0 error）**
  - admin 登录 → 流程中心 → 请假审批（表单版）发起页：**动态表单 6 字段全部渲染**（请假事由/类型/起止日期/天数/备注）+ BPMN 流程图预览 4 节点
  - 填单提交 → 跳转待办页高亮新实例 → 后端日志确认 submitTask 自动完成、test 收 TASK_ASSIGNED（to=2）
  - test 登录 → 待办 → 任务处理页：**审批表单渲染发起人数据**，VIEW 权限字段正确 disabled（事由/类型/天数），备注可编辑，办理人=测试用户
  - 审批通过 → `processFinished: true`，实例 ended=true，admin 收 PROCESS_FINISHED 办结通知（to=1）
  - `agent-browser errors` 无页面错误；console 仅 vite debug + SSE 断线重连告警（预期行为）

Stage Summary:
- **表单↔流程绑定全链路（设计→发布→绑定→发起→审批）在 API 与浏览器两层全部验证通过**，JSON 列双重编码修复闭环
- leave-form-flow v3 成为标准演示版本：免启动变量、审批人节点配置化、动态表单+权限回显完整
- 内存治理三上限落地，next-server OOM 风险显著降低（需观察 24h 稳定性）
- 未解决问题/风险：
  - v2 卡死实例 2 个 + 历史 v1 实例 7 个未清理（演示库卫生，低优先）
  - start-services.sh 端口探测竞态仍在（可改为 kill -0 探测进程而非端口，下轮可修）
  - 沙箱 4.1Gi 内存是硬约束：避免同会话多开 Chrome；QA 时及时 close
- 建议下一阶段优先事项：
  1. 发起页为有"审批人变量"依赖的旧版流程提供变量预填/选择审批人 UI（或全部迁移到节点配置式审批人）
  2. v1/v2 历史实例清理脚本（terminate + 数据卫生）
  3. Dashboard 环比指标 + 流程定义使用排行（候选需求池）
  4. 铃铛下拉接入精确跳转（复用 goToProcess）

---
Task ID: 6
Agent: 主控 (Z.ai Code) — 会话续接：沙箱重置灾后恢复
Task: 服务全量恢复（沙箱工作区被重置后的重建）

Work Log:
- **【重大事件】沙箱工作区被重置**：backend/target/（jar 构建产物）、frontend/node_modules、/home/z/tools/（jdk21、maven、日志）全部丢失；源代码、H2 数据库（backend/data/workflow.mv.db）、worklog 均幸存
- **工具链重建**：系统仅有 JRE21（无 javac），重新下载 Temurin JDK 21.0.12.1 → /home/z/tools/jdk21、Maven 3.9.9 → /home/z/tools/maven（历史路径原样恢复）；~/.m2 被清空，采用在线构建
- **后端重建**：mvn -B -DskipTests package → BUILD SUCCESS（34.9s），jar 97.7MB（Boot 4.0.7 / Flowable 8）
- **前端恢复**：bun install → 323 包 4.3s，vite 8.1.5 可用
- **启动竞态新形态**：服务监督器（next-server PID 1081）探测到新 jar 出现后 19s 自动拉起——但未带内存上限参数，抢占 H2 文件锁（MVStoreException file locked）；手工终止无上限实例（RSS 已 510MB）后按规范参数启动，监督器为一次性触发未再抢启
- **最终验证全过**：8080/5173/3000 三端口 OPEN；后端 29.8s 启动完成（sandbox profile，-Xmx448m）；登录 API HTTP 200（admin 签发双 token）；3000 网关 → /lowcode/* → Vite（HTML/@vite/client/src/main.ts 全 200）、/api/auth/login → 8080 返回真实 JWT——历史破坏过的 raw-query 反代路径正常
- 已知预期行为：/lowcode/ 尾斜杠 308 → /lowcode（Task 5 修复的中间件显式 rewrite 生效中，curl -L 跟随后落地正确）

Stage Summary:
- **灾后恢复完成**：从"全部服务死亡+构建产物丢失"恢复到"三端口全绿+登录链路+网关反代全通过"，H2 演示数据无损（请假审批 v1/v2/v3 及历史实例仍在库中）
- 未解决问题/风险：
  - 沙箱重置会清空构建产物与工具链（/home/z/tools 下的 jdk21/maven 已重建，但重置将再次丢失——如需快速恢复可考虑把工具链挪到项目目录内或写一键恢复脚本 scripts/bootstrap-after-reset.sh）
  - 服务监督器自动拉起 jar 时不带内存参数（会引发 H2 锁冲突 + OOM 风险），后续可改进 service-supervisor.ts 附加内存 flag
  - 孤儿进程 bun PID 1052（pre-reset 残留，无端口，暂无危害）
- 建议下一阶段优先事项：
  1. scripts/bootstrap-after-reset.sh 一键灾后恢复（检测 jar/node_modules/jdk21 缺失 → 自动重建）
  2. service-supervisor.ts 启动参数补齐内存上限
  3. 继续功能推进：发起页审批人选择 UI、v1/v2 历史实例清理、Dashboard 环比指标、铃铛精确跳转

---
Task ID: 7
Agent: 主控 (Z.ai Code) — 定时巡检轮次 2026-09-10 22:05 (Asia/Shanghai)
Task: 浏览器 QA + 运维加固三件套（A1/A2/A3）+ 数据卫生清理（B5）+ 铃铛精确跳转（B7）+ 源码下载通道

Work Log:
- **QA（agent-browser，灾后恢复后首次全链路）**：登录 → dashboard（KPI 2/17/8/2、趋势合计 16 次、占比环 8/8、铃铛角标 21）→ 流程定义 → 流程中心 → 待办处理 → 消息中心全部正常，0 page error。新经验：SSE 长连接下 `wait --load networkidle` 永不满足会卡死 agent-browser 命令队列，须用固定 sleep 等待
- **A2 supervisor 内存参数**：service-supervisor.ts SERVICE_DEFS 补齐 java `-Xmx448m -XX:MaxMetaspaceSize=192m` 与前端 `NODE_OPTIONS=--max-old-space-size=512`（def.env 注入 spawn）。已落盘，待 next dev 下次重启生效（本轮 403 抖动窗口，强制重启风险大于收益）
- **A3 start-services.sh 端口竞态修复**：端口开 + HTTP 探活双确认（curl 任意状态码=活，000=死）；假死等待 20s → kill_stale_backend（仅匹配本平台 jar 名）→ 清场重启；Vite 同逻辑。bash -n 通过
- **A1 bootstrap-after-reset.sh（新脚本）**：一键灾后恢复（jdk21/maven/jar/node_modules 缺失自动重建 → 调 start-services.sh），幂等、x64+aarch64、bash -n 通过
- **B5 历史实例清理（terminate API）**：8 在途 → 清 7（2×v2 卡死 + 5×v1 无 DI 遗留），**保留 e2e-v3-check**（v3 停在经理审批节点，作表单回显演示资产）。admin 待办 2→0，running 8→1
- **B7 铃铛精确跳转（新功能，浏览器端到端全过）**：NotificationBell.vue 工作流消息行内"去处理"按钮（Promotion 图标、hover 提亮、@click.stop）+ goToProcess 三级跳转（taskId→任务处理页；instanceId→流程跟踪页；兜底待办）+ popRef.hide() 收起下拉。taskId 消息✅ / 仅 instanceId✅ / popover 收起✅ / 0 console error
- **源码下载通道（应用户"无法下载代码"诉求）**：沙箱封闭、仅 3000 预览端口可出网 → 打干净源码包 `public/workflow-lowcode-src-20260910.tar.gz`（2.2MB、1925 文件；排除 node_modules/target/H2 data；含 backend+frontend 源码、openspec/docs、scripts、worklog.md），Next.js public/ 静态直出，经网关验证 HTTP 200
- 运维事件：主会话与部分子代理 Bash 多次 403 "broken session"（基础设施抖动），经子代理绕行完成全部工作；next dev 重启（激活 A2/A3）两次尝试均被打断、kill 未执行成功，服务全程零中断

Stage Summary:
- 平台状态：三端口全绿、网关 200、待办干净（admin 0 / test 1 个 v3 演示资产）、铃铛直达上线、QA 全绿、源码可经 /workflow-lowcode-src-20260910.tar.gz 下载
- A2/A3 已落盘未激活：下次 next dev 重启自动生效
- 未解决问题/风险：
  - Bash 会话 403 抖动本轮 3 次；子代理绕行有效，操作失败先怀疑传输层
  - 任务处理页对"任务已被处理"仅 toast（历史低优先）
- 建议下一阶段优先事项：
  1. 择机重启 next dev 激活 A2/A3
  2. 发起页审批人选择 UI
  3. Dashboard 环比指标 + 流程定义使用排行
  4. 页面设计器/数据源管理深度 QA

---
Task ID: 8
Agent: cron-restart
Date: 2026-09-10 19:04:33 +0000
Task: Restart next dev(3000) to activate on-disk A2/A3 changes; Vite(5173)/Java(8080) untouched.

Work Log:
- Stopped old next dev (PIDs 1055/1066 / port-holder); port 3000 released
- Relaunched: cd /home/z/my-project && nohup env NODE_OPTIONS=--max-old-space-size=614 bun run dev >> dev.log 2>&1 &
- Readiness: 3000 OPEN after restart; warmup request completed
- Ports: 3000=OPEN 5173=OPEN 8080=OPEN
- Verification: lowcode HTTP 200, login API HTTP 200

Stage Summary:
- next dev(3000) now runs with A2 (src/lib/service-supervisor.ts env field + memory params) and A3 (scripts/start-services.sh HTTP probe double-confirm + zombie cleanup restart) active
- Cron job 374482 (nextdev restart self-termination) can terminate: later rounds see the Task 8 marker, guard-exit, and delete the job; scheduler should delete it directly if no cron tool is available in-session
