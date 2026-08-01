<script setup lang="ts">
import * as Icons from '@element-plus/icons-vue'

const props = defineProps<{ menuList: any[]; depth?: number }>()
const depth = props.depth ?? 0

function resolveIcon(iconName: string) {
  return (Icons as Record<string, any>)[iconName] || Icons.Menu
}
</script>

<template>
  <template v-for="item in menuList" :key="item.id">
    <!-- 有子菜单 -->
    <el-sub-menu
      v-if="item.children && item.children.length > 0"
      :index="item.path || String(item.id)"
      class="!mx-2"
    >
      <template #title>
        <el-icon :size="16">
          <component :is="resolveIcon(item.icon)" />
        </el-icon>
        <span class="font-medium">{{ item.menuName }}</span>
      </template>
      <!-- 子菜单缩进一个字符（14px） -->
      <el-menu-item
        v-for="child in item.children"
        :key="child.id"
        :index="child.path"
        :style="{ paddingLeft: `${(depth + 1) * 14 + 20}px` }"
      >
        <el-icon :size="16">
          <component :is="resolveIcon(child.icon)" />
        </el-icon>
        <template #title>{{ child.menuName }}</template>
      </el-menu-item>
    </el-sub-menu>

    <!-- 无子菜单 -->
    <el-menu-item
      v-else-if="item.menuType === 1"
      :index="item.path"
      :style="{ paddingLeft: `${depth * 14 + 20}px` }"
    >
      <el-icon :size="16">
        <component :is="resolveIcon(item.icon)" />
      </el-icon>
      <template #title>{{ item.menuName }}</template>
    </el-menu-item>
  </template>
</template>