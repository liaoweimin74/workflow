<template>
  <el-select
    :model-value="modelValue"
    :multiple="multiple"
    filterable
    remote
    reserve-keyword
    clearable
    :remote-method="handleSearch"
    :loading="loading"
    placeholder="搜索用户名/昵称"
    style="width: 100%"
    @update:model-value="handleChange"
  >
    <el-option
      v-for="user in options"
      :key="user.id"
      :label="`${user.nickname} (${user.username})`"
      :value="user.username"
    />
  </el-select>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getUserList } from '@/api/user'
import type { UserVO } from '@/types/user'

const props = withDefaults(defineProps<{
  /** 选中值（单选 string，多选 string[]） */
  modelValue?: string | string[]
  /** 是否多选 */
  multiple?: boolean
}>(), {
  multiple: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | string[]): void
  (e: 'change', value: string | string[]): void
}>()

const loading = ref(false)
const options = ref<UserVO[]>([])

async function handleSearch(query: string) {
  if (!query) {
    options.value = []
    return
  }
  loading.value = true
  try {
  const res = await getUserList({ username: query, page: 1, size: 20 })
    options.value = res.data.rows
  } catch {
    options.value = []
  } finally {
    loading.value = false
  }
}

function handleChange(value: string | string[]) {
  emit('update:modelValue', value)
  emit('change', value)
}

onMounted(() => {
  // 预加载部分用户
  handleSearch('')
})
</script>
