<template>
  <div class="designer-toolbar">
    <div class="toolbar-left">
      <el-button-group>
        <el-button :icon="ArrowLeft" size="small" @click="$emit('back')" title="返回" />
      </el-button-group>
      <template v-if="!readOnly">
        <el-divider direction="vertical" />
        <el-button-group>
          <el-button :icon="RefreshLeft" size="small" @click="$emit('undo')" title="撤销" />
          <el-button :icon="RefreshRight" size="small" @click="$emit('redo')" title="重做" />
        </el-button-group>
        <el-divider direction="vertical" />
        <el-button-group>
          <el-button :icon="ZoomIn" size="small" @click="$emit('zoomIn')" title="放大" />
          <el-button :icon="ZoomOut" size="small" @click="$emit('zoomOut')" title="缩小" />
          <el-button :icon="FullScreen" size="small" @click="$emit('zoomReset')" title="适应屏幕" />
        </el-button-group>
        <el-divider direction="vertical" />
        <div class="minimap-toggle">
          <span class="toggle-label">鸟瞰图</span>
          <el-switch
            v-model="minimapVisible"
            size="small"
            @change="(val: boolean) => $emit('toggleMinimap', val)"
          />
        </div>
      </template>
    </div>

    <div class="toolbar-center">
      <span class="designer-title">{{ readOnly ? '流程版本查看' : '流程设计器' }}</span>
      <el-tag v-if="draftName" type="info" size="small">{{ draftName }}</el-tag>
      <el-tag v-if="draftKey" type="info" size="small" effect="plain">{{ draftKey }}</el-tag>
      <el-tag v-if="isDirty" type="warning" size="small">未保存</el-tag>
      <el-breadcrumb v-if="subflowBreadcrumbs.length" separator="/" style="margin-left: 12px">
        <el-breadcrumb-item
          v-for="(crumb, i) in subflowBreadcrumbs"
          :key="crumb.id"
          @click="$emit('exit-to-level', i)"
        >{{ crumb.name || '未命名子流程' }}</el-breadcrumb-item>
      </el-breadcrumb>
      <!-- 子流程编辑模式：显眼返回按钮 -->
      <el-button
        v-if="isInsideSubflow"
        :icon="Back"
        size="small"
        type="warning"
        plain
        style="margin-left: 12px"
        @click="$emit('exit-to-level', 0)"
      >退出子流程</el-button>
    </div>

    <div class="toolbar-right">
      <template v-if="!readOnly">
        <el-button-group>
          <el-button :icon="Upload" size="small" @click="$emit('importXml')" title="导入" />
          <el-button :icon="Download" size="small" @click="$emit('exportXml')" title="导出XML" />
          <el-button :icon="Picture" size="small" @click="$emit('exportSvg')" title="导出SVG" />
        </el-button-group>
        <el-divider direction="vertical" />
        <el-button type="primary" :icon="Document" size="small" @click="$emit('save')" title="保存" />
        <el-button type="success" :icon="Promotion" size="small" @click="$emit('deploy')" title="部署" />
      </template>
      <el-tag v-else type="info" size="small" effect="plain">只读模式</el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  Back,
  RefreshLeft,
  RefreshRight,
  ZoomIn,
  ZoomOut,
  FullScreen,
  Upload,
  Download,
  Picture,
  Document,
  Promotion
} from '@element-plus/icons-vue'
import { useDesignerStore } from '@/stores/designerStore'
import { ref, computed } from 'vue'

const designerStore = useDesignerStore()

defineProps<{
  /** 只读模式：隐藏保存/部署/导入/撤销/重做等编辑类按钮 */
  readOnly?: boolean
}>()

const draftName = computed(() => designerStore.draftName)
const draftKey = computed(() => designerStore.draftKey)
const isDirty = computed(() => designerStore.isDirty)
const subflowBreadcrumbs = computed(() => designerStore.subflowBreadcrumbs)
const isInsideSubflow = computed(() => designerStore.isInsideSubflow)

// 鸟瞰图开关，默认显示
const minimapVisible = ref(true)

defineEmits<{
  (e: 'save'): void
  (e: 'deploy'): void
  (e: 'exportXml'): void
  (e: 'exportSvg'): void
  (e: 'importXml'): void
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'zoomIn'): void
  (e: 'zoomOut'): void
  (e: 'zoomReset'): void
  (e: 'back'): void
  (e: 'toggleMinimap', visible: boolean): void
  (e: 'exit-to-level', level: number): void
}>()
</script>

<style scoped>
.designer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 48px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  z-index: 10;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #303133;
}

.designer-title {
  font-weight: 600;
  font-size: 15px;
}

.minimap-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toggle-label {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}
</style>
