import http from '@/utils/http'
import type { R } from '@/types/common'

/**
 * 任务催办 API。
 *
 * 对应 POST /api/v1/tasks/{taskId}/remind。
 * 向当前任务的办理人发送催办通知（站内信 / 消息推送）。
 *
 * TaskTodoVO.reminded 字段标记该任务是否已被催办。
 */
export const taskRemindApi = {
  /**
   * 催办指定任务。
   *
   * @param taskId 任务 ID
   * @param data 可选的催办附加信息（消息内容等）
   * @returns 后端返回 void
   */
  remind(taskId: string, data?: { message?: string }): Promise<R<void>> {
    return http.post(`/v1/tasks/${taskId}/remind`, data)
  },
}
