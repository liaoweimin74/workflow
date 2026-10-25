<script setup lang="ts">
defineOptions({ name: 'ClientManagement' })

/**
 * A1 客户端管理页（multi-client-support Task 6）：多端交付的端资产管理入口。
 *
 * 形态：SearchTable 列表（名称/编码/已开通渠道徽标/用户数占位/状态）+
 *       自建「新建」按钮（工具栏 slot，v-permission 控制）+ 新建/编辑抽屉。
 * ⚠️ 新建/编辑走页面自有 el-drawer（不接 SearchTable 内置 dialog formConfig），
 *    后续 A2 设置抽屉（渠道/登录方式/初始授权）在同目录扩展（Task 7）。
 * ⚠️ 用户数列 = 占位：后端暂无端用户统计字段（P1 补），恒显示「—」。
 * ⚠️ portal(id=1) 的保护（改码/停用拒绝）由服务端裁决，前端只透传错误。
 */

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Edit, Plus, Switch } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { ActionButton, SearchField, TableColumn } from '@/components/business/types'
import { listClients, createClient, updateClient, setClientStatus } from '@/api/client'
import type { ClientVO } from '@/types/client'
import ClientSettingDrawer from './ClientSettingDrawer.vue'

const searchTableRef = ref()
// ensure searchTableRef is "used" for template ref binding
void searchTableRef
const router = useRouter()

// ---------- 搜索字段 ----------
const searchFields: SearchField[] = [
  { type: 'input', label: '关键字', prop: 'keyword', placeholder: '端名称/编码' },
  {
    type: 'select', label: '状态', prop: 'status', placeholder: '选择状态',
    options: [{ label: '全部', value: undefined }, { label: '启用', value: 1 }, { label: '停用', value: 0 }],
    style: 'width: 120px',
  },
]

/** 已开通渠道文案：只收 enabled=1 的渠道类型（徽标渲染见模板 channels slot）。 */
function enabledChannelTypes(row: ClientVO): string {
  return row.channels.filter((c) => c.enabled === 1).map((c) => c.channelType).join('/')
}

// ---------- 表格列 ----------
const columns: TableColumn[] = [
  { prop: 'name', label: '名称', width: 160 },
  { prop: 'code', label: '编码', width: 160 },
  { label: '已开通渠道', minWidth: 180, slotName: 'channels', formatter: (row: any) => enabledChannelTypes(row) },
  { label: '用户数', width: 90, align: 'center', formatter: () => '—' },
  { prop: 'status', label: '状态', width: 80, align: 'center', formatter: (_r: any, _c: any, v: any) => (v === 1 ? '启用' : '停用') },
]

// ---------- 行操作 ----------
const actionButtons: ActionButton[] = [
  // 「⚙设置」打开 A2 抽屉（渠道开通/登录方式/初始授权，Task 7）
  { label: '⚙设置', size: 'small', link: true, permission: 'system:client:update', onClick: openSetting },
  { label: '编辑', icon: Edit, size: 'small', link: true, permission: 'system:client:update', onClick: openEdit },
  // 「☰菜单」跳 A3（菜单管理）并携带端参数；MenuPage 的端 Tab 消费在 Task 14 接线（当前忽略=无害）
  { label: '☰菜单', size: 'small', link: true, onClick: goMenu },
  {
    label: '启用/停用', icon: Switch, size: 'small', link: true, permission: 'system:client:update',
    onClick: toggleStatus,
  },
]

function goMenu(row: ClientVO): void {
  router.push({ path: '/system/menu', query: { clientId: String(row.id) } })
}

// ---------- A2 设置抽屉（Task 7：渠道开通/登录方式/初始授权） ----------
const settingVisible = ref(false)
const settingClient = ref<ClientVO | null>(null)

function openSetting(row: ClientVO): void {
  settingClient.value = row
  settingVisible.value = true
}

/** A2 保存后刷新列表（渠道徽标/授权回显即时更新）。 */
function onSettingSaved(): void {
  searchTableRef.value?.fetchList()
}

