<template>
  <div class="material-list-page">
    <el-card style="overflow: hidden">
      <SearchTable
        ref="tableRef"
        :search-fields="searchFields"
        :columns="columns"
        :action-buttons="actionButtons"
        :fetch-api="fetchApi"
        :default-page-size="20"
        :max-visible-buttons="4"
        :show-selection="canManage"
        @selection-change="onSelectionChange"
      >
        <template #default>
          <el-button
            type="primary"
            :icon="Upload"
            v-permission="'material:manage'"
            data-testid="upload-btn"
            @click="openUpload"
          >
            上传物料
          </el-button>
          <el-button
            :icon="Download"
            v-permission="'material:manage'"
            data-testid="export-btn"
            :loading="exporting"
            @click="submitExport"
          >
            导出选中{{ selectedRows.length ? `（${selectedRows.length}）` : '' }}
          </el-button>
          <el-button
            :icon="UploadFilled"
            v-permission="'material:manage'"
            data-testid="import-btn"
            @click="openImport"
          >
            导入物料包
          </el-button>
          <el-button
            :icon="Document"
            v-permission="'material:manage'"
            data-testid="template-btn"
            :loading="downloadingTemplate"
            @click="submitTemplate"
          >
            下载工程模板
          </el-button>
        </template>
        <template #type="{ row }">
          <el-tag :type="row.type === 'PAGE' ? 'primary' : 'success'">
            {{ row.type === 'PAGE' ? '页面' : '组件' }}
          </el-tag>
        </template>
        <template #status="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'">
            {{ row.status === 1 ? '启用' : '停用' }}
          </el-tag>
        </template>
        <template #fileSize="{ row }">
          {{ formatSize(row.fileSize) }}
        </template>
        <template #createdAt="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </SearchTable>
    </el-card>

    <!-- 上传物料：脚手架产物 bundle.js + manifest.json 两个文件 -->
    <el-dialog v-model="uploadVisible" title="上传物料" width="560px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="用 material-scaffold 脚手架产出 bundle 与 manifest 两个文件一起上传：页面型 pnpm build（dist/page），组件型 pnpm build:widget（dist/widget）"
        class="upload-tip"
      />
      <div class="file-row">
        <span class="file-label">bundle 文件</span>
        <input type="file" accept=".js,.mjs" data-testid="bundle-input" @change="onFilePick('bundle', $event)" />
      </div>
      <div class="file-row">
        <span class="file-label">manifest 文件</span>
        <input type="file" accept=".json,application/json" data-testid="manifest-input" @change="onFilePick('manifest', $event)" />
      </div>
      <p class="picked">已选：{{ pickedText }}</p>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="同 key 覆盖上传会把平台侧版本 +1，旧 bundle 立即失效（请确认使用者已刷新页面）"
        class="upload-tip"
      />
      <template #footer>
        <el-button @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" data-testid="upload-submit" @click="submitUpload">上传</el-button>
      </template>
    </el-dialog>

    <!-- 导入物料包：预检 → 逐条选择覆盖/跳过 → 执行并报告 -->
    <el-dialog v-model="importVisible" title="导入物料包" width="760px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="选择由平台「导出选中」生成的物料包（zip）。同 key 已存在的物料默认跳过，可逐条改为覆盖；SDK 主版本与本平台不一致的物料不可导入。"
        class="upload-tip"
      />
      <div class="file-row">
        <span class="file-label">物料包文件</span>
        <input type="file" accept=".zip,application/zip" data-testid="package-input" @change="onPackagePick" />
      </div>

      <template v-if="inspect">
        <p class="picked">
          包内导出时间 {{ inspect.exportedAt }}；本平台 SDK {{ inspect.hostSdkVersion }}
        </p>
        <el-table :data="inspect.items" size="small" max-height="300" border>
          <el-table-column prop="key" label="标识" min-width="140" show-overflow-tooltip />
          <el-table-column prop="name" label="名称" min-width="130" show-overflow-tooltip />
          <el-table-column prop="type" label="类型" width="80" />
          <el-table-column label="包内版本" width="90" align="center">
            <template #default="{ row }">{{ row.version ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="目标系统" min-width="180">
            <template #default="{ row }">
              <span v-if="!row.importable" class="cell-reject">{{ row.reason }}</span>
              <span v-else-if="row.conflict">已存在（版本 {{ row.existingVersion }}）</span>
              <span v-else>全新物料</span>
            </template>
          </el-table-column>
          <el-table-column label="处置" width="120" align="center">
            <template #default="{ row }">
              <el-select v-if="row.conflict && row.importable" v-model="strategies[row.key]" size="small">
                <el-option label="跳过" value="SKIP" />
                <el-option label="覆盖" value="OVERWRITE" />
              </el-select>
              <span v-else-if="!row.importable">—</span>
              <span v-else>导入</span>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <template v-if="importResult">
        <p class="picked">导入结果</p>
        <el-table :data="importResult.results" size="small" max-height="240" border>
          <el-table-column prop="key" label="标识" min-width="140" show-overflow-tooltip />
          <el-table-column label="状态" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="版本" width="70" align="center">
            <template #default="{ row }">{{ row.version ?? '—' }}</template>
          </el-table-column>
          <el-table-column prop="message" label="说明" min-width="240" show-overflow-tooltip />
        </el-table>
        <ul class="import-notes">
          <li v-for="(m, i) in importResult.messages" :key="i">{{ m }}</li>
        </ul>
      </template>

      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :loading="importing"
          :disabled="!inspect"
          data-testid="import-submit"
          @click="submitImport"
        >
          开始导入
        </el-button>
      </template>
    </el-dialog>

    <!-- 挂到菜单：按 material:<key> 约定新建入口菜单 -->
    <el-dialog v-model="mountVisible" :title="`挂接到系统菜单 - ${mountTarget?.name || ''}`" width="520px">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="菜单名称">
          <el-input v-model="mountForm.menuName" maxlength="100" placeholder="默认使用物料名称" />
        </el-form-item>
        <el-form-item label="所属目录">
          <el-tree-select
            v-model="mountForm.parentId"
            :data="menuCategories"
            :props="{ label: 'menuName', children: 'children', value: 'id' }"
            check-strictly
            clearable
            placeholder="不选则挂到根目录"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="访问路径">
          <el-input :model-value="mountTarget ? `/material/${mountTarget.materialKey}` : ''" disabled />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="mountVisible = false">取消</el-button>
        <el-button type="primary" :loading="mounting" data-testid="mount-submit" @click="confirmMount">挂接</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// 远程物料管理页（change: remote-materials 6.3）：上传/启停/删除/挂菜单。
