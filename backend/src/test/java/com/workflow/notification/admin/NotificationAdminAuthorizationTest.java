package com.workflow.notification.admin;

import com.workflow.framework.security.domain.LoginUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationAdminAuthorizationTest {

    @BeforeEach
    void resetSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void accepts_role_admin() {
        authenticate(List.of("ROLE_ADMIN"));

        assertThatCode(NotificationAdminAuthorization::requireAdmin)
                .doesNotThrowAnyException();
    }

    @Test
    void accepts_legacy_admin_role() {
        authenticate(List.of("admin"));

        assertThatCode(NotificationAdminAuthorization::requireAdmin)
                .doesNotThrowAnyException();
    }

    @Test
    void rejects_non_admin_role() {
        authenticate(List.of("ROLE_USER"));

        assertThatThrownBy(NotificationAdminAuthorization::requireAdmin)
                .isInstanceOf(com.workflow.common.exception.BusinessException.class)
                .hasMessage("需要管理员权限");
    }

    @Test
    void rejects_missing_authentication() {
        assertThatThrownBy(NotificationAdminAuthorization::requireAdmin)
                .isInstanceOf(com.workflow.common.exception.BusinessException.class)
                .hasMessage("需要管理员权限");
    }

    private void authenticate(List<String> roles) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        new LoginUser(100L, "user", "x", roles, Set.of(), true),
                        null));
    }
}
