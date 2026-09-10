# 卡片列表样式自定义设计文档

> 日期：2026-09-03
> 状态：设计完成，待实现

## 概述

为 `ListCards` 组件添加样式自定义能力，支持内置主题预设 + 个别属性微调的使用模式。面向开发人员，通过 TypeScript 类型安全的 Props 配置。

## 需求

- **用户**：开发人员
- **自定义范围**：颜色、尺寸、布局、字体（全部）
- **使用方式**：内置模板 + 微调
- **布局灵活性**：字段支持栅格布局（整行、半行、三分之一等）
- **区域配置**：支持卡片头部图标、操作栏样式等

## 方案选型

### 选定方案：Style Object

```vue
<ListCards theme="compact" :style="{ borderRadius: 16 }" />
```

### 选型理由

1. TypeScript 类型完整提示，IDE 自动补全
2. 配置直观，不需要记 CSS 变量名
3. 内置模板只需定义对象，易于维护

## 类型定义

### CardStyle

```typescript
/** 卡片样式配置 */
interface CardStyle {
  // 颜色相关
  backgroundColor?: string
  borderColor?: string
  hoverShadowColor?: string
  
  // 尺寸相关
  borderRadius?: number | string
  padding?: number | string
  gap?: number | string
  
  // 字体相关
  titleFontSize?: number | string
  titleFontWeight?: number | string
  titleColor?: string
  fieldFontSize?: number | string
  fieldLabelColor?: string
  fieldValueColor?: string
  
  // 字段布局
  fields?: {
    layout?: 'grid' | 'list'
    columns?: number
    gap?: number | string
    labelPosition?: 'left' | 'right' | 'top'
    labelWidth?: number | string
    showLabel?: boolean
  }
  
  // 区域布局
  regions?: {
    header?: {
      show?: boolean
      icon?: string | { name: string; color?: string; size?: number }
      iconPosition?: 'left' | 'right'
      height?: number | string
    }
    actions?: {
      position?: 'top' | 'bottom' | 'right'
      gap?: number | string
      justify?: 'start' | 'center' | 'end'
      buttonStyle?: {
        size?: 'small' | 'default' | 'large'
        type?: 'button' | 'text' | 'icon'
        gap?: number | string
      }
    }
    tags?: {
      gap?: number | string
      size?: 'small' | 'default'
    }
  }
}
```

### CardTheme

```typescript
type CardTheme = 'default' | 'compact' | 'loose' | 'dark' | 'borderless'
```

### CardColumn 扩展

```typescript
interface CardColumn {
  prop: string
  label: string
  
  // 新增：栅格配置
  span?: number
  order?: number
  
  // 新增：图标配置
  icon?: string | { name: string; color?: string; size?: number }
  prefixIcon?: string
  suffixIcon?: string
  
  // 新增：自定义渲染（覆盖默认渲染）
  render?: (row: any, column: CardColumn) => VNode
  
  // 已有：字段级样式
  fontFamily?: string
  fontSize?: number
  fontWeight?: number | string
  fontColor?: string
  style?: string
  align?: 'left' | 'center' | 'right'
}
```

## 内置主题

```typescript
const CARD_THEMES: Record<CardTheme, CardStyle> = {
  default: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    gap: 16,
    fields: { layout: 'grid', columns: 12, labelPosition: 'left' },
  },
  compact: {
    backgroundColor: '#fff',
    borderRadius: 4,
    padding: 12,
    gap: 8,
    fields: { layout: 'grid', columns: 12, labelPosition: 'left', gap: 4 },
  },
  loose: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    gap: 20,
    fields: { layout: 'grid', columns: 12, labelPosition: 'top', gap: 12 },
  },
  dark: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    gap: 16,
    titleColor: '#fff',
    fieldValueColor: '#e0e0e0',
    fieldLabelColor: '#999',
  },
  borderless: {
    backgroundColor: '#fff',
    borderRadius: 0,
    borderColor: 'transparent',
    padding: 16,
    gap: 16,
  },
}
```

## Props 接口

```typescript
interface ListCardsProps {
  // ... 现有 props
  
  // 新增
  theme?: CardTheme
  style?: CardStyle
  cardClass?: string | Record<string, boolean>
}
```

## 使用示例

### Level 1：只选主题（80% 场景）

```vue
<ListCards theme="compact" />
```

### Level 2：主题 + 微调（15% 场景）

```vue
<ListCards 
  theme="default" 
  :style="{ borderRadius: 16, padding: 20 }" 
/>
```

### Level 3：字段布局（4% 场景）

```vue
<ListCards 
  theme="default"
  :style="{
    fields: { layout: 'grid', columns: 12, labelPosition: 'top' }
  }"
  :columns="[
    { prop: 'title', label: '标题', span: 12 },
    { prop: 'name', label: '名称', span: 6 },
    { prop: 'age', label: '年龄', span: 6 },
  ]"
/>
```

### Level 4：完全自定义（1% 场景）

```vue
<ListCards 
  :style="{
    backgroundColor: '#f5f7fa',
    borderRadius: 12,
    fields: { layout: 'grid', columns: 12 },
    regions: {
      header: { show: true, icon: 'Document' },
      actions: { position: 'bottom', gap: 12 }
    }
  }"
  :columns="[...]"
/>
```

## 文件结构

```
frontend/src/components/business/
├── ListCards.vue                    # 主组件
├── ListCards.types.ts              # 类型定义
├── ListCards.themes.ts             # 内置主题
└── ListCards.styles.ts             # 样式工具函数
```

### 文件职责

| 文件 | 内容 | 职责 |
|------|------|------|
| `ListCards.types.ts` | `CardStyle`, `CardTheme`, `CardColumn` 等 | 类型定义，IDE 提示 |
| `ListCards.themes.ts` | `CARD_THEMES` 对象 | 内置主题模板，易于扩展 |
| `ListCards.styles.ts` | `mergeStyles()`, `resolveTheme()` 等 | 样式合并逻辑 |
| `ListCards.vue` | 主组件 | 渲染逻辑，引用上述文件 |

## 样式合并逻辑

### 优先级

```
CardColumn.style (字段级) > CardStyle (卡片级) > CARD_THEMES (主题) > 默认值
```

### 合并函数

```typescript
function resolveCardStyle(theme?: CardTheme, style?: CardStyle): CardStyle {
  const baseStyle = theme ? CARD_THEMES[theme] : CARD_THEMES.default
  return deepMerge(baseStyle, style)
}
```

### CSS 变量生成

```typescript
function toCssVariables(style: CardStyle): Record<string, string> {
  return {
    '--card-bg': style.backgroundColor ?? '#fff',
    '--card-radius': `${style.borderRadius ?? 8}px`,
    '--card-padding': `${style.padding ?? 16}px`,
    '--card-gap': `${style.gap ?? 16}px`,
  }
}
```

## 兼容性

### 与现有字段样式的关系

| 层级 | 作用范围 | 优先级 |
|------|---------|--------|
| `CardStyle` | 卡片整体（背景、圆角、间距） | 基础层 |
| `CardColumn.style` | 单个字段（字体、颜色） | 覆盖层 |

字段样式优先级更高，可以覆盖主题样式。两者互补，不冲突。

## 测试策略

1. **类型测试**：TypeScript 编译通过
2. **单元测试**：主题合并逻辑、CSS 变量生成
3. **集成测试**：组件渲染，样式正确应用
4. **视觉测试**：各主题下的视觉效果

## 后续扩展

1. **自定义主题注册**：允许用户注册自己的主题
2. **主题切换 API**：运行时动态切换主题
3. **CSS 变量导出**：支持外部样式表覆盖
