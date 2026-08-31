import { reactive } from 'vue'

/** 组件级静态筛选配置（PageDesigner 数据表格 DsBindingConfigDialog 写入；key = dataSourceId） */
export const tableFilterStore = reactive<Record<string, any>>({})
