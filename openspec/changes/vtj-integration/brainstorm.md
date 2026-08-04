# Brainstorm: VTJ.PRO 替换 form-create

## Design Summary

用 VTJ.PRO 替换项目中的 form-create（@form-create/element-ui + @form-create/designer），作为全页面可视化搭建引擎。VTJ.PRO 是基于 Vue3 + TypeScript + Vite 的低代码引擎，MIT 协议开源，支持设计器-渲染器分离架构。

两种使用模式并存：
1. **在线设计器（流程表单）**：用户在管理后台在线设计审批表单，VTJ 设计器嵌入前端应用，产出 DSL JSON 存后端 FormDefinition.schema 字段，运行时用 @vtj/renderer 渲染 DSL。
2. **设计时出码（CRUD 页面）**：开发者用 VTJ 设计器搭建 CRUD 页面（搜索+表格+弹窗表单），出码导出 Vue SFC 编译进产物，运行时不需要 renderer。

表单组件使用 VTJ 自带的 XForm + XField，原生支持 disabled/readonly/visible 属性，完美对应字段权限 EDIT/VIEW/HIDDEN。自定义业务组件（如 LookupPicker）通过 XField 的 editor prop（传组件对象）或 #editor 插槽接入。

## Alternatives Considered

### 方案 A：一步到位
- **做法**：一次性移除 form-create 全部依赖，同时引入 VTJ 设计器和渲染器。开发期间系统不可用，完成后整体上线。
- **优点**：干净利落，不留过渡态技术债。
- **缺点**：开发周期长（估计 3-4 周），期间无法部署，风险集中。
- **为何未采纳**：用户选择此方案。✅ 已采纳。

### 方案 B：并行过渡
- **做法**：form-create 和 VTJ 并存，分阶段迁移。先引入 VTJ 做流程表单设计器，CRUD 页面保持 form-create 不动，最后再迁移 CRUD 页面并移除 form-create。
- **优点**：每阶段可独立部署验证，风险分散。
- **缺点**：过渡期两套表单体系并存，代码复杂度高，维护成本大。
- **为何未采纳**：用户偏好一步到位，避免过渡态技术债。

### 方案 C：分步替换
- **做法**：按依赖关系分三步——先流程表单设计器/渲染器，再 CRUD 页面出码重建，最后移除 form-create 依赖。每步可部署。
- **优点**：每步可部署可验证，风险可控，第一步完成后核心能力就上线。
- **缺点**：第一步后仍有 form-create 依赖残留，到第三步才彻底清除。
- **为何未采纳**：用户选择方案 A，一步到位更干净。

## Agreed Approach

**方案 A：一步到位。** 用户明确选择一次性替换，不留过渡态。

替换范围：
- 移除 @form-create/element-ui 和 @form-create/designer
- 引入 @vtj/pro、@vtj/web、@vtj/renderer、@vtj/cli、@vtj/ui、@vtj/utils、@vtj/icons
- 流程表单设计器（FormDesigner.vue）用 VTJ 设计器替换
- 流程表单渲染器（FormRenderer.vue）用 @vtj/renderer 替换
- CRUD 页面（User/Role/Org/Menu/Dict）用 VTJ 设计器重建，出码 SFC
- 后端 FormDefinition.schema 从 form-create rule JSON 改为 VTJ DSL JSON
- 字段权限通过 XField 原生 props（disabled/visible）实现
- 自定义组件（LookupPicker）通过 XField editor prop 或插槽接入

## Key Decisions

| 决策点 | 选择 | 理由 |
|---|---|---|
| VTJ 集成方式 | 方式 A — 现有项目集成 | 设计器和业务代码同项目，物料共享方便 |
| 替换范围 | 全部替换 | 一步到位，彻底移除 form-create |
| 运行时渲染 | VTJ renderer 直接渲染 DSL | 不需要出码，DSL 即 schema |
| 设计器接入模式 | 混合：流程在线 + CRUD 设计时 | 流程表单需用户在线设计，CRUD 页面开发者搭建后出码 |
| 后端存储 | 复用 FormDefinition 表 | schema 字段从 rule JSON 改为 DSL JSON，表结构不变 |
| 字段权限 | XField 原生 props（disabled/visible） | 不需要预处理 DSL 树，renderer 原生支持 props 求值 |
| 表单组件 | XForm + XField | VTJ 原生物料，零物料开发成本，原生支持权限控制 |
| 自定义组件接入 | XField editor prop / #editor 插槽 | 两种方式都支持，灵活选择 |
| 数据迁移 | 无需迁移 | 系统无已上线流程表单数据 |
| VTJ Access | 不用于字段权限 | VTJ Access 是路由/操作级权限，与字段权限无关 |

## Open Questions

- VTJ 设计器嵌入现有项目的具体 vite.config.ts 改造细节（需在实现时验证）
- VTJ DSL 节点树遍历提取字段列表的具体实现（用于 FormPropertyTab 字段权限配置 UI）
- LookupPicker 作为 XField editor 的物料注册方式（需验证 editor 传组件对象的 DSL 序列化）
