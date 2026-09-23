import { Module } from '@nestjs/common'
import {
  NotificationAnnouncementController,
  NotificationChannelController,
  NotificationDeliveryController,
  NotificationEventController,
  NotificationStatsController,
  NotificationSubscriptionController,
  NotificationTemplateController,
} from './controller/notification-admin.controller'
import { NotificationController } from './controller/notification.controller'
import { InternalNotificationController } from './controller/internal-notification.controller'
import { NotificationRepository } from './repository/notification.repository'
import { MessageSendService } from './service/message-send.service'
import { NotificationAdminService } from './service/notification-admin.service'
import { NotificationService } from './service/notification.service'
import { NotificationWriteService } from './service/notification-write.service'
import { NotificationSseManager } from './sse/notification-sse.manager'

/**
 * 通知模块（对齐 Java `com.workflow.notification`）。
 *
 * 依赖方向：notification → framework → common（由 eslint 边界规则强制）。
 * 注意：本模块**不依赖 engine / system** —— 角色查询直接落 `sys_role`，
 * 不复用 system 模块的 AuthRepository（见 NotificationRepository 的说明）。
 */
@Module({
  controllers: [
    NotificationController,
    NotificationTemplateController,
    NotificationChannelController,
    NotificationEventController,
    NotificationStatsController,
    NotificationAnnouncementController,
    NotificationDeliveryController,
    NotificationSubscriptionController,
    InternalNotificationController,
  ],
  providers: [
    NotificationSseManager,
    NotificationRepository,
    NotificationService,
    NotificationAdminService,
    NotificationWriteService,
    MessageSendService,
  ],
  exports: [
    NotificationRepository,
    NotificationService,
    NotificationAdminService,
    MessageSendService,
  ],
})
export class NotificationModule {}
