<template>
  <div class="approver-picker">
    <div
      class="ap-trigger"
      :class="{ 'is-disabled': disabled }"
      @click="openDialog"
    >
      <el-icon class="ap-trigger-icon"><User /></el-icon>
      <div class="ap-tags">
        <el-tag
          v-for="user in selectedUsers"
          :key="user.id"
          closable
          :disable-transitions="false"
          size="small"
          @close.stop="removeTag(user.id)"
          @click.stop
        >
          {{ user.nickname }}
        </el-tag>
        <span v-if="selectedUsers.length === 0" class="ap-placeholder">{{ placeholder }}</span>
      </div>
    </div>
    <el-dialog
      v-model="dialogVisible"
      title="选择审批人"
      width="900px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div class="ap-body" :style="{ height: dialogHeight + 'px' }">
        <!-- 左栏：组织树 + 角色列表 Tab -->
        <div class="ap-left">
          <el-tabs v-model="activeTab" class="ap-tabs">
            <el-tab-pane label="组织树" name="org">
              <el-input
                v-model="orgFilter"
                placeholder="搜索组织"
                clearable
                size="small"
                style="margin-bottom: 8px;"
              />
              <div class="ap-scroll">
                <el-tree
                  ref="orgTreeRef"
                  :data="orgTree"
                  :props="treeProps"
                  show-checkbox
                  node-key="id"
                  :filter-node-method="filterOrgNode"
                  @check="onOrgCheck"
                />
              </div>
            </el-tab-pane>
            <el-tab-pane label="角色" name="role">
              <el-input
                v-model="roleFilter"
                placeholder="搜索角色"
                clearable
                size="small"
                style="margin-bottom: 8px;"
              />
              <div class="ap-scroll">
                <el-checkbox-group v-model="checkedRoleIds" @change="onRoleChange">
                  <div
                    v-for="role in filteredRoles"
                    :key="role.id"
                    style="padding: 4px 0;"
                  >
                    <el-checkbox :value="role.id" :label="role.roleName" />
                  </div>
                </el-checkbox-group>
                <el-empty v-if="filteredRoles.length === 0" description="无匹配角色" :image-size="60" />
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>

        <!-- 中栏：待选用户表 -->
        <div class="ap-center">
          <div style="margin-bottom: 8px; display: flex; gap: 8px;">
            <el-input
              v-model="searchKeyword"
              placeholder="姓名/电话搜索"
              clearable
              size="small"
              @keyup.enter="onSearch"
            />
            <el-button type="primary" size="small" @click="onSearch">搜索</el-button>
          </div>
          <div class="ap-scroll ap-table-wrap">
            <el-table
              ref="candTableRef"
              :data="candidateUsers"
              v-loading="candidateLoading"
              border
              size="small"
              height="100%"
              :highlight-current-row="!multiple"
              @current-change="onCurrentChange"
              @select="onTableSelect"
              @select-all="onTableSelectAll"
            >
              <el-table-column v-if="multiple" type="selection" width="40" />
              <el-table-column prop="nickname" label="姓名" />
              <el-table-column prop="orgName" label="部门" />
            </el-table>
            <el-empty
              v-if="!candidateLoading && candidateUsers.length === 0"
              description="请在左侧选择组织或角色，或使用顶部搜索"
            />
          </div>
          <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
            <el-pagination
              v-model:current-page="candQuery.page"
              v-model:page-size="candQuery.size"
              :total="candTotal"
              :page-sizes="[20]"
              layout="total, prev, pager, next"
              small
              @current-change="fetchCandidateUsers"
            />
          </div>
        </div>

        <!-- 右栏：已选用户 -->
        <div class="ap-right">
          <div style="font-weight: bold; margin-bottom: 8px; flex-shrink: 0;">
            已选 {{ selectedUsers.length }} 人
          </div>
          <div class="ap-scroll">
            <div
              v-for="user in selectedUsers"
              :key="user.id"
              style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;"
            >
              <span>{{ user.nickname }} {{ user.orgName }}</span>
              <el-icon style="cursor: pointer; color: #f56c6c;" @click="removeSelected(user.id)"><Close /></el-icon>
            </div>
            <el-empty
              v-if="selectedUsers.length === 0"
              description="暂未选择"
              :image-size="60"
            />
          </div>
          <el-button
            v-if="selectedUsers.length > 0"
            text
            type="danger"
            size="small"
            style="flex-shrink: 0;"
            @click="clearSelected"
          >
            清空
          </el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleConfirm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, nextTick } from 'vue'
