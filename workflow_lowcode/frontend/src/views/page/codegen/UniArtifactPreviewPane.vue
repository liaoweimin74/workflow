<!--
设计器预览弹窗里的「产物预览」页签（Task 8.1）：把当前画布定义出成 uni 产物，
落盘 uni-shell/src/ + 触发 H5 构建，构建成功后左侧手机壳 iframe 加载产物页，
右侧同屏可见产物源码与出码报告（发布前核对口径，一次看全）。

与「出码」页签的分工：出码页签只把 web 产物文本摊在弹窗里（纸面内容，不写盘）；
本页签走完整构建链（Task 8.2 中间件），看到的是 uni 产物真跑起来的样子。

三条口径：
  · 定义每次点亮都现读画布（getSchema），不缓存——未保存的改动照样要出得出来；
  · 版本令牌拼进 iframe URL 且作 :key（?v=）：每次成功构建强制 iframe 重挂
    （key 变了 Vue 销毁重建 iframe 元素，hash 变化触不到的陈旧文档也保不住），
    杜绝看着旧产物（preview=true 口径的「不展示陈旧内容」）；
  · 构建失败保留上一次成功产物：错误条与手机壳并存，人工能对照新旧差异；
  · 空态与错误都写成话，不塌成空白格让人误读。

本组件只由 PageDesigner 在 import.meta.env.DEV 下动态引入（uni 出码栈 + 构建通道
不进生产包）；二维码入口（Task 8.3）走 9.3 发布链路（建快照 → 构建 mp-weixin →
miniprogram-ci 上传 → uploadedQrUrl），目标端判定与链路在 uni-qr-run。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { runUniArtifactPreview } from './uni-preview-run'
import { resolveUniQrAvailability, runUniQrPreview, type UniQrTarget } from './uni-qr-run'

const props = defineProps<{
  /** 页签当前是否被点亮：构建是贵操作，只在点亮时跑 */
  active: boolean
  pageKey: string
  pageName?: string
  /** 页面归属应用 ID：二维码入口按 App 解析小程序客户端（Task 8.3） */
  appId?: string | null
  getSchema: () => { rule: any[]; option: any; dataSources: any[]; actions: any[] }
}>()

const busy = ref(false)
const error = ref('')
const version = ref(0)
const builtAt = ref('')
const previewUrl = ref('')
/** 最近一次成功构建的产物（源码视图 + 报告），失败不清场 */
const files = ref<Record<string, string>>({})
const report = ref<{ codegenRate?: { emittableNodes: number; totalNodes: number; rate: number }; buckets?: { A: number; B: number; C: number } } | null>(null)
/** 源码视图当前展示的产物文件（默认页面 SFC） */
const shownFile = ref('')

const built = computed(() => !!previewUrl.value)
const rate = computed(() => report.value?.codegenRate)
const buckets = computed(() => report.value?.buckets)
const fileNames = computed(() => Object.keys(files.value))
const sourceText = computed(() =>
  shownFile.value ? files.value[shownFile.value] ?? '' : '',
)

function applyResult(out: Awaited<ReturnType<typeof runUniArtifactPreview>>) {
  version.value = out.version
  builtAt.value = out.builtAt
  previewUrl.value = out.previewUrl
  files.value = out.files
  report.value = out.report as any
  // 源码视图默认展示页面 SFC（「这一页出了什么」最直观的那一面）
  const names = Object.keys(out.files)
  shownFile.value =
    names.find((n) => n === `src/pages/gen/${String(props.pageKey).trim()}.vue`)
    ?? names.find((n) => n.endsWith('.vue'))
    ?? names[0]
    ?? ''
}

function build() {
  const key = String(props.pageKey || '').trim()
  if (!key) {
    error.value = '页面标识为空，无法构建产物预览'
    return
  }
  busy.value = true
  error.value = ''
  runUniArtifactPreview({
    pageKey: key,
    pageName: props.pageName || key,
    schema: props.getSchema(),
  })
    .then(applyResult)
    .catch((e: any) => {
      // 构建失败保留上一次成功产物：错误条与手机壳并存，人工能对照新旧差异
      error.value = e?.message || String(e)
    })
    .finally(() => {
      busy.value = false
    })
}

