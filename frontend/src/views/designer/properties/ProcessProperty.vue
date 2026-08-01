<template>
  <el-form label-width="80px" size="small">
    <el-divider content-position="left">基本信息</el-divider>

    <el-form-item label="流程名称">
      <el-input v-model="config.name" placeholder="请输入流程名称" @change="updateBpmnName" />
    </el-form-item>

    <el-form-item label="流程标识">
      <el-input v-model="config.key" placeholder="process_key" disabled />
    </el-form-item>

    <el-form-item label="流程分类">
      <el-select v-model="config.categoryId" placeholder="请选择分类" clearable style="width: 100%">
        <el-option
          v-for="cat in categories"
          :key="cat.id"
          :label="cat.name"
          :value="cat.id"
        />
      </el-select>
    </el-form-item>

    <el-form-item label="流程描述">
      <el-input
        v-model="config.description"
        type="textarea"
        :rows="3"
        placeholder="请输入流程描述"
      />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, watch } from 'vue'
import { useDesignerStore } from '@/stores/designerStore'
import { categoryApi, type Category } from '@/api/category'
import { getModeler } from '../utils/bpmnModeler'

const designerStore = useDesignerStore()

const config = reactive({
  name: '',
  key: '',
  categoryId: null as string | null,
  description: ''
})

const categories = ref<Category[]>([])

onMounted(async () => {
  try {
    const res = await categoryApi.list()
    categories.value = res.data || []
  } catch {
    // ignore
  }

  // 从 BPMN XML 读取流程名称
  const modeler = getModeler()
  const canvas = (modeler as any).get('canvas')
  const rootElement = canvas.getRootElement()
  const bo = rootElement?.businessObject
  if (bo) {
    config.name = bo.name || ''
    config.key = bo.id || ''
  }
})

watch(config, () => {
  designerStore.setDraft(designerStore.draftId || '', config.name)
}, { deep: true })

function updateBpmnName() {
  const modeler = getModeler()
  const canvas = (modeler as any).get('canvas')
  const rootElement = canvas.getRootElement()
  const modeling = (modeler as any).get('modeling')
  if (rootElement) {
    modeling.updateProperties(rootElement, { name: config.name })
  }
}
</script>
