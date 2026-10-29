<template>
  <div class="leading-5">
    <template v-if="axis.status === 'COVERED'">
      <el-tag type="success" size="small">已覆盖</el-tag>
      <el-tooltip :content="axis.permissionNames.join('、')" placement="top">
        <span class="text-xs text-gray-500 ml-1">{{ axis.permissionNames.length }} 个权限对象</span>
      </el-tooltip>
      <div v-if="axis.exemption" class="text-xs text-orange-500 mt-1">
        仍挂着生效豁免（不影响覆盖）
        <el-button link type="warning" size="small" @click="emit('revoke', axis.exemption)">撤销</el-button>
      </div>
    </template>

    <template v-else-if="axis.status === 'EXEMPT'">
      <el-tag type="warning" size="small">已豁免</el-tag>
      <div class="text-xs text-gray-500 mt-1" :title="axis.exemption?.reason">{{ axis.exemption?.reason }}</div>
      <el-button link type="warning" size="small" @click="emit('revoke', axis.exemption!)">撤销豁免</el-button>
    </template>

    <template v-else>
      <el-tag type="danger" size="small">缺口</el-tag>
      <span class="text-xs text-gray-400 ml-1">没有授权会约束任何人</span>
      <div>
        <el-button link type="primary" size="small" @click="emit('exempt', axis.action)">登记豁免</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'RowScopeAxisCell' })

import type { DataScopeAction } from '@/api/dataScope'
import type { RowScopeAxisCoverage, RowScopeExemptionVO } from '@/api/rowPermission'

defineProps<{ axis: RowScopeAxisCoverage }>()
const emit = defineEmits<{
  exempt: [DataScopeAction]
  revoke: [RowScopeExemptionVO]
}>()
</script>
