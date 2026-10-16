import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * FormDesigner 业务表单发布 → 列映射对话框的「已发布列映射」保留性检查。
 *
 * 缺陷背景：handlePublish 打开 ColumnConfigDialog 前执行 columnConfig.value = []，
 * 清空了挂载时从表单定义加载的已发布列映射 → 对话框失去 existing-columns，
 * 已发布为 TEXT 的字段回退为组件默认 VARCHAR(255)，保存发布时被后端
 * isCrossTypeChange（TEXT→VARCHAR 跨类变更）拒绝 → 发布失败（如客户档案 address/remark）。
 *
 * （组件依赖 form-create/路由/api，直接挂载成本高，按项目惯例做源码级断言。）
 */
describe('FormDesigner 业务表单发布保留已发布列映射', () => {
  const source = () => readFileSync(resolve(__dirname, '../FormDesigner.vue'), 'utf8')

  it('列映射对话框绑定 existing-columns=columnConfig', () => {
    expect(source()).toContain(':existing-columns="columnConfig"')
  })

  it('handlePublish 打开对话框前不得清空 columnConfig', () => {
    const src = source()
    // 全源码仅允许挂载解析失败 catch 里的兜底清空（紧随 JSON.parse 的 catch），
    // 发布路径（handlePublish → columnDialogVisible.value = true）不得再出现清空
    const occurrences = src.split('columnConfig.value = []').length - 1
    const catchFallback = src.includes('columnConfig.value = JSON.parse(formDef.columnConfig)')
    expect(occurrences).toBe(catchFallback ? 1 : 0)
    expect(src).not.toMatch(/columnConfig\.value = \[\]\s*columnDialogVisible\.value = true/)
    expect(src).toMatch(/columnDialogVisible\.value = true/)
  })

  it('挂载时从表单定义加载 columnConfig（existing-columns 数据来源）', () => {
    const src = source()
    expect(src).toContain('columnConfig.value = JSON.parse(formDef.columnConfig)')
  })
})
