<template>
  <div class="signature-pad" :class="{ 'is-disabled': disabled }">
    <canvas
      ref="canvasRef"
      class="sp-canvas"
      :style="{ height: height + 'px' }"
    />
    <div class="sp-hint" v-if="!hasStrokes && !modelValue">请在此区域内手写签名</div>
    <div class="sp-toolbar">
      <el-button size="small" :disabled="disabled" @click="clear">清空</el-button>
      <el-button
        size="small"
        type="primary"
        :disabled="disabled || !hasStrokes"
        @click="confirm"
      >
        确认
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

/**
 * 手写签名板（鼠标 + 触摸，Pointer 事件统一处理）。
 *
 * 交互：在画布上手写 → 点「确认」输出 dataURL（v-model）；
 * 「清空」清空画布并输出空串。内部逻辑分辨率固定 500x160，
 * CSS 宽度 100% 自适应容器，坐标按实际渲染尺寸换算。
 */
const props = withDefaults(defineProps<{
  /** 签名图片 dataURL；空串/undefined 表示未签名 */
  modelValue?: string
  disabled?: boolean
  /** 画布逻辑高度（px），宽度自适应容器 */
  height?: number
}>(), {
  modelValue: '',
  disabled: false,
  height: 160,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const LOGICAL_WIDTH = 500

const canvasRef = ref<HTMLCanvasElement>()
const hasStrokes = ref(false)

let ctx: CanvasRenderingContext2D | null = null
let drawing = false
let lastX = 0
let lastY = 0

function setupCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = LOGICAL_WIDTH * dpr
  canvas.height = props.height * dpr
  ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1f2437'
  }
}

/** 坐标换算：CSS 渲染尺寸 → 逻辑坐标（500 x height） */
function toLogical(e: PointerEvent): { x: number; y: number } {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const scaleX = LOGICAL_WIDTH / rect.width
  const scaleY = props.height / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  }
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled) return
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  canvas.setPointerCapture(e.pointerId)
  drawing = true
  const p = toLogical(e)
  lastX = p.x
  lastY = p.y
  // 起笔即画一个点（单击也留痕）
  ctx.beginPath()
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(lastX + 0.01, lastY + 0.01)
  ctx.stroke()
  hasStrokes.value = true
}

function onPointerMove(e: PointerEvent) {
  if (!drawing || props.disabled || !ctx) return
  const p = toLogical(e)
  ctx.beginPath()
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  lastX = p.x
  lastY = p.y
}

function onPointerUp() {
  drawing = false
}

function clear() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  ctx.clearRect(0, 0, LOGICAL_WIDTH, props.height)
  hasStrokes.value = false
  emit('update:modelValue', '')
}

function confirm() {
  const canvas = canvasRef.value
  if (!canvas || !hasStrokes.value) return
  emit('update:modelValue', canvas.toDataURL('image/png'))
}

/** 外部回填已有签名（如撤销确认后重绘） */
function drawModelValue(dataUrl: string) {
  const canvas = canvasRef.value
  if (!canvas || !ctx || !dataUrl) return
  const img = new Image()
  img.onload = () => {
    ctx?.clearRect(0, 0, LOGICAL_WIDTH, props.height)
    // dataURL 与画布同为 500xheight 逻辑尺寸，直接按逻辑尺寸铺绘
    ctx?.drawImage(img, 0, 0, LOGICAL_WIDTH, props.height)
    hasStrokes.value = true
  }
  img.src = dataUrl
}

watch(() => props.modelValue, (val) => {
  if (!val) {
    // 外部置空（如表单重置）：同步清空画布
    if (ctx && hasStrokes.value) {
      ctx.clearRect(0, 0, LOGICAL_WIDTH, props.height)
    }
    hasStrokes.value = false
    return
  }
  if (!hasStrokes.value) {
    drawModelValue(val)
  }
})

onMounted(() => {
  setupCanvas()
  const canvas = canvasRef.value
  if (canvas) {
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerUp)
  }
  if (props.modelValue) {
    drawModelValue(props.modelValue)
  }
})

onBeforeUnmount(() => {
  const canvas = canvasRef.value
  if (canvas) {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointerleave', onPointerUp)
  }
})
</script>

<style scoped>
.signature-pad {
  position: relative;
  width: 100%;
}

.sp-canvas {
  width: 100%;
  border: 1px dashed var(--el-border-color, #dcdfe6);
  border-radius: 6px;
  background: var(--el-bg-color, #fff);
  /* 触摸设备手写：禁止页面滚动/缩放接管 */
  touch-action: none;
  display: block;
}

.signature-pad.is-disabled .sp-canvas {
  background: var(--el-fill-color-light, #f5f7fa);
  cursor: not-allowed;
}

.sp-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--el-text-color-placeholder, #a8abb2);
  font-size: 13px;
  pointer-events: none;
}

.sp-toolbar {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
