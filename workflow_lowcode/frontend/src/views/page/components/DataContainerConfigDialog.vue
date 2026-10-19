<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="520px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-alert
      v-if="formDataSources.length === 0"
      type="warning"
      :closable="false"
      show-icon
      title="当前页面还没有数据源"
      description="先在页面数据源里添加一个数据源，再回来绑定给容器。"
      style="margin-bottom: 12px"
    />

    <el-form label-width="88px">
      <el-form-item label="标题">
        <el-input v-model="form.title" maxlength="40" placeholder="如 部门报销概览" />
      </el-form-item>

      <el-form-item label="数据源">
        <el-select v-model="form.dataSourceId" placeholder="选择页面级数据源" style="width: 100%">
          <el-option
            v-for="ds in formDataSources"
            :key="ds.id"
            :value="ds.id"
            :label="ds.name || ds.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="取数形态">
        <el-radio-group v-model="form.queryMode">
          <el-radio value="list">列表</el-radio>
          <el-radio value="single">单条</el-radio>
        </el-radio-group>
        <div class="dc-hint">
          容器把取到的记录交给内部组件做文案渲染：列表用 <code>{rows[0].字段}</code>、
          <code>{rows.length}</code>，单条用 <code>{row.字段}</code>。子组件不再各自绑数据源。
        </div>
      </el-form-item>

      <el-form-item v-if="form.queryMode === 'list'" label="取几条">
        <el-input-number v-model="form.pageSize" :min="1" :max="200" />
      </el-form-item>

      <DashSizeFields v-model:span="form.span" v-model:height="form.height" />
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!canConfirm" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 数据容器配置弹窗。
 *
 * 没走 DashConfigDialog：那个弹窗按 `active.rule.type === 组件类型` 判定回填与写回，
 * 而容器在画布里的实际类型是 form-create 的行容器（fcRow，为了拿到拖入子组件的能力），
 * 塞进去只会在两边都加分支判断。配置项就五个，独立弹窗更清楚。
 */
import { computed, reactive, watch } from 'vue'
import DashSizeFields from '@/views/dashboard/components/DashSizeFields.vue'

interface FormDataSource {
  id: string
  refId: string
  name?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    bindingProps?: Record<string, any>
    formDataSources?: FormDataSource[]
  }>(),
  { formDataSources: () => [] },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [patch: Record<string, unknown>]
}>()

const form = reactive({
  title: '数据容器',
  dataSourceId: '',
  queryMode: 'list' as 'list' | 'single',
  pageSize: 20,
  span: 24,
  height: '',
})

const canConfirm = computed(() => !!form.dataSourceId)

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) return
    const p = props.bindingProps || {}
    form.title = String(p.title ?? '数据容器')
    form.dataSourceId = String(p.dataSourceId ?? '')
    form.queryMode = p.queryMode === 'single' ? 'single' : 'list'
    form.pageSize = Number(p.pageSize ?? 20) || 20
    form.span = Number(p.span ?? 24) || 24
    form.height = String(p.height ?? '')
  },
)

function confirm(): void {
  emit('confirm', {
    title: form.title,
    dataSourceId: form.dataSourceId,
    queryMode: form.queryMode,
    pageSize: form.queryMode === 'single' ? 1 : form.pageSize,
    span: form.span,
    height: form.height,
  })
  emit('update:modelValue', false)
}
</script>

<style scoped>
.dc-hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.dc-hint code {
  padding: 0 4px;
  background: var(--el-fill-color-light);
  border-radius: 3px;
}
</style>
