package com.workflow.notification.channel.miniprogram;

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
 * MiniprogramChannelAdapter 微信订阅消息调用验证
 */
class MiniprogramChannelAdapterTest {

    private RestClient.Builder restClientBuilder;
    private MockRestServiceServer mockServer;
    private MiniprogramChannelAdapter adapter;

    @BeforeEach
    void setUp() {
        restClientBuilder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        adapter = new MiniprogramChannelAdapter(restClientBuilder);
        ReflectionTestUtils.setField(adapter, "appId", "wx-test-app");
        ReflectionTestUtils.setField(adapter, "appSecret", "test-secret");
        ReflectionTestUtils.setField(adapter, "templateId", "TMPL-123");
    }

    @Test
    void isAvailable_false_when_missing_config() {
        ReflectionTestUtils.setField(adapter, "templateId", "");
        assertFalse(adapter.isAvailable());
    }

    @Test
    void isAvailable_true_when_configured() {
        assertTrue(adapter.isAvailable());
    }

    @Test
    void send_gets_token_then_subscribes_send() {
        // 1. token
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wx-test-app&secret=test-secret"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"access_token\":\"MP_TOKEN\",\"expires_in\":7200}", MediaType.APPLICATION_JSON));
        // 2. subscribe/send
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=MP_TOKEN"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json("{\"touser\":\"openid-abc\",\"template_id\":\"TMPL-123\"}"))
                .andRespond(withSuccess("{\"errcode\":0,\"errmsg\":\"ok\"}", MediaType.APPLICATION_JSON));

        ChannelMessage message = new ChannelMessage();
        message.setMessageId(9L);
        message.setTitle("任务提醒");
        message.setContent("您有一个新任务");
        message.setTemplateData(Map.of("openId", "openid-abc"));

        ChannelDeliveryResult result = adapter.send(message);

        mockServer.verify();
        assertTrue(result.isSuccess());
    }

    @Test
    void send_reuses_cached_token() {
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wx-test-app&secret=test-secret"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"access_token\":\"CACHED_MP\",\"expires_in\":7200}", MediaType.APPLICATION_JSON));

        ChannelMessage m1 = new ChannelMessage();
        m1.setMessageId(1L);
        m1.setContent("first");
        ChannelMessage m2 = new ChannelMessage();
        m2.setMessageId(2L);
        m2.setContent("second");

        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=CACHED_MP"))
                .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=CACHED_MP"))
                .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));

        assertTrue(adapter.send(m1).isSuccess());
        assertTrue(adapter.send(m2).isSuccess());

        mockServer.verify();
    }

    @Test
    void send_returns_failure_when_wechat_error() {
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wx-test-app&secret=test-secret"))
                .andRespond(withSuccess("{\"access_token\":\"MP_ERR\",\"expires_in\":7200}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=MP_ERR"))
                .andRespond(withSuccess("{\"errcode\":43101,\"errmsg\":\"user refuse to accept the msg\"}",
                        MediaType.APPLICATION_JSON));

        ChannelMessage message = new ChannelMessage();
        message.setMessageId(1L);
        message.setContent("test");

        ChannelDeliveryResult result = adapter.send(message);

        mockServer.verify();
        assertFalse(result.isSuccess());
        assertTrue(result.getError().contains("43101"));
    }
}
