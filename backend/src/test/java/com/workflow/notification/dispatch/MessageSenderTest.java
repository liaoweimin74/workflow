package com.workflow.notification.dispatch;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.MessageTemplate;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.model.TemplateContentType;
import com.workflow.notification.template.TemplateService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageSenderTest {

    @Mock
    private TemplateService templateService;

    @Mock
    private TenantProvider tenantProvider;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    private MessageSender messageSender;

    @BeforeEach
    void setUp() {
        messageSender = new MessageSender(templateService, tenantProvider, eventPublisher);
    }

    private MessageTemplate template(String title, String content) {
        MessageTemplate tpl = new MessageTemplate();
        tpl.setTemplateCode("WEB_NOTICE");
        tpl.setTenantId("default");
        tpl.setName("Web 站内信通知");
        tpl.setTitle(title);
        tpl.setContent(content);
        tpl.setPriority(MessagePriority.NORMAL);
        tpl.setCategory(MessageCategory.NOTIFICATION);
        return tpl;
    }

    @Test
    void sendByTemplate_rendersTitleContentAndPublishesEvent() {
        when(tenantProvider.getTenantId()).thenReturn("default");
        MessageTemplate tpl = template("您有新的待办：${taskName}", "来自流程：${processName}");
        tpl.setContentType(TemplateContentType.MARKDOWN);
        when(templateService.getTemplate("WEB_NOTICE", "default")).thenReturn(tpl);
        // 模拟真实渲染：${key} → 变量值（标题与内容共用，避免严格存根不匹配告警）
        when(templateService.render(anyString(), any())).thenAnswer(inv -> {
            String template = inv.getArgument(0);
            Map<String, Object> vars = inv.getArgument(1);
            String out = template;
            for (Map.Entry<String, Object> e : vars.entrySet()) {
                out = out.replace("${" + e.getKey() + "}", String.valueOf(e.getValue()));
            }
            return out;
        });

        Map<String, Object> variables = Map.of("taskName", "审批任务", "processName", "请假流程");

        messageSender.sendByTemplate(100L, "WEB_NOTICE", variables, List.of(1000L), List.of(ChannelType.IN_APP));

        // 校验必填变量
        verify(templateService).validateVariables(eq("您有新的待办：${taskName}"), eq(variables));
        verify(templateService).validateVariables(eq("来自流程：${processName}"), eq(variables));
        // 渲染标题
        verify(templateService).render(eq("您有新的待办：${taskName}"), eq(variables));

        ArgumentCaptor<MessageEvent> eventCaptor = ArgumentCaptor.forClass(MessageEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());

        MessageEvent event = eventCaptor.getValue();
        Message message = event.getMessage();
        assertThat(message.getTemplateCode()).isEqualTo("WEB_NOTICE");
        assertThat(message.getTenantId()).isEqualTo("default");
        assertThat(message.getSenderId()).isEqualTo(100L);
        assertThat(message.getSenderType()).isEqualTo("SYSTEM");
        // 内容：text=渲染后的可读正文，variables=原始变量 Map（供外部渠道二次渲染）
        assertThat(message.getContent()).containsEntry("text", "来自流程：请假流程");
        @SuppressWarnings("unchecked")
        Map<String, Object> storedVariables = (Map<String, Object>) message.getContent().get("variables");
        assertThat(storedVariables)
                .containsEntry("taskName", "审批任务")
                .containsEntry("processName", "请假流程");
        // 渲染类型来自模板 contentType
        assertThat(message.getContentType()).isEqualTo(TemplateContentType.MARKDOWN);
        assertThat(event.getRecipientIds()).containsExactly(1000L);
        assertThat(event.getChannels()).containsExactly(ChannelType.IN_APP);
    }

    @Test
    void sendByTemplate_usesTemplateDefaultsForPriorityAndCategory() {
        when(tenantProvider.getTenantId()).thenReturn("default");
        when(templateService.getTemplate("WEB_NOTICE", "default"))
                .thenReturn(template("标题", "内容"));

        messageSender.sendByTemplate(100L, "WEB_NOTICE", Map.of(), List.of(1000L), List.of(ChannelType.IN_APP));

        ArgumentCaptor<MessageEvent> eventCaptor = ArgumentCaptor.forClass(MessageEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        Message message = eventCaptor.getValue().getMessage();
        assertThat(message.getPriority()).isEqualTo(MessagePriority.NORMAL);
        assertThat(message.getCategory()).isEqualTo(MessageCategory.NOTIFICATION);
        assertThat(message.getMessageType()).isEqualTo(MessageType.PRIVATE);
    }

    @Test
    void sendByTemplate_rejectsMissingTitleVariableBeforePublish() {
        when(tenantProvider.getTenantId()).thenReturn("default");
        when(templateService.getTemplate("WEB_NOTICE", "default"))
                .thenReturn(template("您有新的待办：${taskName}", "内容"));
        // 渲染与校验由 TemplateService 负责；这里模拟校验抛异常
        doThrow(new BusinessException("缺少必填变量: taskName"))
                .when(templateService).validateVariables(anyString(), any());

        assertThatThrownBy(() -> messageSender.sendByTemplate(100L, "WEB_NOTICE",
                Map.of(), List.of(1000L), List.of(ChannelType.IN_APP)))
                .isInstanceOf(BusinessException.class);

        // 校验失败时不发布事件
        verify(eventPublisher, never()).publishEvent(any());
    }
}
