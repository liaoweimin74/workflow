package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.InAppChannelAdapter;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.TemplateContentType;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.DeliveryRetryRepository;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.subscription.ChannelConfigService;
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
    private ChannelConfigService channelConfigService;
    private DeliveryRetryRepository retryRepository;
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
        channelConfigService = mock(ChannelConfigService.class);
        when(channelConfigService.isEnabled(ChannelType.IN_APP)).thenReturn(true);
        retryRepository = mock(DeliveryRetryRepository.class);

        controller = new ChannelController(List.of(inApp, unavailable), messageService, sseManager,
                channelConfigService, retryRepository);

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
        assertThat(channels).hasSize(5);
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
    void test_inApp_message_is_markdown_with_bold_test_message() {
        controller.test(1L); // IN_APP

        verify(messageService).send(argThat(m -> {
            assertThat(m.getContentType()).isEqualTo(TemplateContentType.MARKDOWN);
            Object text = m.getContent().get("text");
            assertThat(text).isEqualTo(
                    "这是一条渠道连通性**测试消息**，收到即表示站内信渠道正常。");
            return true;
        }), eq(List.of(100L)));
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

    // ==================== P1-1: 渠道配置保存 + 成功率真实化 ====================

    @Test
    void updateConfig_saves_config_for_channel() {
        R<Void> res = controller.updateConfig(2L, Map.of("url", "https://sms.example.com", "apiKey", "k1"));

        assertThat(res.getCode()).isEqualTo(200);
        verify(channelConfigService).save(ChannelType.SMS, Map.of("url", "https://sms.example.com", "apiKey", "k1"));
    }

    @Test
    void updateConfig_unknown_channel_returns_fail() {
        R<Void> res = controller.updateConfig(999L, Map.of());

        assertThat(res.getCode()).isNotEqualTo(200);
        verify(channelConfigService, never()).save(any(), any());
    }

    @Test
    void list_enabled_true_when_channel_configured() {
        when(channelConfigService.isConfigured(ChannelType.SMS)).thenReturn(true);
        when(channelConfigService.isEnabled(ChannelType.SMS)).thenReturn(true);

        R<List<Map<String, Object>>> res = controller.list();

        Map<String, Object> sms = res.getData().stream()
                .filter(c -> "SMS".equals(c.get("type"))).findFirst().orElseThrow();
        assertThat(sms.get("enabled")).isEqualTo(true);
    }

    @Test
    void list_successRate_zero_when_channel_has_failed_retries() {
        com.workflow.notification.model.DeliveryRetry failed = new com.workflow.notification.model.DeliveryRetry();
        failed.setStatus(com.workflow.notification.model.MessageStatus.FAILED);
        when(retryRepository.findByChannel(ChannelType.SMS)).thenReturn(List.of(failed));

        R<List<Map<String, Object>>> res = controller.list();

        Map<String, Object> sms = res.getData().stream()
                .filter(c -> "SMS".equals(c.get("type"))).findFirst().orElseThrow();
        assertThat(sms.get("successRate")).isEqualTo(0);
    }

    @Test
    void non_admin_cannot_access_channel_management() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        new LoginUser(200L, "user", "x", List.of("ROLE_USER"), Set.of(), true),
                        null));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.list())
                .isInstanceOf(com.workflow.common.exception.BusinessException.class)
                .hasMessage("需要管理员权限");
    }

    @Test
    void enableAndDisable_updates_channel_state() {
        R<Void> enabled = controller.enable(2L);
        R<Void> disabled = controller.disable(2L);

        assertThat(enabled.getCode()).isEqualTo(200);
        assertThat(disabled.getCode()).isEqualTo(200);
        verify(channelConfigService).setEnabled(ChannelType.SMS, true);
        verify(channelConfigService).setEnabled(ChannelType.SMS, false);
    }
}
