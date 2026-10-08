<script setup lang="ts">
defineOptions({ name: 'MemberGroupManagement' })

/**
 * 成员组管理：左「成员组导航（SideNavList）」+ 右「组成员表格（SearchTable）」。
 *
 * Task 142：去业务表单化重构——不再走 BizDataListPage（业务表单 member_group），
 * 回归专用数据表（sys_member_group / sys_member_group_member）+ 专用接口
 * /api/member-groups；界面参照字典管理页（Task 115/117 的左导航 + 右表格形态）。
 * 自动规则机制已移除（Task 141 决策），成员均为手动添加。
 */

import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Switch as SwitchIcon, Edit, Delete, Plus, User } from '@element-plus/icons-vue'
import { SearchTable, SideNavList } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, NavItem, NavItemAction } from '@/components/business/types'
import {
  getMemberGroupList, createMemberGroup, updateMemberGroup, deleteMemberGroup,
  getGroupMembers, addGroupMembers, removeGroupMembers,
} from '@/api/memberGroup'
import { getUserList } from '@/api/user'
import type { MemberGroupVO, GroupMemberVO } from '@/types/memberGroup'
import type { UserVO } from '@/types/user'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// ================= 成员组（左栏数据源） =================
const groups = ref<MemberGroupVO[]>([])
const groupsLoading = ref(false)
const selectedGroup = ref<MemberGroupVO | null>(null)
const memberTableRef = ref()

const canCreate = computed(() => authStore.hasPermission('system:member-group:create'))
const canUpdate = computed(() => authStore.hasPermission('system:member-group:update'))
const canDelete = computed(() => authStore.hasPermission('system:member-group:delete'))
const canManageMember = computed(() => authStore.hasPermission('system:member-group:member'))

/** DTO → NavItem 映射（与字典管理页同构） */
const navItems = computed<NavItem[]>(() =>
  groups.value.map((g) => ({
    key: g.id,
    title: g.groupName,
    subtitle: g.description || '',
    disabled: g.status !== 1,
    disabledLabel: '停用',
    raw: g,
  })),
)

/** 行内操作：启停 / 编辑 / 删除 */
const navActions = computed<NavItemAction[]>(() => [
  {
    label: '启用/停用',
    icon: SwitchIcon,
    disabled: () => !canUpdate.value,
    onClick: (item) => toggleGroupStatus(item.raw as MemberGroupVO),
  },
  {
    label: '编辑',
    icon: Edit,
    disabled: () => !canUpdate.value,
    onClick: (item) => openGroupEdit(item.raw as MemberGroupVO),
  },
  {
    label: '删除',
    icon: Delete,
    type: 'danger',
    disabled: () => !canDelete.value,
    onClick: (item) => removeGroup(item.raw as MemberGroupVO),
  },
])

async function fetchGroups(): Promise<void> {
  groupsLoading.value = true
  try {
    const res = await getMemberGroupList({ page: 1, size: 999 })
    groups.value = res.data.rows ?? []
    // 选中项被删/停用后仍按 id 回查保留，否则回落第一个
    const keep = selectedGroup.value ? groups.value.find((g) => g.id === selectedGroup.value!.id) : null
    selectedGroup.value = keep ?? groups.value[0] ?? null
  } finally {
    groupsLoading.value = false
  }
}

function handleSelect(item: NavItem): void {
  const row = item.raw as MemberGroupVO
  if (selectedGroup.value?.id === row.id) return
  selectedGroup.value = row
}

// ================= 成员组新建/编辑/删除/启停 =================
const groupDialogVisible = ref(false)
const groupEditing = ref<MemberGroupVO | null>(null) // null = 新建
const groupForm = ref({ groupName: '', description: '' })
const groupSubmitting = ref(false)
const groupFormRef = ref()
const groupRules = {
  groupName: [
    { required: true, message: '请输入成员组名称', trigger: 'blur' },
    { max: 64, message: '名称不能超过 64 个字符', trigger: 'blur' },
  ],
  description: [{ max: 255, message: '说明不能超过 255 个字符', trigger: 'blur' }],
}

function openGroupCreate(): void {
  groupEditing.value = null
  groupForm.value = { groupName: '', description: '' }
  groupDialogVisible.value = true
  nextTick(() => groupFormRef.value?.clearValidate())
}

function openGroupEdit(row: MemberGroupVO): void {
  groupEditing.value = row
  groupForm.value = { groupName: row.groupName, description: row.description ?? '' }
  groupDialogVisible.value = true
  nextTick(() => groupFormRef.value?.clearValidate())
}