// 菜单入口约定 component=material:<key>、path=/material/<key>，由 MaterialRenderer 运行时加载。
defineOptions({ name: 'MaterialList' })

import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Download, Upload, UploadFilled } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { ActionButton, SearchField } from '@/components/business/types'
import type {
  MaterialInspectResult,
  MaterialImportResult,
  MaterialItem,
} from '@/api/material'
import {
  deleteMaterial,
  downloadScaffoldTemplate,
  exportMaterials,
  importMaterialPackage,
  inspectMaterialPackage,
  listMaterials,
  setMaterialStatus,
  uploadMaterial,
} from '@/api/material'
import { createMenu } from '@/api/menu'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
/** SearchTable 暴露 fetchList（刷新列表），其余成员由组件自身维护 */
const tableRef = ref<{ fetchList?: () => void }>()

const searchFields: SearchField[] = [
  { type: 'input', prop: 'keyword', label: '关键字', placeholder: '物料名称或标识' },
  {
    type: 'select',
    prop: 'type',
    label: '类型',
    options: [
      { label: '页面型', value: 'PAGE' },
      { label: '组件型', value: 'WIDGET' },
    ],
  },
]

const columns = [
  { prop: 'name', label: '物料名称', minWidth: 160, showOverflowTooltip: true },
  { prop: 'materialKey', label: '标识', minWidth: 140, showOverflowTooltip: true },
  { prop: 'type', label: '类型', width: 90, slotName: 'type' },
  { prop: 'version', label: '版本', width: 70, align: 'center' as const },
  { prop: 'sdkVersion', label: 'SDK', width: 80, align: 'center' as const },
  { prop: 'fileSize', label: '大小', width: 100, slotName: 'fileSize' },
  { prop: 'status', label: '状态', width: 90, slotName: 'status' },
  { prop: 'createdAt', label: '上传时间', width: 160, slotName: 'createdAt' },
]

async function fetchApi(params: { page: number; size: number; keyword?: string; type?: string }) {
  const res = await listMaterials({
    page: params.page,
    size: params.size,
    keyword: params.keyword || undefined,
    type: params.type || undefined,
  })
  return { rows: res.data?.content ?? [], total: res.data?.totalElements ?? 0 }
}

function refresh() {
  tableRef.value?.fetchList?.()
}

