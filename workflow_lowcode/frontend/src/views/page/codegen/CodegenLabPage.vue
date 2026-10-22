<!--
出码验证台（dev-only，路由 /codegen-lab/:pageKey?）：给「纸面报告 + 真机表现」留一个人工入口。

design D6 原本定的形态是「报告只作为 generatePage 的返回值，不建 UI」；2026-10-22 用户要求
有一个能在前端界面上人工验证的界面，所以这块 UI 是对 D6 的有意改向，理由与形态记在 D5/D6。

三条纪律（与 e2e 同源）：
  · 一次生成同时喂三块内容：报告、双渲染对照、产物源码，都是本次 generatePage 的结果，不各算一遍；
  · 宿主侧内联渲染要求 route.params.pageKey 就是当前页名（组件身份来自它），所以换页先改地址栏；
  · 右侧产物来自磁盘 codegen/probe/（生成物、不进 git），必须逐字节核对它是否就是本次生成的那份，
    不是就警示，避免「看着旧产物读新报告」。
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { RouteComponent } from 'vue-router'
import { pageApi } from '@/api/page'
import type { PageDefinitionDetailDTO } from '@/api/page'
import CodegenComparePane from './CodegenComparePane.vue'
import CodegenReportPanel from './CodegenReportPanel.vue'
import { writeProbeFiles } from './codegen-run'
import { generatePage } from './generate'
import type { GenerateResult } from './ir'
import { CORPUS_KEYS, corpusSchemaOf, mismatchedFiles, probeComponentOf, probeTextsOf } from './probe-index'

const route = useRoute()
const router = useRouter()

type SourceMode = 'corpus' | 'live'
const source = ref<SourceMode>(route.query.source === 'live' ? 'live' : 'corpus')
const pageKey = ref(String(route.params.pageKey || CORPUS_KEYS[0] || ''))
const typedKey = ref(pageKey.value)
const busy = ref(false)
const error = ref('')

/** 两种来源都补一个 pageKey：对照面板与宿主侧组件身份都读它 */
type LabDefinition = PageDefinitionDetailDTO & { pageKey: string }

const result = ref<GenerateResult | null>(null)
const definition = ref<LabDefinition | null>(null)
// 产物组件必须是 shallowRef：深响应会把组件对象包成 reactive，Vue 会警告并拖慢挂载
const artifact = shallowRef<RouteComponent | null>(null)
const mismatch = ref<string[]>([])
const shownFile = ref('')
/** 每次成功生成都 +1：对照面板用它重挂宿主渲染器（definition 换了它不会自己重读） */
const revision = ref(0)
const writing = ref(false)
const writeError = ref('')

const sourceText = computed(() => (result.value && shownFile.value ? result.value.files[shownFile.value] ?? '' : ''))

// 链接给的是两条全屏真机路由（要看无干扰的整页表现时跳出去）
const base = import.meta.env.BASE_URL.replace(/\/$/, '')
const hostHref = computed(() => `${base}/page/${pageKey.value}?preview=true`)
const artifactHref = computed(() => `${base}/codegen-probe/${pageKey.value}`)

async function load(key: string) {
  if (!key) {
    error.value = '没有可选页面：语料目录为空，地址栏也没给 pageKey'
    result.value = null
    return
  }
  busy.value = true
  error.value = ''
  try {
    let schema: any
    let def: LabDefinition
    if (source.value === 'corpus') {
      schema = corpusSchemaOf(key)
      if (!schema) throw new Error(`语料里没有这一页：${key}（换一页，或切到「活库定义」）`)
      // 语料 fixture 只有 schema，没有落库的那几个字段；宿主侧只读 type/schema/name，
      // 断言过去而不是补假 id——补出来的假身份会让人以为这是接口给的定义
      def = { pageKey: key, key, name: key, type: 'PAGE', schema: JSON.stringify(schema) } as unknown as LabDefinition
    } else {
      // preview=true：与设计器预览 / e2e 的宿主路由同一份定义（最新 DRAFT），否则两侧看的不是同一页
      const res = await pageApi.getPageByKey(key, true)
      def = { ...res.data, pageKey: key }
      if (def.type !== 'PAGE') throw new Error(`页面类型不是自定义页面：${key}（${def.type}）`)
      schema = JSON.parse(def.schema || '{}')
    }
    const gen = generatePage(schema, {
      pageKey: key,
      pageName: String(def.name || key),
      exportedAt: `codegen-lab@${new Date().toISOString()}`,
    })
    result.value = gen
    definition.value = def

    const names = Object.keys(gen.files)
    const disk = await probeTextsOf(names)
    mismatch.value = mismatchedFiles(gen.files, disk)
    const vueName = names.find((n) => n.endsWith('.vue'))
    artifact.value = vueName ? ((await probeComponentOf(vueName)) ?? null) : null
    // 默认展示 vue 产物：模板是「出了什么元素」最直观的那一面
    shownFile.value = vueName ?? names[0] ?? ''
    revision.value += 1
  } catch (e: any) {
    result.value = null
    definition.value = null
    artifact.value = null
    error.value = e?.message || String(e)
  } finally {
    busy.value = false
  }
}

/**
 * 把本次生成的文件交给 dev 中间件写进 codegen/probe/，成了就重读磁盘。
 * 磁盘那本 glob 与产物组件都只在落盘后才有内容，所以成功后必须走一遍 load，
 * 否则画面停在「产物不存在」上，人以为按钮没生效。
 */
