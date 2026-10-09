package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.event.NotificationEventService;
import com.workflow.notification.model.NotificationEventDefinition;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class EventDefinitionControllerTest {

    private NotificationEventService service;
    private TenantProvider tenantProvider;
    private EventDefinitionController controller;

    @BeforeEach
    void setUp() {
        service = mock(NotificationEventService.class);
        tenantProvider = mock(TenantProvider.class);
        when(tenantProvider.getTenantId()).thenReturn("default");
        controller = new EventDefinitionController(service, tenantProvider);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new LoginUser(100L, "admin", "x", List.of("ROLE_ADMIN"), Set.of(), true), null));
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void list_delegates_current_tenant() {
        when(service.list(eq("default"), eq(0), eq(20), isNull(), isNull()))
                .thenReturn(new com.workflow.common.domain.PageResult<>(0, 0, 20, List.of()));

        R<?> result = controller.list(0, 20, null, null);

        assertThat(result.getCode()).isEqualTo(200);
        verify(service).list("default", 0, 20, null, null);
    }

    @Test
    void create_passes_operator_and_payload() {
        NotificationEventDefinition event = new NotificationEventDefinition();
        event.setEventCode("TASK_CREATED");
        when(service.create("default", "admin", "TASK_CREATED", "任务创建", "说明", "流程"))
                .thenReturn(event);

        R<NotificationEventDefinition> result = controller.create(Map.of(
                "eventCode", "TASK_CREATED", "eventName", "任务创建",
                "description", "说明", "businessDomain", "流程"));

        assertThat(result.getData()).isSameAs(event);
        verify(service).create("default", "admin", "TASK_CREATED", "任务创建", "说明", "流程");
    }

    @Test
    void non_admin_is_rejected() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new LoginUser(101L, "user", "x", List.of("ROLE_USER"), Set.of(), true), null));

        assertThatThrownBy(() -> controller.list(0, 20, null, null))
                .isInstanceOf(com.workflow.common.exception.BusinessException.class)
                .hasMessage("需要管理员权限");
        verifyNoInteractions(service);
    }
}
