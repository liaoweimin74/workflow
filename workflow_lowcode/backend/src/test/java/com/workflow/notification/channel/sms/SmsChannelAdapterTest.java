package com.workflow.notification.channel.sms;

import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

/**
 * SmsChannelAdapter 短信网关调用验证（MockRestServiceServer 模拟真实 HTTP）
 */
class SmsChannelAdapterTest {

    private RestClient.Builder restClientBuilder;
    private MockRestServiceServer mockServer;
    private SmsChannelAdapter adapter;

    @BeforeEach
    void setUp() {
        restClientBuilder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        adapter = new SmsChannelAdapter(restClientBuilder);
        ReflectionTestUtils.setField(adapter, "url", "https://sms.example.com/send");
        ReflectionTestUtils.setField(adapter, "apiKey", "test-key");
        ReflectionTestUtils.setField(adapter, "apiSecret", "test-secret");
        ReflectionTestUtils.setField(adapter, "signName", "测试签名");
    }

    @Test
    void isAvailable_false_when_url_missing() {
        ReflectionTestUtils.setField(adapter, "url", "");
        assertFalse(adapter.isAvailable());
    }

    @Test
    void isAvailable_true_when_configured() {
        assertTrue(adapter.isAvailable());
    }

    @Test
    void send_posts_json_with_auth_headers_and_parses_success() {
        mockServer.expect(requestTo("https://sms.example.com/send"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-API-Key", "test-key"))
                .andExpect(header("X-API-Secret", "test-secret"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json("{\"phone\":\"13800000000\",\"signName\":\"测试签名\"}"))
                .andRespond(withSuccess("{\"code\":0,\"msg\":\"ok\",\"messageId\":\"sms-123\"}",
                        MediaType.APPLICATION_JSON));

        ChannelMessage message = new ChannelMessage();
        message.setMessageId(42L);
        message.setTitle("催办通知");
        message.setContent("您的任务已超时");
        message.setTemplateData(Map.of("phone", "13800000000"));

        ChannelDeliveryResult result = adapter.send(message);

        mockServer.verify();
        assertTrue(result.isSuccess());
        assertTrue(result.getMessageId().contains("sms-123"));
    }

    @Test
    void send_returns_failure_when_gateway_error_code() {
        mockServer.expect(requestTo("https://sms.example.com/send"))
                .andRespond(withSuccess("{\"code\":1001,\"msg\":\"余额不足\"}", MediaType.APPLICATION_JSON));

        ChannelMessage message = new ChannelMessage();
        message.setMessageId(1L);
        message.setContent("test");
        message.setTemplateData(Map.of("phone", "13800000000"));

        ChannelDeliveryResult result = adapter.send(message);

        mockServer.verify();
        assertFalse(result.isSuccess());
        assertTrue(result.getError().contains("余额不足"));
    }

    @Test
    void send_returns_failure_when_unconfigured() {
        ReflectionTestUtils.setField(adapter, "url", "");
        ChannelMessage message = new ChannelMessage();
        message.setMessageId(1L);
        message.setContent("test");

        ChannelDeliveryResult result = adapter.send(message);

        assertFalse(result.isSuccess());
        assertTrue(result.getError().contains("未配置"));
    }
}
