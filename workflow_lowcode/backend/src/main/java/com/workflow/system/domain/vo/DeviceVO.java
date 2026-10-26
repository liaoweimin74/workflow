package com.workflow.system.domain.vo;

import java.time.LocalDateTime;

/** A4 推送设备行（sys_user_device 展示投影，token 掩码）。 */
public record DeviceVO(
        Long id,
        String platform,
        String deviceTokenMasked,
        Integer revoked,
        LocalDateTime lastLoginAt) {
}
