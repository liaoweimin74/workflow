<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="880px"
    top="6vh"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-alert type="info" :closable="false" show-icon class="mb-3">
      <template #title>按权限对象勾选读 / 写</template>
      <div class="text-xs leading-5">
        这里是数据权限的唯一授权入口：勾选只影响本角色，其他角色的授权不受影响。
        读轴约束列表、聚合与单条读取；写轴约束修改、删除。两个轴都不勾选表示该对象不约束此角色。
      </div>
    </el-alert>

    <el-table :data="rows" v-loading="loading" size="small" empty-text="尚未创建权限对象，请先到「数据权限」页配置">
      <el-table-column label="权限对象" min-width="190">
        <template #default="{ row }">
          <div class="font-medium">{{ row.permissionName }}</div>
          <div v-if="row.remark" class="text-xs text-gray-400">{{ row.remark }}</div>
        </template>
      </el-table-column>
      <el-table-column label="条件（组内 AND）" min-width="280">
        <template #default="{ row }">
          <span class="text-xs">{{ conditionSummary(row.conditions) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="数据源" width="90" align="center">
        <template #default="{ row }">{{ row.dataSourceIds.length }} 个</template>
      </el-table-column>
      <el-table-column label="读" width="70" align="center">
        <template #default="{ row }">
          <el-checkbox
            v-model="row.read"
            :data-testid="`role-dp-read-${row.permissionId}`"
          />
        </template>
      </el-table-column>
      <el-table-column label="写" width="70" align="center">
        <template #default="{ row }">
          <el-checkbox
            v-model="row.write"
            :data-testid="`role-dp-write-${row.permissionId}`"
          />
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" data-testid="role-dp-save" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
defineOptions({ name: 'RoleDataPermissionDialog' })

import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getRoleDataPermissions,
  saveRoleDataPermissions,
  type RoleDataPermission,
  type RoleDataPermissionSaveItem,
} from '@/api/role'
import type { DataScopeAction } from '@/api/dataScope'
import type { RoleVO } from '@/types/role'
import { conditionSummary } from '../row-permission/conditionModel'

const props = defineProps<{ modelValue: boolean; role: RoleVO | null }>()
const emit = defineEmits<{
  'update:modelValue': [boolean]
  saved: []
}>()

const rows = ref<RoleDataPermission[]>([])
const loading = ref(false)
const saving = ref(false)

const title = computed(() =>
  props.role
    ? `数据权限 — ${props.role.roleName}（${props.role.roleCode}）`
    : '数据权限',
)

async function load(): Promise<void> {
  const roleId = props.role?.id
  if (!roleId) return
  loading.value = true
  try {
    const res = await getRoleDataPermissions(roleId)
    rows.value = (res.data ?? []).map((row) => ({ ...row, read: !!row.read, write: !!row.write }))
  } finally {
    loading.value = false
  }
}

async function submit(): Promise<void> {
  const roleId = props.role?.id
  if (!roleId) return
  const items: RoleDataPermissionSaveItem[] = rows.value
    .filter((row) => row.read || row.write)
    .map((row) => {
      const actions: DataScopeAction[] = []
      if (row.read) actions.push('READ')
      if (row.write) actions.push('WRITE')
      return { permissionId: row.permissionId, actions }
    })
  saving.value = true
  try {
    await saveRoleDataPermissions(roleId, items)
    ElMessage.success('数据权限已保存')
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}

function getState() {
  return {
    visible: props.modelValue,
    roleId: props.role?.id ?? null,
    rows: rows.value.map((row) => ({
      permissionId: row.permissionId,
      permissionName: row.permissionName,
      read: row.read,
      write: row.write,
    })),
  }
}

defineExpose({ submit, getState })

watch(
  () => [props.modelValue, props.role?.id] as const,
  ([open]) => {
    if (open) void load()
  },
  { immediate: true },
)
</script>
