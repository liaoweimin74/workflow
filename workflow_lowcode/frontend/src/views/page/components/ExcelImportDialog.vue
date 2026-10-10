<template>
  <el-dialog
    :model-value="modelValue"
    title="导入 Excel"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @closed="resetState"
  >
    <!-- 第一步：选择文件 + 说明文案 -->
    <template v-if="!result">
      <el-upload
        ref="uploadRef"
        class="excel-import-upload"
        drag
        accept=".xlsx"
        :limit="1"
        :auto-upload="false"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
        :on-exceed="handleExceed"
      >
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">将 .xlsx 文件拖到此处，或<em>点击选择</em></div>
      </el-upload>
      <div class="excel-import-tips">
        <div class="tips-title">导入说明</div>
        <ul>
          <li>仅支持 .xlsx 格式，单次最多导入 5000 行数据（文件不超过 20MB）。</li>
          <li>首行为表头：表头文字需与页面列的字段名或列名一致（使用「导出 Excel」下载的文件回填后可直接导入）。</li>
          <li>按行写入业务数据：单行失败不影响其他行，导入完成后展示失败明细（行号 + 原因）。</li>
        </ul>
      </div>
    </template>

    <!-- 第二步：导入结果统计 + 失败明细（可滚动） -->
    <template v-else>
      <el-result :icon="result.failed > 0 ? 'warning' : 'success'" :title="resultTitle">
        <template #sub-title>
          <div class="excel-import-stats">
            <span>共读取 <b>{{ result.total }}</b> 行数据</span>
            <span class="stat-ok">成功 <b>{{ result.success }}</b> 条</span>
            <span :class="result.failed > 0 ? 'stat-bad' : ''">失败 <b>{{ result.failed }}</b> 条</span>
            <span>跳过空行 <b>{{ result.skipped }}</b> 条</span>
          </div>
        </template>
      </el-result>
      <div v-if="result.errors.length > 0" class="excel-import-errors max-h-60 overflow-auto">
        <el-table :data="result.errors" size="small" border>
          <el-table-column prop="row" label="Excel 行号" width="110" align="center" />
          <el-table-column prop="message" label="失败原因" min-width="260" />
        </el-table>
      </div>
    </template>

    <template #footer>
      <el-button @click="close">{{ result ? '关闭' : '取消' }}</el-button>
      <el-button
        v-if="!result"
        type="primary"
        :loading="uploading"
        :disabled="!file"
        @click="handleImport"
      >开始导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { importPageDataFromExcel, pageExcelUrl, type PageDataImportResult } from './excelTransfer'

/**
 * Excel 导入弹窗（Task 5-b）：
 * el-upload 拖拽选择（.xlsx 单文件，auto-upload=false）→ 确认后 FormData 上传到
 * /api/v1/pages/{pageKey}/data/import → 展示 PageDataImportResultVO 统计与失败明细；
 * 有行写入成功（success>0）时 emit('success')，由父组件（PageDataTable）触发既有刷新链路。
 */
const props = defineProps<{
  /** 弹窗显隐（v-model） */
  modelValue: boolean
  /** 页面 key（导入端点路径） */
  pageKey: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'success', result: PageDataImportResult): void
}>()

const uploadRef = ref()
/** 已选文件（el-upload on-change 捕获的 raw File） */
const file = ref<File | null>(null)
const uploading = ref(false)
/** 导入结果（非空 = 已导入，切换到统计视图） */
const result = ref<PageDataImportResult | null>(null)

const resultTitle = computed(() => (result.value?.failed ? '导入完成（部分失败）' : '导入成功'))

/** 选择文件：仅接受 .xlsx（accept 之外的拖拽/选择在此兜底拦截） */
function handleFileChange(uploadFile: { raw?: File; name?: string }) {
  const raw = uploadFile?.raw
  if (!raw) return
  if (!raw.name.toLowerCase().endsWith('.xlsx')) {
    ElMessage.error('仅支持 .xlsx 格式')
    file.value = null
    uploadRef.value?.clearFiles()
    return
  }
  file.value = raw
}

function handleFileRemove() {
  file.value = null
}

/** 超出单文件上限（limit=1）：提示先移除已选文件 */
function handleExceed() {
  ElMessage.warning('一次只能导入一个文件，请先移除已选文件')
}

/** 确认导入：FormData 上传 → 成功展示统计（success>0 通知父组件刷新）→ 失败 toast R 消息 */
async function handleImport() {
  if (!file.value || uploading.value) return
  uploading.value = true
  try {
    const r = await importPageDataFromExcel(pageExcelUrl(props.pageKey, 'import'), file.value)
    result.value = r
    if (r.success > 0) {
      emit('success', r)
    }
  } catch (e) {
    ElMessage.error(e instanceof Error && e.message ? e.message : '导入失败')
  } finally {
    uploading.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}

/** 弹窗关闭后重置（下次打开回到选文件步骤） */
function resetState() {
  file.value = null
  result.value = null
  uploading.value = false
  uploadRef.value?.clearFiles()
}
</script>

<style scoped>
.excel-import-upload :deep(.el-upload-dragger) {
  padding: 24px 0;
}
.excel-import-tips {
  margin-top: 12px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
  line-height: 1.8;
}
.excel-import-tips .tips-title {
  font-weight: 600;
  color: #303133;
}
.excel-import-tips ul {
  margin: 4px 0 0;
  padding-left: 18px;
}
.excel-import-stats {
  display: flex;
  gap: 16px;
  justify-content: center;
  font-size: 13px;
  color: #606266;
}
.excel-import-stats .stat-ok {
  color: #67c23a;
}
.excel-import-stats .stat-bad {
  color: #f56c6c;
}
</style>
