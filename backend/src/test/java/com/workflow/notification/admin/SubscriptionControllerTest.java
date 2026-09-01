package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.SubscriptionRule;
import com.workflow.notification.subscription.SubscriptionRuleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * 管理端订阅规则 CRUD 逻辑验证
 */
class SubscriptionControllerTest {

    private SubscriptionRuleRepository repository;
    private SubscriptionController controller;

    @BeforeEach
    void setUp() {
        repository = mock(SubscriptionRuleRepository.class);
        controller = new SubscriptionController(repository);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        new LoginUser(100L, "admin", "x", List.of("ROLE_ADMIN"), java.util.Set.of(), true),
                        null));
    }

    @Test
    void list_returnsPagedRules() {
        SubscriptionRule rule = new SubscriptionRule();
        rule.setId(1L);
        rule.setEventCode("TASK_CREATED");
        rule.setChannel(ChannelType.SMS);
        Page<SubscriptionRule> page = new PageImpl<>(List.of(rule));
        when(repository.findAll(any(Specification.class), any(PageRequest.class))).thenReturn(page);

        R<Map<String, Object>> res = controller.list(0, 10, "TASK");

        assertThat(res.getCode()).isEqualTo(200);
        assertThat(res.getData().get("total")).isEqualTo(1L);
        List<?> rows = (List<?>) res.getData().get("rows");
        Map<?, ?> row = (Map<?, ?>) rows.get(0);
        assertThat(row.get("eventCode")).isEqualTo("TASK_CREATED");
        assertThat(row.get("channel")).isEqualTo(ChannelType.SMS);
    }

    @Test
    void create_savesRule_withDefaultTenantAndCreator() {
        Map<String, Object> body = Map.of(
                "eventCode", "TASK_CREATED",
                "channel", "SMS",
                "priority", "HIGH",
                "enable", true);

        R<Void> res = controller.create(body);

        assertThat(res.getCode()).isEqualTo(200);
        verify(repository).save(argThat(r -> {
            assertThat(r.getEventCode()).isEqualTo("TASK_CREATED");
            assertThat(r.getChannel()).isEqualTo(ChannelType.SMS);
            assertThat(r.getPriority()).isEqualTo(MessagePriority.HIGH);
            assertThat(r.getEnable()).isTrue();
            assertThat(r.getTenantId()).isEqualTo("default");
            assertThat(r.getCreatedBy()).isEqualTo("admin");
            return true;
        }));
    }

    @Test
    void update_changesRuleFields() {
        SubscriptionRule existing = new SubscriptionRule();
        existing.setId(7L);
        existing.setEventCode("OLD");
        when(repository.findById(7L)).thenReturn(java.util.Optional.of(existing));

        Map<String, Object> body = Map.of(
                "eventCode", "NEW",
                "channel", "IN_APP",
                "enable", false);

        R<Void> res = controller.update(7L, body);

        assertThat(res.getCode()).isEqualTo(200);
        verify(repository).save(argThat(r -> {
            assertThat(r.getId()).isEqualTo(7L);
            assertThat(r.getEventCode()).isEqualTo("NEW");
            assertThat(r.getChannel()).isEqualTo(ChannelType.IN_APP);
            assertThat(r.getEnable()).isFalse();
            return true;
        }));
    }

    // ==================== P1-2: 删除 ====================

    @Test
    void delete_removesRule() {
        when(repository.existsById(5L)).thenReturn(true);

        R<Void> res = controller.delete(5L);

        assertThat(res.getCode()).isEqualTo(200);
        verify(repository).deleteById(5L);
    }

    @Test
    void delete_throws_when_rule_not_found() {
        when(repository.existsById(99L)).thenReturn(false);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.delete(99L))
                .isInstanceOf(com.workflow.common.exception.BusinessException.class);
        verify(repository, never()).deleteById(any());
    }
}
