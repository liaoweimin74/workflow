package com.workflow.notification.template;

import com.workflow.notification.model.MessageTemplate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TemplateServiceTest {

    @Mock
    private MessageTemplateRepository templateRepository;

    @InjectMocks
    private TemplateService templateService;

    @Test
    void render_replaces_variables() {
        String template = "您有新待办：${taskName}，来自流程${processName}";
        Map<String, Object> variables = Map.of("taskName", "审批任务", "processName", "请假流程");

        String result = templateService.render(template, variables);

        assertThat(result).isEqualTo("您有新待办：审批任务，来自流程请假流程");
    }

    @Test
    void render_handles_null_value() {
        String template = "消息：${content}";
        Map<String, Object> variables = Map.of();

        String result = templateService.render(template, variables);

        assertThat(result).isEqualTo("消息：");
    }

    @Test
    void validateVariables_throws_when_missing() {
        String template = "缺少：${missing}";
        Map<String, Object> variables = Map.of();

        assertThatThrownBy(() -> templateService.validateVariables(template, variables))
                .isInstanceOf(com.workflow.common.exception.BusinessException.class);
    }

    @Test
    void validateVariables_passes_when_present() {
        String template = "完整：${present}";
        Map<String, Object> variables = Map.of("present", "值");

        templateService.validateVariables(template, variables);
        // 不抛异常即通过
    }

    @Test
    void create_saves_template() {
        MessageTemplate template = new MessageTemplate();
        template.setTemplateCode("TEST");
        template.setTenantId("default");
        template.setName("测试模板");

        when(templateRepository.existsByTemplateCodeAndTenantId("TEST", "default")).thenReturn(false);
        when(templateRepository.save(any(MessageTemplate.class))).thenReturn(template);

        MessageTemplate result = templateService.create(template);

        assertThat(result).isNotNull();
        verify(templateRepository).save(any(MessageTemplate.class));
    }

    @Test
    void create_throws_when_duplicate() {
        MessageTemplate template = new MessageTemplate();
        template.setTemplateCode("TEST");
        template.setTenantId("default");

        when(templateRepository.existsByTemplateCodeAndTenantId("TEST", "default")).thenReturn(true);

        assertThatThrownBy(() -> templateService.create(template))
                .isInstanceOf(com.workflow.common.exception.BusinessException.class);
    }

    // ==================== P2-4: 模板启停 ====================

    @Test
    void toggle_flips_enabled_state() {
        MessageTemplate template = new MessageTemplate();
        template.setId(1L);
        template.setEnabled(true);
        when(templateRepository.findById(1L)).thenReturn(java.util.Optional.of(template));

        templateService.toggle(1L);

        verify(templateRepository).save(argThat(t -> Boolean.FALSE.equals(t.getEnabled())));
    }

    @Test
    void toggle_throws_when_template_not_found() {
        when(templateRepository.findById(99L)).thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> templateService.toggle(99L))
                .isInstanceOf(com.workflow.common.exception.BusinessException.class);
    }

    @Test
    void getTemplate_throws_when_template_disabled() {
        MessageTemplate template = new MessageTemplate();
        template.setTemplateCode("DISABLED");
        template.setTenantId("default");
        template.setEnabled(false);
        when(templateRepository.findByTemplateCodeAndTenantId("DISABLED", "default"))
                .thenReturn(java.util.Optional.of(template));

        assertThatThrownBy(() -> templateService.getTemplate("DISABLED", "default"))
                .isInstanceOf(com.workflow.common.exception.BusinessException.class);
    }
}
