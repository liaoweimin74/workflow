<script setup lang="ts">
defineOptions({ name: 'DictManagement' })

/**
 * 字典管理：左「类型导航（SideNavList）」+ 右「字典项表格（SearchTable）」。
 *
 * Task 115：重构为左导航列表 + 右表格，消灭 LookupPicker 反模式（dictCode
 * 由选中上下文注入）、修复 createTime→createdAt 列错绑。
 * Task 117：左栏抽为公共组件 SideNavList——本页成为第一个消费方，
 * 业务数据由本页管理（受控模式），组件零字典语义。
 */

import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Switch as SwitchIcon, Edit, Delete, CopyDocument } from '@element-plus/icons-vue'
import { SearchTable, SideNavList } from '@/components/business'
import type { SearchField, TableColumn, FormConfig, NavItem, NavItemAction } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import {
  getDictTypeList, createDictType, updateDictType, deleteDictType,
  getDictDataList, createDictData, updateDictData, deleteDictData,
} from '@/api/dict'
import type { DictTypeVO, DictDataVO } from '@/types/dict'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// ================= 字典类型（左栏数据源） =================
const types = ref<DictTypeVO[]>([])
const typesLoading = ref(false)
const selectedType = ref<DictTypeVO | null>(null)
const dataTableRef = ref()

const canCreate = computed(() => authStore.hasPermission('system:dict:create'))
const canUpdate = computed(() => authStore.hasPermission('system:dict:update'))
const canDelete = computed(() => authStore.hasPermission('system:dict:delete'))

/** DTO → NavItem 映射（Task 117：映射归父级，组件保持通用） */
const navItems = computed<NavItem[]>(() =>
  types.value.map((t) => ({
    key: t.id,
    title: t.dictName,
    subtitle: t.dictCode,
    disabled: t.status !== 1,
    disabledLabel: '停用',
    raw: t,
  })),
)

/** 行内操作：启停 / 编辑 / 删除（谓词控制权限禁用） */
const navActions = computed<NavItemAction[]>(() => [
  {
    label: '启用/停用',
    icon: SwitchIcon,
    disabled: () => !canUpdate.value,
    onClick: (item) => toggleTypeStatus(item.raw as DictTypeVO),
  },
  {
    label: '编辑',
    icon: Edit,
    disabled: () => !canUpdate.value,
    onClick: (item) => openTypeEdit(item.raw as DictTypeVO),
  },
  {
    label: '删除',
    icon: Delete,
    type: 'danger',
    disabled: () => !canDelete.value,
    onClick: (item) => removeType(item.raw as DictTypeVO),
  },
])

async function fetchTypes(): Promise<void> {
  typesLoading.value = true
  try {
    const res = await getDictTypeList({ page: 1, size: 999 })
    types.value = res.data.rows ?? []
    // 选中项若被删/停用列表刷新后仍保留原选中（按 id 回查），否则回落到第一个
    const keep = selectedType.value ? types.value.find((t) => t.id === selectedType.value!.id) : null
    selectedType.value = keep ?? types.value[0] ?? null
  } finally {
    typesLoading.value = false
  }
}

function handleSelect(item: NavItem): void {
  const row = item.raw as DictTypeVO
  if (selectedType.value?.id === row.id) return
  selectedType.value = row
}

// ================= 类型新建/编辑/删除/启停 =================
const typeDialogVisible = ref(false)
const typeEditing = ref<DictTypeVO | null>(null) // null = 新建
const typeForm = ref({ dictName: '', dictCode: '', remark: '' })
const typeSubmitting = ref(false)
const typeFormRef = ref()
const typeRules = {
  dictName: [{ required: true, message: '请输入字典名称', trigger: 'blur' }],
  dictCode: [
    { required: true, message: '请输入字典编码', trigger: 'blur' },
    { pattern: /^[A-Za-z][A-Za-z0-9_]*$/, message: '字母开头，仅字母/数字/下划线', trigger: 'blur' },
  ],
}

function openTypeCreate(): void {
  typeEditing.value = null
  typeForm.value = { dictName: '', dictCode: '', remark: '' }
  typeDialogVisible.value = true
  nextTick(() => typeFormRef.value?.clearValidate())
}

