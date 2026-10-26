package com.workflow.system.service;

import com.workflow.system.domain.vo.ClientIdentityVO;

import java.util.List;

/**
 * A4 端身份管理链（J5a，spec client-login-identity「端身份 Tab」）。
 *
 * <p>与本人自助链（AuthService.clientUnbind）分离：本服务按 userId 定向操作，
 * 供管理端使用；绑定码签发复用 AuthService.issueBindCode，不在本面。
 */
public interface ClientIdentityService {

    /** 账号的全部端身份（openid 绑定 + 推送设备按端聚合，掩码输出，clientId 升序）。 */
    List<ClientIdentityVO> listByUser(Long userId);

    /** 管理员解绑账号在指定端的 openid 绑定（软删，与本人解绑同形状）。 */
    void adminUnbind(Long userId, Long clientId);

    /** 吊销账号的推送设备（revoked=1；异主或不存在统一 404 防越权探测；已吊销幂等）。 */
    void revokeDevice(Long userId, Long deviceId);
}
