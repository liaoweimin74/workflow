package com.workflow.system.controller;

import com.workflow.common.domain.R;
import com.workflow.system.domain.vo.ClientIdentityVO;
import com.workflow.system.service.ClientIdentityService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * A4 端身份 Tab 管理端点（J5a，spec client-login-identity）。
 *
 * <p>授权口径沿用现网 system 控制器先例：登录校验 + 前端按钮权限码
 * （V76 seed：system:user:identity/unbind/revoke/bindcode）显隐管控。
 * 绑定码签发复用 POST /api/auth/bind-code/issue（J3），不在此重复挂点。
 */
@RestController
@RequestMapping("/api/users")
public class ClientIdentityController {

    private final ClientIdentityService clientIdentityService;

    public ClientIdentityController(ClientIdentityService clientIdentityService) {
        this.clientIdentityService = clientIdentityService;
    }

    /** 账号按端的 openid 绑定 + 推送设备列表（掩码输出）。 */
    @GetMapping("/{userId}/client-identities")
    public R<List<ClientIdentityVO>> list(@PathVariable Long userId) {
        return R.ok(clientIdentityService.listByUser(userId));
    }

    /** 管理员解绑指定端的身份（与本人 POST /api/auth/client/unbind 分离）。 */
    @PostMapping("/{userId}/client-identities/{clientId}/unbind")
    public R<Void> unbind(@PathVariable Long userId, @PathVariable Long clientId) {
        clientIdentityService.adminUnbind(userId, clientId);
        return R.ok();
    }

    /** 吊销指定推送设备（revoked=1，通知发送侧跳过）。 */
    @PostMapping("/{userId}/devices/{deviceId}/revoke")
    public R<Void> revoke(@PathVariable Long userId, @PathVariable Long deviceId) {
        clientIdentityService.revokeDevice(userId, deviceId);
        return R.ok();
    }
}
