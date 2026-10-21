<template>
  <div data-testid="row-scope-coverage">
    <el-alert type="info" :closable="false" show-icon class="mb-3">
      <template #title>「关联即受控」的盘点：每个数据源受不受数据权限控制、控制后有没有人被授到</template>
      <div class="text-xs leading-5">
        只统计启用中、且能消费筛选条件的数据源（FORM / SQL）：
        <strong>已受控</strong> = 挂了权限对象且至少一个对象授权给了角色；
        <strong>未授权</strong> = 挂了对象但没有任何角色被授权，非管理员一行都看不见；
        <strong>缺口</strong> = 没挂对象，该源对全体登录用户可见。
        豁免是对「缺口」的决定留痕（接受该源不受控），理由必填、撤销只软撤销。
      </div>
    </el-alert>

    <div class="grid grid-cols-5 gap-3 mb-3" data-testid="rs-coverage-summary">
      <div class="rounded border px-3 py-2">
        <div class="text-xs text-gray-500">数据源</div>
        <div class="text-xl font-semibold">{{ coverage.totalSources }}</div>
      </div>
      <div class="rounded border px-3 py-2">
        <div class="text-xs text-gray-500">已受控</div>
        <div class="text-xl font-semibold text-green-600">{{ coverage.coveredSources }}</div>
      </div>
      <div class="rounded border px-3 py-2">
        <div class="text-xs text-gray-500">未授权</div>
        <div class="text-xl font-semibold text-orange-500">{{ coverage.noGrantSources }}</div>
      </div>
      <div class="rounded border px-3 py-2">
        <div class="text-xs text-gray-500">已豁免</div>
        <div class="text-xl font-semibold text-orange-500">{{ coverage.exemptSources }}</div>
      </div>
      <div class="rounded border px-3 py-2">
        <div class="text-xs text-gray-500">缺口</div>
        <div class="text-xl font-semibold text-red-600">{{ coverage.gapSources }}</div>
      </div>
    </div>

    <el-table :data="coverage.sources" v-loading="loading" size="small" empty-text="没有启用中的 FORM / SQL 数据源">
      <el-table-column label="数据源" min-width="220">
        <template #default="{ row }">
          <div class="font-medium">{{ row.name }}</div>
          <div class="text-xs text-gray-400">{{ row.type }} · {{ row.dataSourceId }}</div>
        </template>
      </el-table-column>
      <el-table-column label="受控状态" min-width="320">
        <template #default="{ row }">
          <div class="leading-5" data-testid="rs-source-coverage">
            <template v-if="row.coverage.status === 'COVERED'">
              <el-tag type="success" size="small">已受控</el-tag>
              <el-tooltip :content="row.coverage.permissionNames.join('、')" placement="top">
                <span class="text-xs text-gray-500 ml-1">{{ row.coverage.permissionNames.length }} 个权限对象</span>
              </el-tooltip>
              <div v-if="row.coverage.exemption" class="text-xs text-orange-500 mt-1">
                仍挂着生效豁免（不影响受控）
                <el-button link type="warning" size="small" @click="revokeExemption(row.coverage.exemption)">撤销</el-button>
              </div>
            </template>

            <template v-else-if="row.coverage.status === 'NO_GRANT'">
              <el-tag type="warning" size="small">未授权</el-tag>
              <span class="text-xs text-gray-400 ml-1">
                挂了 {{ row.coverage.permissionNames.length }} 个对象，但没有任何角色被授权：非管理员看不见该源
              </span>
              <div>
                <el-button link type="primary" size="small" @click="goAuthorize">去角色管理授权</el-button>
              </div>
            </template>

            <template v-else-if="row.coverage.status === 'EXEMPT'">
              <el-tag type="warning" size="small">已豁免</el-tag>
              <div class="text-xs text-gray-500 mt-1" :title="row.coverage.exemption?.reason">
                {{ row.coverage.exemption?.reason }}
              </div>
              <el-button link type="warning" size="small" @click="revokeExemption(row.coverage.exemption!)">撤销豁免</el-button>
            </template>

            <template v-else>
              <el-tag type="danger" size="small">缺口</el-tag>
              <span class="text-xs text-gray-400 ml-1">未关联权限对象，该源对全体登录用户可见</span>
              <div>
                <el-button link type="primary" size="small" @click="exemptSource(row)">登记豁免</el-button>
              </div>
            </template>
          </div>
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

const props = defineProps<{ dataSourceNames: Record<string, string> }>()

const loading = ref(false)
const coverage = ref<RowScopeCoverageVO>({
  sources: [],
  totalSources: 0,
  coveredSources: 0,
  noGrantSources: 0,
  exemptSources: 0,
  gapSources: 0,
})
const exemptions = ref<RowScopeExemptionVO[]>([])

function sourceName(dataSourceId: string): string {
  return props.dataSourceNames[dataSourceId] ?? dataSourceId
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

function goAuthorize(): void {
  ElMessage.info('授权在「系统管理 → 角色管理 → 数据权限」中维护')
}

async function exemptSource(source: RowScopeSourceCoverage): Promise<void> {
  let reason: string
  try {
    const result = (await ElMessageBox.prompt(
      `「${source.name}」没有关联权限对象，全体登录用户都能看见它的数据。登记豁免必须说明为什么接受这个缺口。`,
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
  await rowPermissionApi.exempt({ dataSourceId: source.dataSourceId, reason })
  ElMessage.success('已登记豁免')
  await loadAll()
}

async function revokeExemption(exemption: RowScopeExemptionVO | null): Promise<void> {
  if (!exemption) return
  try {
    await ElMessageBox.confirm(
      `撤销后「${sourceName(exemption.dataSourceId)}」将重新按覆盖度判定，确定撤销？`,
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
