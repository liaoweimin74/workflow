<script setup lang="ts">
defineOptions({ name: 'ClientIdentityDrawer' })

/**
 * A4 端身份抽屉（J5b，spec client-login-identity「A4 端身份 Tab」）：
 * 按端列 openid 绑定与推送设备（平台/掩码 token/吊销状态/最近登录），
 * 操作 = 解绑（管理员定向）/ 吊销设备 / 生成绑定码（复用 J3 /auth/bind-code/issue）。
 *
 * ⚠️ 掩码由服务端输出（前4+****+后4），前端原样展示、不做二次处理。
 * ⚠️ 绑定码是一次性凭证：签发后仅本抽屉内全文回显一次，重开即清。
 * ⚠️ 按钮权限码 V76 seed：system:user:identity（入口）/unbind/revoke/bindcode。
 * ⚠️ H5 登录记录表不在 J 系列（P2 记账），此处只渲染 openid/设备两数据源。
 */

import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  adminUnbindClient,
  issueBindCode,
  listClientIdentities,
  revokeDevice,
} from '@/api/clientIdentity'
import type { ClientIdentityVO } from '@/types/clientIdentity'
import type { UserVO } from '@/types/user'

const props = defineProps<{ modelValue: boolean; user: UserVO | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)
const identities = ref<ClientIdentityVO[]>([])
/** clientId → 最近一次签发的绑定码全文（一次性展示）。 */
const bindCodeByClient = ref<Record<number, string>>({})

async function load(): Promise<void> {
  if (!props.user) return
  loading.value = true
  try {
    const res = await listClientIdentities(props.user.id)
    identities.value = res.data
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.user?.id] as const,
  ([open]) => {
    if (open && props.user) {
      bindCodeByClient.value = {}
      void load()
    }
  },
  { immediate: true },
)

async function onUnbind(row: ClientIdentityVO): Promise<void> {
  if (!props.user) return
  try {
    await ElMessageBox.confirm(
      `确定解绑「${props.user.username}」在「${row.clientName}」的端身份（${row.openidMasked}）吗？解绑后该端需重新绑定。`,
      '确认解绑',
      { type: 'warning' },
    )
  } catch {
    return // cancelled
  }
  await adminUnbindClient(props.user.id, row.clientId)
  ElMessage.success('已解绑')
  await load()
}

async function onRevoke(row: ClientIdentityVO, deviceId: number): Promise<void> {
  if (!props.user) return
  try {
    await ElMessageBox.confirm('确定吊销该推送设备吗？吊销后该设备不再收到推送。', '确认吊销', { type: 'warning' })
  } catch {
    return // cancelled
  }
  await revokeDevice(props.user.id, deviceId)
  ElMessage.success('已吊销')
  await load()
}

async function onBindCode(row: ClientIdentityVO): Promise<void> {
  if (!props.user) return
  const res = await issueBindCode({ userId: props.user.id, clientId: row.clientId })
  bindCodeByClient.value = { ...bindCodeByClient.value, [row.clientId]: res.data.code }
  ElMessage.success(`绑定码有效期至 ${res.data.expiresAt}`)
}
</script>

<template>
  <el-drawer v-model="visible" :title="`端身份 · ${user?.username ?? ''}`" size="620px">
    <el-table v-loading="loading" :data="identities" empty-text="该账号暂无端身份">
      <el-table-column label="端" min-width="130">
        <template #default="{ row }">
          <div>{{ row.clientName }}</div>
          <div class="sub-text">{{ row.clientCode }}</div>
        </template>
      </el-table-column>

      <el-table-column label="openid（掩码）" min-width="150">
        <template #default="{ row }">
          <template v-if="row.openidMasked">
            <div>{{ row.openidMasked }}</div>
            <div class="sub-text">绑定于 {{ row.boundAt }}</div>
          </template>
          <span v-else class="sub-text">未绑定</span>
        </template>
      </el-table-column>

      <el-table-column label="推送设备" min-width="210">
        <template #default="{ row }">
          <div v-for="d in row.devices" :key="d.id" class="device-row" :data-test="`device-${d.id}`">
            <span>{{ d.platform || '未知平台' }} · {{ d.deviceTokenMasked }}</span>
            <el-tag v-if="d.revoked === 1" type="info" size="small">已吊销</el-tag>
            <el-button
              v-else
              link
              type="danger"
              size="small"
              v-permission="'system:user:revoke'"
              :data-test="`revoke-${d.id}`"
              @click="onRevoke(row, d.id)"
            >
              吊销
            </el-button>
            <span class="sub-text">{{ d.lastLoginAt ? `最近登录 ${d.lastLoginAt}` : '从未登录' }}</span>
          </div>
          <span v-if="row.devices.length === 0" class="sub-text">无设备</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button
            v-if="row.openidMasked"
            link
            type="danger"
            size="small"
            v-permission="'system:user:unbind'"
            :data-test="`unbind-${row.clientId}`"
            @click="onUnbind(row)"
          >
            解绑
          </el-button>
          <el-button
            link
            type="primary"
            size="small"
            v-permission="'system:user:bindcode'"
            :data-test="`bindcode-${row.clientId}`"
            @click="onBindCode(row)"
          >
            生成绑定码
          </el-button>
          <div v-if="bindCodeByClient[row.clientId]" class="bind-code" :data-test="`bindcode-value-${row.clientId}`">
            {{ bindCodeByClient[row.clientId] }}
          </div>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.sub-text {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.device-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}
.bind-code {
  margin-top: 4px;
  font-family: monospace;
  font-weight: 600;
  color: var(--el-color-primary);
}
</style>