async function submitGroup(): Promise<void> {
  await groupFormRef.value?.validate().catch(() => Promise.reject(new Error('invalid')))
  groupSubmitting.value = true
  try {
    if (groupEditing.value) {
      await updateMemberGroup(groupEditing.value.id, {
        groupName: groupForm.value.groupName,
        description: groupForm.value.description,
      })
      ElMessage.success('成员组已更新')
    } else {
      await createMemberGroup({
        groupName: groupForm.value.groupName,
        description: groupForm.value.description,
      })
      ElMessage.success('成员组已创建')
    }
    groupDialogVisible.value = false
    await fetchGroups()
  } finally {
    groupSubmitting.value = false
  }
}

async function removeGroup(row: MemberGroupVO): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除成员组「${row.groupName}」将连带移除其全部成员关系，且不可恢复。确定删除？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await deleteMemberGroup(row.id)
  ElMessage.success('删除成功')
  if (selectedGroup.value?.id === row.id) selectedGroup.value = null
  await fetchGroups()
}

async function toggleGroupStatus(row: MemberGroupVO): Promise<void> {
  await updateMemberGroup(row.id, { status: row.status === 1 ? 0 : 1 })
  ElMessage.success(row.status === 1 ? '已停用' : '已启用')
  await fetchGroups()
}

// ================= 组成员（右栏 SearchTable） =================
const memberSearchFields: SearchField[] = [
  { type: 'input', label: '关键词', prop: 'keyword', placeholder: '用户名 / 昵称' },
]

const memberColumns: TableColumn[] = [
  { prop: 'username', label: '用户名', width: 130 },
  { prop: 'nickname', label: '昵称', width: 130 },
  { prop: 'orgName', label: '组织机构', minWidth: 130 },
  { prop: 'postName', label: '岗位', width: 110 },
  {
    prop: 'joinedAt', label: '加入时间', width: 170,
    // 后端 LocalDateTime 为 ISO 串（2026-10-06T06:46:49.208），本地转友好格式
    formatter: (_r: any, _c: any, v: any) =>
      typeof v === 'string' && v ? v.replace('T', ' ').slice(0, 19) : '',
  },
]

const memberFetchApi = async (p: any) => {
  if (!selectedGroup.value) return { rows: [], total: 0 }
  const res = await getGroupMembers(selectedGroup.value.id, {
    page: p.page || 1,
    size: p.size || 10,
    keyword: p.keyword?.trim() ? p.keyword.trim() : undefined,
  })
  return { rows: res.data.rows, total: res.data.total }
}

/** 行内操作：移除成员 */
const memberActionButtons: ActionButton[] = [
  {
    label: '移除',
    type: 'danger',
    size: 'small',
    link: true,
    permission: 'system:member-group:member',
    onClick: (row: any) => removeMember(row as GroupMemberVO),
  },
]

async function removeMember(row: GroupMemberVO): Promise<void> {
  if (!selectedGroup.value) return
  try {
    await ElMessageBox.confirm(
      `确定将成员「${row.nickname || row.username}」移出成员组吗？`,
      '确认移除',
      { type: 'warning' },
    )
  } catch {
    return
  }
  await removeGroupMembers(selectedGroup.value.id, [row.userId])
  ElMessage.success('已移除')
  await memberTableRef.value?.fetchList?.()
  await fetchGroups()
}

// 选中组变化 → 刷新右表（用 id 做依赖，避免同对象替换触发重复请求）
watch(() => selectedGroup.value?.id, () => {
  memberTableRef.value?.fetchList?.()
})

// ================= 添加成员弹窗（远程用户多选，value=用户 id） =================
const addMemberVisible = ref(false)
const addMemberSubmitting = ref(false)
/** 选中用户 id 列表（el-select value=用户 id 数字） */
const pickedUserIds = ref<number[]>([])
const userOptions = ref<UserVO[]>([])
const userSearching = ref(false)

async function searchUsers(query: string): Promise<void> {
  userSearching.value = true
  try {
    const res = await getUserList({ username: query, page: 1, size: 20 })
    userOptions.value = res.data.rows ?? []
  } catch {
    userOptions.value = []
  } finally {
    userSearching.value = false
  }
}

function openAddMember(): void {
  pickedUserIds.value = []
  addMemberVisible.value = true
  void searchUsers('')
}

