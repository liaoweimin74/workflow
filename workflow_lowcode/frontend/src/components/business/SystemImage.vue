<template>
  <div class="sys-image" :style="{ '--si-thumb': thumbPx + 'px' }">
    <div class="si-grid">
      <div
        v-for="(m, idx) in orderedMetas"
        :key="m.id"
        class="si-item"
        :class="{ 'is-missing': isMissing(m) }"
        :title="isMissing(m) ? `图片 #${m.id}（不存在或已删除）` : metaLine(m)"
      >
        <div class="si-thumb">
          <img
            v-if="thumbUrls.get(m.id)"
            :src="thumbUrls.get(m.id)!"
            class="si-thumb-img"
            :alt="m.fileName"
            loading="lazy"
            @click="previewable && !isMissing(m) && openPreviewAt(idx)"
          />
          <div v-else-if="thumbFailed.has(m.id)" class="si-thumb-broken">
            <el-icon><Picture /></el-icon>
          </div>
          <div v-else class="si-thumb-loading">
            <el-icon class="is-loading"><Loading /></el-icon>
          </div>
          <span v-if="isMissing(m)" class="si-missing-badge">失效</span>
          <div v-else class="si-mask">
            <el-tooltip v-if="previewable" content="预览" placement="top">
              <button type="button" class="si-mask-btn" aria-label="预览" @click="openPreviewAt(idx)">
                <el-icon><ZoomIn /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip v-if="downloadable" content="下载" placement="top">
              <button type="button" class="si-mask-btn" aria-label="下载" @click="download(m)">
                <el-icon><Download /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </div>
        <!-- 删除：角标圆心与缩略图正方形右上角重合（骑角定位，Task 150 反馈）。
             须挂载于 .si-thumb 之外：.si-thumb overflow:hidden 会裁剪外露半圆 -->
        <button
          v-if="!disabled"
          type="button"
          class="si-del-badge"
          aria-label="删除"
          @click.stop="removeOne(m)"
        >
          <el-icon><Close /></el-icon>
        </button>
        <div class="si-info">
          <span class="si-info-meta">{{ metaLine(m) }}</span>
        </div>
      </div>

      <el-upload
        v-if="!disabled && canAddMore"
        class="si-upload"
        :show-file-list="false"
        accept="image/*"
        :multiple="allowMultiSelect"
        :disabled="uploading"
        :http-request="doUpload"
      >
        <div class="si-add" :class="{ 'is-uploading': uploading }">
          <el-icon class="si-add-icon"><Plus /></el-icon>
          <span class="si-add-text">{{ uploading ? '上传中…' : '上传图片' }}</span>
        </div>
      </el-upload>
    </div>

    <div v-if="!orderedMetas.length && !canAddMore" class="si-empty">{{ placeholder }}</div>

    <el-dialog
      v-model="previewVisible"
      :title="previewMeta?.fileName || '图片预览'"
      width="860px"
      append-to-body
      destroy-on-close
      @closed="revokePreview"
    >
      <div class="si-preview-body">
        <img v-if="previewUrl" :src="previewUrl" class="si-preview-img" :alt="previewMeta?.fileName" />
        <div v-else class="si-thumb-loading si-preview-loading">
          <el-icon class="is-loading"><Loading /></el-icon>
        </div>
        <div v-if="orderedMetas.length > 1" class="si-preview-nav">
          <button
            type="button"
            class="si-nav-btn"
            :disabled="previewIndex <= 0"
            aria-label="上一张"
            @click="navPreview(-1)"
          >
            <el-icon><ArrowLeft /></el-icon>
          </button>
          <span class="si-nav-count">{{ previewIndex + 1 }} / {{ orderedMetas.length }}</span>
          <button
            type="button"
            class="si-nav-btn"
            :disabled="previewIndex >= orderedMetas.length - 1"
            aria-label="下一张"
            @click="navPreview(1)"
          >
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
        <div v-if="previewMeta && !isMissing(previewMeta)" class="si-preview-meta">
          <span>{{ metaLine(previewMeta) }}</span>
          <el-button v-if="downloadable" link type="primary" size="small" @click="previewMeta && download(previewMeta)">
            下载原图
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 系统组件·图片（Task 147；Task 148 反馈修正）。
 *
 * 表单设计器 / 页面设计器「系统组件」分组的图片字段组件（组件本体运行时实现；
 * 设计器物料注册见 FormDesigner/PageDesigner 的 addComponent，API 层见 api/attachment.ts）：
 * - 上传：逐文件 uploadImages（POST /attachments/upload-image，服务端强校验图片类型并
 *   读取像素尺寸返回 width/height）；前端先行校验大小（maxSizeMB）、图片类型（isImageFile，
 *   MIME image/* 或图片扩展名白名单）、数量（limit）、像素尺寸（minWidth/maxWidth/minHeight/
 *   maxHeight，0 = 不限；经 Image 对象读 naturalWidth/naturalHeight）
 * - 数量限制同步占位（Task 148 反馈 1 修正）：doUpload 在任何 await 之前先同步占位
 *   pendingCount——el-upload 一次多选会连派 N 个 http-request，若占位发生在异步尺寸
 *   解码之后，全部文件都会在 pendingCount 回填前通过数量校验导致超限
 * - 单/多图由「图片数量 limit」决定（无独立开关）：limit=1 → 单图，值 = 图片 id（number，
 *   业务列 BIGINT）；limit≥2 → 多图且有上限；limit=0 → 多图不限，值 = id 数组（number[]，
 *   业务列 JSON）。与后端 ColumnTypeMapper / 前端 ColumnConfigDialog 对齐
 * - multiSelect：文件选择框是否允许一次选中多个文件（仅多图模式生效）
 * - 说明性文字：不在组件内内联渲染（原 si-tip 已移除），由设计器把派生文案写入
 *   规则的 info 字段，form-create 在字段 label 后以 ？ 图标悬浮显示（Task 148 反馈 2；
 *   文案构造见 componentHints.ts）
 * - 不显示文件名（Task 148 反馈 3，无配置项）：信息条仅展示 尺寸·大小
 * - 缩略图：卡片网格（CSS 变量 --si-thumb 控制边长，响应式 auto-fill）；缩略图走
 *   fetchAttachmentThumbnail（服务端等比缩放 JPEG，磁盘缓存；非位图回退原图），
 *   因 /api/attachments/** 需 Bearer 鉴权不能 <img src> 直链，统一 XHR blob + objectURL
 *   缓存（thumbUrls）；悬浮遮罩仅提供 预览/下载（三图标窄缩略图会被 flex 压缩变形，
 *   Task 149 反馈），删除改为缩略图右上角角标 X（悬浮/聚焦显示，触屏 hover:none 常显）；
 *   缩略图边长变化自动失效重取
 * - 预览：dialog + 原图 blob（fetchAttachmentBlob 'preview'），多图支持 上一张/下一张
 *   导航与「n / m」计数，底部展示 尺寸·大小 信息与下载原图入口
 * - 回显：值非空时按缺失 id 一次合并请求 getAttachmentsByIds 拉元数据，按值顺序渲染；
 *   已失效 id 展示占位卡片（可删除）。注意：占位构造函数命名为 missingMeta
 *   （不得叫 placeholder —— script setup 顶层绑定会遮蔽同名 prop 导致模板显示函数源码）
 * - 移除：仅从前端值中摘除，不调 deleteAttachment（防止编辑态删除后未提交致已存
 *   数据引用悬空；服务端孤儿清理属后续 GC 范畴）
 * - 设计器画布与运行时共用（main.ts 经 FcDesigner.component 全局注册）
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Close, Download, Loading, Picture, Plus, ZoomIn } from '@element-plus/icons-vue'
import {
  fetchAttachmentBlob,
  fetchAttachmentThumbnail,
  formatFileSize,
  getAttachmentsByIds,
  isImageFile,
  uploadImages,
  type AttachmentMeta,
} from '@/api/attachment'

const props = withDefaults(defineProps<{
  /** 值：单图（limit=1）= 图片 id（number）；多图 = 图片 id 数组（number[]） */
  modelValue?: number | number[] | null
  /** 图片数量：1 = 单图（值 number）；≥2 = 多图上限；0 = 多图不限（值 number[]） */
  limit?: number
  /** 是否允许一次选中多个文件上传（仅多图模式生效） */
  multiSelect?: boolean
  /** 单图大小上限（MB），服务端全局上限 100MB */
  maxSizeMB?: number
  /** 最小宽度（px，0 = 不限） */
  minWidth?: number
  /** 最大宽度（px，0 = 不限） */
  maxWidth?: number
  /** 最小高度（px，0 = 不限） */
  minHeight?: number
  /** 最大高度（px，0 = 不限） */
  maxHeight?: number
  /** 缩略图边长（px，64~640，服务端按最大边等比缩放） */
  thumbnailSize?: number
  /** 是否支持点击缩略图大图预览 */
  previewable?: boolean
  /** 是否提供下载原图入口 */
  downloadable?: boolean
  /** 禁用（隐藏上传/删除，保留预览/下载） */
  disabled?: boolean
  /** 空态提示文字 */
  placeholder?: string
}>(), {
  modelValue: null,
  limit: 5,
  multiSelect: true,
  maxSizeMB: 10,
  minWidth: 0,
  maxWidth: 0,
  minHeight: 0,
  maxHeight: 0,
  thumbnailSize: 110,
  previewable: true,
  downloadable: true,
  disabled: false,
  placeholder: '暂无图片',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | number[] | null): void
  (e: 'change', value: number | number[] | null): void
}>()

