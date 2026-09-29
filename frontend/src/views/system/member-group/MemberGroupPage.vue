<script setup lang="ts">
defineOptions({ name: 'MemberGroupManagement' })

import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { User, Plus } from '@element-plus/icons-vue'
import { SearchTable, ApproverPicker } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import {
  getMemberGroupList,
  createMemberGroup,
  updateMemberGroup,
  deleteMemberGroup,
  getGroupMembers,
  addGroupMembers,
  removeGroupMembers,
  getGroupRules,
  addGroupRule,
  removeGroupRule,
} from '@/api/memberGroup'
import { getPostOptions } from '@/api/post'
import { getOrgTree } from '@/api/org'
import type { MemberGroupVO, GroupMemberVO, GroupRuleVO } from '@/types/memberGroup'
import type { PostOptionVO } from '@/types/post'
import type { TreeNode } from '@/types/org'

const searchTableRef = ref()

// ---------- 搜索字段 ----------
const searchFields: SearchField[] = [
  { type: 'input', label: '关键词', prop: 'keyword', placeholder: '成员组名称/说明' },
]

// ---------- 表格列 ----------
const columns: TableColumn[] = [
  { prop: 'groupName', label: '成员组名称', width: 160 },
  { prop: 'description', label: '说明', minWidth: 180 },
  { label: '成员数', width: 90, align: 'center', formatter: (row: any) => String(row.memberCount) },
  { label: '手动添加', width: 90, align: 'center', formatter: (row: any) => String(row.manualCount) },
  { label: '自动规则', width: 90, align: 'center', formatter: (row: any) => String(row.ruleCount) },
  { prop: 'createdAt', label: '创建时间', width: 170 },
]

// ---------- fetchApi ----------
async function fetchApi(params: any) {
  const res = await getMemberGroupList(params)
  return { rows: res.data.rows, total: res.data.total }
}

// ---------- 表单配置 ----------
const formConfig: FormConfig<MemberGroupVO> = {
  rule: [
    { type: 'input', field: 'groupName', title: '成员组名称', validate: [{ required: true, message: '请输入成员组名称', trigger: 'blur' }] } as Rule,
    { type: 'input', field: 'description', title: '成员组说明', props: { type: 'textarea', maxlength: 255, rows: 2, placeholder: '请输入成员组说明' } } as Rule,
  ],
  createApi: createMemberGroup,
  updateApi: (id, data) => updateMemberGroup(id as number, data),
  deleteApi: async (id) => { await deleteMemberGroup(id as number) },
  getApi: async (id) => {
    const res = await getMemberGroupList({ page: 1, size: 999 })
    return res.data.rows.find((r: MemberGroupVO) => r.id === (id as number)) as MemberGroupVO
  },
  dialogTitle: { create: '新增成员组', edit: '编辑成员组' },
  createPermission: 'system:member-group:create',
  editPermission: 'system:member-group:update',
  deletePermission: 'system:member-group:delete',
}

// ============================================================
// 成员管理抽屉（成员 + 自动规则）
// ============================================================

const drawerVisible = ref(false)
const currentGroup = ref<MemberGroupVO | null>(null)
const activeTab = ref<'members' | 'rules'>('members')

// ---------- 成员列表 ----------
const memberList = ref<GroupMemberVO[]>([])
const memberTotal = ref(0)
const memberPage = ref(1)
const memberSize = ref(10)
const memberKeyword = ref('')
const memberLoading = ref(false)

/** 待添加成员（ApproverPicker 多选） */
const pickedUserIds = ref<number[]>([])
const addMemberLoading = ref(false)

async function loadMembers() {
  if (currentGroup.value === null) return
  memberLoading.value = true
  try {
    const res = await getGroupMembers(currentGroup.value.id, {
      page: memberPage.value,
      size: memberSize.value,
      keyword: memberKeyword.value.trim() !== '' ? memberKeyword.value.trim() : undefined,
    })
    memberList.value = res.data.rows
    memberTotal.value = res.data.total
  } finally {
    memberLoading.value = false
  }
}

