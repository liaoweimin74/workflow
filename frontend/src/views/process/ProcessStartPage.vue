<template>
  <div class="process-start-page">
    <el-page-header @back="router.back()">
      <template #content>
        <span class="header-title">发起流程 — {{ processDef?.name ?? '加载中…' }}</span>
      </template>
    </el-page-header>

    <el-card v-loading="loading" shadow="never" style="margin-top: 16px">
      <!-- 流程基本信息 -->
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item label="流程名称">{{ processDef?.name }}</el-descriptions-item>
        <el-descriptions-item label="流程Key">{{ processDef?.key }}</el-descriptions-item>
        <el-descriptions-item label="版本">v{{ processDef?.version }}</el-descriptions-item>
        <el-descriptions-item label="描述" :span="3">{{ processDef?.description || '—' }}</el-descriptions-item>
      </el-descriptions>

      <!-- 流程图预览（可折叠） -->
      <el-collapse v-model="diagramCollapse" style="margin-top: 16px">
        <el-collapse-item title="流程图预览" name="diagram">
          <div ref="diagramRef" class="bpmn-preview" />
        </el-collapse-item>
      </el-collapse>

      <!-- 发起表单区 -->
      <el-divider content-position="left">发起表单</el-divider>

      <template v-if="formDefId">
        <FormRenderer
          ref="formRendererRef"
          :form-def-id="formDefId"
:initial-values="draftValues ?? undefined"
          :field-permissions="processDef?.fieldPermissions"
        />
      </template>
      <template v-else>
        <el-alert
          title="该流程未关联表单，确认信息后可直接发起"
          type="info"
          :closable="false"
          show-icon
        />
      </template>

      <!-- 提交按钮 -->
      <div class="submit-bar">
        <el-button @click="router.back()">取消</el-button>
        <el-button v-if="formDefId" :loading="savingDraft" @click="handleSaveDraft">保存草稿</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ formDefId ? '提交发起' : '确认发起' }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import BpmnViewer from 'bpmn-js/lib/NavigatedViewer'
import type ViewerType from 'bpmn-js/lib/NavigatedViewer'
import { deployedProcessApi } from '@/api/processDefinition'
import { processInstanceApi } from '@/api/processInstance'
import { formApi } from '@/api/form'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import type { DeployedProcessDefinition } from '@/api/processDefinition'

const route = useRoute()
const router = useRouter()
const processDefinitionId = route.params.processDefinitionId as string

const loading = ref(true)
const submitting = ref(false)
const savingDraft = ref(false)
const processDef = ref<DeployedProcessDefinition | null>(null)
const formDefId = ref<string | null>(null)
const diagramCollapse = ref<string[]>([])
const diagramRef = ref<HTMLElement>()
const formRendererRef = ref<InstanceType<typeof FormRenderer>>()
const draftValues = ref<Record<string, unknown> | null>(null)

let viewer: ViewerType | null = null

// ── 加载流程定义信息 + XML ──
async function loadProcessDefinition() {
  loading.value = true
  try {
    const [defRes, xmlRes] = await Promise.all([
      deployedProcessApi.get(processDefinitionId),
      deployedProcessApi.getXml(processDefinitionId),
    ])
    processDef.value = defRes.data
    const xml = xmlRes.data

    // 从 API 响应获取表单定义 ID（后端已按优先级：发起人节点表单 > 流程默认表单）
    const raw = defRes.data as unknown as Record<string, unknown>
    formDefId.value = (raw.formDefId as string) || null

    // 加载已有草稿回填表单
    if (formDefId.value) {
      try {
        const draftRes = await formApi.getDraft(formDefId.value)
        if (draftRes.data?.dataJson) {
          draftValues.value = JSON.parse(draftRes.data.dataJson)
        }
      } catch {
        // 无草稿或加载失败，忽略
      }
    }

    // 渲染流程图
    diagramCollapse.value = ['diagram']
    await nextTick()
    if (diagramRef.value && !viewer) {
      viewer = new BpmnViewer({ container: diagramRef.value })
    }
    if (viewer) {
      try {
        await viewer.importXML(xml)
        const canvas = viewer.get('canvas') as { zoom: (type: string, auto?: boolean) => void }
        canvas.zoom('fit-viewport', true)
      } catch {
        // XML 解析失败，忽略
      }
    }
  } catch {
    ElMessage.error('加载流程定义失败')
  } finally {
    loading.value = false
  }
}

// ── 保存草稿 ──
async function handleSaveDraft() {
  if (!formDefId.value || !formRendererRef.value) return
  savingDraft.value = true
  try {
    const data = formRendererRef.value.getFormData()
    await formApi.saveDraft({
      formDefId: formDefId.value,
      dataJson: JSON.stringify(data),
    })
    ElMessage.success('草稿已保存')
  } catch {
    ElMessage.error('保存草稿失败')
  } finally {
    savingDraft.value = false
  }
}

// ── 提交发起 ──
async function handleSubmit() {
  if (!processDef.value) return

  submitting.value = true
  try {
    let variables: Record<string, unknown> = {}

    if (formDefId.value && formRendererRef.value) {
      variables = formRendererRef.value.getFormData()
    }

    const res = await processInstanceApi.start({
      processKey: processDef.value.key,
      formDefId: formDefId.value ?? undefined,
      variables,
    })

    // 发起成功后清除草稿
    if (formDefId.value) {
      try {
        await formApi.clearDraft(formDefId.value)
      } catch {
        // 清除失败不影响发起结果
      }
    }

    ElMessage.success('发起成功')
    router.push({ path: '/process/todo', query: { tab: 'initiated', highlight: res.data.id } })
  } catch {
    ElMessage.error('发起失败，请重试')
  } finally {
    submitting.value = false
  }
}

// ── 折叠展开时重新 zoom ──
watch(diagramCollapse, async (val) => {
  if (val.includes('diagram') && viewer) {
    await nextTick()
    const canvas = viewer.get('canvas') as { zoom: (type: string, auto?: boolean) => void }
    canvas.zoom('fit-viewport', true)
  }
})

onMounted(() => {
  loadProcessDefinition()
})
</script>

<style scoped>
.process-start-page {
  padding: 16px;
}

.header-title {
  font-size: 16px;
  font-weight: bold;
}

.bpmn-preview {
  height: 300px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  overflow: hidden;
}

.submit-bar {
  margin-top: 24px;
  text-align: center;
}
</style>