// ========== 行内操作 ==========

function openMaterial(row: MaterialItem) {
  router.push(`/material/${row.materialKey}`)
}

async function toggleStatus(row: MaterialItem) {
  const next = row.status === 1 ? 0 : 1
  try {
    await setMaterialStatus(row.id, next)
    ElMessage.success(next === 1 ? '已启用' : '已停用')
    refresh()
  } catch {
    // http 拦截器已提示
  }
}

/** 409「被菜单引用」二次确认后强制删除。 */
async function removeMaterial(row: MaterialItem) {
  try {
    await ElMessageBox.confirm(`确定删除物料「${row.name}」？删除后运行时将无法加载。`, '删除物料', {
      type: 'warning',
    })
  } catch {
    return
  }
  let refMessage = ''
  try {
    await deleteMaterial(row.id, false)
    ElMessage.success('已删除')
    refresh()
    return
  } catch (e) {
    if ((e as { code?: number })?.code !== 409) {
      // http 拦截器已提示
      return
    }
    /** 409 的消息里已带引用菜单清单，直接呈现给用户 */
    refMessage = (e as Error).message || '相关菜单'
  }
  try {
    await ElMessageBox.confirm(
      `该物料已被菜单引用（${refMessage}），强制删除会留下无效菜单（需要到菜单管理里手动清理）。仍要删除「${row.name}」吗？`,
      '物料被引用',
      { type: 'warning', confirmButtonText: '强制删除' }
    )
  } catch {
    return
  }
  try {
    await deleteMaterial(row.id, true)
    ElMessage.success('已强制删除，请检查残留菜单')
    refresh()
  } catch {
    // http 拦截器已提示
  }
}

const actionButtons = computed<ActionButton[]>(() => [
  {
    label: '打开',
    link: true,
    type: 'primary',
    show: (row) => row.type === 'PAGE',
    onClick: openMaterial,
  },
  {
    label: '停用',
    link: true,
    type: 'warning',
    permission: 'material:manage',
    show: (row) => row.status === 1,
    onClick: toggleStatus,
  },
  {
    label: '启用',
    link: true,
    type: 'success',
    permission: 'material:manage',
    show: (row) => row.status !== 1,
    onClick: toggleStatus,
  },
  {
    label: '挂到菜单',
    link: true,
    permission: 'material:manage',
    show: (row) => row.type === 'PAGE',
    onClick: openMountDialog,
  },
  {
    label: '删除',
    link: true,
    type: 'danger',
    permission: 'material:manage',
    onClick: removeMaterial,
  },
])

// ========== 上传 ==========

const uploadVisible = ref(false)
const uploading = ref(false)
const bundleFile = ref<File | null>(null)
const manifestFile = ref<File | null>(null)

const pickedText = computed(() =>
  [bundleFile.value?.name, manifestFile.value?.name].filter(Boolean).join(' + ') || '未选择文件'
)

function openUpload() {
  bundleFile.value = null
  manifestFile.value = null
  uploadVisible.value = true
}

function onFilePick(kind: 'bundle' | 'manifest', event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  if (kind === 'bundle') bundleFile.value = file
  else manifestFile.value = file
}

async function submitUpload() {
  if (!bundleFile.value || !manifestFile.value) {
    ElMessage.warning('请同时选择 bundle 文件与 manifest 文件')
    return
  }
  uploading.value = true
  try {
    await uploadMaterial(bundleFile.value, manifestFile.value)
    ElMessage.success('上传成功')
    uploadVisible.value = false
    refresh()
  } catch {
    // http 拦截器已提示
  } finally {
    uploading.value = false
  }
}

// ========== 多选 / 导出 / 工程模板 ==========

const canManage = computed(() => authStore.hasPermission('material:manage'))
const selectedRows = ref<MaterialItem[]>([])
const exporting = ref(false)
const downloadingTemplate = ref(false)

function onSelectionChange(rows: MaterialItem[]) {
  selectedRows.value = rows || []
}

/** Blob 落盘：下载文件名由前端生成（后端 zip 流走 blob 通道，响应头读不到）。 */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

function stampNow() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

async function submitExport() {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先勾选要导出的物料')
    return
  }
  exporting.value = true
  try {
    const blob = await exportMaterials(selectedRows.value.map((r) => r.id))
    saveBlob(blob, `materials-${stampNow()}.zip`)
    ElMessage.success(`已导出 ${selectedRows.value.length} 个物料`)
  } catch (e) {
    ElMessage.error((e as Error).message || '导出失败')
  } finally {
    exporting.value = false
  }
}

