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
      <template #title>按权限对象勾选授权</template>
      <div class="text-xs leading-5">
        这里是数据权限的唯一授权入口：勾选只影响本角色，其他角色的授权不受影响。
        授权 = 赋予该角色看见对象圈定行的权利（看即能操作，不再分读/写）。
        数据源只要挂过权限对象就受控：本角色未被授权任何对象时，在这些数据源上一行都看不见。
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
      <el-table-column label="授权" width="80" align="center">
        <template #default="{ row }">
          <el-checkbox
            v-model="row.granted"
            :data-testid="`role-dp-granted-${row.permissionId}`"
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
    rows.value = (res.data ?? []).map((row) => ({ ...row, granted: !!row.granted }))
  } finally {
    loading.value = false
  }
}

async function submit(): Promise<void> {
  const roleId = props.role?.id
  if (!roleId) return
  const items: RoleDataPermissionSaveItem[] = rows.value
    .filter((row) => row.granted)
    .map((row) => ({ permissionId: row.permissionId }))
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
      granted: row.granted,
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
