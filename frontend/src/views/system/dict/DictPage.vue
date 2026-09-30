<script setup lang="ts">
defineOptions({ name: 'DictManagement' })

/**
 * Task 115：字典管理交互重构——左「类型导航列表」+ 右「字典项表格」。
 *
 * 旧版问题（左表右表双 SearchTable）：
 * 1. 字典类型是小集合（通常 5~20 条），用 520px 宽的完整表格（搜索栏+分页+多列）承载，空间利用率低；
 * 2. LookupPicker 反模式：左侧已选中类型，右侧新增字典项弹窗里还要再弹窗选一遍「字典分类」，
 *    编辑回显还需 3 次额外请求拼 lookup 行；
 * 3. 父子分页联动脆弱：左表翻页后 selectedType 悬空，右表数据与选中态可能错位；
 * 4. 既有 bug：列绑 createTime，而前后端实际字段是 createdAt（列恒为空白）。
 *
 * 新版交互（对齐若依系标准形态）：
 * - 左栏收窄为 260px 导航列表：本地过滤、选中高亮、停用灰显、hover 行内启停/编辑/删除；
 * - 右侧仅保留字典项 SearchTable，dictCode 由上下文自动注入表单（不再二次选择）；
 * - 进入页面自动选中第一个类型（减少一次无意义点击）；
 * - 响应式：窄屏上下堆叠。
 */

import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Edit, Delete, Switch as SwitchIcon, CopyDocument } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import {
  getDictTypeList, createDictType, updateDictType, deleteDictType,
  getDictDataList, createDictData, updateDictData, deleteDictData,
} from '@/api/dict'
import type { DictTypeVO, DictDataVO } from '@/types/dict'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// ================= 共享状态 =================
const types = ref<DictTypeVO[]>([])
const typesLoading = ref(false)
const selectedType = ref<DictTypeVO | null>(null)
const dataTableRef = ref()

const canCreate = computed(() => authStore.hasPermission('system:dict:create'))
const canUpdate = computed(() => authStore.hasPermission('system:dict:update'))
const canDelete = computed(() => authStore.hasPermission('system:dict:delete'))

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

function selectType(row: DictTypeVO): void {
  if (selectedType.value?.id === row.id) return
  selectedType.value = row
}

// ================= 左栏：过滤 =================
const typeKeyword = ref('')
const filteredTypes = computed(() => {
  const kw = typeKeyword.value.trim().toLowerCase()
  if (!kw) return types.value
  return types.value.filter(
    (t) => t.dictName?.toLowerCase().includes(kw) || t.dictCode?.toLowerCase().includes(kw),
  )
})

// ================= 左栏：类型新建/编辑/删除/启停 =================
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

// ================= 右栏：字典项表格 =================
const dataSearchFields: SearchField[] = [
  { type: 'input', label: '标签', prop: 'label', placeholder: '输入标签' },
  { type: 'input', label: '值', prop: 'value', placeholder: '输入值' },
]

// 修复 Task 115：后端字段为 createdAt（旧版绑 createTime 恒空白）
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

/**
 * Task 115：表单去掉 LookupPicker——dictCode 由左侧选中上下文注入，
 * 新增/编辑均不再弹「选择字典分类」二级弹窗。
 */
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
  <!-- Task 115：左导航 + 右表格；窄屏上下堆叠（flex-col），lg 起左右分栏 -->
  <div class="flex flex-col lg:flex-row gap-3 h-full min-h-0">
    <!-- ── 左栏：字典类型导航列表 ── -->
    <el-card class="type-sidebar" :body-style="{ padding: '0' }" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-sm font-bold">字典类型</span>
          <el-tooltip content="新增字典类型" placement="top">
            <el-button
              type="primary" :icon="Plus" size="small" circle
              aria-label="新增字典类型"
              :disabled="!canCreate" @click="openTypeCreate"
            />
          </el-tooltip>
        </div>
      </template>

      <!-- 本地过滤（类型为小集合，不需要独立搜索请求） -->
      <div class="px-3 pt-2 pb-1">
        <el-input
          v-model="typeKeyword" placeholder="搜索名称 / 编码" :prefix-icon="Search"
          size="small" clearable aria-label="搜索字典类型"
        />
      </div>

      <el-scrollbar class="type-list" role="listbox" aria-label="字典类型列表">
        <div v-if="typesLoading" class="p-4 text-center text-xs text-gray-400">加载中…</div>
        <div v-else-if="filteredTypes.length === 0" class="p-4 text-center text-xs text-gray-400">
          {{ typeKeyword ? '无匹配类型' : '暂无字典类型，点击右上角 + 新建' }}
        </div>
        <div
          v-for="t in filteredTypes" :key="t.id"
          class="type-item"
          :class="{ 'is-active': selectedType?.id === t.id, 'is-disabled': t.status !== 1 }"
          role="option"
          :aria-selected="selectedType?.id === t.id"
          tabindex="0"
          @click="selectType(t)"
          @keydown.enter="selectType(t)"
          @keydown.space.prevent="selectType(t)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="type-name" :title="t.dictName">{{ t.dictName }}</span>
              <el-tag v-if="t.status !== 1" size="small" type="info" effect="plain">停用</el-tag>
            </div>
            <div class="type-code" :title="t.dictCode">{{ t.dictCode }}</div>
          </div>
          <!-- hover 行内操作：启停 / 编辑 / 删除 -->
          <div class="type-actions" @click.stop>
            <el-tooltip content="启用/停用" placement="top">
              <el-button
                :icon="SwitchIcon" size="small" link
                :disabled="!canUpdate" @click="toggleTypeStatus(t)"
              />
            </el-tooltip>
            <el-tooltip content="编辑" placement="top">
              <el-button
                :icon="Edit" size="small" link
                :disabled="!canUpdate" @click="openTypeEdit(t)"
              />
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button
                :icon="Delete" size="small" link type="danger"
                :disabled="!canDelete" @click="removeType(t)"
              />
            </el-tooltip>
          </div>
        </div>
      </el-scrollbar>
    </el-card>

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

<style scoped>
.type-sidebar {
  width: 100%;
  flex-shrink: 0;
}
@media (min-width: 1024px) {
  .type-sidebar {
    width: 264px;
  }
}
.type-list {
  /* 视口高度 - 顶栏/页签/卡头/搜索框的保守下限，滚动交给 el-scrollbar */
  height: calc(100vh - 320px);
  min-height: 240px;
}
.type-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background-color 0.15s ease;
}
.type-item:hover {
  background-color: var(--el-fill-color-light);
}
.type-item.is-active {
  background-color: var(--el-color-primary-light-9);
  border-left-color: var(--el-color-primary);
}
.type-item.is-disabled .type-name,
.type-item.is-disabled .type-code {
  opacity: 0.5;
}
.type-item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
.type-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.type-code {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
/* 行内操作默认隐藏，hover/focus/选中时浮现（键盘可达） */
.type-actions {
  display: none;
  flex-shrink: 0;
}
.type-item:hover .type-actions,
.type-item:focus-within .type-actions,
.type-item.is-active .type-actions {
  display: inline-flex;
}
</style>
