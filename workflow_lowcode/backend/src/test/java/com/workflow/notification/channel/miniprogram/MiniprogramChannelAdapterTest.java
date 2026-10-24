package com.workflow.notification.channel.miniprogram;

import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.service.WechatMiniprogramClient;
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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
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

    /**
     * 多小程序凭据共存时（如商户端与客户端各一个 appid），access_token 不得跨应用复用：
     * 缓存必须绑定取到它的那个 appid，换了应用就重新取。
     * 否则 B 应用拿着 A 的 token 调订阅消息，微信侧随机返回 40001 无效凭据。
     */
    @Test
    void send_refetches_token_when_app_id_changes() {
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wx-app-a&secret=secret-a"))
                .andRespond(withSuccess("{\"access_token\":\"TOKEN_A\",\"expires_in\":7200}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=TOKEN_A"))
                .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wx-app-b&secret=secret-b"))
                .andRespond(withSuccess("{\"access_token\":\"TOKEN_B\",\"expires_in\":7200}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=TOKEN_B"))
                .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));

        ReflectionTestUtils.setField(adapter, "appId", "wx-app-a");
        ReflectionTestUtils.setField(adapter, "appSecret", "secret-a");
        ChannelMessage first = new ChannelMessage();
        first.setMessageId(1L);
        first.setContent("to app A");
        assertTrue(adapter.send(first).isSuccess());

        ReflectionTestUtils.setField(adapter, "appId", "wx-app-b");
        ReflectionTestUtils.setField(adapter, "appSecret", "secret-b");
        ChannelMessage second = new ChannelMessage();
        second.setMessageId(2L);
        second.setContent("to app B");
        assertTrue(adapter.send(second).isSuccess());

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

    // ---------- Task 9.4：推送按 Client 凭证（spec「小程序凭证多实例」） ----------

    /**
     * 消息声明 appId 时，token 必须以该 Client 的 appId/appSecret 获取
     * （而非渠道静态配置）——同一渠道可为不同小程序客户端发消息。
     */
    @Test
    void send_with_message_appId_uses_that_client_credentials() {
        WechatMiniprogramClient wechat = mock(WechatMiniprogramClient.class);
        when(wechat.forAppId("t1", "wx-app-a"))
                .thenReturn(new WechatMiniprogramClient.Credentials("wx-app-a", "secret-a"));
        ReflectionTestUtils.setField(adapter, "wechatMiniprogramClient", wechat);

        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/token"
                        + "?grant_type=client_credential&appid=wx-app-a&secret=secret-a"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"access_token\":\"TOKEN_A\",\"expires_in\":7200}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=TOKEN_A"))
                .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));

        ChannelMessage message = new ChannelMessage();
        message.setMessageId(1L);
        message.setTenantId("t1");
        message.setAppId("wx-app-a");
        message.setContent("to client A");

        assertTrue(adapter.send(message).isSuccess());
        mockServer.verify();
    }

    /** 两个 Client 同渠道先后发送：各自凭证，token 缓存按 appId 隔离（不串用）。 */
    @Test
    void send_two_message_appIds_do_not_cross_credentials() {
        WechatMiniprogramClient wechat = mock(WechatMiniprogramClient.class);
        when(wechat.forAppId("t1", "wx-app-a"))
                .thenReturn(new WechatMiniprogramClient.Credentials("wx-app-a", "secret-a"));
        when(wechat.forAppId("t1", "wx-app-b"))
                .thenReturn(new WechatMiniprogramClient.Credentials("wx-app-b", "secret-b"));
        ReflectionTestUtils.setField(adapter, "wechatMiniprogramClient", wechat);

        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/token"
                        + "?grant_type=client_credential&appid=wx-app-a&secret=secret-a"))
                .andRespond(withSuccess("{\"access_token\":\"TOKEN_A\",\"expires_in\":7200}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=TOKEN_A"))
                .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/token"
                        + "?grant_type=client_credential&appid=wx-app-b&secret=secret-b"))
                .andRespond(withSuccess("{\"access_token\":\"TOKEN_B\",\"expires_in\":7200}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=TOKEN_B"))
                .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));

        ChannelMessage first = new ChannelMessage();
        first.setMessageId(1L);
        first.setTenantId("t1");
        first.setAppId("wx-app-a");
        first.setContent("a");
        assertTrue(adapter.send(first).isSuccess());

        ChannelMessage second = new ChannelMessage();
        second.setMessageId(2L);
        second.setTenantId("t1");
        second.setAppId("wx-app-b");
        second.setContent("b");
        assertTrue(adapter.send(second).isSuccess());

        mockServer.verify();
    }

    /** 声明了 appId 但该 Client 凭证缺失/不存在：明确失败，禁止拿别家凭证顶替。 */
    @Test
    void send_with_unresolvable_appId_fails_without_calling_wechat() {
        WechatMiniprogramClient wechat = mock(WechatMiniprogramClient.class);
        when(wechat.forAppId("t1", "wx-ghost"))
                .thenThrow(new BusinessException(404, "小程序客户端不存在"));
        ReflectionTestUtils.setField(adapter, "wechatMiniprogramClient", wechat);

        ChannelMessage message = new ChannelMessage();
        message.setMessageId(3L);
        message.setTenantId("t1");
        message.setAppId("wx-ghost");
        message.setContent("x");

        ChannelDeliveryResult result = adapter.send(message);

        assertFalse(result.isSuccess());
        assertTrue(result.getError().contains("小程序客户端不存在"));
        mockServer.verify();
    }

    /** 未声明 appId：沿用渠道静态配置（后向兼容）。 */
    @Test
    void send_without_appId_uses_channel_static_config() {
        WechatMiniprogramClient wechat = mock(WechatMiniprogramClient.class);
        ReflectionTestUtils.setField(adapter, "wechatMiniprogramClient", wechat);

        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/token"
                        + "?grant_type=client_credential&appid=wx-test-app&secret=test-secret"))
                .andRespond(withSuccess("{\"access_token\":\"STATIC_TOKEN\",\"expires_in\":7200}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=STATIC_TOKEN"))
                .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));

        ChannelMessage message = new ChannelMessage();
        message.setMessageId(4L);
        message.setContent("no appId");
        assertTrue(adapter.send(message).isSuccess());
        mockServer.verify();
    }
}