import { User, Close } from '@element-plus/icons-vue'
import { getOrgTree } from '@/api/org'
import { getRoleList } from '@/api/role'
import { getUserList, getUserBatch } from '@/api/user'
import type { TreeNode } from '@/types/org'
import type { RoleVO } from '@/types/role'
import type { UserVO, SelectedUser } from '@/types/user'

const props = withDefaults(defineProps<{
  modelValue: number[]
  disabled?: boolean
  multiple?: boolean
  placeholder?: string
  maxSelected?: number
  dialogHeight?: number
}>(), {
  disabled: false,
  multiple: true,
  placeholder: '请选择审批人',
  dialogHeight: 400,
})

const emit = defineEmits<{
  'update:modelValue': [number[]]
  'change': [SelectedUser[]]
}>()

const dialogVisible = ref(false)
const selectedUsers = ref<SelectedUser[]>([])
const activeTab = ref<'org' | 'role'>('org')

// 左栏 - 组织树
const orgFilter = ref('')
const orgTree = ref<TreeNode[]>([])
const orgTreeRef = ref()
const treeProps = { label: 'label', children: 'children' }
const checkedOrgIds = ref<number[]>([])

// 左栏 - 角色列表
const roleFilter = ref('')
const roles = ref<RoleVO[]>([])
const checkedRoleIds = ref<number[]>([])

// 中栏 - 待选用户
const candidateUsers = ref<UserVO[]>([])
const candidateLoading = ref(false)
const searchKeyword = ref('')
const candQuery = reactive({ page: 1, size: 20 })
const candTotal = ref(0)
const candTableRef = ref()

// 快照：打开弹窗时的已选集，取消时恢复
let snapshot: SelectedUser[] = []

const filteredRoles = computed(() => {
  if (!roleFilter.value) return roles.value
  return roles.value.filter(r => r.roleName.includes(roleFilter.value))
})

watch(orgFilter, (val) => {
  orgTreeRef.value?.filter(val)
})

function filterOrgNode(value: string, data: TreeNode) {
  if (!value) return true
  return data.label.includes(value)
}

function onOrgCheck() {
  checkedOrgIds.value = orgTreeRef.value?.getCheckedKeys(false) || []
  fetchCandidateUsers()
}

function onRoleChange() {
  fetchCandidateUsers()
}

async function loadOrgTree() {
  try {
    const res = await getOrgTree()
    orgTree.value = res.data
  } catch {
    orgTree.value = []
  }
}

async function loadRoles() {
  try {
    const res = await getRoleList({ page: 1, size: 999, status: 1 })
    roles.value = res.data.rows
  } catch {
    roles.value = []
  }
}

async function fetchCandidateUsers() {
  candidateLoading.value = true
  try {
    const hasFilter = checkedOrgIds.value.length > 0 || checkedRoleIds.value.length > 0
    const hasSearch = searchKeyword.value.trim().length > 0
    if (!hasFilter && !hasSearch) {
      candidateUsers.value = []
      candTotal.value = 0
      return
    }
    const params: Record<string, unknown> = { ...candQuery }
    if (hasSearch) {
      // 全局模糊搜索：忽略左侧筛选，后端 OR 匹配姓名和电话
      params.nickname = searchKeyword.value.trim()
    } else {
      if (checkedOrgIds.value.length > 0) params.orgIds = checkedOrgIds.value
      if (checkedRoleIds.value.length > 0) params.roleIds = checkedRoleIds.value
    }
    const res = await getUserList(params)
    candidateUsers.value = res.data.rows
    candTotal.value = res.data.total
    // 同步已选状态
    await nextTick()
    syncTableSelection()
  } finally {
    candidateLoading.value = false
  }
}

function syncTableSelection() {
  if (!candTableRef.value) return
  candidateUsers.value.forEach((row) => {
    const isSelected = selectedUsers.value.some(u => u.id === row.id)
    candTableRef.value.toggleRowSelection(row, isSelected)
  })
}

