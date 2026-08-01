<script setup lang="ts">
import { reactive } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import http from '@/utils/http'

const authStore = useAuthStore()
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

async function handleChangePassword() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    ElMessage.warning('两次密码不一致')
    return
  }
  try {
    await http.put('/auth/password', {
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    })
    ElMessage.success('密码修改成功')
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
  } catch (e: any) {
    ElMessage.error(e?.msg || '修改失败')
  }
}
</script>

<template>
  <div style="max-width: 600px">
    <el-card>
      <template #header><span style="font-weight: bold">个人信息</span></template>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="用户名">{{ authStore.user?.username }}</el-descriptions-item>
        <el-descriptions-item label="昵称">{{ authStore.user?.nickname }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ authStore.user?.email || '-' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ authStore.user?.phone || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card style="margin-top: 16px">
      <template #header><span style="font-weight: bold">修改密码</span></template>
      <el-form :model="passwordForm" label-width="100px" style="max-width: 400px">
        <el-form-item label="旧密码" required>
          <el-input v-model="passwordForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="passwordForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认密码" required>
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleChangePassword">修改密码</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>