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
          <span class="jii-title">导入 JSON 实例生成变量结构</span>
          <span class="jii-sub">粘贴一份示例 JSON，系统据此生成字段结构树，变量选择器即可展开选择到具体字段</span>
        </div>
      </template>
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
        <el-button v-if="hasStructure" size="small" text type="danger" @click="onClearFromDialog">清除已有结构</el-button>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :disabled="!preview.ok" @click="onImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import type { FieldNode } from '../utils/dsl'
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
  }>(),
  { icon: false }
)

const emit = defineEmits<{
  import: [fields: FieldNode[]]
  clear: []
}>()

const open = ref(false)
const text = ref('')

// 打开时预填当前实例结构（仅展示统计；实例本身未存，从结构还原成示例骨架便于增量编辑）
watch(open, (v) => {
  if (v) text.value = ''
})

const hasStructure = computed(() => Array.isArray(props.structure) && props.structure.length > 0)
const stats = computed(() => (hasStructure.value ? statFields(props.structure as FieldNode[]).total : 0))

/** 图标模式 tooltip：无结构引导导入，有结构报字段数 + 可重导 */
const iconTip = computed(() =>
  hasStructure.value ? `已导入结构（${stats.value} 字段）· 点击重新导入` : '导入 JSON 实例生成变量结构'
)

/** 实时解析预览（防抖不需要：解析轻量） */
const preview = computed(() => inferStructureFromJsonText(text.value))

function onImport() {
  const r = inferStructureFromJsonText(text.value)
  if (!r.ok || !r.fields?.length) {
    ElMessage.error(r.error || '未能识别出字段结构')
    return
  }
  emit('import', r.fields)
  open.value = false
  ElMessage.success(`已导入结构：${r.stats?.top ?? r.fields.length} 个顶层字段`)
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
