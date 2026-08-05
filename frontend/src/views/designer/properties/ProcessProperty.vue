<template>
  <el-tabs v-model="activeTab" class="process-property-tabs">
    <!-- 流程配置（审批策略 + 流程编号合并） -->
    <el-tab-pane label="流程配置" name="process">
      <el-form label-width="90px" size="small">
        <el-divider content-position="left">审批人去重</el-divider>

        <el-form-item label="审批人去重">
          <el-switch v-model="config.approvalPolicy.deduplication.enabled" @change="syncToStore" />
        </el-form-item>

        <template v-if="config.approvalPolicy.deduplication.enabled">
          <el-form-item label="去重范围">
            <el-radio-group v-model="config.approvalPolicy.deduplication.scope" @change="syncToStore">
              <el-radio value="GLOBAL">全流程</el-radio>
              <el-radio value="PHASE">同一阶段</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="去重行为">
            <el-radio-group v-model="config.approvalPolicy.deduplication.action" @change="syncToStore">
              <el-radio value="AUTO_PASS">自动通过</el-radio>
              <el-radio value="SKIP">跳过节点</el-radio>
              <el-radio value="ESCALATE">转交上级</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>

        <el-form-item label="允许撤回">
          <el-switch v-model="config.approvalPolicy.allowRecall" @change="syncToStore" />
        </el-form-item>

        <el-form-item label="允许加签">
          <el-switch v-model="config.approvalPolicy.allowAddSigner" @change="syncToStore" />
        </el-form-item>

        <el-form-item label="允许转办">
          <el-switch v-model="config.approvalPolicy.allowDelegate" @change="syncToStore" />
        </el-form-item>

        <el-divider content-position="left">流程编号</el-divider>

        <el-form-item label="自动编号">
          <el-switch v-model="config.numberRule.enabled" @change="syncToStore" />
        </el-form-item>

        <el-form-item v-if="config.numberRule.enabled" label="编号规则">
          <el-input
            v-model="config.numberRule.pattern"
            placeholder="{{year}}-{{seq:4}}"
            @change="syncToStore"
          />
          <div v-if="numberPreview" style="color: #999; font-size: 12px; margin-top: 4px">
            预览：{{ numberPreview }}
          </div>
        </el-form-item>
      </el-form>
    </el-tab-pane>

    <!-- 表单配置（原"默认表单"改名） -->
    <el-tab-pane label="表单配置" name="form">
      <ProcessFormPropertyTab />
    </el-tab-pane>
  </el-tabs>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { useDesignerStore, DEFAULT_PROCESS_CONFIG, type ProcessConfigData } from '@/stores/designerStore'
import ProcessFormPropertyTab from './ProcessFormPropertyTab.vue'

const designerStore = useDesignerStore()

const activeTab = ref('process')

const config = reactive<ProcessConfigData>(JSON.parse(JSON.stringify(DEFAULT_PROCESS_CONFIG)))

const numberPreview = computed(() => {
  if (!config.numberRule.enabled || !config.numberRule.pattern) return ''
  const year = new Date().getFullYear()
  return config.numberRule.pattern
    .replace('{{year}}', String(year))
    .replace('{{seq:4}}', '0001')
    .replace('{{seq}}', '1')
})

onMounted(async () => {
  const stored = designerStore.getProcessConfig()
  Object.assign(config, stored)
  syncToStore()
})

function syncToStore() {
  designerStore.setProcessConfig({ ...config })
}
</script>

<style scoped>
.process-property-tabs {
  padding: 0 8px;
}

.process-property-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.process-property-tabs :deep(.el-tabs__content) {
  overflow-y: auto;
}
</style>
