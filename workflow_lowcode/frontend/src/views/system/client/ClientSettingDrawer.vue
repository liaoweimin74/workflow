<script setup lang="ts">
defineOptions({ name: 'ClientSettingDrawer' })

/**
 * A2 客户端设置抽屉（multi-client-support Task 7，tasks.md 1.5）：
 * 三 Tab【渠道开通 | 登录方式 | 初始授权】，保存并生效。
 *
 * ⚠️ 渠道区状态模型 = channelDraft（WEB/H5/APP/MP 四行草稿），打开时从
 *    client.channels 深拷贝；保存时仅「与原始快照有差异」的渠道逐个
 *    PUT /clients/:id/channels（enabled=0 的未开通空行不重发，幂等降噪）。
 * ⚠️ MP 的 secret 走掩码语义：回显 '******' 原样提交 = 后端保留原密文
 *    （client.service secret 边界约定）；开通校验镜像服务端（appid/secret 必填）。
 * ⚠️ portal(id=1) 的 WEB 渠道锁定：恒开通、开关 disabled（管理入口不可自断）。
 * ⚠️ 登录方式存 config.loginMethods 数组；渠道→可选项映射按设计原型
 *    （WEB/H5/APP→SMS/PWD，MP→OPENID_SILENT/BIND_CODE）。
 */

import { reactive, ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { listRolesByClient, testChannel, updateClient, upsertChannel } from '@/api/client'
import { getMemberGroupList } from '@/api/memberGroup'
import type { MemberGroupVO } from '@/types/memberGroup'
import type { ClientVO } from '@/types/client'

const props = defineProps<{ modelValue: boolean; client: ClientVO | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const CHANNEL_TYPES = ['WEB', 'H5', 'APP', 'MP'] as const
type ChannelType = (typeof CHANNEL_TYPES)[number]

const CHANNEL_LABELS: Record<ChannelType, string> = {
  WEB: 'WEB',
  H5: 'H5',
  APP: 'APP',
  MP: '微信小程序',
}

/** 渠道 → 可勾选登录方式（设计原型「按渠道勾搭」的映射裁定，存 config.loginMethods）。 */
const LOGIN_METHOD_OPTIONS: Record<ChannelType, Array<{ code: string; label: string }>> = {
  WEB: [
    { code: 'SMS', label: '手机验证码' },
    { code: 'PWD', label: '账密' },
  ],
  H5: [
    { code: 'SMS', label: '手机验证码' },
    { code: 'PWD', label: '账密' },
  ],
  APP: [
    { code: 'SMS', label: '手机验证码' },
    { code: 'PWD', label: '账密' },
  ],
  MP: [
    { code: 'OPENID_SILENT', label: 'openid 静默' },
    { code: 'BIND_CODE', label: '绑定码' },
  ],
}

/** 平台端 id（与后端 PORTAL_CLIENT_ID 一致）。 */
const PORTAL_CLIENT_ID = 1

interface ChannelDraft {
  enabled: number
  config: Record<string, any>
}

const activeTab = ref('channels')
const saving = ref(false)
const roleOptions = ref<Array<{ id: number; roleName: string; roleCode: string }>>([])
const groupOptions = ref<MemberGroupVO[]>([])

const channelDraft = reactive<Record<ChannelType, ChannelDraft>>({
  WEB: { enabled: 0, config: {} },
  H5: { enabled: 0, config: {} },
  APP: { enabled: 0, config: {} },
  MP: { enabled: 0, config: {} },
})

/** 打开抽屉时的原始快照，submit 用它做变更检测（非响应式：只读）。 */
let original: Record<ChannelType, ChannelDraft> = {
  WEB: { enabled: 0, config: {} },
  H5: { enabled: 0, config: {} },
  APP: { enabled: 0, config: {} },
  MP: { enabled: 0, config: {} },
}

const form = reactive<{ defaultRoleId: number | null; defaultMemberGroupId: number | null }>({
  defaultRoleId: null,
  defaultMemberGroupId: null,
})

const isPortal = computed(() => props.client?.id === PORTAL_CLIENT_ID)
const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})
const enabledTypes = computed(() => CHANNEL_TYPES.filter((t) => channelDraft[t].enabled === 1))

function initFromClient(c: ClientVO): void {
  const rows = new Map(c.channels.map((ch) => [ch.channelType, ch]))
  for (const t of CHANNEL_TYPES) {
    const row = rows.get(t)
    const baseline: ChannelDraft = {
      enabled: row ? row.enabled : 0,
      config: JSON.parse(JSON.stringify(row?.config ?? {})),
    }
    original[t] = baseline
    // portal 的 WEB 恒开通（锁定不可停）；其余原样进草稿
    const draftEnabled = c.id === PORTAL_CLIENT_ID && t === 'WEB' ? 1 : baseline.enabled
    channelDraft[t] = { enabled: draftEnabled, config: JSON.parse(JSON.stringify(baseline.config)) }
  }
  form.defaultRoleId = c.defaultRoleId
  form.defaultMemberGroupId = c.defaultMemberGroupId
}

async function loadGrants(clientId: number): Promise<void> {
  const [roles, groups] = await Promise.all([
    listRolesByClient(clientId),
    getMemberGroupList({ page: 1, size: 200 }),
  ])
  roleOptions.value = roles.data.rows
  groupOptions.value = groups.data.rows
}

watch(
  () => [props.modelValue, props.client?.id] as const,
  ([open]) => {
    if (open && props.client) {
      initFromClient(props.client)
      void loadGrants(props.client.id)
    }
  },
  { immediate: true },
)

function onEnableChange(t: ChannelType, v: boolean | string | number): void {
  channelDraft[t].enabled = v ? 1 : 0
}

