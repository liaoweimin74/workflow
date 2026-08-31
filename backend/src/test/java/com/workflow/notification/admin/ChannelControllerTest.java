package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.InAppChannelAdapter;
import com.workflow.notification.model.ChannelType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * ChannelController 渠道测试逻辑验证
 */
class ChannelControllerTest {

    private ChannelController controller;

    @BeforeEach
    void setUp() {
        ChannelAdapter inApp = new InAppChannelAdapter();
        ChannelAdapter unavailable = mock(ChannelAdapter.class);
        when(unavailable.getChannelType()).thenReturn(ChannelType.SMS);
        when(unavailable.isAvailable()).thenReturn(false);
        when(unavailable.test()).thenReturn(ChannelDeliveryResult.failure("渠道未配置"));

        controller = new ChannelController(List.of(inApp, unavailable));
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
    void test_available_channel_returns_ok() {
        R<Void> res = controller.test(1L); // IN_APP

        assertThat(res.getCode()).isEqualTo(200);
    }

    @Test
    void test_unavailable_channel_returns_fail() {
        R<Void> res = controller.test(2L); // SMS 未配置

        assertThat(res.getCode()).isNotEqualTo(200);
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