function openTypeEdit(row: DictTypeVO): void {
  typeEditing.value = row
  typeForm.value = { dictName: row.dictName, dictCode: row.dictCode, remark: row.remark ?? '' }
  typeDialogVisible.value = true
  nextTick(() => typeFormRef.value?.clearValidate())
}

async function submitType(): Promise<void> {
  await typeFormRef.value?.validate().catch(() => Promise.reject(new Error('invalid')))
  typeSubmitting.value = true
  try {
    if (typeEditing.value) {
      // 编辑：后端 DictTypeUpdateForm 仅支持 dictName/remark/status（dictCode 不可变）
      await updateDictType(typeEditing.value.id, {
        dictName: typeForm.value.dictName,
        remark: typeForm.value.remark,
      })
      ElMessage.success('字典类型已更新')
    } else {
      await createDictType({
        dictName: typeForm.value.dictName,
        dictCode: typeForm.value.dictCode,
        remark: typeForm.value.remark,
      })
      ElMessage.success('字典类型已创建')
    }
    typeDialogVisible.value = false
    await fetchTypes()
  } finally {
    typeSubmitting.value = false
  }
}

async function removeType(row: DictTypeVO): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除字典类型「${row.dictName}」将连带其全部字典项，且不可恢复。确定删除？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await deleteDictType(row.id)
  ElMessage.success('删除成功')
  if (selectedType.value?.id === row.id) selectedType.value = null
  await fetchTypes()
}

async function toggleTypeStatus(row: DictTypeVO): Promise<void> {
  await updateDictType(row.id, { status: row.status === 1 ? 0 : 1 })
  ElMessage.success(row.status === 1 ? '已停用' : '已启用')
  await fetchTypes()
}

// ================= 字典项（右栏 SearchTable） =================
const dataSearchFields: SearchField[] = [
  { type: 'input', label: '标签', prop: 'label', placeholder: '输入标签' },
  { type: 'input', label: '值', prop: 'value', placeholder: '输入值' },
]

// Task 115 修复：后端字段为 createdAt（旧版绑 createTime 恒空白）
const dataColumns: TableColumn[] = [
  { prop: 'label', label: '标签', minWidth: 150 },
  { prop: 'value', label: '值', width: 150 },
  { prop: 'sortOrder', label: '排序', width: 80 },
  { prop: 'createdAt', label: '创建时间', width: 170 },
]

const dataFetchApi = async (p: any) => {
  if (!selectedType.value) return { rows: [], total: 0 }
  const res = await getDictDataList(selectedType.value.dictCode)
  let list = (res.data as any[]) || []
  if (p.label) list = list.filter((d: any) => d.label?.includes(p.label))
  if (p.value) list = list.filter((d: any) => d.value?.includes(p.value))
  const total = list.length
  const start = ((p.page || 1) - 1) * (p.size || 10)
  return { rows: list.slice(start, start + (p.size || 10)), total }
}

/** Task 115：表单去掉 LookupPicker——dictCode 由左侧选中上下文注入 */
const dataFormConfig = computed<FormConfig<DictDataVO>>(() => ({
  initialValues: selectedType.value ? { dictCode: selectedType.value.dictCode } : {},
  rule: [
    { type: 'input', field: 'label', title: '标签', validate: [{ required: true, message: '请输入标签', trigger: 'blur' }] },
    { type: 'input', field: 'value', title: '值', validate: [{ required: true, message: '请输入值', trigger: 'blur' }] },
    { type: 'input', field: 'sortOrder', title: '排序' },
  ] as Rule[],
  createApi: async (data: any) => createDictData({ ...data, dictCode: selectedType.value?.dictCode }) as any,
  updateApi: (id, data) => updateDictData(id as number, { ...data, dictCode: selectedType.value?.dictCode }) as any,
  deleteApi: deleteDictData as any,
  getApi: async (id: any) => {
    if (!selectedType.value) return {} as any
    const res = await getDictDataList(selectedType.value.dictCode)
    return (res.data as any[]).find((d) => d.id === id) ?? ({} as any)
  },
  dialogTitle: { create: '新增字典项', edit: '编辑字典项' },
  createPermission: 'system:dict:create',
  editPermission: 'system:dict:update',
  deletePermission: 'system:dict:delete',
}))

