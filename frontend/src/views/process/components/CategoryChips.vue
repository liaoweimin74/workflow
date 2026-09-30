<template>
  <!--
    Task 105：流程分类胶囊条（替代原左侧分类树表）。
    · 点击胶囊 → 筛选该分类流程；「全部」= 不筛选
    · 内联维护：「＋」新建 / 双击胶囊改名 / hover 出 ✕ 删除（权限点分别控制）
    · 分类扁平无层级；新建自动排到最后（后端 max+1），无排序输入
  -->
  <div class="category-chips" role="group" aria-label="流程分类筛选">
    <span
      class="chip"
      :class="{ active: modelValue === null }"
      role="button"
      tabindex="0"
      @click="select(null)"
      @keydown.enter.prevent="select(null)"
    >全部</span>

    <template v-for="cat in categories" :key="cat.id">
      <!-- 改名态：原位输入框 -->
      <el-input
        v-if="renamingId === cat.id"
        :ref="setRenameRef"
        v-model="renameValue"
        class="chip-input"
        size="small"
        :maxlength="50"
        aria-label="修改分类名称"
        @keydown.enter.prevent="confirmRename"
        @keydown.esc.prevent="cancelRename"
        @blur="confirmRename"
      />
      <!-- 展示态 -->
      <span
        v-else
        class="chip"
        :class="{ active: modelValue === cat.id }"
        role="button"
        tabindex="0"
        :title="canRename ? `${cat.name}（双击重命名）` : cat.name"
        @click="select(cat.id)"
        @keydown.enter.prevent="select(cat.id)"
        @dblclick="canRename && startRename(cat)"
      >
        <span class="chip-name">{{ cat.name }}</span>
        <el-icon
          v-if="canDelete"
          class="chip-delete"
          title="删除分类"
          @click.stop="remove(cat)"
        ><Close /></el-icon>
      </span>
    </template>

    <!-- 新建态 -->
    <el-input
      v-if="creating"
      ref="createInputRef"
      v-model="createValue"
      class="chip-input"
      size="small"
      :maxlength="50"
      placeholder="分类名称，回车确认"
      aria-label="新建分类"
      @keydown.enter.prevent="confirmCreate"
      @keydown.esc.prevent="cancelCreate"
      @blur="confirmCreate"
    />
    <span
      v-else-if="canCreate"
      class="chip chip-add"
      role="button"
      tabindex="0"
      title="新建分类"
      @click="startCreate"
      @keydown.enter.prevent="startCreate"
    >
      <el-icon><Plus /></el-icon>
    </span>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, computed, onBeforeUpdate } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close, Plus } from '@element-plus/icons-vue'
import { categoryApi, type Category } from '@/api/category'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  /** 分类列表（父页面持有，刷新后传入） */
  categories: Category[]
  /** 当前选中分类 id；null = 全部 */
  modelValue: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', id: string | null): void
  /** 分类增删改成功后通知父页面重新拉取列表（分类 + 流程表） */
  (e: 'changed'): void
}>()

const authStore = useAuthStore()
const canCreate = computed(() => authStore.hasPermission('process:category:create'))
const canRename = computed(() => authStore.hasPermission('process:category:update'))
const canDelete = computed(() => authStore.hasPermission('process:category:delete'))

// ------------------------------------------------------------ 选中
function select(id: string | null) {
  // 改名/新建输入态下点击其他胶囊：先退出输入态再切换
  cancelRename()
  cancelCreate()
  emit('update:modelValue', id)
}

// ------------------------------------------------------------ 新建（内联）
const creating = ref(false)
const createValue = ref('')
const createInputRef = ref()
/** 防止 Enter 提交后 input 卸载触发的 blur 造成二次提交 */
let createSettled = false

async function startCreate() {
  cancelRename()
  creating.value = true
  createValue.value = ''
  createSettled = false
  await nextTick()
  createInputRef.value?.focus?.()
}

async function confirmCreate() {
  if (!creating.value || createSettled) return
  const name = createValue.value.trim()
  if (!name) {
    cancelCreate()
    return
  }
  createSettled = true
  try {
    await categoryApi.create({ name })
    ElMessage.success('分类已创建')
    creating.value = false
    emit('changed')
  } catch {
    // http 拦截器已弹出后端错误消息；保持输入态便于修正
    createSettled = false
  }
}

function cancelCreate() {
  creating.value = false
  createValue.value = ''
}

// ------------------------------------------------------------ 改名（内联）
const renamingId = ref<string | null>(null)
const renameValue = ref('')
let renameInputRef: any = null
/** 防止 Enter 提交后 input 卸载触发的 blur 造成二次提交 */
let renameSettled = false

onBeforeUpdate(() => {
  renameInputRef = null
})

function setRenameRef(el: any) {
  renameInputRef = el
}

async function startRename(cat: Category) {
  cancelCreate()
  renamingId.value = cat.id
  renameValue.value = cat.name
  renameSettled = false
  await nextTick()
  renameInputRef?.focus?.()
}

async function confirmRename() {
  if (!renamingId.value || renameSettled) return
  const name = renameValue.value.trim()
  const original = props.categories.find(c => c.id === renamingId.value)
  if (!name || (original && name === original.name)) {
    cancelRename()
    return
  }
  renameSettled = true
  try {
    await categoryApi.update(renamingId.value, { name })
    ElMessage.success('分类已更新')
    renamingId.value = null
    emit('changed')
  } catch {
    renameSettled = false
  }
}

function cancelRename() {
  renamingId.value = null
  renameValue.value = ''
}

// ------------------------------------------------------------ 删除
async function remove(cat: Category) {
  try {
    await ElMessageBox.confirm(
      `确定删除分类「${cat.name}」吗？分类下存在流程时将无法删除。`,
      '删除分类',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await categoryApi.delete(cat.id)
    ElMessage.success('分类已删除')
    if (props.modelValue === cat.id) emit('update:modelValue', null)
    emit('changed')
  } catch {
    // http 拦截器已弹出错误消息（如「该分类下存在流程…」）
  }
}
</script>

<style scoped>
.category-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  transition: color 0.15s, border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}

.chip:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

.chip:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: 1px;
}

.chip.active {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}

.chip.active:hover {
  color: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
}

.chip-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-delete {
  font-size: 12px;
  margin-right: -6px;
  padding: 1px;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s, background-color 0.15s;
}

.chip:hover .chip-delete,
.chip:focus-within .chip-delete {
  opacity: 0.75;
}

.chip-delete:hover {
  opacity: 1 !important;
  background: rgba(0, 0, 0, 0.12);
}

.chip.active .chip-delete:hover {
  background: rgba(255, 255, 255, 0.25);
}

.chip-add {
  padding: 0 10px;
  color: var(--el-text-color-secondary);
  border-style: dashed;
}

.chip-add:hover {
  color: var(--el-color-primary);
  border-style: solid;
}

.chip-input {
  width: 140px;
}

.chip-input :deep(.el-input__wrapper) {
  border-radius: 999px;
}
</style>
