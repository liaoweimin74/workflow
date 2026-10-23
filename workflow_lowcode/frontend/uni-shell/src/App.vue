<script setup lang="ts">
// uni-shell 全局壳（Task 3.3 骨架）：generatePageUni 产物同步后以产物 App.vue 为准（Task 8.x）
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  console.log('[uni-shell] launched')
})
</script>

<style>
page {
  background-color: #f7f8fa;
}
</style>