const dataActionButtons = [
  {
    label: '启用/停用', icon: SwitchIcon, size: 'small', link: true,
    onClick: async (row: DictDataVO) => {
      await updateDictData(row.id, { status: row.status === 1 ? 0 : 1 } as any)
      dataTableRef.value?.fetchList()
    },
  },
]

// 选中类型变化 → 刷新右表（用 dictCode 做依赖，避免同对象替换触发重复请求）
watch(() => selectedType.value?.dictCode, () => {
  // fetchList 可选调用：SearchTable stub/测试环境可能未暴露该方法
  dataTableRef.value?.fetchList?.()
})

// 复制字典编码（表头标签）
async function copyDictCode(): Promise<void> {
  const code = selectedType.value?.dictCode
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success(`已复制 ${code}`)
  } catch {
    ElMessage.warning('复制失败，请手动选择复制')
  }
}

onMounted(fetchTypes)
</script>

<template>
  <!-- Task 117：左栏换用公共组件 SideNavList；窄屏上下堆叠（flex-col），lg 起左右分栏 -->
  <div class="flex flex-col lg:flex-row gap-3 h-full min-h-0">
    <!-- ── 左栏：字典类型导航 ── -->
    <SideNavList
      title="字典类型"
      :items="navItems"
      :selected-key="selectedType?.id ?? null"
      :loading="typesLoading"
      :actions="navActions"
      :creatable="true"
      create-label="新增字典类型"
      :create-disabled="!canCreate"
      filter-placeholder="搜索名称 / 编码"
      filter-aria-label="搜索字典类型"
      :empty-text="types.length === 0 ? '暂无字典类型' : '无匹配类型'"
      empty-hint="点击右上角 + 新建"
      @select="handleSelect"
      @create="openTypeCreate"
    />

    <!-- ── 右栏：字典项表格 ── -->
    <el-card v-if="selectedType" class="flex-1 min-w-0" shadow="never">
      <template #header>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-bold">字典数据</span>
          <span class="text-sm text-gray-500">— {{ selectedType.dictName }}</span>
          <!-- 编码可直接复制，供表单设计器引用 -->
          <el-tag
            class="cursor-pointer" size="small" effect="plain" type="info"
            :title="`点击复制 ${selectedType.dictCode}`"
            @click="copyDictCode"
          >
            <el-icon class="align-middle mr-0.5"><CopyDocument /></el-icon>
            {{ selectedType.dictCode }}
          </el-tag>
        </div>
      </template>
      <SearchTable
        ref="dataTableRef"
        :search-fields="dataSearchFields"
        :columns="dataColumns"
        :action-buttons="dataActionButtons"
        table-size="small"
        :fetch-api="dataFetchApi"
        :form-config="dataFormConfig"
      />
    </el-card>

    <!-- 未选中占位（理论上进入即自动选中第一个，防御性保留） -->
    <div v-else class="flex-1 flex items-center justify-center text-gray-400 text-sm">
      {{ types.length === 0 ? '请先创建字典类型' : '请选择左侧字典类型' }}
    </div>

    <!-- ── 类型新建/编辑弹窗（轻量三字段；编辑时编码不可变） ── -->
    <el-dialog
      v-model="typeDialogVisible"
      :title="typeEditing ? '编辑字典类型' : '新增字典类型'"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form ref="typeFormRef" :model="typeForm" :rules="typeRules" label-width="82px">
        <el-form-item label="字典名称" prop="dictName">
          <el-input v-model="typeForm.dictName" placeholder="如：审批意见类型" maxlength="50" />
        </el-form-item>
        <el-form-item label="字典编码" prop="dictCode">
          <el-input
            v-model="typeForm.dictCode" placeholder="如：opinion_type"
            maxlength="50" :disabled="!!typeEditing"
          />
          <div v-if="typeEditing" class="text-xs text-gray-400 leading-4 mt-0.5">
            编码创建后不可修改（已被字典项与业务引用）
          </div>
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="typeForm.remark" type="textarea" :rows="2" maxlength="200" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="typeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="typeSubmitting" @click="submitType">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
