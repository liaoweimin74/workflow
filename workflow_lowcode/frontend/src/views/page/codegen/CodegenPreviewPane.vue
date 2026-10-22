<!--
设计器预览弹窗里的「出码」页签：出码前先看一眼这一页会出成什么 Vue3 源码。

与工具栏「出码」按钮的分工：按钮负责落盘 + 开全屏产物路由（真机表现），本页签只负责把
generatePage 的产物文本摊在预览弹窗里（纸面内容），一次盘都不写。

三条口径：
  · 定义每次页签点亮都现读画布（getSchema），不缓存——未保存的改动照样要出得出来；
  · 报告只排版 generatePage().report，一个判定都不自己算（与验证台同一纪律）；
  · 空态与错误都写成话，不塌成空白格让人误读成「产物就是空的」。

本组件只由 PageDesigner 在 import.meta.env.DEV 下动态引入：静态引到设计器里，
生产包就会带上 generate → report → reverse（含 @vue/compiler-sfc）整条出码栈。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { generatePage } from './generate'
import type { GenerateResult } from './ir'

const props = defineProps<{
  /** 页签当前是否被点亮：出码是贵操作，只在点亮时跑 */
  active: boolean
  pageKey: string
  pageName?: string
  getSchema: () => { rule: any[]; option: any; dataSources: any[]; actions: any[] }
}>()

const busy = ref(false)
const error = ref('')
const result = ref<GenerateResult | null>(null)
const shownFile = ref('')

const rate = computed(() => result.value?.report.codegenRate)
const buckets = computed(() => result.value?.report.buckets)
const sourceText = computed(() =>
  result.value && shownFile.value ? result.value.files[shownFile.value] ?? '' : '',
)

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
const labHref = computed(() => `${base}/codegen-lab/${encodeURIComponent(String(props.pageKey || '').trim())}`)

function generate() {
  const key = String(props.pageKey || '').trim()
  if (!key) {
    error.value = '页面标识为空，无法出码'
    result.value = null
    return
  }
  busy.value = true
  error.value = ''
  try {
    const gen = generatePage(props.getSchema(), {
      pageKey: key,
      pageName: props.pageName || key,
      exportedAt: `designer-preview@${new Date().toISOString()}`,
    })
    result.value = gen
    const names = Object.keys(gen.files)
    // 模板是「这一页出了什么元素」最直观的那一面，默认就展示它
    shownFile.value = names.find((n) => n.endsWith('.vue')) ?? names[0] ?? ''
  } catch (e: any) {
    result.value = null
    error.value = e?.message || String(e)
  } finally {
    busy.value = false
  }
}

watch(() => props.active, (on) => { if (on) generate() }, { immediate: true })
</script>

<template>
  <div class="codegen-preview-pane">
    <div class="codegen-preview-pane__bar">
      <span v-if="rate" class="codegen-preview-pane__rate">
        可出码 {{ rate.emittableNodes }}/{{ rate.totalNodes }} 节点（{{ Math.round(rate.rate * 100) }}%）
        · A{{ buckets?.A ?? 0 }} B{{ buckets?.B ?? 0 }} C{{ buckets?.C ?? 0 }}
      </span>
      <span v-else class="codegen-preview-pane__rate">尚未出码</span>

      <span v-if="buckets && buckets.C" class="codegen-preview-pane__degraded" role="alert">
        保真退化 {{ buckets.C }} 处：产物看着像，不代表它忠实于定义，明细在验证台
      </span>

      <select v-if="result" class="codegen-preview-pane__file" v-model="shownFile">
        <option v-for="name in Object.keys(result.files)" :key="name" :value="name">{{ name }}</option>
      </select>

      <el-button class="codegen-preview-pane__regen" size="small" :loading="busy" @click="generate">重新生成</el-button>
      <a class="codegen-preview-pane__lab" :href="labHref" target="_blank" rel="noopener">验证台（双渲染对照）</a>
    </div>

    <p v-if="error" class="codegen-preview-pane__error" role="alert">{{ error }}</p>

    <pre v-else-if="result" class="codegen-preview-pane__source">{{ sourceText }}</pre>

    <p v-else class="codegen-preview-pane__idle">{{ busy ? '正在出码…' : '还没有产物' }}</p>

    <p class="codegen-preview-pane__hint">
      以上是按当前画布定义（含未保存的改动）现场生成的源码，没有写盘。要落盘并在真机上跑，用工具栏的「出码」。
    </p>
  </div>
</template>

<style scoped>
.codegen-preview-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.codegen-preview-pane__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.codegen-preview-pane__rate {
  font-size: 12px;
  color: #606266;
}
.codegen-preview-pane__degraded {
  padding: 2px 8px;
  border-radius: 3px;
  background: #fef0f0;
  color: #b03232;
  font-size: 12px;
}
.codegen-preview-pane__file {
  height: 26px;
  max-width: 260px;
  padding: 0 6px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 12px;
}
.codegen-preview-pane__lab {
  font-size: 12px;
  color: #409eff;
}
.codegen-preview-pane__error,
.codegen-preview-pane__idle {
  margin: 0;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.6;
}
.codegen-preview-pane__error {
  background: #fef0f0;
  color: #b03232;
}
.codegen-preview-pane__idle {
  background: #fdf6ec;
  color: #b88230;
}
.codegen-preview-pane__source {
  margin: 0;
  padding: 10px;
  max-height: 52vh;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafafa;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
.codegen-preview-pane__hint {
  margin: 0;
  font-size: 12px;
  color: #909399;
}
</style>
