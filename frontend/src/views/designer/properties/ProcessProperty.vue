<template>
  <el-form label-width="90px" size="small">
    <el-divider content-position="left">基本信息</el-divider>

    <el-form-item label="流程名称">
      <el-input v-model="info.name" placeholder="请输入流程名称" @change="updateBpmnName" />
    </el-form-item>

    <el-form-item label="流程标识">
      <el-input v-model="info.key" disabled />
    </el-form-item>

    <el-form-item label="流程分类">
      <el-tree-select
        v-model="info.categoryId"
        :data="categoryTree"
        :props="{ label: 'name', value: 'id', children: 'children' }"
        placeholder="请选择分类"
        clearable
        check-strictly
        style="width: 100%"
        @change="syncBasicInfo"
      />
    </el-form-item>

    <el-form-item label="流程描述">
      <el-input
        v-model="info.description"
        type="textarea"
        :rows="3"
        placeholder="请输入流程描述"
        @change="syncBasicInfo"
      />
    </el-form-item>

    <el-divider content-position="left">审批策略</el-divider>

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
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { useDesignerStore, DEFAULT_PROCESS_CONFIG, type ProcessConfigData } from '@/stores/designerStore'
import { categoryApi, type Category } from '@/api/category'
import { getModeler } from '../utils/bpmnModeler'

const designerStore = useDesignerStore()

// 基本信息：从 BPMN root element 和 store draft 读取，不存入 __PROCESS__
const info = reactive({
  name: '',
  key: '',
  categoryId: null as string | null,
  description: '',
})

// 运行时行为配置：存入 __PROCESS__
const config = reactive<ProcessConfigData>(JSON.parse(JSON.stringify(DEFAULT_PROCESS_CONFIG)))

const categoryTree = ref<any[]>([])

const numberPreview = computed(() => {
  if (!config.numberRule.enabled || !config.numberRule.pattern) return ''
  const year = new Date().getFullYear()
  return config.numberRule.pattern
    .replace('{{year}}', String(year))
    .replace('{{seq:4}}', '0001')
    .replace('{{seq}}', '1')
})

onMounted(async () => {
  // 加载分类树
  try {
    const res = await categoryApi.list()
    categoryTree.value = buildTree(res.data || [])
  } catch {
    // ignore
  }

  // 从 store 读取流程级配置（运行时行为）
  const stored = designerStore.getProcessConfig()
  Object.assign(config, stored)

  // 从 BPMN XML 读取流程名称和 key
  const modeler = getModeler()
  const canvas = (modeler as any).get('canvas')
  const rootElement = canvas.getRootElement()
  const bo = rootElement?.businessObject
  if (bo) {
    info.name = bo.name || ''
    info.key = bo.id || ''
  }

  // 从 store draft 读取 categoryId
  info.categoryId = designerStore.draftCategoryId

  syncToStore()
})

watch(() => info.name, (val) => {
  designerStore.setDraft(designerStore.draftId || '', val, info.key)
})

function syncToStore() {
  designerStore.setProcessConfig({ ...config })
}

function syncBasicInfo() {
  designerStore.setDraftBasicInfo({
    categoryId: info.categoryId,
    description: info.description,
  })
}

function updateBpmnName() {
  const modeler = getModeler()
  const canvas = (modeler as any).get('canvas')
  const rootElement = canvas.getRootElement()
  const modeling = (modeler as any).get('modeling')
  if (rootElement) {
    modeling.updateProperties(rootElement, { name: info.name })
  }
  designerStore.setDraft(designerStore.draftId || '', info.name, info.key)
}

function buildTree(items: Category[]): any[] {
  const map = new Map<string, any>()
  const roots: any[] = []
  items.forEach(item => map.set(item.id, { ...item, children: [] }))
  items.forEach(item => {
    const node = map.get(item.id)!
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  const sortNodes = (nodes: any[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder)
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}
</script>
