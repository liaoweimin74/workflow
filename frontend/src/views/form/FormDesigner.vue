<template>
  <div class="form-designer-page">
    <!-- 顶部工具栏 -->
    <div class="designer-toolbar">
      <el-button :icon="ArrowLeft" @click="handleBack">返回</el-button>
      <el-divider direction="vertical" />
      <span class="form-name">{{ formName || '加载中...' }}</span>
      <el-tag v-if="formStatus" :type="statusTagType(formStatus)" size="small" style="margin-left: 8px">
        {{ statusLabel(formStatus) }}
      </el-tag>
      <div class="toolbar-right">
        <el-button type="primary" :icon="Check" @click="handleSave" :loading="saving">保存</el-button>
        <el-button v-if="formStatus === 'DRAFT'" type="success" :icon="Promotion" @click="handlePublish" :loading="publishing">
          发布
        </el-button>
      </div>
    </div>

    <!-- VTJ 设计器容器 -->
    <div class="designer-body" v-loading="loading">
      <!-- VTJ 设计器通过 provider 全局渲染，这里只需要一个容器 -->
      <div ref="designerContainer" class="vtj-designer-container" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Check, Promotion } from '@element-plus/icons-vue'
import { useProvider } from '@vtj/web'
import { formApi, type FormDefinitionDetailDTO } from '@/api/form'
import type { BlockSchema } from '@vtj/core'

const route = useRoute()
const router = useRouter()

const designerContainer = ref<HTMLElement | null>(null)
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)

const formId = computed(() => route.query.id as string)
const formName = ref('')
const formStatus = ref('')
const formKey = ref('')

// VTJ Provider 实例（在 main.ts 中通过 createProvider 全局注册）
const provider = useProvider()

// 设计器引擎实例
// TODO: useProvider() 返回 Provider（运行时渲染器），设计器引擎 Engine 需要通过
// @vtj/designer 的 useEngine() 获取。当前 main.ts 仅注册了 Provider，
// 设计器 UI 入口在页面右下角。如果后续需要编程式 load/export，
// 可通过 engine.applyAI(dsl) 加载、engine.current.value.toDsl() 导出。
let engine: any = null

onMounted(async () => {
  if (!formId.value) {
    ElMessage.error('缺少表单 ID')
    router.push('/form')
    return
  }

  loading.value = true
  try {
    const res = await formApi.getFormDefinition(formId.value)
    const formDef = res.data as FormDefinitionDetailDTO
    formName.value = formDef.name
    formStatus.value = formDef.status
    formKey.value = formDef.key

    // 加载已有 DSL 到 VTJ 设计器
    if (formDef.schema && formDef.schema !== '[]' && formDef.schema !== '') {
      try {
        const dsl = JSON.parse(formDef.schema) as BlockSchema
        await loadDslIntoDesigner(dsl)
      } catch {
        // schema 解析失败，使用空设计器
      }
    }
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  // 清理设计器资源（如有）
  engine = null
})

/**
 * 加载 DSL 到 VTJ 设计器
 * TODO: 确认 engine 的获取方式。当前通过 provider 间接访问。
 * VTJ 设计器 Engine 提供 applyAI(dsl) 方法加载 BlockSchema。
 */
async function loadDslIntoDesigner(dsl: BlockSchema) {
  await nextTick()
  try {
    // 确保设计器容器已渲染
    if (!designerContainer.value) return
    // 尝试通过 provider 获取设计器引擎
    // TODO: 需要确认 provider 是否暴露 engine，或需要从 @vtj/designer 的 useEngine() 获取
    const anyProvider = provider as any
    engine = anyProvider.engine || anyProvider.simulator?.engine || null
    if (engine && typeof engine.applyAI === 'function') {
      await engine.applyAI(dsl)
    }
  } catch {
    // 设计器未就绪或加载失败，静默处理
  }
}

/**
 * 从 VTJ 设计器导出当前 DSL
 * TODO: 确认 engine.current.value.toDsl() 的可用性。
 * BlockModel.toDsl() 返回 BlockSchema。
 */
function exportDslFromDesigner(): BlockSchema | null {
  try {
    if (engine && engine.current && engine.current.value) {
      const currentBlock = engine.current.value
      if (typeof currentBlock.toDsl === 'function') {
        return currentBlock.toDsl()
      }
    }
    return null
  } catch {
    return null
  }
}

async function handleSave() {
  saving.value = true
  try {
    const dsl = exportDslFromDesigner()
    const schemaJson = dsl ? JSON.stringify(dsl) : ''
    await formApi.updateFormDefinition(formId.value, {
      name: formName.value,
      key: formKey.value,
      schema: schemaJson,
    })
    ElMessage.success('保存成功')
    // 刷新状态
    const res = await formApi.getFormDefinition(formId.value)
    formStatus.value = (res.data as FormDefinitionDetailDTO).status
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    saving.value = false
  }
}

async function handlePublish() {
  try {
    await ElMessageBox.confirm('确定要发布此表单吗？发布后不可修改，新版本将作为草稿。', '确认发布', {
      type: 'warning',
    })
  } catch {
    return
  }

  publishing.value = true
  try {
    await formApi.publishFormDefinition(formId.value)
    ElMessage.success('发布成功')
    // 刷新状态
    const res = await formApi.getFormDefinition(formId.value)
    formStatus.value = (res.data as FormDefinitionDetailDTO).status
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    publishing.value = false
  }
}

function handleBack() {
  router.push('/form')
}

function statusTagType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    DRAFT: 'warning',
    PUBLISHED: 'success',
    ARCHIVED: 'info',
  }
  return map[status] || ''
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    ARCHIVED: '已归档',
  }
  return map[status] || status
}
</script>

<style scoped>
.form-designer-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.designer-toolbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  gap: 8px;
  height: 50px;
  flex-shrink: 0;
}

.form-name {
  font-size: 16px;
  font-weight: bold;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.designer-body {
  flex: 1;
  overflow: hidden;
}

.vtj-designer-container {
  width: 100%;
  height: 100%;
}
</style>
