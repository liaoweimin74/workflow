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

    <!-- form-create 设计器 -->
    <div class="designer-body" v-loading="loading">
      <fc-designer
        ref="designerRef"
        :height="designerHeight"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Check, Promotion } from '@element-plus/icons-vue'
import { formApi, type FormDefinitionDetailDTO } from '@/api/form'

const route = useRoute()
const router = useRouter()

const designerRef = ref<any>(null)
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)

const formId = computed(() => route.query.id as string)
const formName = ref('')
const formStatus = ref('')
const formKey = ref('')

const designerHeight = ref('calc(100vh - 50px)')

onMounted(async () => {
  if (!formId.value) {
    ElMessage.error('缺少表单 ID')
    router.push('/form')
    return
  }

  // 注册 LookupPicker 到设计器拖拽面板
  designerRef.value?.addComponent({
    label: '字典选择器',
    name: 'LookupPicker',
    rule: {
      type: 'LookupPicker',
      field: '',
      title: '选择',
      props: {
        columns: [],
        fetchApi: null,
        displayField: '',
        returnFields: {},
      },
    },
  })

  loading.value = true
  try {
    const res = await formApi.getFormDefinition(formId.value)
    const formDef = res.data as FormDefinitionDetailDTO
    formName.value = formDef.name
    formStatus.value = formDef.status
    formKey.value = formDef.key

    // 加载已有 schema 到设计器
    if (formDef.schema && formDef.schema !== '[]') {
      try {
        const rule = JSON.parse(formDef.schema)
        // 等待设计器渲染完成
        await nextTick()
        if (designerRef.value) {
          designerRef.value.setRule(rule)
        }
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

async function handleSave() {
  if (!designerRef.value) return

  saving.value = true
  try {
    const rule = designerRef.value.getRule()
    const schemaJson = JSON.stringify(rule)
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

import { nextTick } from 'vue'
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
</style>
