<template>
  <view class="shell-home">
    <text class="shell-home__title">低代码 uniapp 产物宿主工程</text>
    <text class="shell-home__tip">生成页将写入 src/pages/gen/（Task 8.x 同步接线）</text>
  </view>
</template>

<script setup lang="ts">
// Task 3.3 骨架首页：uni build 要求 pages.json 至少一个页面；
// 首次产物同步（Task 8.x）后 pages.json 以客户端启用清单整体替换（清单即真相）
</script>

<style scoped>
.shell-home {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 96rpx 48rpx;
}

.shell-home__title {
  font-size: 36rpx;
  font-weight: 600;
}

.shell-home__tip {
  margin-top: 24rpx;
  font-size: 26rpx;
  color: #909193;
}
</style>
