package com.workflow.notification.channel.wechatwork;

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
 * WechatWorkChannelAdapter 企业微信应用消息调用验证
 */
class WechatWorkChannelAdapterTest {

    private RestClient.Builder restClientBuilder;
    private MockRestServiceServer mockServer;
    private WechatWorkChannelAdapter adapter;

    @BeforeEach
    void setUp() {
        restClientBuilder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        adapter = new WechatWorkChannelAdapter(restClientBuilder);
        ReflectionTestUtils.setField(adapter, "corpId", "ww-test-corp");
        ReflectionTestUtils.setField(adapter, "corpSecret", "test-secret");
        ReflectionTestUtils.setField(adapter, "agentId", "1000002");
    }

    @Test
    void isAvailable_false_when_missing_config() {
        ReflectionTestUtils.setField(adapter, "corpSecret", "");
        assertFalse(adapter.isAvailable());
    }

    @Test
    void isAvailable_true_when_configured() {
        assertTrue(adapter.isAvailable());
    }

    @Test
    void send_gets_token_then_sends_message() {
        // 1. gettoken
        mockServer.expect(requestTo("https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=ww-test-corp&corpsecret=test-secret"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"errcode\":0,\"errmsg\":\"ok\",\"access_token\":\"TOKEN_ABC\",\"expires_in\":7200}",
                        MediaType.APPLICATION_JSON));
        // 2. message/send
        mockServer.expect(requestTo("https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN_ABC"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andRespond(withSuccess("{\"errcode\":0,\"errmsg\":\"ok\"}", MediaType.APPLICATION_JSON));

        ChannelMessage message = new ChannelMessage();
        message.setMessageId(7L);
        message.setTitle("审批提醒");
        message.setContent("有一条审批待处理");
        message.setTemplateData(Map.of("userId", "zhangsan"));

        ChannelDeliveryResult result = adapter.send(message);

        mockServer.verify();
        assertTrue(result.isSuccess());
    }

    @Test
    void send_reuses_cached_token_for_second_message() {
        // gettoken 只被调用一次（token 缓存生效）
        mockServer.expect(requestTo("https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=ww-test-corp&corpsecret=test-secret"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"errcode\":0,\"access_token\":\"CACHED_TOKEN\",\"expires_in\":7200}",
                        MediaType.APPLICATION_JSON));

        ChannelMessage m1 = new ChannelMessage();
        m1.setMessageId(1L);
        m1.setContent("first");
        ChannelMessage m2 = new ChannelMessage();
        m2.setMessageId(2L);
        m2.setContent("second");

        // 两条 send 均命中 /message/send（access_token 相同）
        mockServer.expect(requestTo("https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=CACHED_TOKEN"))
                .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=CACHED_TOKEN"))
                .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));

        assertTrue(adapter.send(m1).isSuccess());
        assertTrue(adapter.send(m2).isSuccess());

        mockServer.verify();
    }

    @Test
    void send_returns_failure_when_wechat_error() {
        mockServer.expect(requestTo("https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=ww-test-corp&corpsecret=test-secret"))
                .andRespond(withSuccess("{\"errcode\":0,\"access_token\":\"TOKEN_ERR\",\"expires_in\":7200}",
                        MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN_ERR"))
                .andRespond(withSuccess("{\"errcode\":60020,\"errmsg\":\"not allow to access from your ip\"}",
                        MediaType.APPLICATION_JSON));

        ChannelMessage message = new ChannelMessage();
        message.setMessageId(1L);
        message.setContent("test");

        ChannelDeliveryResult result = adapter.send(message);

        mockServer.verify();
        assertFalse(result.isSuccess());
        assertTrue(result.getError().contains("60020"));
    }

    @Test
    void send_returns_failure_when_token_missing() {
        mockServer.expect(requestTo("https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=ww-test-corp&corpsecret=test-secret"))
                .andRespond(withSuccess("{\"errcode\":0,\"errmsg\":\"ok\"}", MediaType.APPLICATION_JSON));

        ChannelMessage message = new ChannelMessage();
        message.setMessageId(1L);
        message.setContent("test");

        ChannelDeliveryResult result = adapter.send(message);

        mockServer.verify();
        assertFalse(result.isSuccess());
        assertTrue(result.getError().contains("access_token"));
    }
}
