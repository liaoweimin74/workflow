<template>
  <div class="sys-attachment">
    <div v-if="!disabled" class="sa-upload">
      <el-upload
        :show-file-list="false"
        :accept="acceptStr || undefined"
        :multiple="allowMultiSelect"
        :drag="draggable"
        :disabled="uploading"
        :http-request="doUpload"
      >
        <div v-if="draggable" class="sa-dragger" :class="{ 'is-uploading': uploading }">
          <el-icon class="sa-dragger-icon"><UploadFilled /></el-icon>
          <div class="sa-dragger-text">{{ uploading ? '上传中…' : '将文件拖到此处，或点击上传' }}</div>
        </div>
        <el-button v-else type="primary" plain :loading="uploading" :disabled="uploading">
          <el-icon style="margin-right: 4px"><Upload /></el-icon>
          {{ uploading ? '上传中…' : '上传附件' }}
        </el-button>
      </el-upload>
    </div>

    <ul v-if="orderedMetas.length" class="sa-list">
      <li v-for="m in orderedMetas" :key="m.id" class="sa-file" :title="showFileName ? undefined : m.fileName">
        <el-icon class="sa-file-icon" :class="{ 'is-image': previewKindOf(m) === 'image' }">
          <Picture v-if="previewKindOf(m) === 'image'" />
          <Document v-else />
        </el-icon>
        <span
          v-if="showFileName"
          class="sa-file-name"
          :class="{ 'is-clickable': previewable }"
          :title="m.fileName"
          @click="onNameClick(m)"
        >{{ m.fileName }}</span>
        <span class="sa-file-size">{{ formatFileSize(m.fileSize) }}</span>
        <span class="sa-file-actions">
          <el-button v-if="previewable" link type="primary" size="small" @click="openPreview(m)">预览</el-button>
          <el-button link type="primary" size="small" @click="download(m)">下载</el-button>
          <el-button v-if="!disabled" link type="danger" size="small" @click="removeOne(m)">删除</el-button>
        </span>
      </li>
    </ul>
    <div v-else class="sa-empty">{{ placeholder }}</div>

    <el-dialog
      v-model="previewVisible"
      :title="previewMeta?.fileName || '附件预览'"
      :width="previewKind === 'image' ? '620px' : '860px'"
      append-to-body
      destroy-on-close
      @closed="revokePreview"
    >
      <div class="sa-preview-body">
        <template v-if="previewKind === 'image'">
          <img v-if="previewUrl" :src="previewUrl" class="sa-preview-img" :alt="previewMeta?.fileName" />
        </template>
        <template v-else-if="previewKind === 'pdf' || previewKind === 'text'">
          <iframe v-if="previewUrl" :src="previewUrl" class="sa-preview-frame" frameborder="0" />
        </template>
        <template v-else-if="previewKind === 'video'">
          <video v-if="previewUrl" :src="previewUrl" controls class="sa-preview-frame" />
        </template>
        <template v-else-if="previewKind === 'audio'">
          <audio v-if="previewUrl" :src="previewUrl" controls class="sa-preview-audio" />
        </template>
        <template v-else>
          <el-empty description="该文件类型暂不支持在线预览">
            <el-button type="primary" @click="previewMeta && download(previewMeta)">下载查看</el-button>
          </el-empty>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 系统组件·附件（Task 146 / Task 146b 配置化增强）。
 *
 * 表单设计器 / 页面设计器「系统组件」分组的附件字段组件（组件本体的运行时实现；
 * 设计器物料注册见 FormDesigner/PageDesigner 的 addComponent，API 层见 api/attachment.ts）：
 * - 上传：逐文件 uploadAttachments（multipart），前端先行校验单文件大小（maxSizeMB）、
 *   类型（accept, input accept 语法，兼容字符串与字符串数组）、数量（limit）；服务端全局上限 100MB
 * - 单/多文件由「文件数量 limit」决定（无独立开关）：limit=1 → 单文件，值 = 附件 id（number，
 *   业务列 BIGINT）；limit≥2 → 多文件且有上限；limit=0 → 多文件不限，值 = id 数组（number[]，
 *   业务列 JSON）。与后端 ColumnTypeMapper / 前端 ColumnConfigDialog 对齐
 * - multiSelect：文件选择框是否允许一次选中多个文件（仅多文件模式生效，拖拽同受控）
 * - draggable：拖拽上传区（el-upload drag 模式）；previewable：是否提供在线预览；
 *   showFileName：列表是否显示文件名（隐藏时以 hover title 提示）
 * - 说明性文字：不在组件内内联渲染（原 sa-tip 已移除，Task 148 反馈 2），由设计器把
 *   派生文案写入规则的 info 字段，form-create 在字段 label 后以 ？ 图标悬浮显示
 *   （文案构造见 componentHints.ts）
 * - 回显：值非空时按缺失 id 一次合并请求 getAttachmentsByIds 拉元数据，按值顺序渲染；
 *   已失效 id 展示占位行（可删除/下载重传）。注意：占位行构造函数命名为 missingMeta
 *   （不得叫 placeholder —— script setup 顶层绑定会遮蔽同名 prop 导致模板显示函数源码）
 * - 预览：fetchAttachmentBlob(id,'preview') Blob → image/PDF/文本/音视频分流渲染，
 *   office 与未知类型引导下载；下载走 fetchAttachmentBlob(id,'download') + a[download]
 * - 移除：仅从前端值中摘除，不调 deleteAttachment（防止编辑态删除后未提交致已存
 *   数据引用悬空；服务端孤儿清理属后续 GC 范畴）
 * - 设计器画布与运行时共用（main.ts 经 FcDesigner.component 全局注册）；画布内保持
 *   可交互（与 vendor 自带 upload 组件行为一致）
 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Picture, Upload, UploadFilled } from '@element-plus/icons-vue'