// ----- Task 8.3：小程序体验版预览二维码（发布链路） -----
const qrChecking = ref(false)
/** 可用的小程序客户端（null = 目标端不具备条件，此时只有 qrReason 可说话） */
const qrTarget = ref<UniQrTarget | null>(null)
const qrReason = ref('')
const qrBusy = ref(false)
const qrError = ref('')
const qrUrl = ref('')

/** 点亮时解析目标端：MP_WEIXIN 且 Client 已配 appid 才给二维码入口 */
function checkQr() {
  qrChecking.value = true
  qrError.value = ''
  resolveUniQrAvailability(props.appId)
    .then((out) => {
      qrTarget.value = out.available ? out.target : null
      qrReason.value = out.available ? '' : out.reason
    })
    .catch((e: any) => {
      qrTarget.value = null
      qrReason.value = e?.message || String(e)
    })
    .finally(() => {
      qrChecking.value = false
    })
}

/** 点「生成体验版二维码」才跑发布链路（上传是贵操作，也是「发布」语义） */
function makeQr() {
  qrBusy.value = true
  qrError.value = ''
  runUniQrPreview(props.appId)
    .then((out) => {
      if (!out.available) {
        qrReason.value = out.reason
        qrUrl.value = ''
        return
      }
      qrUrl.value = out.qrUrl
    })
    .catch((e: any) => {
      // 失败清掉旧二维码：扫到上一版比没有更糟
      qrUrl.value = ''
      qrError.value = e?.message || String(e)
    })
    .finally(() => {
      qrBusy.value = false
    })
}

// 点亮才干活：构建是贵操作，二维码目标解析要走网络（都在 watch 之后定义，避免 TDZ）
watch(() => props.active, (on) => { if (on) { build(); checkQr() } }, { immediate: true })
</script>

<template>
  <div class="uni-artifact-pane">
    <div class="uni-artifact-pane__bar">
      <span v-if="version" class="uni-artifact-pane__meta">
        构建版本 v{{ version }} · {{ builtAt ? new Date(builtAt).toLocaleTimeString() : '' }}
      </span>
      <span v-else class="uni-artifact-pane__meta">尚未构建</span>

      <el-button class="uni-artifact-pane__build" size="small" :loading="busy" @click="build">
        {{ version ? '重新构建' : '构建并预览' }}
      </el-button>
    </div>

    <p v-if="error" class="uni-artifact-pane__error" role="alert">{{ error }}</p>

    <div v-if="built" class="uni-artifact-pane__views">
      <div class="uni-artifact-pane__device">
        <iframe
          :key="version"
          class="uni-artifact-pane__frame"
          :src="previewUrl"
          title="uni 产物预览"
        />
      </div>

      <div class="uni-artifact-pane__aside">
        <div class="uni-artifact-pane__report">
          <template v-if="rate">
            <p>可出码 {{ rate.emittableNodes }}/{{ rate.totalNodes }} 节点（{{ Math.round(rate.rate * 100) }}%）
              · A{{ buckets?.A ?? 0 }} B{{ buckets?.B ?? 0 }} C{{ buckets?.C ?? 0 }}</p>
            <p v-if="buckets && buckets.C" class="uni-artifact-pane__degraded" role="alert">
              保真退化 {{ buckets.C }} 处：产物看着像，不代表它忠实于定义，明细在验证台
            </p>
          </template>
          <p v-else>本次构建未带回报告</p>
        </div>

        <div class="uni-artifact-pane__source-view">
          <select v-if="fileNames.length" v-model="shownFile" class="uni-artifact-pane__file">
            <option v-for="name in fileNames" :key="name" :value="name">{{ name }}</option>
          </select>
          <pre class="uni-artifact-pane__source">{{ sourceText }}</pre>
        </div>
      </div>
    </div>

    <p v-else-if="!error" class="uni-artifact-pane__idle">{{ busy ? '正在构建 H5 产物…' : '还没有产物，点「构建并预览」开始' }}</p>

    <!-- 小程序端预览二维码（Task 8.3）：目标端为 MP_WEIXIN 且 Client 已配 appid 才有入口 -->
    <div class="uni-artifact-pane__qr">
      <p class="uni-artifact-pane__qr-title">小程序体验版预览</p>
      <p v-if="qrChecking" class="uni-artifact-pane__qr-note">正在解析小程序客户端…</p>
      <template v-else-if="qrTarget">
        <p class="uni-artifact-pane__qr-note">
          客户端「{{ qrTarget.clientName }}」（appid {{ qrTarget.appid }}）· 发布链路：建快照 → 构建 mp-weixin → miniprogram-ci 上传体验版
        </p>
        <div class="uni-artifact-pane__qr-row">
          <el-button class="uni-artifact-pane__qr-build" size="small" :loading="qrBusy" @click="makeQr">
            生成体验版二维码
          </el-button>
          <img
            v-if="qrUrl"
            class="uni-artifact-pane__qr-img"
            :src="qrUrl"
            alt="微信开发者工具预览二维码"
          />
        </div>
        <p v-if="qrUrl" class="uni-artifact-pane__qr-note">用微信开发者工具扫此二维码（或「预览」）打开体验版</p>
      </template>
      <p v-else class="uni-artifact-pane__qr-note">{{ qrReason }}</p>
      <p v-if="qrError" class="uni-artifact-pane__qr-error" role="alert">{{ qrError }}</p>
    </div>

    <p class="uni-artifact-pane__hint">
      以上是按当前画布定义（含未保存的改动）构建的 uni 产物 H5，落盘 uni-shell/src/ 并构建后由本地静态服务承载。
      小程序端体验版二维码按该 App 的小程序客户端走发布链路生成（上传即体验版发布，请确认后再点）。
    </p>
  </div>