async function submitAddMembers(): Promise<void> {
  if (!selectedGroup.value) return
  if (pickedUserIds.value.length === 0) {
    ElMessage.warning('请先选择要添加的成员')
    return
  }
  addMemberSubmitting.value = true
  try {
    await addGroupMembers(selectedGroup.value.id, pickedUserIds.value)
    ElMessage.success(`已添加 ${pickedUserIds.value.length} 名成员`)
    addMemberVisible.value = false
    await memberTableRef.value?.fetchList?.()
    await fetchGroups()
  } finally {
    addMemberSubmitting.value = false
  }
}

onMounted(fetchGroups)
</script>

<template>
  <!-- 与字典管理同构：窄屏上下堆叠（flex-col），lg 起左右分栏 -->
  <div class="flex flex-col lg:flex-row gap-3 h-full min-h-0">
    <!-- ── 左栏：成员组导航 ── -->
    <SideNavList
      title="成员组"
      :items="navItems"
      :selected-key="selectedGroup?.id ?? null"
      :loading="groupsLoading"
      :actions="navActions"
      :creatable="true"
      create-label="新增成员组"
      :create-disabled="!canCreate"
      filter-placeholder="搜索名称 / 说明"
      filter-aria-label="搜索成员组"
      :empty-text="groups.length === 0 ? '暂无成员组' : '无匹配成员组'"
      empty-hint="点击右上角 + 新建"
      @select="handleSelect"
      @create="openGroupCreate"
    />

    <!-- ── 右栏：组成员表格 ── -->
    <el-card v-if="selectedGroup" class="flex-1 min-w-0" shadow="never">
      <template #header>
        <div class="flex items-center gap-2 flex-wrap">
          <el-icon class="align-middle text-gray-500"><User /></el-icon>
          <span class="text-sm font-bold">组成员</span>
          <span class="text-sm text-gray-500">— {{ selectedGroup.groupName }}</span>
          <el-tag size="small" effect="plain" type="info">{{ selectedGroup.memberCount }} 人</el-tag>
          <div class="flex-1" />
          <el-button
            v-permission="'system:member-group:member'"
            type="primary"
            size="small"
            :icon="Plus"
            @click="openAddMember"
          >
            添加成员
          </el-button>
        </div>
      </template>
      <SearchTable
        ref="memberTableRef"
        :search-fields="memberSearchFields"
        :columns="memberColumns"
        :action-buttons="memberActionButtons"
        table-size="small"
        :fetch-api="memberFetchApi"
      />
    </el-card>

    <!-- 未选中占位（理论上进入即自动选中第一个，防御性保留） -->
    <div v-else class="flex-1 flex items-center justify-center text-gray-400 text-sm">
      {{ groups.length === 0 ? '请先创建成员组' : '请选择左侧成员组' }}
    </div>

    <!-- ── 成员组新建/编辑弹窗（名称 + 说明） ── -->
    <el-dialog
      v-model="groupDialogVisible"
      :title="groupEditing ? '编辑成员组' : '新增成员组'"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form ref="groupFormRef" :model="groupForm" :rules="groupRules" label-width="82px">
        <el-form-item label="组名称" prop="groupName">
          <el-input v-model="groupForm.groupName" placeholder="如：项目管理组" maxlength="64" />
        </el-form-item>
        <el-form-item label="说明" prop="description">
          <el-input
            v-model="groupForm.description" type="textarea" :rows="2" maxlength="255"
            placeholder="选填，用于说明该组的用途"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="groupSubmitting" @click="submitGroup">确定</el-button>
      </template>
    </el-dialog>

    <!-- ── 添加成员弹窗（远程搜索多选；value=用户 id） ── -->
    <el-dialog
      v-model="addMemberVisible"
      :title="`添加成员 — ${selectedGroup?.groupName ?? ''}`"
      width="460px"
      :close-on-click-modal="false"
    >
      <el-select
        v-model="pickedUserIds"
        multiple
        filterable
        remote
        reserve-keyword
        clearable
        :remote-method="searchUsers"
        :loading="userSearching"
        placeholder="搜索用户名添加成员（可多选）"
        style="width: 100%"
      >
        <el-option
          v-for="u in userOptions"
          :key="u.id"
          :label="`${u.nickname} (${u.username})`"
          :value="u.id"
          :disabled="u.status !== 1"
        />
      </el-select>
      <div class="text-xs text-gray-400 leading-4 mt-2">
        已在组内的成员将被自动跳过；曾移出的成员会重新加入。
      </div>
      <template #footer>
        <el-button @click="addMemberVisible = false">取消</el-button>
        <el-button type="primary" :loading="addMemberSubmitting" @click="submitAddMembers">确定添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>
