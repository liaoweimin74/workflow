<script setup lang="ts">
import * as Icons from '@element-plus/icons-vue'

const props = defineProps<{ menuList: any[]; depth?: number }>()
const depth = props.depth ?? 0

function resolveIcon(iconName: string) {
  return (Icons as Record<string, any>)[iconName] || Icons.Menu
}

/** 子级可渲染菜单（排除按钮 menuType=2） */
function renderableChildren(item: any): any[] {
  return (item.children || []).filter((c: any) => c.menuType !== 2)
}
</script>

<template>
  <template v-for="item in menuList" :key="item.id">
    <!-- 有可渲染子菜单（子级含非按钮菜单） -->
    <el-sub-menu
      v-if="item.children && item.children.length > 0 && item.children.some((c: any) => c.menuType !== 2)"
      :index="'submenu-' + item.id"
      class="!mx-2"
    >
      <template #title>
        <el-icon :size="16">
          <component :is="resolveIcon(item.icon)" />
        </el-icon>
        <span class="font-medium">{{ item.menuName }}</span>
      </template>
      <!-- 子菜单缩进一个字符（14px）；按钮（menuType=2）排除 -->
      <el-menu-item
        v-for="child in renderableChildren(item)"
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

    <!-- 叶子菜单（无子级或子级全是按钮） -->
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