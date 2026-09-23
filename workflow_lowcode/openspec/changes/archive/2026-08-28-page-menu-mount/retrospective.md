# Retrospective: page-menu-mount

> 本回顾基于实现全过程：16 个 commit、650+ 后端测试全绿、前端构建通过、多轮用户反馈驱动修复。

## What Went Well

- **TDD 全程贯彻**：后端每个任务严格 RED（先写测试看到失败）→ GREEN（最小实现）→ 提交。新增测试用例覆盖挂接创建/多挂接/列表/解除/404/403/OR 放行/管理员授权，累计后端 650+ 测试全绿。
- **复用量大于新建**：挂接完全复用现有 `sys_menu`/RBAC 权限体系，未新增数据库表；校验复用 `@Component("pe")` PermissionEvaluator，避免重复实现。
- **多挂接设计落地完整**：挂接接口不查重（每次新建）、列表查询返回数组、解除走软删，配合前端"已挂 N 个菜单"提示与列表管理，防误操作与灵活管理兼得。
- **三个前端入口 + 菜单管理页反向入口**：列表页、视图设计器、页面设计器均有一键挂接；菜单管理页"关联页面"选择器反向支持，选页面自动回填 path/component/permission，闭环完整。

## What Went Wrong / Costs

- **挂接后"无页面访问权限"排查了两轮**：第一轮修了 PermissionEvaluator 的 admin 角色匹配（`admin` vs `ROLE_ADMIN`）与挂接自动授权，但未解决根本问题；第二轮才发现 `JwtAuthenticationFilter` 构造的 LoginUser **角色权限恒为空**（`Collections.emptyList()`/`emptySet()`），导致后端鉴权形同虚设。**教训：权限链路问题应从认证源头查起（JWT 过滤器 → LoginUser 构造），而非只看校验点。**
- **引入循环依赖**：初次尝试让 JwtAuthenticationFilter 注入 AuthService 形成 `filter → AuthServiceImpl → passwordEncoder → SecurityConfig → filter` 环，测试阶段才发现（ApplicationContext 加载失败）。**教训：涉及 SecurityConfig 的依赖注入需先审视 Bean 依赖图。**
- **前端多轮 UI 细节回归**：目录过滤条件（menuType 语义 0/1/2）、页签标题来源、父子菜单同 path（/form）匹配歧义、紧凑/正常尺寸区分、侧边栏按钮渲染——均由用户浏览器实测反馈驱动，说明**这类纯前端行为缺少自动化测试覆盖，回归成本高**。

## Misses / Follow-up

- **前端自动化测试缺失**：本项目前端无单测基建，页签标题/菜单渲染/组件复用等行为靠手动冒烟验证，已多轮出回归。建议后续引入组件测试（如 Vitest + Vue Test Utils）覆盖菜单渲染与路由切换。
- **手动浏览器冒烟（tasks 5.3）未执行完整场景**：挂接 2 个菜单→侧边栏两处出现→解除一条→权限账号切换，部分已由自动化覆盖，但端到端浏览器验证仍待运行时环境执行。
- **menuType=0 目录作为挂接父级**：设计器挂接弹窗的目录候选只列 menuType=0，若某些业务目录被建成 menuType=1 会不可选（当前系统内目录均为 0，暂无影响）。

## Key Numbers

- Commits: 16（3 docs/chore + 13 feat/fix）
- Backend tests: 650+, all green
- Frontend build: tsc + vite 通过
- Files changed: 后端 10 文件（新增 4）、前端 8 文件
- Features delivered: 多挂接菜单、OR 权限校验、三入口挂接 + 菜单管理页反向挂接、JWT 权限加载修复、侧边栏/页签/路由修复