// ================= 配置派生 =================

/** 单/多图由数量决定：limit=1 单图；其余（≥2、0 不限）多图 */
const isMulti = computed(() => Number(props.limit) !== 1)
/** 文件选择框是否允许一次多选：仅多图模式生效 */
const allowMultiSelect = computed(() => isMulti.value && props.multiSelect !== false)
/** 缩略图边长夹取（与后端 64~640 对齐） */
const thumbPx = computed(() => {
  const n = Number(props.thumbnailSize)
  return Number.isFinite(n) ? Math.max(64, Math.min(640, Math.round(n))) : 110
})

function num0(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** 是否还能继续上传（multi 限额/单图已占位时隐藏上传卡片；计入同步占位的 pending） */
const canAddMore = computed(() => {
  if (props.disabled) return false
  const max = isMulti.value ? Number(props.limit) : 1
  if (!(Number.isFinite(max) && max > 0)) return true
  return idsRef.value.length + pendingCount.value < max
})

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

/** 缺失 id 合并为一次请求拉元数据；仍不命中（已删除）落占位卡片。
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
    ElMessage.error((e as Error)?.message || '获取图片信息失败')
  } finally {
    fetchingMeta = false
  }
}

function missingMeta(id: number): AttachmentMeta {
  return { id, fileName: `图片 #${id}（不存在或已删除）`, contentType: null, fileSize: 0, createdBy: null, createdAt: null, width: null, height: null }
}

function isMissing(m: AttachmentMeta): boolean {
  return m.fileSize === 0 && !m.contentType
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

// ================= 上传（大小/类型/数量/尺寸四重校验） =================

const uploading = ref(false)
/** 同步占位计数（ref：canAddMore 需响应）。必须在任何 await 之前自增，见 doUpload。 */
const pendingCount = ref(0)

async function doUpload(options: { file: File; onSuccess?: (body: unknown) => void; onError?: (err: Error) => void }) {
  const file = options.file
  const max = isMulti.value ? Number(props.limit) : 1
  // 数量校验 + 同步占位（Task 148 反馈 1 修正）：el-upload 一次多选会连派 N 个
  // http-request，占位若发生在下方 await（尺寸解码）之后，所有文件都会在
  // pendingCount 回填前通过校验导致超限；故先同步占位，任一校验失败在 finally 释放
  if (Number.isFinite(max) && max > 0 && idsRef.value.length + pendingCount.value >= max) {
    ElMessage.error(`最多上传 ${max} 张图片`)
    options.onError?.(new Error('count limit'))
    return
  }
  pendingCount.value++
  uploading.value = true
  try {
    const limitMb = Number(props.maxSizeMB)
    const maxMb = Number.isFinite(limitMb) && limitMb > 0 ? limitMb : 10
    if (file.size > maxMb * 1024 * 1024) {
      ElMessage.error(`「${file.name}」超过单图上限 ${maxMb}MB，已跳过`)
      options.onError?.(new Error('size limit'))
      return
    }
    if (!isImageFile(file)) {
      ElMessage.error(`「${file.name}」不是支持的图片类型（JPG/PNG/GIF/WebP/BMP/SVG/ICO/AVIF），已跳过`)
      options.onError?.(new Error('not an image'))
      return
    }
    // 尺寸校验：本地解码读 naturalWidth/naturalHeight（权威校验在前端，服务端仅补元数据）
    try {
      const dims = await readImageDimensions(file)
      const ruleViolation = checkDimensionRule(dims)
      if (ruleViolation) {
        ElMessage.error(`「${file.name}」${ruleViolation}，已跳过`)
        options.onError?.(new Error('dimension limit'))
        return
      }
    } catch (e) {
      ElMessage.error(`「${file.name}」图片解析失败，已跳过`)
      options.onError?.(e as Error)
      return
    }
    const res = await uploadImages(file, 'form-image')
    const list = (res && res.data) || []
    if (!list.length) throw new Error('服务端未返回图片信息')
    const meta = list[0]
    metaMap.set(meta.id, meta)
    emitIds(isMulti.value ? [...idsRef.value, meta.id] : [meta.id])
    options.onSuccess?.(meta)
  } catch (e) {
    ElMessage.error(`「${file.name}」上传失败：${(e as Error)?.message || '未知错误'}`)
    options.onError?.(e as Error)
  } finally {
    pendingCount.value = Math.max(0, pendingCount.value - 1)
    uploading.value = pendingCount.value > 0
  }
}

/** 本地解码图片尺寸（objectURL + Image naturalWidth/naturalHeight）。 */
function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    let url = ''
    try {
      url = URL.createObjectURL(file)
    } catch {
      reject(new Error('无法读取图片'))
      return
    }
    const img = new Image()
    img.onload = () => {
      try { URL.revokeObjectURL(url) } catch { /* noop */ }
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      try { URL.revokeObjectURL(url) } catch { /* noop */ }
      reject(new Error('图片解析失败'))
    }
    img.src = url
  })
}