function onSearch() {
  candQuery.page = 1
  fetchCandidateUsers()
}

// 单选模式：点击行选中
function onCurrentChange(row: UserVO | null) {
  if (!row) return
  if (!props.multiple) {
    addUserToSelected(row)
  }
}

function onTableSelect(selection: UserVO[], row: UserVO) {
  const isSelected = selection.some(r => r.id === row.id)
  if (isSelected) {
    addUserToSelected(row)
  } else {
    removeUserFromSelected(row.id)
  }
}

function onTableSelectAll(selection: UserVO[]) {
  if (selection.length > 0) {
    selection.forEach(row => addUserToSelected(row))
  } else {
    candidateUsers.value.forEach(row => removeUserFromSelected(row.id))
  }
}

function addUserToSelected(user: UserVO) {
  // 单选模式：直接替换已选用户
  if (!props.multiple) {
    selectedUsers.value = [{
      id: user.id,
      nickname: user.nickname,
      username: user.username,
      orgName: user.orgName,
    }]
    return
  }
  // 多选模式：追加
  if (!selectedUsers.value.some(u => u.id === user.id)) {
    selectedUsers.value.push({
      id: user.id,
      nickname: user.nickname,
      username: user.username,
      orgName: user.orgName,
    })
  }
}

function removeUserFromSelected(userId: number) {
  selectedUsers.value = selectedUsers.value.filter(u => u.id !== userId)
}

function removeSelected(userId: number) {
  removeUserFromSelected(userId)
  syncTableSelection()
}

function removeTag(userId: number) {
  removeUserFromSelected(userId)
  syncTableSelection()
  emit('update:modelValue', selectedUsers.value.map(u => u.id))
  emit('change', [...selectedUsers.value])
}

function clearSelected() {
  selectedUsers.value = []
  syncTableSelection()
}

async function openDialog() {
  if (props.disabled) return
  dialogVisible.value = true
  // 重置筛选
  checkedOrgIds.value = []
  checkedRoleIds.value = []
  searchKeyword.value = ''
  candQuery.page = 1
  candidateUsers.value = []
  candTotal.value = 0
  // 加载左侧数据
  await Promise.all([loadOrgTree(), loadRoles()])
  // 根据 modelValue 初始化已选集
  if (props.modelValue.length > 0) {
    try {
      const res = await getUserBatch(props.modelValue)
      selectedUsers.value = res.data.map(u => ({
        id: u.id,
        nickname: u.nickname,
        username: u.username,
        orgName: u.orgName,
      }))
    } catch {
      selectedUsers.value = []
    }
  } else {
    selectedUsers.value = []
  }
  // 保存快照
  snapshot = [...selectedUsers.value]
}

function handleCancel() {
  // 恢复快照
  selectedUsers.value = [...snapshot]
  dialogVisible.value = false
}

function handleConfirm() {
  emit('update:modelValue', selectedUsers.value.map(u => u.id))
  emit('change', [...selectedUsers.value])
  dialogVisible.value = false
}

defineExpose({ openDialog })
</script>

<style scoped>
.ap-body {
  display: flex;
  gap: 12px;
}

.ap-left {
  width: 200px;
  border-right: 1px solid #ebeef5;
  padding-right: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ap-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ap-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ap-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ap-right {
  width: 240px;
  border-left: 1px solid #ebeef5;
  padding-left: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ap-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.ap-table-wrap {
  display: flex;
  flex-direction: column;
}

.ap-trigger {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-height: 32px;
  padding: 4px 11px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  background-color: #fff;
  transition: border-color 0.2s;
  box-sizing: border-box;
  width: 100%;
}

.ap-trigger:hover {
  border-color: #c0c4cc;
}

.ap-trigger.is-disabled {
  background-color: #f5f7fa;
  cursor: not-allowed;
}

.ap-trigger-icon {
  margin-top: 2px;
  color: #a8abb2;
  flex-shrink: 0;
}

.ap-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
}

.ap-placeholder {
  color: #a8abb2;
  font-size: 12px;
  line-height: 24px;
}
</style>