import {
  fetchAttachmentBlob,
  formatFileSize,
  getAttachmentsByIds,
  previewKindOf,
  uploadAttachments,
  type AttachmentMeta,
} from '@/api/attachment'

const props = withDefaults(defineProps<{
  /** 值：单文件（limit=1）= 附件 id（number）；多文件 = 附件 id 数组（number[]） */
  modelValue?: number | number[] | null
  /** 文件数量：1 = 单文件（值 number）；≥2 = 多文件上限；0 = 多文件不限（值 number[]） */
  limit?: number
  /** 是否允许一次选中多个文件上传（仅多文件模式生效） */
  multiSelect?: boolean
  /** 是否拖拽上传 */
  draggable?: boolean
  /** 是否支持在线预览 */
  previewable?: boolean
  /** 是否显示文件名（隐藏时 hover 行可看 title） */
  showFileName?: boolean
  /** 单文件大小上限（MB），服务端全局上限 100MB */
  maxSizeMB?: number
  /** 允许的文件类型（input accept 语法；字符串逗号分隔或字符串数组均可），空 = 不限 */
  accept?: string | string[]
  /** 禁用（隐藏上传/删除，保留预览/下载） */
  disabled?: boolean
  /** 空态提示文字 */
  placeholder?: string
}>(), {
  modelValue: null,
  limit: 5,
  multiSelect: true,
  draggable: false,
  previewable: true,
  showFileName: true,
  maxSizeMB: 10,
  accept: '',
  disabled: false,
  placeholder: '暂无附件',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | number[] | null): void
  (e: 'change', value: number | number[] | null): void
}>()

// ================= 配置派生 =================

/** 单/多文件由数量决定：limit=1 单文件；其余（≥2、0 不限）多文件 */
const isMulti = computed(() => Number(props.limit) !== 1)
/** 文件选择框是否允许一次多选：仅多文件模式生效 */
const allowMultiSelect = computed(() => isMulti.value && props.multiSelect !== false)
/** accept 归一化：设计器下拉多选存数组，亦兼容旧逗号分隔字符串 */
const acceptStr = computed(() => (Array.isArray(props.accept) ? props.accept.join(',') : props.accept || ''))

// ================= 值同步（id 列表 ↔ 元数据） =================

/** 本地 id 真值（与 props.modelValue 经 lastEmitted 回声判等同步） */
const idsRef = ref<number[]>([])
/** id → 元数据缓存（含失效占位） */
const metaMap = reactive(new Map<number, AttachmentMeta>())
let lastEmitted: string | null = null
let fetchingMeta = false

function normalizeIds(v: unknown): number[] {
  if (Array.isArray(v)) return v.map((x) => Number(x)).filter((x) => Number.isFinite(x))
  const n = Number(v)
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? [] : [n]
}

function syncFromProp() {
  const ids = normalizeIds(props.modelValue)
  const key = ids.join(',')
  if (key === lastEmitted) return // 自身 emit 的回声，保持本地状态
  lastEmitted = key
  idsRef.value = ids
  void fetchMissingMetas(ids)
}
watch(() => props.modelValue, syncFromProp, { immediate: true, deep: true })

/** 缺失 id 合并为一次请求拉元数据；仍不命中（已删除）落占位行。
 *  命名注意：不可与 prop placeholder 同名（script setup 顶层绑定遮蔽 prop）。 */
async function fetchMissingMetas(ids: number[]) {
  const missing = ids.filter((id) => !metaMap.has(id))
  if (!missing.length || fetchingMeta) return
  fetchingMeta = true
  try {
    const res = await getAttachmentsByIds(missing)
    const list = (res && res.data) || []
    list.forEach((m) => metaMap.set(m.id, m))
    missing.filter((id) => !metaMap.has(id)).forEach((id) => metaMap.set(id, missingMeta(id)))
  } catch (e) {
    missing.forEach((id) => metaMap.set(id, missingMeta(id)))
    ElMessage.error((e as Error)?.message || '获取附件信息失败')
  } finally {
    fetchingMeta = false
  }
}

function missingMeta(id: number): AttachmentMeta {
  return { id, fileName: `附件 #${id}（不存在或已删除）`, contentType: null, fileSize: 0, createdBy: null, createdAt: null }
}

/** 展示顺序跟随值顺序 */
const orderedMetas = computed<AttachmentMeta[]>(() =>
  idsRef.value.map((id) => metaMap.get(id)).filter((m): m is AttachmentMeta => !!m),
)

