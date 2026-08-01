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
            if (loginUser.getRoles().contains("admin")) {
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