async function handleAddMembers() {
  if (currentGroup.value === null) return
  if (pickedUserIds.value.length === 0) {
    ElMessage.warning('请先选择要添加的成员')
    return
  }
  addMemberLoading.value = true
  try {
    await addGroupMembers(currentGroup.value.id, pickedUserIds.value)
    ElMessage.success(`已添加 ${pickedUserIds.value.length} 名成员`)
    pickedUserIds.value = []
    memberPage.value = 1
    await loadMembers()
    searchTableRef.value?.fetchList()
  } finally {
    addMemberLoading.value = false
  }
}

async function handleRemoveMember(row: GroupMemberVO) {
  if (currentGroup.value === null) return
  try {
    await ElMessageBox.confirm(`确定将成员「${row.nickname || row.username}」移出成员组吗？`, '确认移除', { type: 'warning' })
    await removeGroupMembers(currentGroup.value.id, [row.userId])
    ElMessage.success('已移除')
    await loadMembers()
    searchTableRef.value?.fetchList()
  } catch { /* cancelled */ }
}

function handleMemberSearch() {
  memberPage.value = 1
  void loadMembers()
}

// ---------- 自动规则 ----------
const rules = ref<GroupRuleVO[]>([])
const rulesLoading = ref(false)
const ruleType = ref<'position' | 'org'>('position')
const ruleValue = ref<number | undefined>(undefined)
const postOptions = ref<PostOptionVO[]>([])
const orgTree = ref<TreeNode[]>([])
let _optionsLoaded = false

async function ensureRuleOptions() {
  if (_optionsLoaded) return
  _optionsLoaded = true
  try {
    const [postRes, orgRes] = await Promise.all([getPostOptions(), getOrgTree()])
    postOptions.value = postRes.data
    orgTree.value = orgRes.data
  } catch {
    _optionsLoaded = false
  }
}

async function loadRules() {
  if (currentGroup.value === null) return
  rulesLoading.value = true
  try {
    const res = await getGroupRules(currentGroup.value.id)
    rules.value = res.data
  } finally {
    rulesLoading.value = false
  }
}

async function handleAddRule() {
  if (currentGroup.value === null) return
  if (ruleValue.value === undefined || ruleValue.value === null) {
    ElMessage.warning(ruleType.value === 'position' ? '请选择岗位' : '请选择组织机构')
    return
  }
  await addGroupRule(currentGroup.value.id, ruleType.value, ruleValue.value)
  ElMessage.success('规则已添加，符合条件的成员已自动归属')
  ruleValue.value = undefined
  await loadRules()
  searchTableRef.value?.fetchList()
}

async function handleRemoveRule(row: GroupRuleVO) {
  if (currentGroup.value === null) return
  try {
    await ElMessageBox.confirm(
      `确定删除规则「${row.ruleTypeName}：${row.ruleValueLabel}」吗？删除后规则匹配的成员将自动移出成员组。`,
      '确认删除规则',
      { type: 'warning' },
    )
    await removeGroupRule(currentGroup.value.id, row.id)
    ElMessage.success('规则已删除')
    await loadRules()
    searchTableRef.value?.fetchList()
  } catch { /* cancelled */ }
}

// ---------- 打开抽屉 ----------
async function handleManageMembers(row: MemberGroupVO) {
  currentGroup.value = row
  activeTab.value = 'members'
  memberPage.value = 1
  memberKeyword.value = ''
  pickedUserIds.value = []
  drawerVisible.value = true
  await Promise.all([loadMembers(), loadRules(), ensureRuleOptions()])
}

// ---------- 操作按钮 ----------
const actionButtons: ActionButton[] = [
  { label: '成员管理', icon: User, size: 'small', link: true, onClick: handleManageMembers },
]
</script>