async function submitTemplate() {
  downloadingTemplate.value = true
  try {
    const blob = await downloadScaffoldTemplate()
    saveBlob(blob, 'material-scaffold.zip')
    ElMessage.success('工程模板已下载（含两类物料示例源码与开发教程 README）')
  } catch (e) {
    ElMessage.error((e as Error).message || '模板下载失败')
  } finally {
    downloadingTemplate.value = false
  }
}

// ========== 导入物料包 ==========

const importVisible = ref(false)
const importing = ref(false)
const inspect = ref<MaterialInspectResult | null>(null)
const importResult = ref<MaterialImportResult | null>(null)
/** 冲突条目的处置（key → OVERWRITE/SKIP），预检时按保守默认全部跳过 */
const strategies = reactive<Record<string, string>>({})
const packageFile = ref<File | null>(null)

function openImport() {
  inspect.value = null
  importResult.value = null
  packageFile.value = null
  for (const k of Object.keys(strategies)) delete strategies[k]
  importVisible.value = true
}

async function onPackagePick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  packageFile.value = file
  inspect.value = null
  importResult.value = null
  if (!file) return
  try {
    const res = await inspectMaterialPackage(file)
    inspect.value = res.data ?? null
    for (const item of inspect.value?.items ?? []) {
      strategies[item.key] = 'SKIP'
    }
  } catch {
    // http 拦截器已提示
  }
}

async function submitImport() {
  if (!packageFile.value || !inspect.value) {
    ElMessage.warning('请先选择物料包并完成预检')
    return
  }
  const actions = inspect.value.items
    .filter((i) => i.conflict && i.importable)
    .map((i) => ({ key: i.key, strategy: strategies[i.key] || 'SKIP' }))
  importing.value = true
  try {
    const res = await importMaterialPackage(packageFile.value, actions)
    importResult.value = res.data ?? null
    const ok = res.data?.results?.filter((r) => r.status === 'IMPORTED' || r.status === 'OVERWRITTEN').length ?? 0
    ElMessage.success(`导入完成：成功 ${ok} 条`)
    refresh()
  } catch {
    // http 拦截器已提示
  } finally {
    importing.value = false
  }
}

function statusText(status: string) {
  return { IMPORTED: '已导入', OVERWRITTEN: '已覆盖', SKIPPED: '已跳过', FAILED: '失败' }[status] || status
}

function statusTag(status: string) {
  if (status === 'FAILED') return 'danger'
  if (status === 'SKIPPED') return 'info'
  return 'success'
}

// ========== 挂到菜单 ==========

const mountVisible = ref(false)
const mounting = ref(false)
const mountTarget = ref<MaterialItem | null>(null)
const mountForm = reactive<{ menuName: string; parentId?: number }>({ menuName: '', parentId: undefined })

/** 目录节点（menuType=0）供所属目录选择，与页面模板挂菜单一致 */
const menuCategories = computed(() => filterMenuDirs(authStore.menus as any[]))

function filterMenuDirs(menus: any[]): any[] {
  return (menus || [])
    .filter((m: any) => m.menuType === 0)
    .map((m: any) => ({ ...m, children: m.children ? filterMenuDirs(m.children) : [] }))
}

function openMountDialog(row: MaterialItem) {
  mountTarget.value = row
  mountForm.menuName = row.name
  mountForm.parentId = undefined
  mountVisible.value = true
}

async function confirmMount() {
  const target = mountTarget.value
  if (!target) return
  mounting.value = true
  try {
    await createMenu({
      parentId: mountForm.parentId,
      menuName: mountForm.menuName || target.name,
      menuType: 1,
      path: `/material/${target.materialKey}`,
      component: `material:${target.materialKey}`,
      icon: 'Files',
      sortOrder: 99,
      status: 1,
    })
    ElMessage.success('挂接成功，菜单已生成（角色需分配该菜单后才可见）')
    mountVisible.value = false
  } catch {
    // http 拦截器已提示
  } finally {
    mounting.value = false
  }
}

// ========== 展示格式化 ==========

function formatSize(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.material-list-page {
  padding: 16px;
}
.upload-tip {
  margin-bottom: 12px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.file-label {
  width: 90px;
  color: var(--el-text-color-secondary);
}
.picked {
  margin: 4px 0 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cell-reject {
  color: var(--el-color-danger);
  font-size: 12px;
}
.import-notes {
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
