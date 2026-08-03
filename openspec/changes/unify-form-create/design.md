# Design: unify-form-create

## Context

项目前端已有两条表单轨道并行运行：

- **FormBuilder**（自定义，`@deprecated`）：7 个 CRUD 页面通过 SearchTable 使用，FormField[] 驱动，RenderField 子组件手写 h() 渲染
- **form-create**（开源 v3.3.1 + 设计器 v3.5.0）：FormDesigner 拖拽设计 → rule JSON → FormDefinition 持久化 → FormRenderer 渲染

基础设施已有 70%：设计器、持久化、版本管理、字段权限、渲染器全部就绪。差距在于 CRUD 页面未接入。

## Goals

1. CRUD 表单可通过 FcDesigner 拖拽设计
2. 少数复杂表单可自定义页面，风格统一
3. 定制组件（LookupPicker 等）同时用于 CRUD 表单、工作流表单和设计器

## Non-Goals

- 不改造 SearchTable 的 columns/searchFields/buttons 配置方式（仍前端写死）
- 不统一数据持久化（CRUD 数据仍走业务表，不走 FormData）
- 不引入 Pro 版设计器
- 不做低代码平台（不配置化列表列和搜索栏）

## Decisions

### D1: FormDefinition 增加 formKey

```java
// FormDefinition.java
@Column(name = "form_key")
private String formKey;  // 可选，CRUD 表单绑定时使用
```

- 流程表单：`formKey = null`，通过流程定义关联 FormDefinition
- CRUD 表单：`formKey = "user-crud"`，页面通过 formKey 加载已发布版本

**为什么不用现有 id/name？** id 是 UUID 不语义化，name 是显示名可能重复。formKey 是语义化唯一键，专门用于 CRUD 绑定。

### D2: SearchTable 接口改造

```typescript
// Before
interface FormConfig<T> {
  fields: FormField[]
  initialValues?: Partial<T>
  layout?: FormLayout
  labelWidth?: string
}

// After
interface FormConfig<T> {
  formKey: string                    // ← 替代 fields
  initialValues?: Partial<T>
  labelWidth?: string
}
```

SearchTable 内部：
```
弹窗打开 → FormRenderer 加载 formKey 对应 schema → 渲染表单
提交     → FormRenderer.getFormData() → 调用页面的 create/update API
```

**为什么不保留 fields 作为 fallback？** 双轨并存增加维护成本，一次性迁移更干净。

### D3: FormRenderer 支持双模式

```typescript
// 模式 1: 流程表单（现有）
<FormRenderer :form-def-id="xxx" />

// 模式 2: CRUD 表单（新增）
<FormRenderer :form-key="'user-crud'" />
```

内部逻辑：
- `formDefId` → 直接加载该 FormDefinition
- `formKey` → 查询 `formKey = xxx AND status = PUBLISHED` 的最新版本

### D4: LookupPicker 注册为 form-create 组件

```typescript
// main.ts
import formCreate from '@form-create/element-ui'
import LookupPicker from '@/components/business/LookupPicker.vue'

formCreate.component('LookupPicker', LookupPicker)
```

LookupPicker 改造点：
- 通过 `formCreateInject` 获取 form-create api
- `returnFields` 回填改用 `api.setValue(targetField, value)`（替代直接操作 localModel）
- modelValue 仍用标准 v-model

FcDesigner 注册：
```typescript
// FormDesigner.vue onMounted
designerRef.value?.addComponent({
  label: '字典选择器',
  name: 'LookupPicker',
  rule: { type: 'LookupPicker', field: '', title: '选择', props: {} }
})
```

### D5: FormPageLayout 统一外壳

```vue
<template>
  <div class="form-page-layout">
    <div class="form-page-header" v-if="title">
      <span>{{ title }}</span>
      <slot name="toolbar" />
    </div>
    <div class="form-page-body">
      <slot />
    </div>
    <div class="form-page-footer" v-if="$slots.footer">
      <slot name="footer" />
    </div>
  </div>
</template>
```

提供统一的 label-width、间距、按钮区样式。自定义页面套用此外壳。

### D6: onChange 迁移

MenuPage 的 `onChange: (val) => { currentMenuType.value = val }` 迁移方式：

```typescript
// rule JSON 中
{
  type: 'select',
  field: 'menuType',
  update(val, rule, api) {
    // 通过 control 声明式联动 或 直接设外部 ref
    currentMenuType.value = val
  }
}
```

因为适配层方案下 rule 在前端组装（不走 JSON 序列化），函数可直接写。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 7 个页面一次性迁移，回归测试量大 | 每个页面迁移后立即手动验证；先迁移简单页面（UserPage）验证流程，再批量 |
| LookupPicker 注册到 form-create 后，returnFields 回填行为变化 | 单元测试覆盖；重点验证 DictPage |
| FcDesigner 设计器里配置 LookupPicker 的 fetchApi/columns 等 props 不直观 | 在设计器注册时配置默认 props 模板；后续可考虑属性配置面板 |
| rule JSON 初始数据需要准备 7 份 | 可先用 FcDesigner 拖拽设计后导出，存为种子数据 |
| FormDefinition 表加列需要数据库迁移 | Flyway/ Liquibase 脚本，加 nullable 列 |

## Migration Plan

```
Phase 1: 基础设施
  ├── 后端: FormDefinition 加 formKey + 查询接口
  ├── 前端: FormRenderer 支持 formKey 模式
  ├── 前端: LookupPicker 注册为 form-create 组件
  └── 前端: FormPageLayout 组件

Phase 2: SearchTable 改造
  ├── SearchTable 内部 FormBuilder → FormRenderer
  └── FormConfig 接口从 fields → formKey

Phase 3: 7 个页面迁移
  ├── 准备 7 份 rule JSON 种子数据
  ├── 逐页迁移 formConfig
  └── 每页迁移后验证

Phase 4: 清理
  ├── 删除 FormBuilder.vue + RenderField
  ├── 删除 FormField 类型
  ├── 删除 FormBuilder 测试
  └── 删除 FormBuilder 的 barrel export

Rollback: 如果迁移出问题，git revert 到 Phase 1 之前。
  FormBuilder 代码仍在 main 分支历史中，可恢复。
```

## Open Questions

- rule JSON 种子数据放哪？建议 `frontend/src/views/*/forms/` 目录下，按页面组织
- FcDesigner 是否需要区分 CRUD 表单和流程表单的设计入口？建议初期不区分，统一一个设计器页面
