<script setup lang="ts">
defineOptions({ name: 'MessageEventDefinitionList' })

import { ref } from 'vue'
import { SearchTable } from '@/components/business'
import { Switch } from '@element-plus/icons-vue'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { ElMessage } from 'element-plus'
import {
  getEventDefinitions,
  createEventDefinition,
  updateEventDefinition,
  deleteEventDefinition,
  toggleEventDefinition,
} from '../../api/event'

const tableRef = ref()

const searchFields: SearchField[] = [
  { type: 'input', label: '事件代码/名称', prop: 'keyword', placeholder: '输入代码或名称' },
  { type: 'input', label: '业务领域', prop: 'businessDomain', placeholder: '业务领域' },
]

const columns: TableColumn[] = [
  { prop: 'eventCode', label: '事件代码', minWidth: 180 },
  { prop: 'eventName', label: '事件名称', minWidth: 160 },
  { prop: 'businessDomain', label: '业务领域', width: 130 },
  { prop: 'templateCount', label: '模板数', width: 90 },
  { prop: 'ruleCount', label: '规则数', width: 90 },
  { prop: 'enabled', label: '状态', width: 90, render: (row: any) => (row.enabled ? '启用' : '已停用') },
  { prop: 'createdAt', label: '创建时间', width: 180 },
]

async function fetchApi(params: any) {
  const res = await getEventDefinitions({
    page: params.page || 1,
    size: params.size || 10,
    keyword: params.keyword || undefined,
    enabled: params.enabled,
  })
  const data = res.data as any
  return { rows: data?.rows || [], total: data?.total || 0 }
}

const formConfig: FormConfig = {
  rule: [
    {
      type: 'input', field: 'eventCode', title: '事件代码',
      props: { placeholder: '大写字母、数字、下划线' },
      validate: [{ required: true, message: '请输入事件代码', trigger: 'blur' }],
    },
    {
      type: 'input', field: 'eventName', title: '事件名称',
      validate: [{ required: true, message: '请输入事件名称', trigger: 'blur' }],
    },
    { type: 'input', field: 'businessDomain', title: '业务领域', props: { placeholder: '如：流程、审批、任务' } },
    { type: 'input', field: 'description', title: '事件说明', props: { type: 'textarea', rows: 3 } },
  ] as Rule[],
  createApi: (data: any) => createEventDefinition(data) as any,
  updateApi: (id: number | string, data: any) => updateEventDefinition(id as number, data) as any,
  deleteApi: async (id: number | string) => {
    await deleteEventDefinition(id as number)
    ElMessage.success('事件已删除')
  },
  dialogTitle: { create: '新建事件', edit: '编辑事件' },
}

const actionButtons: ActionButton[] = [
  {
    label: '启停', icon: Switch, size: 'small', link: true,
    onClick: async (row: any) => {
      await toggleEventDefinition(row.id)
      ElMessage.success(row.enabled ? '事件已停用' : '事件已启用')
      tableRef.value?.fetchList()
    },
  },
]
</script>

<template>
  <SearchTable
    ref="tableRef"
    :search-fields="searchFields"
    :columns="columns"
    :action-buttons="actionButtons"
    :fetch-api="fetchApi"
    :form-config="formConfig"
  />
</template>
