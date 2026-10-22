<!--
出码报告面板（design D6 的产物之一，2026-10-22 起在出码验证台里给人看）。
口径全部来自 generatePage 返回的 report，本组件只排版、不判定：
 · 可出码率必须连着分子分母一起显示，光给百分比看不出「节点总数变了」这件事；
 · C 桶（已登记组件不忠实出码）非零就是保真度 bug，Gate 要求恒 0，所以单独点名到组件与路径；
 · A/B 桶与 unsupported/登记表计数照原样列出，空值写成「零」而不是留空表。
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { GenerateReport, HoleBucket } from './ir'

const props = defineProps<{ report: GenerateReport }>()

const rate = computed(() => `${(props.report.codegenRate.rate * 100).toFixed(1)}%`)
/** C 桶明细：告警里要直接给出「先修哪个组件的哪个位置」 */
const cHoles = computed(() => props.report.holes.filter((h) => h.bucket === 'C'))
const buckets = computed(() => (['A', 'B', 'C'] as HoleBucket[]).map((b) => ({ bucket: b, count: props.report.buckets[b] })))
/** 有没有值得摊开看的东西：差异、未登记能力、走不进去的节点（A 桶的出处） */
const hasDetail = computed(() => {
  const r = props.report
  return r.holes.length > 0 || r.renameFailures.length > 0 || r.unsupported.length > 0 || r.nodes.some((n) => n.blocked)
})
</script>

<template>
  <div class="codegen-report">
    <div class="codegen-report__metrics">
      <span class="codegen-report__metric">
        可出码节点
        <b class="codegen-report__rate">{{ report.codegenRate.emittableNodes }}/{{ report.codegenRate.totalNodes }}</b>
        <i class="codegen-report__percent">（{{ rate }}）</i>
      </span>
      <span class="codegen-report__metric">
        已登记组件
        <b>{{ report.codegenRate.registeredNodes }}/{{ report.codegenRate.totalNodes }}</b>
      </span>
      <span v-for="b in buckets" :key="b.bucket" class="codegen-report__metric" :class="`codegen-report__bucket-${b.bucket}`">
        {{ b.bucket }} 桶
        <b>{{ b.count }}</b>
      </span>
    </div>

    <p v-if="report.buckets.C" class="codegen-report__alert-c" role="alert">
      有 {{ report.buckets.C }} 个空洞落在<b>已登记</b>组件的子树里（C 桶）：这是保真度 bug，不是广度债，
      Gate 要求这一项恒为 0。先修这些子树 ——
      <span v-for="h in cHoles" :key="h.path" class="codegen-report__alert-c-item">{{ h.owner }} @ {{ h.path }}（{{ h.kind }}）</span>
    </p>

    <div class="codegen-report__counts">
      登记表计数：丢弃 <b>{{ report.registryCounts.dropped }}</b> 告警 <b>{{ report.registryCounts.warnings }}</b>
      重命名 <b>{{ report.registryCounts.renames }}</b> 仅接线 <b>{{ report.registryCounts.wireOnly }}</b>
    </div>

    <!-- 明细默认收起：验证台一屏要先给双渲染对照；有差异时自动展开，别把问题藏进折叠里 -->
    <details class="codegen-report__details" :open="hasDetail">
      <summary class="codegen-report__summary">
        明细（空洞 {{ report.holes.length }} · 重命名失败 {{ report.renameFailures.length }} · 未登记能力
        {{ report.unsupported.length }} · 节点 {{ report.nodes.length }}）
      </summary>

      <section class="codegen-report__section">
        <h4>回读空洞（{{ report.holes.length }}）</h4>
        <p v-if="!report.holes.length" class="codegen-report__empty">回读零空洞</p>
        <table v-else>
          <thead>
            <tr><th>路径</th><th>种类</th><th>桶</th><th>归属组件</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in report.holes" :key="`${h.path}-${h.kind}`" class="codegen-report__hole">
              <td>{{ h.path }}</td>
              <td>{{ h.kind }}</td>
              <td>{{ h.bucket }}</td>
              <td>{{ h.owner || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="codegen-report__section">
        <h4>重命名核对（{{ report.renameFailures.length }}）</h4>
        <p v-if="!report.renameFailures.length" class="codegen-report__empty">重命名全部核对通过</p>
        <table v-else>
          <thead>
            <tr><th>路径</th><th>目标名</th><th>桶</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in report.renameFailures" :key="r.path" class="codegen-report__rename-failure">
              <td>{{ r.path }}</td>
              <td>{{ r.to }}</td>
              <td>{{ r.bucket }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="codegen-report__section">
        <h4>未登记的组件能力（{{ report.unsupported.length }}）</h4>
        <p v-if="!report.unsupported.length" class="codegen-report__empty">没有未登记的组件能力</p>
        <table v-else>
          <thead>
            <tr><th>路径</th><th>类型</th><th>键</th><th>说明</th></tr>
          </thead>
          <tbody>
            <tr v-for="u in report.unsupported" :key="`${u.path}-${u.key}`" class="codegen-report__unsupported">
              <td>{{ u.path }}</td>
              <td>{{ u.type }}</td>
              <td>{{ u.key }}</td>
              <td>{{ u.message }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="codegen-report__section">
        <h4>节点明细（{{ report.nodes.length }}）</h4>
        <div class="codegen-report__node-scroll">
          <table>
            <thead>
              <tr><th>类型</th><th>路径</th><th>判定</th></tr>
            </thead>
            <tbody>
              <!-- blocked 就是 A 桶数字的出处：未登记类型 / 走不进去的载体，原样给出归因串 -->
              <tr v-for="n in report.nodes" :key="n.path" class="codegen-report__node">
                <td>{{ n.type }}</td>
                <td>{{ n.path }}</td>
                <td>{{ n.blocked ?? '可出码' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </details>
  </div>
</template>

<style scoped>
.codegen-report {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.codegen-report__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
}
.codegen-report__metric b {
  font-size: 15px;
}
.codegen-report__percent {
  color: #666;
  font-style: normal;
}
.codegen-report__alert-c {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #f56c6c;
  border-radius: 4px;
  background: #fef0f0;
  color: #b03232;
  font-size: 13px;
  line-height: 1.6;
}
.codegen-report__alert-c-item {
  display: inline-block;
  margin-right: 8px;
  padding: 0 6px;
  border-radius: 3px;
  background: #fde2e2;
}
.codegen-report__counts {
  font-size: 13px;
  color: #444;
}
.codegen-report__details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.codegen-report__summary {
  font-size: 13px;
  font-weight: 600;
  color: #444;
  cursor: pointer;
}
.codegen-report__section h4 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}
.codegen-report__empty {
  margin: 0;
  color: #67c23a;
  font-size: 12px;
}
.codegen-report table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.codegen-report th,
.codegen-report td {
  border: 1px solid #ebeef5;
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
}
.codegen-report th {
  background: #f5f7fa;
  font-weight: 600;
}
.codegen-report__node-scroll {
  max-height: 320px;
  overflow: auto;
}
</style>
