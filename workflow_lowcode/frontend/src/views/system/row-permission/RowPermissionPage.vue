<template>
  <div class="p-4" data-testid="row-permission-page">
    <div class="flex items-start justify-between mb-3">
      <div>
        <h2 class="text-lg font-semibold">数据权限</h2>
        <p class="text-xs text-gray-500 mt-1">
          权限对象 = 条件 + 关联数据源。多个对象同时命中时取并集（对象间 OR、对象内 AND）；
          未关联任何对象的数据源不受本页约束。授权（哪个角色、读还是写）只在「角色管理 → 数据权限」里配置。
        </p>
      </div>
      <div class="flex gap-2">
        <el-button :loading="loading" @click="refresh">刷新</el-button>
        <el-button type="primary" data-testid="rp-create" @click="openCreate">新建权限对象</el-button>
      </div>
    </div>

    <el-tabs v-model="tab" @tab-change="onTabChange">
      <el-tab-pane label="权限对象" name="objects">
        <el-table :data="objects" v-loading="loading" size="small" empty-text="尚未配置权限对象">
          <el-table-column label="名称" min-width="150">
            <template #default="{ row }">
              <div class="font-medium">{{ row.name }}</div>
              <div v-if="row.remark" class="text-xs text-gray-400">{{ row.remark }}</div>
            </template>
          </el-table-column>
          <el-table-column label="条件（组内 AND）" min-width="280">
            <template #default="{ row }">
              <span class="text-xs">{{ conditionSummary(row.conditions) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="关联数据源" min-width="200">
            <template #default="{ row }">
              <div class="flex flex-wrap gap-1">
                <el-tag v-for="id in row.dataSourceIds" :key="id" size="small" type="info">{{ sourceName(id) }}</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="已授权角色（只读）" min-width="280">
            <template #default="{ row }">
              <div v-if="row.grants.length" class="flex flex-wrap gap-1">
                <el-tag
                  v-for="(grant, index) in row.grants"
                  :key="index"
                  size="small"
                  :type="grant.action === 'READ' ? 'primary' : 'warning'"
                  data-testid="rp-grant-tag"
                >
                  {{ roleName(grant.subjectKey) }} · {{ grant.action === 'READ' ? '读' : '写' }}
                </el-tag>
              </div>
              <span v-else class="text-xs text-gray-400">未授权给任何角色（不收紧任何人）</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="right" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" data-testid="rp-edit" @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" size="small" data-testid="rp-delete" @click="removeObject(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="覆盖度盘点" name="coverage" lazy>
        <RowScopeCoveragePanel :key="coverageVersion" :data-source-names="dataSourceNames" />
      </el-tab-pane>
    </el-tabs>

    <RowPermissionEditor
      v-model="editorVisible"
      :permission="editing"
      :data-sources="scopeDataSources"
      @saved="afterSaved"
    />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'RowPermissionPage' })

import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import { getRoleList } from '@/api/role'
import { rowPermissionApi, type RowPermissionDTO } from '@/api/rowPermission'
import { conditionSummary } from './conditionModel'
import RowPermissionEditor from './RowPermissionEditor.vue'
import RowScopeCoveragePanel from './RowScopeCoveragePanel.vue'

const tab = ref('objects')
const loading = ref(false)
const objects = ref<RowPermissionDTO[]>([])
const dataSources = ref<DataSourceDTO[]>([])

const editorVisible = ref(false)
const editing = ref<RowPermissionDTO | null>(null)

/** 覆盖度面板挂载时自己取数；切回该 Tab 或对象变更后用新 key 强制重查 */
const coverageVersion = ref(0)

/** 只有这两类数据源的取数实现消费筛选条件，其余类型连后端都会拒绝关联 */
const scopeDataSources = computed(() => dataSources.value.filter((source) => source.type === 'FORM' || source.type === 'SQL'))

const dataSourceNames = computed<Record<string, string>>(() => {
  const names: Record<string, string> = {}
  for (const source of dataSources.value) names[source.id] = source.name
  return names
})

function sourceName(id: string): string {
  return dataSourceNames.value[id] ?? id
}

/** 授权展示用：roleCode → 角色名；查不到就退化成显示 roleCode，不影响配置 */
const roleNames = ref<Record<string, string>>({})

function roleName(code: string): string {
  return roleNames.value[code] ?? code
}

async function loadRoleNames(): Promise<void> {
  try {
    const res = await getRoleList({ page: 1, size: 500 })
    const names: Record<string, string> = {}
    for (const role of res.data.rows ?? []) names[role.roleCode] = role.roleName
    roleNames.value = names
  } catch {
    roleNames.value = {}
  }
}

async function loadDataSources(): Promise<void> {
  try {
    const res = await dataSourceApi.getEnabledDataSources()
    dataSources.value = res.data ?? []
  } catch {
    dataSources.value = []
  }
}

async function loadObjects(): Promise<void> {
  loading.value = true
  try {
    const res = await rowPermissionApi.list()
    objects.value = res.data ?? []
  } finally {
    loading.value = false
  }
}

async function refresh(): Promise<void> {
  coverageVersion.value++
  await Promise.all([loadDataSources(), loadObjects(), loadRoleNames()])
}

function onTabChange(name: string | number): void {
  if (name === 'coverage') coverageVersion.value++
}

function openCreate(): void {
  editing.value = null
  editorVisible.value = true
}

function openEdit(row: RowPermissionDTO): void {
  editing.value = row
  editorVisible.value = true
}

async function afterSaved(): Promise<void> {
  await Promise.all([loadDataSources(), loadObjects()])
  coverageVersion.value++
}

async function removeObject(row: RowPermissionDTO): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除「${row.name}」会同时移除它的条件、数据源关联与角色授权；相关角色可能因此不再受限。确定删除？`,
      '删除权限对象',
      { type: 'warning' },
    )
  } catch {
    return
  }
  await rowPermissionApi.remove(row.id)
  ElMessage.success('已删除')
  await Promise.all([loadObjects()])
  coverageVersion.value++
}

onMounted(refresh)
</script>
