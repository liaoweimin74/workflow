<template>
  <div class="process-list-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>流程定义管理</span>
          <el-button type="primary" :icon="Plus" @click="handleCreate">新建流程</el-button>
        </div>
      </template>

      <div class="filter-bar">
        <el-input
          v-model="searchName"
          placeholder="搜索流程名称"
          :prefix-icon="Search"
          clearable
          style="width: 250px"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-cascader
          v-model="searchCategoryId"
          :options="categoryOptions"
          :props="{ checkStrictly: true, value: 'id', label: 'name', emitPath: false }"
          placeholder="选择分类"
          clearable
          style="width: 200px; margin-left: 12px"
          @change="handleSearch"
        />
        <el-button type="primary" @click="handleSearch" style="margin-left: 12px">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </div>

      <el-table :data="tableData" border v-loading="loading" style="margin-top: 16px">
        <el-table-column prop="name" label="流程名称" min-width="180" />

        <el-table-column prop="key" label="流程标识" width="180" />

        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'DEPLOYED' ? 'success' : 'info'" size="small">
              {{ row.status === 'DEPLOYED' ? '已部署' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="version" label="版本" width="80" align="center" />

        <el-table-column prop="updatedAt" label="更新时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.updatedAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleDesign(row)">设计</el-button>
            <el-button type="success" link size="small" @click="handleDeploy(row)">部署</el-button>
            <el-button type="warning" link size="small" @click="handleCopy(row)">复制</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- 新建流程对话框 -->
    <el-dialog v-model="createDialogVisible" title="新建流程" width="500px">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="80px">
        <el-form-item label="流程名称" prop="name">
          <el-input v-model="createForm.name" placeholder="请输入流程名称" />
        </el-form-item>
        <el-form-item label="流程标识" prop="key">
          <el-input v-model="createForm.key" placeholder="如：leave_approval" />
        </el-form-item>
        <el-form-item label="分类">
          <el-cascader
            v-model="createForm.categoryId"
            :options="categoryOptions"
            :props="{ checkStrictly: true, value: 'id', label: 'name', emitPath: false }"
            placeholder="选择分类"
            clearable
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreateSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { processDesignApi, type ProcessDraft } from '@/api/processDefinition'
import { categoryApi, type Category } from '@/api/category'

const router = useRouter()

const loading = ref(false)
const submitting = ref(false)
const tableData = ref<ProcessDraft[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(20)

const searchName = ref('')
const searchCategoryId = ref<string | null>(null)
const categoryOptions = ref<Category[]>([])

const createDialogVisible = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = reactive({
  name: '',
  key: '',
  categoryId: null as string | null
})
const createRules: FormRules = {
  name: [{ required: true, message: '请输入流程名称', trigger: 'blur' }],
  key: [
    { required: true, message: '请输入流程标识', trigger: 'blur' },
    { pattern: /^[a-z][a-z0-9_]*$/, message: '只能包含小写字母、数字、下划线，且以字母开头', trigger: 'blur' }
  ]
}

onMounted(() => {
  loadCategories()
  loadData()
})

async function loadCategories() {
  try {
    const res = await categoryApi.list()
    categoryOptions.value = buildTree(res.data || [])
  } catch {
    // ignore
  }
}

function buildTree(items: Category[]): any[] {
  const map = new Map<string, any>()
  const roots: any[] = []
  items.forEach(item => map.set(item.id, { ...item, children: [] }))
  items.forEach(item => {
    const node = map.get(item.id)!
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId).children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

async function loadData() {
  loading.value = true
  try {
    const res = await processDesignApi.listDrafts({
      page: page.value - 1,
      size: size.value,
      name: searchName.value || undefined,
      categoryId: searchCategoryId.value || undefined
    })
    const data = res.data as any
    tableData.value = data.content || data.rows || []
    total.value = data.totalElements || data.total || 0
  } catch (err: any) {
    ElMessage.error('加载失败: ' + (err?.message || err))
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  loadData()
}

function handleReset() {
  searchName.value = ''
  searchCategoryId.value = null
  page.value = 1
  loadData()
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function handleCreate() {
  createForm.name = ''
  createForm.key = ''
  createForm.categoryId = null
  createDialogVisible.value = true
}

async function handleCreateSubmit() {
  if (!createFormRef.value) return
  await createFormRef.value.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      const res = await processDesignApi.createDraft(
        createForm.name,
        createForm.key,
        createForm.categoryId || undefined
      )
      ElMessage.success('创建成功')
      createDialogVisible.value = false
      // 跳转到设计器
      router.push({ path: '/designer', query: { id: res.data.id } })
    } catch (err: any) {
      ElMessage.error('创建失败: ' + (err?.message || err))
    } finally {
      submitting.value = false
    }
  })
}

function handleDesign(row: ProcessDraft) {
  router.push({ path: '/designer', query: { id: row.id } })
}

async function handleDeploy(row: ProcessDraft) {
  try {
    await ElMessageBox.confirm('确定要部署此流程吗？', '确认', { type: 'warning' })
    await processDesignApi.deploy(row.id)
    ElMessage.success('部署成功')
    loadData()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('部署失败: ' + (err?.message || err))
    }
  }
}

async function handleCopy(row: ProcessDraft) {
  try {
    await processDesignApi.copyProcess(row.id)
    ElMessage.success('复制成功')
    loadData()
  } catch (err: any) {
    ElMessage.error('复制失败: ' + (err?.message || err))
  }
}

async function handleDelete(row: ProcessDraft) {
  try {
    await ElMessageBox.confirm(`确定要删除流程「${row.name}」吗？`, '提示', { type: 'warning' })
    await processDesignApi.deleteDraft(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败: ' + (err?.message || err))
    }
  }
}
</script>

<style scoped>
.process-list-page {
  padding: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filter-bar {
  display: flex;
  align-items: center;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