/** 尺寸规则校验：命中限制返回报错文案，通过返回 null。 */
function checkDimensionRule(dims: { width: number; height: number }): string | null {
  const minW = num0(props.minWidth)
  const maxW = num0(props.maxWidth)
  const minH = num0(props.minHeight)
  const maxH = num0(props.maxHeight)
  if (minW > 0 && dims.width < minW) return `宽度 ${dims.width}px 低于最小要求 ${minW}px`
  if (maxW > 0 && dims.width > maxW) return `宽度 ${dims.width}px 超过最大限制 ${maxW}px`
  if (minH > 0 && dims.height < minH) return `高度 ${dims.height}px 低于最小要求 ${minH}px`
  if (maxH > 0 && dims.height > maxH) return `高度 ${dims.height}px 超过最大限制 ${maxH}px`
  return null
}

// ================= 缩略图（XHR blob 缓存，鉴权不能直链） =================

const thumbUrls = reactive(new Map<number, string>())
const thumbFailed = reactive(new Set<number>())
const thumbLoading = reactive(new Set<number>())

async function ensureThumb(m: AttachmentMeta) {
  if (isMissing(m) || thumbUrls.has(m.id) || thumbFailed.has(m.id) || thumbLoading.has(m.id)) return
  thumbLoading.add(m.id)
  try {
    const blob = await fetchAttachmentThumbnail(m.id, thumbPx.value)
    const url = URL.createObjectURL(blob)
    revokeThumb(m.id)
    thumbUrls.set(m.id, url)
  } catch {
    thumbFailed.add(m.id)
  } finally {
    thumbLoading.delete(m.id)
  }
}

