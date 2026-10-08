package com.workflow.framework.security.permission;

import com.workflow.framework.security.domain.LoginUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component("pe")
public class PermissionEvaluator {
    public boolean hasPermission(String... permissions) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return false;
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof LoginUser loginUser) {
            // 管理员绕过：兼容 "admin"（历史）与 "ROLE_ADMIN"（系统角色 code）
            if (loginUser.getRoles().stream().anyMatch(r -> "admin".equals(r) || "ROLE_ADMIN".equals(r))) {
                return true;
            }
            for (String permission : permissions) {
                if (loginUser.getPermissions().contains(permission)) {
                    return true;
                }
            }
        }
        return false;
    }
}