/** loginMethods 未勾选时不落键（保持与原始快照一致 → 不误判为变更）。 */
function loginMethodsOf(t: ChannelType): string[] {
  return (channelDraft[t].config.loginMethods as string[]) ?? []
}
function setLoginMethods(t: ChannelType, v: unknown): void {
  const arr = v as string[]
  if (arr.length === 0) delete channelDraft[t].config.loginMethods
  else channelDraft[t].config.loginMethods = arr
}

async function runTest(t: ChannelType): Promise<void> {
  if (!props.client) return
  const res = await testChannel(props.client.id, t)
  const data = res.data as { ok: boolean; msg: string }
  if (data.ok) ElMessage.success(data.msg || '连通测试通过')
  else ElMessage.error(data.msg || '连通测试失败')
}

/** 与原始快照比对：enabled 或 config 任一差异即重发该渠道。 */
function isChannelChanged(t: ChannelType): boolean {
  const d = channelDraft[t]
  const o = original[t]
  return d.enabled !== o.enabled || JSON.stringify(d.config) !== JSON.stringify(o.config)
}

async function submit(): Promise<void> {
  const c = props.client
  if (!c) return
  // MP 开通必填 appid/secret（镜像服务端校验；掩码串也算有值）
  if (channelDraft.MP.enabled === 1) {
    const appid = String(channelDraft.MP.config.appid ?? '').trim()
    const secret = String(channelDraft.MP.config.secret ?? '').trim()
    if (!appid || !secret) {
      ElMessage.warning('开通微信小程序需填写 appid 与 secret')
      return
    }
  }
  saving.value = true
  try {
    // 初始授权 → PUT /clients/:id（仅授权两字段，基本信息归 A1 编辑抽屉）
    await updateClient(c.id, {
      defaultRoleId: form.defaultRoleId,
      defaultMemberGroupId: form.defaultMemberGroupId,
    })
    // 变更渠道逐个 upsert（PUT /clients/:id/channels）
    for (const t of CHANNEL_TYPES) {
      if (isChannelChanged(t)) {
        const d = channelDraft[t]
        await upsertChannel(c.id, { channelType: t, enabled: d.enabled, config: d.config })
      }
    }
    ElMessage.success('已保存并生效')
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-drawer v-model="visible" :title="`设置 · ${client?.name ?? ''}`" size="560px">
    <el-tabs v-model="activeTab">
      <!-- Tab 1：渠道开通 -->
      <el-tab-pane label="渠道开通" name="channels">
        <div v-for="t in CHANNEL_TYPES" :key="t" class="channel-row">
          <el-checkbox
            :data-test="`channel-enable-${t}`"
            :model-value="channelDraft[t].enabled === 1"
            :disabled="isPortal && t === 'WEB'"
            @change="onEnableChange(t, $event)"
          >
            {{ CHANNEL_LABELS[t] }}
          </el-checkbox>

          <div v-if="t === 'MP' && channelDraft.MP.enabled === 1" class="channel-params">
            <el-input v-model="channelDraft.MP.config.appid" placeholder="appid（wx 开头）" size="small" />
            <el-input
              v-model="channelDraft.MP.config.secret"
              placeholder="secret（掩码 ****** = 保留原密文，留空则清除）"
              size="small"
            />
            <el-button size="small" @click="runTest('MP')">连通测试</el-button>
          </div>

          <div v-if="t === 'APP' && channelDraft.APP.enabled === 1" class="channel-params">
            <el-input v-model="channelDraft.APP.config.minVersion" placeholder="最低版本，如 1.2.0" size="small" />
            <el-checkbox v-model="channelDraft.APP.config.forceUpdate" size="small">强制更新</el-checkbox>
            <el-input v-model="channelDraft.APP.config.downloadUrl" placeholder="下载/升级地址" size="small" />
          </div>
        </div>
        <p v-if="isPortal" class="channel-hint">平台端 WEB 渠道锁定，不可停用。</p>
      </el-tab-pane>

      <!-- Tab 2：登录方式（按已开通渠道渲染勾选项，存 config.loginMethods） -->
      <el-tab-pane label="登录方式" name="login">
        <p v-if="enabledTypes.length === 0" class="channel-hint">先在「渠道开通」勾选渠道。</p>
        <div v-for="t in enabledTypes" :key="t" class="login-row">
          <span class="login-channel">{{ CHANNEL_LABELS[t] }}</span>
          <el-checkbox-group :model-value="loginMethodsOf(t)" @update:model-value="setLoginMethods(t, $event)">
            <el-checkbox v-for="opt in LOGIN_METHOD_OPTIONS[t]" :key="opt.code" :value="opt.code">
              {{ opt.label }}
            </el-checkbox>
          </el-checkbox-group>
        </div>
      </el-tab-pane>

      <!-- Tab 3：初始授权（角色本端限定 = tasks 3.3 数据侧；成员组数据范围主体） -->
      <el-tab-pane label="初始授权" name="grant">
        <el-form label-width="110px">
          <el-form-item label="注册默认角色">
            <el-select v-model="form.defaultRoleId" clearable placeholder="仅本端角色" style="width: 100%">
              <el-option v-for="r in roleOptions" :key="r.id" :label="r.roleName" :value="r.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="默认成员组">
            <el-select v-model="form.defaultMemberGroupId" clearable placeholder="数据范围主体" style="width: 100%">
              <el-option v-for="g in groupOptions" :key="g.id" :label="g.groupName" :value="g.id" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存并生效</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.channel-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.channel-params {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding-left: 24px;
}
.login-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}
.login-channel {
  min-width: 72px;
  font-weight: 600;
}
.channel-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
