<template>
  <div class="jii-wrap">
    <!-- 图标模式：嵌在参数行内（删除按钮之后），已导入结构时图标变绿提示 -->
    <el-tooltip v-if="icon" placement="top" :content="iconTip">
      <el-button
        size="small"
        text
        type="primary"
        class="jii-icon-btn"
        :class="{ 'is-set': hasStructure }"
        aria-label="导入 JSON 实例"
        @click="open = true"
      >
        <el-icon><Upload /></el-icon>
      </el-button>
    </el-tooltip>
    <!-- 菜单模式：结构与删除按钮并列时防拥挤——单一入口承载 查看/导入(JSON·表单)/清除 -->
    <!-- 注：触发按钮不用 el-tooltip 包裹（会吞掉 el-dropdown 的 click 触发导致菜单打不开），改用原生 title -->
    <el-dropdown
      v-else-if="mode === 'menu'"
      trigger="click"
      placement="bottom-end"
      popper-class="jii-menu"
      @command="onMenuCmd"
    >
      <el-button
        size="small"
        text
        type="primary"
        class="jii-icon-btn"
        :class="{ 'is-set': hasStructure }"
        :title="iconTip"
        aria-label="字段结构：查看 / 导入"
      >
        <el-badge
          :value="hasStructure ? stats : undefined"
          :max="99"
          type="success"
          class="jii-badge"
        >
          <el-icon><Upload /></el-icon>
        </el-badge>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="manage">
            {{ hasStructure ? `查看结构树（${stats} 字段）` : '粘贴 JSON 实例导入…' }}
          </el-dropdown-item>
          <el-dropdown-item v-if="isFormData" command="form" divided>从绑定表单导入结构</el-dropdown-item>
          <el-dropdown-item v-if="hasStructure" command="clear" divided>清除结构</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <template v-else>
      <el-button size="small" text type="primary" class="jii-btn" @click="open = true">
        <el-icon><Upload /></el-icon>
        导入 JSON 实例
      </el-button>
      <el-tag v-if="hasStructure" size="small" type="success" effect="plain" closable class="jii-tag" @close="emit('clear')">
        结构 {{ stats }} 字段
      </el-tag>
    </template>

    <el-dialog
      v-model="open"
      width="560px"
      append-to-body
      :close-on-click-modal="false"
      class="jii-dialog"
    >
      <template #header>
        <div class="jii-head">
          <span class="jii-title">{{ hasStructure ? '字段结构（查看 / 重新导入）' : '导入 JSON 实例生成变量结构' }}</span>
          <span class="jii-sub">粘贴一份示例 JSON，系统据此生成字段结构树，变量选择器即可展开选择到具体字段</span>
        </div>
      </template>
      <!-- 当前已导入结构：只读查看（重导前可确认现有结构，避免盲覆盖） -->
      <div v-if="hasStructure" class="jii-current">
        <div class="jii-current-head">
          <span class="jii-current-title">当前已导入结构（{{ stats }} 字段）</span>
          <el-button size="small" text type="danger" @click="onClearFromDialog">清除</el-button>
        </div>
        <StructureTree :nodes="structure" class="jii-current-tree" />
      </div>
      <el-input
        v-model="text"
        type="textarea"
        :rows="11"
        spellcheck="false"
        placeholder='例如：{"code":0,"data":{"id":123,"items":[{"sku":"A-1","qty":2}]},"msg":"ok"}'
        class="jii-textarea"
      />
      <div class="jii-preview" :class="preview.ok ? 'is-ok' : 'is-err'">
        <template v-if="!text.trim()">等待输入…</template>
        <template v-else-if="preview.ok && preview.stats">
          ✓ 识别成功：{{ preview.stats.top }} 个顶层字段 · 共 {{ preview.stats.total }} 个节点 · 最大深度 {{ preview.stats.depth }}
          <template v-if="preview.stats.truncated">（超出规模上限已截断：深度 ≤ {{ JSON_INFER_MAX_DEPTH }}、单层 ≤ {{ JSON_INFER_MAX_KEYS }} 键）</template>
        </template>
        <template v-else>✗ {{ preview.error }}</template>
      </div>
      <template #footer>
        <el-button @click="open = false">关闭</el-button>
        <el-button type="primary" :disabled="!preview.ok" @click="onImport">{{ hasStructure ? '覆盖导入' : '导入' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import type { FieldNode } from '../utils/dsl'
import StructureTree from './StructureTree.vue'
import {
  inferStructureFromJsonText,
  statFields,
  JSON_INFER_MAX_DEPTH,
  JSON_INFER_MAX_KEYS,
} from '../utils/jsonStructure'

const props = withDefaults(
  defineProps<{
    /** 已导入的结构（存在时显示成功标签/图标变绿与清除按钮） */
    structure?: FieldNode[] | null
    /** 图标按钮模式（嵌入参数行内，仅图标 + tooltip 提示状态）；默认 false = 文本按钮 + 结构标签 */
    icon?: boolean
    /** 菜单模式：单一入口下拉（查看/导入/清除），多图标并列行内防拥挤 */
    mode?: 'icon' | 'menu'
    /** menu 模式：是否提供「从绑定表单导入」菜单项（formData 参数） */
    isFormData?: boolean
  }>(),
  { icon: false, mode: 'icon', isFormData: false }
)

const emit = defineEmits<{
  import: [fields: FieldNode[]]
  clear: []
  /** menu 模式：请求从绑定表单导入结构（formData 参数） */
  'import-form': []
}>()

const open = ref(false)
const text = ref('')

// 打开时清空输入区：当前结构已在上方「当前已导入结构」区只读展示，粘贴新实例即覆盖导入
watch(open, (v) => {
  if (v) text.value = ''
})

const hasStructure = computed(() => Array.isArray(props.structure) && props.structure.length > 0)
const stats = computed(() => (hasStructure.value ? statFields(props.structure as FieldNode[]).total : 0))

/** 图标/菜单模式 tooltip：无结构引导导入，有结构引导查看 + 可重导 */
const iconTip = computed(() =>
  hasStructure.value ? `已导入结构（${stats.value} 字段）· 点击查看结构树 / 重新导入` : '导入字段结构（粘贴 JSON 实例 / 绑定表单）'
)

/** menu 模式下拉指令分发：manage=打开对话框（顶部即当前结构树），form=表单导入，clear=清除 */
function onMenuCmd(cmd: string | number | object) {
  if (cmd === 'manage') open.value = true
  else if (cmd === 'form') emit('import-form')
  else if (cmd === 'clear') {
    emit('clear')
    ElMessage.success('已清除结构')
  }
}

/** 实时解析预览（防抖不需要：解析轻量） */
const preview = computed(() => inferStructureFromJsonText(text.value))

function onImport() {
  const r = inferStructureFromJsonText(text.value)
  if (!r.ok || !r.fields?.length) {
    ElMessage.error(r.error || '未能识别出字段结构')
    return
  }
  emit('import', r.fields)
  // 导入后不关闭对话框：emit 同步更新 structure，上方「当前已导入结构」树立即可见，
  // 满足「导入后可直接查看结构」；粘贴区保留，粘贴新实例可继续覆盖导入（真实反馈：
  // 导入成功后对话框立即关闭，行内只剩变绿图标，结构树需再点图标重开才能看到）
  ElMessage.success(`已导入结构：${r.stats?.top ?? r.fields.length} 个顶层字段，可在上方查看结构树`)
}

function onClearFromDialog() {
  emit('clear')
  open.value = false
  ElMessage.success('已清除结构')
}
</script>

<style scoped>
.jii-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.jii-btn {
  padding: 0 4px;
}

.jii-icon-btn {
  padding: 5px 6px;
}

.jii-icon-btn.is-set {
  color: var(--el-color-success);
}

.jii-icon-btn.is-set:hover {
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 12%, transparent);
}

/* menu 模式：字段数徽标（右上角小圆标，空值不渲染） */
.jii-badge :deep(.el-badge__content) {
  position: absolute;
  top: 2px;
  right: calc(-6px - var(--el-badge-size, 18px) / 2);
  transform: translateY(-50%) translateX(50%);
  font-size: 10px;
  line-height: 14px;
  height: 14px;
  padding: 0 4px;
}

.jii-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.jii-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.jii-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

/* 当前已导入结构查看区（只读树 + 清除入口） */
.jii-current {
  margin-bottom: 10px;
}
.jii-current-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.jii-current-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-success);
}
.jii-current-tree {
  background: color-mix(in srgb, var(--el-color-success) 4%, var(--el-fill-color-extra-light));
}

.jii-preview {
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
}

.jii-preview.is-ok {
  background: var(--el-color-success-light-9, #f0f9eb);
  color: var(--el-color-success);
}

.jii-preview.is-err {
  background: var(--el-color-danger-light-9, #fef0f0);
  color: var(--el-color-danger);
  word-break: break-all;
}

.jii-textarea :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
}
</style>
