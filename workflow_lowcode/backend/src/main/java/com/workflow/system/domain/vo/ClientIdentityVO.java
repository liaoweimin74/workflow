package com.workflow.system.domain.vo;

import java.time.LocalDateTime;
import java.util.List;

/**
 * A4 端身份 Tab 行（spec client-login-identity）：账号在单端的 openid 绑定 + 推送设备聚合视图。
 *
 * <p>身份值只出掩码形态（前4+****+后4），完整 openid/deviceToken 不落管理端展示链。
 * openidMasked/boundAt 为 null = 该端只有设备记录、未绑 openid。
 */
public record ClientIdentityVO(
        Long clientId,
        String clientName,
        String clientCode,
        String openidMasked,
        LocalDateTime boundAt,
        List<DeviceVO> devices) {
}
