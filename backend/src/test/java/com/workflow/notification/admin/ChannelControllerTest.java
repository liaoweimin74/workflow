package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.InAppChannelAdapter;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.MessageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ChannelController 渠道测试逻辑验证
 */
class ChannelControllerTest {

    private MessageService messageService;
    private SseEmitterManager sseManager;
    private ChannelController controller;

    @BeforeEach
    void setUp() {
        ChannelAdapter inApp = new InAppChannelAdapter();
        ChannelAdapter unavailable = mock(ChannelAdapter.class);
        when(unavailable.getChannelType()).thenReturn(ChannelType.SMS);
        when(unavailable.isAvailable()).thenReturn(false);
        when(unavailable.test()).thenReturn(ChannelDeliveryResult.failure("渠道未配置"));

        messageService = mock(MessageService.class);
        sseManager = new SseEmitterManager();

        controller = new ChannelController(List.of(inApp, unavailable), messageService, sseManager);

        // 默认登录用户 100
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        new LoginUser(100L, "admin", "x", List.of("ROLE_ADMIN"), Set.of(), true),
                        null));
    }

    @Test
    void list_returns_dynamic_availability() {
        R<List<Map<String, Object>>> res = controller.list();

        assertThat(res.getCode()).isEqualTo(200);
        List<Map<String, Object>> channels = res.getData();
        assertThat(channels).hasSize(4);
        // 站内信可用
        Map<String, Object> inApp = channels.get(0);
        assertThat(inApp.get("enabled")).isEqualTo(true);
        // 短信不可用
        Map<String, Object> sms = channels.get(1);
        assertThat(sms.get("enabled")).isEqualTo(false);
    }

    @Test
    void test_inApp_sends_real_message_to_current_user() {
        R<Void> res = controller.test(1L); // IN_APP

        assertThat(res.getCode()).isEqualTo(200);
        verify(messageService).send(argThat(m ->
                "CHANNEL_TEST".equals(m.getTemplateCode()) &&
                "SYSTEM".equals(m.getSenderType()) &&
                m.getSenderId().equals(100L)), eq(List.of(100L)));
    }

    @Test
    void test_unavailable_channel_returns_fail() {
        R<Void> res = controller.test(2L); // SMS 未配置

        assertThat(res.getCode()).isNotEqualTo(200);
        verify(messageService, never()).send(any(), anyList());
    }

    @Test
    void test_unknown_channel_id_returns_fail() {
        R<Void> res = controller.test(999L);

        assertThat(res.getCode()).isNotEqualTo(200);
    }

    @Test
    void list_successRate_reflects_availability() {
        R<List<Map<String, Object>>> res = controller.list();

        List<Map<String, Object>> channels = res.getData();
        assertThat(channels.get(0).get("successRate")).isEqualTo(100);   // IN_APP
        assertThat(channels.get(1).get("successRate")).isNull();          // SMS
    }
}
