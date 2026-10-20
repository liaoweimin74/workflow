<template>
  <div data-testid="row-scope-coverage">
    <el-alert type="info" :closable="false" show-icon class="mb-3">
      <template #title>「没挂即不受控」的反向查询</template>
      <div class="text-xs leading-5">
        只统计启用中、且能消费筛选条件的数据源（FORM / SQL），按读写两轴分别判定：
        <strong>已覆盖</strong> = 至少一个关联对象在该轴有授权；<strong>缺口</strong> = 没有任何授权会约束任何人。
        豁免不是关闭告警，而是把「接受这个缺口」的决定留痕，理由必填、撤销只软撤销。
      </div>
    </el-alert>

    <div class="grid grid-cols-4 gap-3 mb-3" data-testid="rs-coverage-summary">
      <div class="rounded border px-3 py-2">
        <div class="text-xs text-gray-500">总轴数</div>
        <div class="text-xl font-semibold">{{ coverage.totalAxes }}</div>
      </div>
      <div class="rounded border px-3 py-2">
        <div class="text-xs text-gray-500">已覆盖</div>
        <div class="text-xl font-semibold text-green-600">{{ coverage.coveredAxes }}</div>
      </div>
      <div class="rounded border px-3 py-2">
        <div class="text-xs text-gray-500">已豁免</div>
        <div class="text-xl font-semibold text-orange-500">{{ coverage.exemptAxes }}</div>
      </div>
      <div class="rounded border px-3 py-2">
        <div class="text-xs text-gray-500">缺口</div>
        <div class="text-xl font-semibold text-red-600">{{ coverage.gapAxes }}</div>
      </div>
    </div>

    <el-table :data="coverage.sources" v-loading="loading" size="small" empty-text="没有启用中的 FORM / SQL 数据源">
      <el-table-column label="数据源" min-width="220">
        <template #default="{ row }">
          <div class="font-medium">{{ row.name }}</div>
          <div class="text-xs text-gray-400">{{ row.type }} · {{ row.dataSourceId }}</div>
        </template>
      </el-table-column>
      <el-table-column label="读（列表 / 聚合 / 单条）" min-width="280">
        <template #default="{ row }">
          <RowScopeAxisCell
            :axis="row.read"
            @exempt="(action) => exemptSource(row, action)"
            @revoke="revokeExemption"
          />
        </template>
      </el-table-column>
      <el-table-column label="写（修改 / 删除）" min-width="280">
        <template #default="{ row }">
          <RowScopeAxisCell
            :axis="row.write"
            @exempt="(action) => exemptSource(row, action)"
            @revoke="revokeExemption"
          />
        </template>
      </el-table-column>
    </el-table>

    <el-divider content-position="left">豁免记录（留痕，含已撤销）</el-divider>
    <el-table :data="exemptions" v-loading="loading" size="small" empty-text="尚无豁免记录">
      <el-table-column label="数据源" min-width="180">
        <template #default="{ row }">
          {{ sourceName(row.dataSourceId) }}
          <span class="text-xs text-gray-400">{{ row.dataSourceId }}</span>
        </template>
      </el-table-column>
      <el-table-column label="动作" width="80">
        <template #default="{ row }">{{ actionLabel(row.action) }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="理由" min-width="260" show-overflow-tooltip />
      <el-table-column label="登记" width="190">
        <template #default="{ row }">
          <div>{{ row.createdBy ?? '—' }}</div>
          <div class="text-xs text-gray-400">{{ formatTime(row.createdAt) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="190">
        <template #default="{ row }">
          <template v-if="row.revokedAt">
            <el-tag type="info" size="small">已撤销</el-tag>
            <div class="text-xs text-gray-400">{{ row.revokedBy ?? '—' }} · {{ formatTime(row.revokedAt) }}</div>
          </template>
          <el-tag v-else type="success" size="small">生效中</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" align="right">
        <template #default="{ row }">
          <el-button v-if="!row.revokedAt" link type="warning" size="small" @click="revokeExemption(row)">撤销</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'RowScopeCoveragePanel' })

import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { rowPermissionApi } from '@/api/rowPermission'
import type {
  RowScopeCoverageVO,
  RowScopeExemptionVO,
  RowScopeSourceCoverage,
} from '@/api/rowPermission'
import type { DataScopeAction } from '@/api/dataScope'
import RowScopeAxisCell from './RowScopeAxisCell.vue'

const props = defineProps<{ dataSourceNames: Record<string, string> }>()

const loading = ref(false)
const coverage = ref<RowScopeCoverageVO>({
  sources: [],
  totalAxes: 0,
  coveredAxes: 0,
  exemptAxes: 0,
  gapAxes: 0,
})
const exemptions = ref<RowScopeExemptionVO[]>([])

function sourceName(dataSourceId: string): string {
  return props.dataSourceNames[dataSourceId] ?? dataSourceId
}

function actionLabel(action: DataScopeAction): string {
  return action === 'READ' ? '读' : '写'
}

function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 19)
}

async function loadAll(): Promise<void> {
  loading.value = true
  try {
    const [report, history] = await Promise.all([rowPermissionApi.coverage(), rowPermissionApi.exemptions()])
    coverage.value = report.data
    exemptions.value = history.data ?? []
  } finally {
    loading.value = false
  }
}

async function exemptSource(source: RowScopeSourceCoverage, action: DataScopeAction): Promise<void> {
  let reason: string
  try {
    const result = (await ElMessageBox.prompt(
      `「${source.name}」的${actionLabel(action)}轴目前没有任何授权会约束任何人。登记豁免必须说明为什么接受这个缺口。`,
      '登记豁免（留痕）',
      {
        inputType: 'textarea',
        inputPlaceholder: '例如：该数据源仅管理员使用，由菜单权限兜底',
        inputValidator: (value: string) => (value && value.trim() ? true : '理由不能为空'),
        confirmButtonText: '登记豁免',
        cancelButtonText: '取消',
      },
    )) as { value?: string }
    reason = (result.value ?? '').trim()
  } catch {
    return
  }
  await rowPermissionApi.exempt({ dataSourceId: source.dataSourceId, action, reason })
  ElMessage.success('已登记豁免')
  await loadAll()
}

async function revokeExemption(exemption: RowScopeExemptionVO | null): Promise<void> {
  if (!exemption) return
  try {
    await ElMessageBox.confirm(
      `撤销后「${sourceName(exemption.dataSourceId)}」的${actionLabel(exemption.action)}轴将重新按覆盖度判定，确定撤销？`,
      '撤销豁免',
      { type: 'warning' },
    )
  } catch {
    return
  }
  await rowPermissionApi.revokeExemption(exemption.id)
  ElMessage.success('已撤销豁免')
  await loadAll()
}

onMounted(loadAll)
</script>
