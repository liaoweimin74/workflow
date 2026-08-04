## Design Summary

将项目中的两条独立表单轨道（自定义 FormBuilder + form-create FormRenderer）统一为一条基于 form-create 的轨道。CRUD 表单通过 FcDesigner 拖拽设计，schema 只管渲染、数据仍走业务表；少数复杂表单开发人员自定义页面但套用统一外壳；定制的 form-create 组件（如 LookupPicker）同时用于普通表单和工作流表单。

### 现状

```
轨道 A: 自定义 FormBuilder (已标 @deprecated)
  7 个页面 → SearchTable → FormBuilder → FormField[] (前端写死 TS 对象)
  字段类型: input/input-number/select/tree-select/switch/date-picker/radio/checkbox/textarea/slot/lookup
  特殊: onChange 回调(1处, 无回滚), LookupPicker(1处, DictPage)

轨道 B: form-create (已运行)
  FormDesigner (FcDesigner 拖拽) → rule JSON → 后端 FormDefinition 持久化
  FormRenderer ← rule JSON → form-create 渲染
  字段权限: EDIT/VIEW/HIDDEN
  版本快照: DRAFT/PUBLISHED + publishedVersion
```

两条轨道零交集，schema 格式不同，服务不同场景。

## Alternatives Considered

### 方案 A: 适配层（低风险）

- **做法**：SearchTable 内部写 `formFieldToRule()` 转换器，FormField[] → Rule[]，外部接口不变
- **优点**：7 个页面零改动，可渐进迁移
- **缺点**：维护转换层，两套 schema 概念仍然并存，没有真正统一
- **为何未采用**：用户目标是让 CRUD 表单也能拖拽设计，适配层只是换了渲染引擎，没有实现拖拽设计能力

### 方案 B: 直接替换（中等风险）

- **做法**：7 个页面的 formConfig 改为 form-create Rule[] 格式，前端写 Rule JSON
- **优点**：一步到位用 form-create，无转换层
- **缺点**：7 个页面都要手写 Rule JSON，工作量大且容易出错；仍然不能拖拽设计
- **为何未采用**：手写 Rule JSON 和手写 FormField[] 本质一样，没有实现拖拽设计的目标

### 方案 C: 统一架构 — 拖拽设计 + schema 驱动 + 自定义组件复用（采用）

- **做法**：
  - CRUD 表单也走 FcDesigner 拖拽设计 → rule JSON → FormDefinition 持久化
  - SearchTable 内部用 FormRenderer 替代 FormBuilder，通过 formKey 加载 schema
  - schema 只管渲染，数据仍走各页面的业务 Controller
  - 自定义组件（LookupPicker 等）注册到 form-create 全局 + FcDesigner 设计器
  - 复杂表单用 FormPageLayout 统一外壳，内部自定义
- **优点**：真正统一两条轨道，CRUD 表单也能拖拽设计，定制组件两边复用
- **缺点**：需要建立 CRUD 表单与 FormDefinition 的绑定机制，改造 SearchTable，迁移 7 个页面
- **采用理由**：完全满足用户的三个目标，且项目已有 70% 基础设施

## Agreed Approach

采用方案 C（统一架构）。核心改动：

1. **FormDefinition 增加 formKey**：用于 CRUD 页面绑定表单定义（如 `user-crud`、`menu-crud`）
2. **SearchTable 改造**：接收 formKey，内部用 FormRenderer 替代 FormBuilder；保留 columns/searchFields/buttons 前端配置
3. **自定义组件注册**：LookupPicker 注册为 form-create 组件 + FcDesigner 拖拽面板入口
4. **7 个页面迁移**：每个页面的 formConfig.fields 从 FormField[] 改为 formKey 引用
5. **FormPageLayout 封装**：统一外壳供自定义页面使用
6. **删除 FormBuilder**：迁移完成后删除 FormBuilder.vue + RenderField + 相关测试

## Key Decisions

| 决策 | 选择 | 理由 |
|---|---|---|
| CRUD 表单数据存哪 | schema 只管渲染，数据走业务表 | CRUD 页面有自己的业务逻辑和后端接口，不适合统一存 FormData |
| SearchTable 怎么集成 | 内部用 FormRenderer 替代 FormBuilder | 最小改动，columns/searchFields/buttons 仍前端配置 |
| 迁移节奏 | 一次性迁移所有 7 个页面 | 用户明确要求 |
| LookupPicker | 编写为 form-create 自定义组件 | 同时用于普通表单和工作流表单 |
| onChange 回调 | 迁移到 form-create update 回调 | 7 个页面中仅 MenuPage 1 处使用，无回滚，直接映射 |

## Open Questions

- 7 个 CRUD 页面的 rule JSON 初始数据如何生成？手写还是用 FcDesigner 设计后导出？
- FormDefinition 的 formKey 命名规范？建议 `{模块}-crud`（如 `user-crud`、`menu-crud`）。
- FcDesigner 设计器页面是否需要区分"CRUD 表单"和"流程表单"？还是统一一个入口？