async function toggleStatus(row: ClientVO): Promise<void> {
  const next = row.status === 1 ? 0 : 1
  await setClientStatus(row.id, next)
  ElMessage.success(next === 1 ? '已启用' : '已停用')
  searchTableRef.value?.fetchList()
}

// ---------- fetchApi ----------
async function fetchApi(params: any) {
  const res = await listClients(params)
  return { rows: res.data.rows, total: res.data.total }
}

// ---------- 新建/编辑抽屉 ----------
const drawerVisible = ref(false)
const editing = ref<ClientVO | null>(null) // null = 新建
const form = ref({ code: '', name: '', icon: '', status: 1 })
const submitting = ref(false)
const formRef = ref()
const rules = {
  code: [
    { required: true, message: '请输入端编码', trigger: 'blur' },
    { pattern: /^[a-z][a-z0-9_]{1,63}$/, message: '编码为小写字母开头的字母数字下划线（≤64）', trigger: 'blur' },
  ],
  name: [
    { required: true, message: '请输入端名称', trigger: 'blur' },
    { max: 64, message: '名称不能超过 64 个字符', trigger: 'blur' },
  ],
}

function openCreate(): void {
  editing.value = null
  form.value = { code: '', name: '', icon: '', status: 1 }
  drawerVisible.value = true
}

function openEdit(row: ClientVO): void {
  editing.value = row
  form.value = { code: row.code, name: row.name, icon: row.icon ?? '', status: row.status }
  drawerVisible.value = true
}

async function submitForm(): Promise<void> {
  await formRef.value?.validate().catch(() => Promise.reject(new Error('invalid')))
  submitting.value = true
  try {
    if (editing.value) {
      // 编码创建后不可改（服务端同样拒绝 portal 改码）；只提交可变字段
      await updateClient(editing.value.id, { name: form.value.name, icon: form.value.icon || null, status: form.value.status })
      ElMessage.success('客户端已更新')
    } else {
      await createClient({
        code: form.value.code,
        name: form.value.name,
        icon: form.value.icon || null,
        status: form.value.status,
      })
      ElMessage.success('客户端已创建')
    }
    drawerVisible.value = false
    searchTableRef.value?.fetchList()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <SearchTable
    ref="searchTableRef"
    :search-fields="searchFields"
    :columns="columns"
    :action-buttons="actionButtons"
    :fetch-api="fetchApi"
  >
    <!-- 工具栏自建入口：新建走页面抽屉（非 SearchTable 内置 dialog） -->
    <el-button type="primary" :icon="Plus" v-permission="'system:client:create'" @click="openCreate">
      新建
    </el-button>

    <!-- 已开通渠道徽标：仅 enabled=1 的渠道渲染 tag -->
    <template #channels="{ row }">
      <el-tag
        v-for="ch in row.channels.filter((c: any) => c.enabled === 1)"
        :key="ch.channelType"
        size="small"
        class="channel-tag"
      >
        {{ ch.channelType }}
      </el-tag>
      <span v-if="enabledChannelTypes(row) === ''" class="channel-empty">—</span>
    </template>
  </SearchTable>

  <el-drawer
    v-model="drawerVisible"
    :title="editing ? '编辑客户端' : '新建客户端'"
    size="420px"
    :close-on-click-modal="false"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="端编码" prop="code">
        <el-input v-model="form.code" :disabled="!!editing" placeholder="如 driver_app（创建后不可改）" />
      </el-form-item>
      <el-form-item label="端名称" prop="name">
        <el-input v-model="form.name" placeholder="如 司机端" />
      </el-form-item>
      <el-form-item label="图标" prop="icon">
        <el-input v-model="form.icon" placeholder="可选，Element Plus 图标名" />
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio :value="1">启用</el-radio>
          <el-radio :value="0">停用</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="drawerVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
    </template>
  </el-drawer>

  <!-- A2 设置抽屉：渠道开通/登录方式/初始授权（保存并生效后刷新列表） -->
  <ClientSettingDrawer v-model="settingVisible" :client="settingClient" @saved="onSettingSaved" />
</template>

<style scoped>
.channel-tag + .channel-tag {
  margin-left: 4px;
}
.channel-empty {
  color: var(--el-text-color-secondary);
}
</style>
