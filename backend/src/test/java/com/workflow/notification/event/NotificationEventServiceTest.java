package com.workflow.notification.event;

import com.workflow.notification.model.NotificationEventDefinition;
import com.workflow.notification.store.NotificationEventDefinitionRepository;
import com.workflow.notification.subscription.SubscriptionRuleRepository;
import com.workflow.notification.template.MessageTemplateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationEventServiceTest {

    @Mock private NotificationEventDefinitionRepository repository;
    @Mock private MessageTemplateRepository templateRepository;
    @Mock private SubscriptionRuleRepository ruleRepository;

    private NotificationEventService service;

    @BeforeEach
    void setUp() {
        service = new NotificationEventService(repository, templateRepository, ruleRepository);
    }

    @Test
    void create_accepts_valid_code_and_defaults_enabled() {
        when(repository.existsByTenantIdAndEventCode("default", "TASK_CREATED")).thenReturn(false);
        NotificationEventDefinition saved = new NotificationEventDefinition();
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        NotificationEventDefinition result = service.create("default", "admin", "TASK_CREATED",
                "任务创建", "任务创建后触发", "流程");

        assertThat(result.getEventCode()).isEqualTo("TASK_CREATED");
        assertThat(result.getEnabled()).isTrue();
        assertThat(result.getCreatedBy()).isEqualTo("admin");
        verify(repository).save(any(NotificationEventDefinition.class));
    }

    @Test
    void create_rejects_invalid_code() {
        assertThatThrownBy(() -> service.create("default", "admin", "task-created",
                "任务创建", null, null))
                .hasMessageContaining("事件代码");
        verify(repository, never()).save(any());
    }

    @Test
    void create_rejects_duplicate_code() {
        when(repository.existsByTenantIdAndEventCode("default", "TASK_CREATED")).thenReturn(true);

        assertThatThrownBy(() -> service.create("default", "admin", "TASK_CREATED",
                "任务创建", null, null))
                .hasMessageContaining("已存在");
        verify(repository, never()).save(any());
    }

    @Test
    void delete_rejects_event_referenced_by_template() {
        NotificationEventDefinition event = event(7L, "TASK_CREATED");
        when(repository.findById(7L)).thenReturn(Optional.of(event));
        when(templateRepository.existsByTenantIdAndEventCode("default", "TASK_CREATED")).thenReturn(true);

        assertThatThrownBy(() -> service.delete("default", 7L))
                .hasMessageContaining("引用");
        verify(repository, never()).delete(any(NotificationEventDefinition.class));
    }

    @Test
    void delete_rejects_event_referenced_by_rule() {
        NotificationEventDefinition event = event(7L, "TASK_CREATED");
        when(repository.findById(7L)).thenReturn(Optional.of(event));
        when(templateRepository.existsByTenantIdAndEventCode("default", "TASK_CREATED")).thenReturn(false);
        when(ruleRepository.existsByTenantIdAndEventCode("default", "TASK_CREATED")).thenReturn(true);

        assertThatThrownBy(() -> service.delete("default", 7L))
                .hasMessageContaining("引用");
    }

    @Test
    void delete_rejects_event_from_another_tenant() {
        NotificationEventDefinition event = event(7L, "TASK_CREATED");
        event.setTenantId("other");
        when(repository.findById(7L)).thenReturn(Optional.of(event));

        assertThatThrownBy(() -> service.delete("default", 7L))
                .hasMessageContaining("事件不存在");
    }

    @Test
    void requireEnabled_rejects_disabled_event() {
        NotificationEventDefinition event = event(7L, "TASK_CREATED");
        event.setEnabled(false);
        when(repository.findByTenantIdAndEventCode("default", "TASK_CREATED"))
                .thenReturn(Optional.of(event));

        assertThatThrownBy(() -> service.requireEnabled("default", "TASK_CREATED"))
                .hasMessageContaining("已停用");
    }

    @Test
    void list_filters_keyword_and_preserves_page_shape() {
        NotificationEventDefinition event = event(1L, "TASK_CREATED");
        event.setEventName("任务创建");
        when(repository.findAll(any(org.springframework.data.jpa.domain.Specification.class), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(event)));

        assertThat(service.list("default", 0, 20, "TASK", null).getRows())
                .containsExactly(event);
    }

    private NotificationEventDefinition event(Long id, String code) {
        NotificationEventDefinition event = new NotificationEventDefinition();
        event.setId(id);
        event.setTenantId("default");
        event.setEventCode(code);
        event.setEventName("事件");
        event.setEnabled(true);
        return event;
    }
}
