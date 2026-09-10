<template>
  <div class="data-source-panel" v-if="visible">
    <el-divider content-position="left">数据源配置</el-divider>
    <el-form :model="config" label-width="80px" size="small">
      <el-form-item label="API地址">
        <el-input v-model="config.action" placeholder="/api/v1/xxx/list" />
      </el-form-item>
      <el-form-item label="请求方法">
        <el-radio-group v-model="config.method">
          <el-radio-button value="GET">GET</el-radio-button>
          <el-radio-button value="POST">POST</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="插入位置">
        <el-input v-model="config.to" placeholder="options" />
        <span class="form-tip">响应数据写入字段的哪个属性（通常为 options）</span>
      </el-form-item>
      <el-form-item label="解析表达式">
        <el-input v-model="config.parse" placeholder="data.content" />
        <span class="form-tip">从响应中提取选项列表的表达式（如 data.rows 或 data.content）</span>
      </el-form-item>
      <el-form-item label="请求头">
        <div class="key-value-list">
          <div v-for="(item, idx) in config.headers" :key="idx" class="key-value-row">
            <el-input v-model="item.key" placeholder="Header名" style="width: 40%" />
            <el-input v-model="item.value" placeholder="Header值" style="width: 45%" />
            <el-button :icon="Delete" circle size="small" @click="config.headers.splice(idx, 1)" />
          </div>
          <el-button size="small" :icon="Plus" @click="config.headers.push({ key: '', value: '' })">添加</el-button>
        </div>
      </el-form-item>
      <el-form-item label="请求参数">
        <div class="key-value-list">
          <div v-for="(item, idx) in config.data" :key="idx" class="key-value-row">
            <el-input v-model="item.key" placeholder="参数名" style="width: 40%" />
            <el-input v-model="item.value" placeholder="参数值" style="width: 45%" />
            <el-button :icon="Delete" circle size="small" @click="config.data.splice(idx, 1)" />
          </div>
          <el-button size="small" :icon="Plus" @click="config.data.push({ key: '', value: '' })">添加</el-button>
        </div>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" size="small" @click="applyConfig">应用到字段</el-button>
        <el-button size="small" @click="clearConfig">清空</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { watch, reactive } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'

interface KeyValue {
  key: string
  value: string
}

interface FetchConfig {
  action: string
  method: string
  to: string
  parse: string
  headers: KeyValue[]
  data: KeyValue[]
}

const props = defineProps<{
  visible: boolean
  currentRule: any
}>()

const emit = defineEmits<{
  (e: 'update:rule', rule: any): void
}>()

const config = reactive<FetchConfig>({
  action: '',
  method: 'GET',
  to: 'options',
  parse: 'data',
  headers: [],
  data: [],
})

// 监听 currentRule 变化，从 rule 中读取已有 fetch 配置回填
watch(() => props.currentRule, (rule) => {
  if (!rule || !rule.fetch) {
    resetConfig()
    return
  }
  const fetch = rule.fetch
  config.action = fetch.action || ''
  config.method = fetch.method || 'GET'
  config.to = fetch.to || 'options'
  config.parse = fetch.parse || 'data'
  config.headers = Object.entries(fetch.headers || {}).map(([key, value]) => ({ key, value: String(value) }))
  config.data = Object.entries(fetch.data || {}).map(([key, value]) => ({ key, value: String(value) }))
}, { immediate: true, deep: true })

function applyConfig() {
  if (!props.currentRule) return

  const fetchObj: any = {
    action: config.action,
    method: config.method,
    to: config.to,
    parse: config.parse,
  }

  // 将 key-value 数组转为对象
  if (config.headers.length > 0) {
    fetchObj.headers = config.headers.reduce((acc, item) => {
      if (item.key) acc[item.key] = item.value
      return acc
    }, {} as Record<string, string>)
  }

  if (config.data.length > 0) {
    fetchObj.data = config.data.reduce((acc, item) => {
      if (item.key) acc[item.key] = item.value
      return acc
    }, {} as Record<string, string>)
  }

  const updatedRule = { ...props.currentRule, fetch: fetchObj }
  emit('update:rule', updatedRule)
}

function clearConfig() {
  resetConfig()
  if (props.currentRule) {
    const updatedRule = { ...props.currentRule }
    delete updatedRule.fetch
    emit('update:rule', updatedRule)
  }
}

function resetConfig() {
  config.action = ''
  config.method = 'GET'
  config.to = 'options'
  config.parse = 'data'
  config.headers = []
  config.data = []
}
</script>

<style scoped>
.data-source-panel {
  padding: 8px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  display: block;
}

.key-value-list {
  width: 100%;
}

.key-value-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}
</style>