<template>
  <SearchTable
    ref="searchTableRef"
    :search-fields="searchFields"
    :columns="columns"
    :action-buttons="actionButtons"
    :fetch-api="fetchApi"
    :form-config="formConfig"
  />

  <el-drawer
    v-model="drawerVisible"
    :title="`成员组管理 — ${currentGroup?.groupName ?? ''}`"
    size="760px"
    :destroy-on-close="false"
  >
    <el-tabs v-model="activeTab">
      <!-- 成员 Tab -->
      <el-tab-pane label="组成员" name="members">
        <div class="member-add-bar">
          <ApproverPicker
            v-model="pickedUserIds"
            :hide-trigger="false"
            placeholder="点击选择要添加的成员（可多选）"
            class="member-picker"
          />
          <el-button
            v-permission="'system:member-group:member'"
            type="primary"
            :icon="Plus"
            :loading="addMemberLoading"
            @click="handleAddMembers"
          >
            添加成员
          </el-button>
        </div>

        <div class="member-search-bar">
          <el-input
            v-model="memberKeyword"
            placeholder="按用户名/昵称过滤"
            clearable
            style="width: 220px"
            @keyup.enter="handleMemberSearch"
            @clear="handleMemberSearch"
          />
          <el-button @click="handleMemberSearch">查询</el-button>
        </div>

        <el-table v-loading="memberLoading" :data="memberList" size="small" class="member-table">
          <el-table-column prop="username" label="用户名" width="120" />
          <el-table-column prop="nickname" label="昵称" width="120" />
          <el-table-column prop="orgName" label="组织机构" min-width="120" />
          <el-table-column prop="postName" label="岗位" width="110" />
          <el-table-column label="来源" width="100" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.source === 'manual'" size="small">直接添加</el-tag>
              <el-tag v-else-if="row.source === 'position'" size="small" type="warning">岗位规则</el-tag>
              <el-tag v-else size="small" type="success">组织规则</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="joinedAt" label="加入时间" width="160" />
          <el-table-column label="操作" width="90" align="center">
            <template #default="{ row }">
              <el-button
                v-if="row.source === 'manual'"
                v-permission="'system:member-group:member'"
                link
                type="danger"
                size="small"
                @click="handleRemoveMember(row)"
              >
                移除
              </el-button>
              <span v-else class="rule-member-hint">随规则</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="member-pagination">
          <el-pagination
            v-model:current-page="memberPage"
            v-model:page-size="memberSize"
            :total="memberTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            small
            background
            @current-change="loadMembers"
            @size-change="handleMemberSearch"
          />
        </div>
      </el-tab-pane>

      <!-- 规则 Tab -->
      <el-tab-pane label="自动规则" name="rules">
        <div class="rule-hint">
          按维度配置关联规则，符合条件的成员将自动归属到成员组内（按岗位、按组织机构）。
        </div>

        <div class="rule-add-bar">
          <el-select v-model="ruleType" style="width: 140px" @change="ruleValue = undefined">
            <el-option label="按岗位" value="position" />
            <el-option label="按组织机构" value="org" />
          </el-select>
          <el-select
            v-if="ruleType === 'position'"
            v-model="ruleValue"
            filterable
            placeholder="选择岗位"
            style="width: 260px"
          >
            <el-option
              v-for="p in postOptions"
              :key="p.id"
              :label="`${p.postName}（${p.postCode}）`"
              :value="p.id"
            />
          </el-select>
          <el-tree-select
            v-else
            v-model="ruleValue"
            :data="orgTree"
            :props="{ label: 'label', value: 'id', children: 'children' }"
            check-strictly
            filterable
            clearable
            placeholder="选择组织机构"
            style="width: 260px"
          />
          <el-button v-permission="'system:member-group:rule'" type="primary" :icon="Plus" @click="handleAddRule">
            添加规则
          </el-button>
        </div>

        <el-table v-loading="rulesLoading" :data="rules" size="small" class="rule-table">
          <el-table-column prop="ruleTypeName" label="规则维度" width="110" align="center" />
          <el-table-column prop="ruleValueLabel" label="匹配对象" min-width="180" />
          <el-table-column prop="createdAt" label="创建时间" width="160" />
          <el-table-column label="操作" width="90" align="center">
            <template #default="{ row }">
              <el-button
                v-permission="'system:member-group:rule'"
                link
                type="danger"
                size="small"
                @click="handleRemoveRule(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<style scoped>
.member-add-bar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

.member-picker {
  flex: 1;
  min-width: 0;
}

.member-search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.member-table {
  width: 100%;
}

.rule-member-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary, #8b91ab);
}

.member-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.rule-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary, #8b91ab);
  line-height: 1.5;
  margin-bottom: 10px;
}

.rule-add-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.rule-table {
  width: 100%;
}
</style>
