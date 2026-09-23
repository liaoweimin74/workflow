package com.workflow.notification.admin;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.domain.LoginUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 通知管理端统一鉴权。
 */
public final class NotificationAdminAuthorization {

    private NotificationAdminAuthorization() {
    }

    /**
     * 要求当前用户具备管理员角色。
     */
    public static void requireAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof LoginUser loginUser)) {
            throw new BusinessException(403, "需要管理员权限");
        }
        boolean admin = loginUser.getRoles() != null && loginUser.getRoles().stream()
                .anyMatch(role -> "ROLE_ADMIN".equals(role) || "admin".equals(role));
        if (!admin) {
            throw new BusinessException(403, "需要管理员权限");
        }
    }
}
