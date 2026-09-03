## 1. ListCards 查询能力

- [ ] 1.1 在 `frontend/src/components/business/__tests__/ListCards.test.ts` 增加查询栏显示、查询参数和查询后回到第一页的失败测试
- [ ] 1.2 在 `frontend/src/components/business/ListCards.vue` 增加 searchFields/showSearch/pageSizes 属性与查询栏渲染
- [ ] 1.3 在 `frontend/src/components/business/ListCards.vue` 实现查询、重置、页码和 page size 变化请求逻辑，并保持现有分页与卡片行为

## 2. PageDataCards 配置适配

- [ ] 2.1 在 `frontend/src/views/page/components/PageDataCards.vue` 增加查询字段、查询开关和 pageSizes 的配置透传，并在 designMode 下隐藏查询与分页
- [ ] 2.2 在 `frontend/src/views/page/components/PageDataCards.vue` 将非空查询值转换为 AND like filter 并传给数据源
- [ ] 2.3 为 PageDataCards 的查询和配置透传补充组件测试，验证 dataSourceApi 收到正确请求参数

## 3. 验证

- [ ] 3.1 运行 ListCards 与 PageDataCards 相关 Vitest 测试并修复回归
- [ ] 3.2 对修改文件执行 TypeScript/Vue 诊断并运行前端构建
