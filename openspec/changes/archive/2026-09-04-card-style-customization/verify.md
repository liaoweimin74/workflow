# Verification

## Checklist

### 单元测试（vitest）
- [ ] `resolveFieldStyle` 合并优先级：条件命中 > 字段级 > 基础级 > 默认
- [ ] `resolveFieldStyle` 多条条件规则首个命中 break
- [ ] `resolveFieldStyle` 无命中保持基础样式
- [ ] `normalizeColumnStyle` 旧字段收敛（fontFamily/fontSize/fontWeight/fontColor/className/style 字符串/styleExpr → style）
- [ ] `normalizeColumnStyle` 幂等；已有结构化 `style.color` 不被 `fontColor` 覆盖
- [ ] `CARD_THEMES` 含 5 个主题（default/compact/loose/dark/borderless），字段完整
- [ ] theme+style 合并：style 优先
- [ ] 卡片级 `dynamic` 按行求值生效

### 组件测试
- [ ] `ListCards`：theme 生效、style 覆写、`span:6` 半行 / `span:12` 整行、字段级与卡片级条件样式、`regions.header` 图标、slot/render 逃生舱保留
- [ ] `buildCellRender`：统一 `FieldStyle` 渲染、旧 `styleExpr` 兼容、`cellClassName` td 级生效
- [ ] `ColumnAdvancedConfig`：可视化控件保存为结构化 `style`、`className`/`css` 逃生舱保留、旧字段回填兼容
- [ ] 条件样式规则编辑器：新增规则生成正确 `when`、排序决定命中优先级、回填

### 配置保留
- [ ] PAGE 表格列配置弹窗加载/保存保留 `style`（含 `dynamic`）与 `contentType/contentValue/onCellClick/custom/hidden`
- [ ] `styleExpr` 旧配置读取兼容并迁移为 `dynamic`

### 类型与编译
- [ ] 前端 `vue-tsc` 无错误
- [ ] 后端编译通过（`ViewCompiler.java` 透传 `style`/`dynamic`）

### 手工验证
- [ ] 视图设计器中表格↔卡片切换，字段样式一致无跳变
- [ ] 条件样式按行生效（状态色切换）
- [ ] 5 个内置主题切换正常
- [ ] 旧 schema（含 `styleExpr`/`fontColor`）加载不丢样式

### 回归
- [ ] 前端全量测试通过，无既有用例破坏
- [ ] 后端编译通过

## Commands

```bash
# 前端测试
cd frontend && npm test

# 类型检查
cd frontend && npx vue-tsc --noEmit

# 后端编译
# （按项目构建命令执行）
```

## Notes

- 所有验收项通过后，合并 worktree 回 main，再归档本变更。
- 若出现回归，优先定位样式解析入口（`resolveFieldStyle`/`normalizeColumnStyle`）是否为公共路径。