async function writeToDisk() {
  if (!result.value) return
  writing.value = true
  writeError.value = ''
  try {
    await writeProbeFiles(pageKey.value, result.value.files)
    await load(pageKey.value)
  } catch (e: any) {
    writeError.value = e?.message || String(e)
  } finally {
    writing.value = false
  }
}

/** 换页先写地址栏：宿主侧内联渲染的组件身份取自 route.params.pageKey */
async function select(key: string) {  if (!key || key === pageKey.value) {
    await load(key || pageKey.value)
    return
  }
  typedKey.value = key
  await router.replace(`/codegen-lab/${key}${source.value === 'live' ? '?source=live' : ''}`)
  pageKey.value = key
  await load(key)
}

function onPickChange(e: Event) {
  void select((e.target as HTMLSelectElement).value)
}

// 浏览器前进/后退或直接改地址栏
watch(
  () => route.params.pageKey,
  (v) => {
    const key = String(v || '')
    if (key && key !== pageKey.value) {
      pageKey.value = key
      typedKey.value = key
      void load(key)
    }
  },
)

onMounted(() => void load(pageKey.value))
</script>

<template>
  <div class="codegen-lab">
    <header class="codegen-lab__bar">
      <h3 class="codegen-lab__title">出码验证台<span class="codegen-lab__badge">dev-only</span></h3>

      <el-radio-group v-model="source" size="small" @change="load(pageKey)">
        <el-radio value="corpus">语料 fixture</el-radio>
        <el-radio value="live">活库定义</el-radio>
      </el-radio-group>

      <select
        v-if="source === 'corpus'"
        class="codegen-lab__picker"
        :value="pageKey"
        @change="onPickChange"
      >
        <option v-for="key in CORPUS_KEYS" :key="key" :value="key">{{ key }}</option>
      </select>
      <input
        v-else
        v-model="typedKey"
        class="codegen-lab__key"
        placeholder="pageKey"
        @keyup.enter="select(typedKey.trim())"
      />
      <el-button size="small" @click="select(source === 'live' ? typedKey.trim() : pageKey)">取定义并生成</el-button>
      <el-button class="codegen-lab__regen" size="small" :loading="busy" @click="load(pageKey)">重新生成</el-button>
      <el-button class="codegen-lab__write" size="small" type="primary" plain :loading="writing" @click="writeToDisk">
        落盘产物
      </el-button>

      <span class="codegen-lab__links">
        <a class="codegen-lab__link-host" :href="hostHref" target="_blank" rel="noopener">宿主全屏路由</a>
        <a class="codegen-lab__link-artifact" :href="artifactHref" target="_blank" rel="noopener">产物全屏路由</a>
      </span>
    </header>

    <p class="codegen-lab__hint">
      同一份定义出三块内容：出码报告、宿主/产物双渲染对照、产物源码。右侧产物取自
      <code>codegen/probe/</code>（生成物，不进 git），点「落盘产物」把本次生成的文件写进去；
      不一致会在对照区警示。
    </p>

    <p v-if="writeError" class="codegen-lab__write-error" role="alert">{{ writeError }}</p>

    <p v-if="error" class="codegen-lab__error" role="alert">{{ error }}</p>

    <template v-else-if="result && definition">
      <CodegenReportPanel :report="result.report" />

      <CodegenComparePane
        :page-key="pageKey"
        :definition="definition"
        :artifact="artifact"
        :mismatch="mismatch"
        :revision="revision"
      />

      <section class="codegen-lab__source-block">
        <h4 class="codegen-lab__section-title">
          产物源码
          <select class="codegen-lab__file-picker" v-model="shownFile">
            <option v-for="name in Object.keys(result.files)" class="codegen-lab__file" :key="name" :value="name">{{ name }}</option>
          </select>
        </h4>
        <pre class="codegen-lab__source">{{ sourceText }}</pre>
      </section>
    </template>

    <p v-else class="codegen-lab__idle">正在生成…</p>
  </div>
</template>

<style scoped>
.codegen-lab {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 20px 40px;
  background: #fff;
  min-height: 100vh;
}
.codegen-lab__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}
.codegen-lab__title {
  margin: 0;
  font-size: 16px;
}
.codegen-lab__badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #fdf6ec;
  color: #b88230;
  font-size: 11px;
  font-weight: 400;
}
.codegen-lab__picker,
.codegen-lab__key {
  height: 28px;
  padding: 0 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 13px;
}
.codegen-lab__key {
  width: 200px;
}
.codegen-lab__links {
  margin-left: auto;
  display: flex;
  gap: 12px;
  font-size: 12px;
}
.codegen-lab__hint {
  margin: 0;
  color: #666;
  font-size: 12px;
}
.codegen-lab__hint code {
  padding: 1px 4px;
  background: #f5f7fa;
  border-radius: 3px;
}
.codegen-lab__error,
.codegen-lab__write-error {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #f56c6c;
  border-radius: 4px;
  background: #fef0f0;
  color: #b03232;
  font-size: 13px;
}
.codegen-lab__idle {
  color: #909399;
  font-size: 13px;
}
.codegen-lab__section-title {
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
}
.codegen-lab__file-picker {
  height: 26px;
  padding: 0 6px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 400;
}
.codegen-lab__source {
  margin: 0;
  padding: 10px;
  max-height: 60vh;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafafa;
  font-size: 12px;
  line-height: 1.5;
}
</style>
