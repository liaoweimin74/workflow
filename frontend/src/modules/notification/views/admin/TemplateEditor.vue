<template>
  <div class="template-editor">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>{{ isEdit ? '编辑模板' : '新建模板' }}</span>
          <div>
            <el-button @click="$emit('cancel')">取消</el-button>
            <el-button type="primary" @click="handleSave">保存</el-button>
          </div>
        </div>
      </template>

      <el-form :model="form" label-width="120px" ref="formRef" :rules="rules">
        <el-form-item label="模板编码" prop="templateCode">
          <el-input v-model="form.templateCode" :disabled="isEdit" placeholder="如 TASK_CREATED" />
        </el-form-item>
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="form.name" placeholder="如 任务创建通知" />
        </el-form-item>
        <el-form-item label="标题模板">
          <el-input v-model="form.title" placeholder="支持变量：${变量名}" />
        </el-form-item>
        <el-form-item label="内容模板">
          <el-input v-model="form.content" type="textarea" :rows="6" placeholder="支持变量：${变量名}" />
        </el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="form.channel" placeholder="选择渠道">
            <el-option label="站内信" value="IN_APP" />
            <el-option label="短信" value="SMS" />
            <el-option label="企业微信" value="WECHAT_WORK" />
            <el-option label="小程序" value="WECHAT_MINIPROGRAM" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="form.priority" placeholder="选择优先级">
            <el-option label="低" value="LOW" />
            <el-option label="普通" value="NORMAL" />
            <el-option label="高" value="HIGH" />
            <el-option label="紧急" value="URGENT" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category" placeholder="选择分类">
            <el-option label="工作流" value="WORKFLOW" />
            <el-option label="系统" value="SYSTEM" />
            <el-option label="用户" value="USER" />
            <el-option label="外部" value="EXTERNAL" />
          </el-select>
        </el-form-item>
      </el-form>

      <!-- 变量预览 -->
      <el-divider content-position="left">变量预览</el-divider>
      <div class="preview-section">
        <div class="preview-item">
          <span class="preview-label">标题预览：</span>
          <span class="preview-content">{{ previewText(form.title) }}</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">内容预览：</span>
          <span class="preview-content">{{ previewText(form.content) }}</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { createTemplate, updateTemplate } from '../../api/admin'

const props = defineProps<{ templateData?: any }>()
const emit = defineEmits(['cancel', 'saved'])

const isEdit = computed(() => !!props.templateData?.id)

const form = reactive({
  templateCode: '',
  name: '',
  title: '',
  content: '',
  channel: 'IN_APP',
  priority: 'NORMAL',
  category: 'WORKFLOW',
})

const rules = {
  templateCode: [{ required: true, message: '请输入模板编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
}

onMounted(() => {
  if (props.templateData) {
    Object.assign(form, props.templateData)
  }
})

function previewText(text: string) {
  if (!text) return '(空)'
  return text.replace(/\$\{(\w+)\}/g, (_, name) => `[${name}]`)
}

async function handleSave() {
  try {
    if (isEdit.value) {
      await updateTemplate(props.templateData.id, form)
    } else {
      await createTemplate(form)
    }
    ElMessage.success('保存成功')
    emit('saved')
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败')
  }
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.preview-section {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 12px 16px;
}
.preview-item {
  margin-bottom: 8px;
}
.preview-item:last-child {
  margin-bottom: 0;
}
.preview-label {
  font-weight: 600;
  color: #606266;
}
.preview-content {
  color: #333;
}
</style>