function revokeThumb(id: number) {
  const old = thumbUrls.get(id)
  if (old) {
    try { URL.revokeObjectURL(old) } catch { /* noop */ }
    thumbUrls.delete(id)
  }
}

/** 元数据变化与缩略图边长变化均触发补拉（边长变化先清缓存） */
watch(
  () => [orderedMetas.value.map((m) => m.id).join(','), thumbPx.value],
  (_nv, ov) => {
    if (ov && ov[0] !== undefined && ov[1] !== undefined && ov[0] === _nv[0] && ov[1] !== _nv[1]) {
      // 边长变化：失效全部缩略图重新拉取
      Array.from(thumbUrls.keys()).forEach((id) => {
        revokeThumb(id)
        thumbFailed.delete(id)
      })
    }
    orderedMetas.value.forEach((m) => void ensureThumb(m))
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  Array.from(thumbUrls.keys()).forEach((id) => revokeThumb(id))
})

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
    a.download = m.fileName || `image-${m.id}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  } catch (e) {
    ElMessage.error((e as Error)?.message || '下载失败')
  }
}

const previewVisible = ref(false)
const previewIndex = ref(0)
const previewMeta = ref<AttachmentMeta | null>(null)
const previewUrl = ref('')

async function openPreviewAt(idx: number) {
  const m = orderedMetas.value[idx]
  if (!m || isMissing(m)) return
  previewIndex.value = idx
  previewMeta.value = m
  previewVisible.value = true
  await loadPreviewBlob(m)
}

async function loadPreviewBlob(m: AttachmentMeta) {
  revokePreview()
  try {
    const blob = await fetchAttachmentBlob(m.id, 'preview')
    previewUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    previewVisible.value = false
    ElMessage.error((e as Error)?.message || '预览失败')
  }
}

async function navPreview(delta: number) {
  const next = previewIndex.value + delta
  const m = orderedMetas.value[next]
  if (!m || isMissing(m)) return
  previewIndex.value = next
  previewMeta.value = m
  await loadPreviewBlob(m)
}

function revokePreview() {
  if (previewUrl.value) {
    try { URL.revokeObjectURL(previewUrl.value) } catch { /* noop */ }
    previewUrl.value = ''
  }
}

// ================= 展示辅助 =================

/** 信息条：尺寸（服务端读取成功时）+ 文件大小（不展示文件名，Task 148 反馈 3） */
function metaLine(m: AttachmentMeta): string {
  if (isMissing(m)) return '图片不存在或已删除'
  const sizePart = formatFileSize(m.fileSize)
  if (m.width && m.height) return `${m.width}×${m.height} · ${sizePart}`
  return sizePart
}
</script>

<style scoped>
.sys-image {
  width: 100%;
}
.si-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--si-thumb), 1fr));
  gap: 10px;
  max-width: 100%;
}
.si-item {
  position: relative; /* 承载骑角删除角标的定位原点 */
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.si-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-fill-color-lighter);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.si-item:hover .si-thumb {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.si-item.is-missing .si-thumb {
  border-style: dashed;
  opacity: 0.75;
}
.si-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  cursor: zoom-in;
}
.si-thumb-loading,
.si-thumb-broken {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
  font-size: 22px;
}
.si-thumb-broken {
  color: var(--el-color-info);
}
.si-missing-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 1px 6px;
  font-size: 11px;
  line-height: 16px;
  color: #fff;
  background: var(--el-color-danger);
  border-radius: 3px;
}
.si-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  transition: opacity 0.2s;
}
.si-item:hover .si-mask,
.si-item:focus-within .si-mask {
  opacity: 1;
}
.si-mask-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0; /* 两钮 28×2+gap6=62px ≤ 缩略图最小 64px，禁止压缩防变形 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: transform 0.15s, background 0.15s, color 0.15s;
}
.si-mask-btn:hover {
  transform: scale(1.12);
  background: #fff;
  color: var(--el-color-primary);
}
/* 删除角标：20px 圆心精确落位缩略图正方形右上角（骑角定位，外露半圆）。
   悬浮/聚焦显现，悬停变危险红；阴影强化外露半圆在浅色背景上的轮廓 */
.si-del-badge {
  position: absolute;
  top: -10px;
  right: -10px;
  z-index: 3;
  width: 20px;
  height: 20px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  opacity: 0;
  transition: opacity 0.2s, background 0.15s;
}
.si-item:hover .si-del-badge,
.si-item:focus-within .si-del-badge {
  opacity: 1;
}
.si-del-badge:hover {
  background: var(--el-color-danger);
}
.si-del-badge .el-icon {
  font-size: 12px;
}
/* 触屏无 hover：角标常显保证可删除 */
@media (hover: none) {
  .si-del-badge {
    opacity: 1;
  }
}
.si-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.si-info-meta {
  font-size: 11px;
  line-height: 15px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.si-add {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  aspect-ratio: 1 / 1;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  transition: border-color 0.2s, background 0.2s;
  cursor: pointer;
}
.si-add:hover,
.si-add.is-uploading {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.si-add-icon {
  font-size: 22px;
  color: var(--el-color-primary);
}
.si-add-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.si-upload :deep(.el-upload) {
  width: 100%;
}
.si-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: 6px;
}
.si-preview-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-height: 200px;
}
.si-preview-img {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
  border-radius: 4px;
}
.si-preview-loading {
  width: 120px;
  height: 120px;
  font-size: 28px;
}
.si-preview-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}
.si-nav-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-border-color);
  border-radius: 50%;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.si-nav-btn:hover:not(:disabled) {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}
.si-nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.si-nav-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  min-width: 48px;
  text-align: center;
}
.si-preview-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

<style>
/* 骑角角标画布兼容（Task 150）：表单设计器包装盒 _fd-drag-tool(hidden)/_fd-draggable-drag(auto)
   会裁剪角标外露半圆。仅对包含本组件角标的包装盒放宽 overflow，其他组件与运行时渲染不受影响。 */
._fd-drag-tool:has(.si-del-badge),
._fd-draggable-drag:has(.si-del-badge) {
  overflow: visible;
}
</style>