function emitIds(next: number[]) {
  idsRef.value = next
  lastEmitted = next.join(',')
  const out: number | number[] | null = isMulti.value ? next : next.length ? next[0] : null
  emit('update:modelValue', out)
  emit('change', out)
}

// ================= 上传 =================

const uploading = ref(false)
let pendingCount = 0

async function doUpload(options: { file: File; onSuccess?: (body: unknown) => void; onError?: (err: Error) => void }) {
  const file = options.file
  const limitMb = Number(props.maxSizeMB)
  const maxMb = Number.isFinite(limitMb) && limitMb > 0 ? limitMb : 10
  if (file.size > maxMb * 1024 * 1024) {
    ElMessage.error(`「${file.name}」超过单文件上限 ${maxMb}MB，已跳过`)
    options.onError?.(new Error('size limit'))
    return
  }
  if (!matchAccept(file)) {
    ElMessage.error(`「${file.name}」类型不在允许范围（${acceptStr.value}），已跳过`)
    options.onError?.(new Error('accept'))
    return
  }
  if (isMulti.value) {
    const max = Number(props.limit)
    if (Number.isFinite(max) && max > 0 && idsRef.value.length + pendingCount >= max) {
      ElMessage.error(`最多上传 ${max} 个文件`)
      options.onError?.(new Error('count limit'))
      return
    }
  }
  pendingCount++
  uploading.value = true
  try {
    const res = await uploadAttachments(file)
    const list = (res && res.data) || []
    if (!list.length) throw new Error('服务端未返回附件信息')
    const meta = list[0]
    metaMap.set(meta.id, meta)
    emitIds(isMulti.value ? [...idsRef.value, meta.id] : [meta.id])
    options.onSuccess?.(meta)
  } catch (e) {
    ElMessage.error(`「${file.name}」上传失败：${(e as Error)?.message || '未知错误'}`)
    options.onError?.(e as Error)
  } finally {
    pendingCount = Math.max(0, pendingCount - 1)
    uploading.value = pendingCount > 0
  }
}

/** input accept 语法的宽松匹配（.ext / mime / mime/*；el-upload 只过滤文件选择框，拖拽/脚本绕过需自行兜底） */
function matchAccept(file: File): boolean {
  if (!acceptStr.value) return true
  const tokens = acceptStr.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (!tokens.length) return true
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  return tokens.some((tk) => {
    if (tk.startsWith('.')) return name.endsWith(tk)
    if (tk.endsWith('/*')) return type.startsWith(tk.slice(0, -1))
    return type === tk
  })
}

// ================= 移除 / 下载 / 预览 =================

function removeOne(m: AttachmentMeta) {
  emitIds(idsRef.value.filter((id) => id !== m.id))
}

async function download(m: AttachmentMeta) {
  try {
    const blob = await fetchAttachmentBlob(m.id, 'download')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = m.fileName || `attachment-${m.id}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  } catch (e) {
    ElMessage.error((e as Error)?.message || '下载失败')
  }
}

const previewVisible = ref(false)
const previewMeta = ref<AttachmentMeta | null>(null)
const previewUrl = ref('')
const previewKind = ref<ReturnType<typeof previewKindOf>>('unknown')

function onNameClick(m: AttachmentMeta) {
  if (props.previewable) openPreview(m)
}

async function openPreview(m: AttachmentMeta) {
  if (!m.id) return
  previewMeta.value = m
  previewKind.value = previewKindOf(m)
  previewVisible.value = true
  if (previewKind.value === 'office' || previewKind.value === 'unknown') return // 引导下载，无需取流
  try {
    const blob = await fetchAttachmentBlob(m.id, 'preview')
    revokePreview()
    previewUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    previewVisible.value = false
    ElMessage.error((e as Error)?.message || '预览失败')
  }
}

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

// ================= 展示辅助 =================
</script>

<style scoped>
.sys-attachment {
  width: 100%;
}
.sa-dragger {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 18px 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  transition: border-color 0.2s, background 0.2s;
  cursor: pointer;
}
.sa-dragger:hover,
.sa-dragger.is-uploading {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.sa-dragger-icon {
  font-size: 28px;
  color: var(--el-color-primary);
}
.sa-dragger-text {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 20px;
}
.sa-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sa-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-fill-color-blank);
}
.sa-file-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.sa-file-icon.is-image {
  color: var(--el-color-success);
}
.sa-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
}
.sa-file-name.is-clickable {
  cursor: pointer;
  color: var(--el-color-primary);
}
.sa-file-name.is-clickable:hover {
  text-decoration: underline;
}
.sa-file-size {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.sa-file-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.sa-file-actions .el-button + .el-button {
  margin-left: 8px;
}
.sa-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: 6px;
}
.sa-preview-body {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}
.sa-preview-img {
  max-width: 100%;
  max-height: 65vh;
  object-fit: contain;
}
.sa-preview-frame {
  width: 100%;
  height: 70vh;
  border: none;
}
.sa-preview-audio {
  width: 100%;
}
</style>