</template>

<style scoped>
.uni-artifact-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.uni-artifact-pane__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.uni-artifact-pane__meta {
  font-size: 12px;
  color: #606266;
}
.uni-artifact-pane__error {
  margin: 0;
  padding: 8px;
  border-radius: 4px;
  background: #fef0f0;
  color: #b03232;
  font-size: 12px;
  line-height: 1.6;
}
.uni-artifact-pane__views {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.uni-artifact-pane__device {
  display: flex;
  justify-content: center;
  padding: 8px;
  border-radius: 8px;
  background: #f5f7fa;
}
.uni-artifact-pane__frame {
  width: 375px;
  height: 640px;
  border: 1px solid #dcdfe6;
  border-radius: 12px;
  background: #fff;
}
.uni-artifact-pane__aside {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.uni-artifact-pane__report {
  padding: 8px 10px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafafa;
  font-size: 12px;
  line-height: 1.8;
}
.uni-artifact-pane__report p {
  margin: 0;
}
.uni-artifact-pane__degraded {
  color: #b03232;
}
.uni-artifact-pane__source-view {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.uni-artifact-pane__file {
  height: 26px;
  max-width: 320px;
  padding: 0 6px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 12px;
}
.uni-artifact-pane__source {
  margin: 0;
  padding: 10px;
  max-height: 46vh;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafafa;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
.uni-artifact-pane__idle {
  margin: 0;
  padding: 8px;
  border-radius: 4px;
  background: #fdf6ec;
  color: #b88230;
  font-size: 12px;
  line-height: 1.6;
}
.uni-artifact-pane__hint {
  margin: 0;
  font-size: 12px;
  color: #909399;
}
.uni-artifact-pane__qr {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafafa;
}
.uni-artifact-pane__qr-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #303133;
}
.uni-artifact-pane__qr-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #606266;
}
.uni-artifact-pane__qr-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.uni-artifact-pane__qr-img {
  width: 160px;
  height: 160px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
}
.uni-artifact-pane__qr-error {
  margin: 0;
  padding: 8px;
  border-radius: 4px;
  background: #fef0f0;
  color: #b03232;
  font-size: 12px;
  line-height: 1.6;
}
</style>
