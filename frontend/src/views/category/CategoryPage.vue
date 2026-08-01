<template>
  <div class="category-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>流程分类管理</span>
          <el-button type="primary" :icon="Plus" @click="handleAdd(null)">新建分类</el-button>
        </div>
      </template>

      <el-table
        :data="categoryTree"
        row-key="id"
        border
        default-expand-all
        :tree-props="{ children: 'children' }"
        v-loading="loading"
      >
        <el-table-column prop="name" label="分类名称" min-width="200" />

        <el-table-column prop="sortOrder" label="排序" width="80" align="center" />

        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleAdd(row)">添加子分类</el-button>
            <el-button type="warning" link size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="500px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item v-if="form.parentName" label="父分类">
          <el-input v-model="form.parentName" disabled />
        </el-form-item>

        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入分类名称" />
        </el-form-item>

        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="999" controls-position="right" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { categoryApi, type Category, type CategoryTreeNode } from '@/api/category'

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const dialogTitle = ref('')
const categoryTree = ref<CategoryTreeNode[]>([])
const formRef = ref<FormInstance>()

const form = reactive({
  id: '',
  name: '',
  parentId: null as string | null,
  parentName: '',
  sortOrder: 0
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }]
}

onMounted(() => {
  loadData()
})

async function loadData() {
  loading.value = true
  try {
    const res = await categoryApi.list()
    const flat = res.data || []
    categoryTree.value = buildTree(flat)
  } catch (err: any) {
    ElMessage.error('加载分类失败: ' + (err?.message || err))
  } finally {
    loading.value = false
  }
}

function buildTree(items: Category[]): CategoryTreeNode[] {
  const map = new Map<string, CategoryTreeNode>()
  const roots: CategoryTreeNode[] = []

  // 初始化所有节点
  items.forEach(item => {
    map.set(item.id, { ...item, children: [] })
  })

  // 构建树
  items.forEach(item => {
    const node = map.get(item.id)!
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  // 排序
  const sortNodes = (nodes: CategoryTreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder)
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)

  return roots
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function handleAdd(parent: Category | null) {
  dialogTitle.value = parent ? '添加子分类' : '新建分类'
  resetForm()
  if (parent) {
    form.parentId = parent.id
    form.parentName = parent.name
  }
  dialogVisible.value = true
}

function handleEdit(row: Category) {
  dialogTitle.value = '编辑分类'
  resetForm()
  form.id = row.id
  form.name = row.name
  form.parentId = row.parentId
  form.sortOrder = row.sortOrder
  dialogVisible.value = true
}

async function handleDelete(row: Category) {
  try {
    await ElMessageBox.confirm(`确定要删除分类「${row.name}」吗？`, '提示', {
      type: 'warning'
    })
    await categoryApi.delete(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败: ' + (err?.message || err))
    }
  }
}

function resetForm() {
  form.id = ''
  form.name = ''
  form.parentId = null
  form.parentName = ''
  form.sortOrder = 0
  formRef.value?.resetFields()
}

async function handleSubmit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return

    submitting.value = true
    try {
      const data = {
        name: form.name,
        parentId: form.parentId,
        sortOrder: form.sortOrder
      }

      if (form.id) {
        await categoryApi.update(form.id, data)
        ElMessage.success('修改成功')
      } else {
        await categoryApi.create(data)
        ElMessage.success('创建成功')
      }

      dialogVisible.value = false
      loadData()
    } catch (err: any) {
      ElMessage.error('操作失败: ' + (err?.message || err))
    } finally {
      submitting.value = false
    }
  })
}
</script>

<style scoped>
.category-page {
  padding: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
