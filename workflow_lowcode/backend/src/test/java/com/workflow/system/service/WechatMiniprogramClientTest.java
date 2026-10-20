package com.workflow.system.service;

import com.workflow.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class WechatMiniprogramClientTest {

    private static final String SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session"
            + "?appid=wx-test-app&secret=test-secret&js_code=CODE-1&grant_type=authorization_code";

    private MockRestServiceServer mockServer;
    private WechatMiniprogramClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(builder).build();
        client = new WechatMiniprogramClient(builder);
        ReflectionTestUtils.setField(client, "appId", "wx-test-app");
        ReflectionTestUtils.setField(client, "appSecret", "test-secret");
    }

    @Test
    void code2Session_returns_openid_and_unionid() {
        mockServer.expect(requestTo(SESSION_URL))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"openid\":\"openid-1\",\"unionid\":\"union-1\",\"session_key\":\"sk\"}",
                        MediaType.APPLICATION_JSON));

        WechatMiniprogramClient.SessionInfo session = client.code2Session("CODE-1");

        mockServer.verify();
        assertEquals("wx-test-app", session.appId());
        assertEquals("openid-1", session.openid());
        assertEquals("union-1", session.unionid());
    }

    @Test
    void code2Session_omits_blank_unionid() {
        mockServer.expect(requestTo(SESSION_URL))
                .andRespond(withSuccess("{\"openid\":\"openid-1\",\"unionid\":\"\"}", MediaType.APPLICATION_JSON));

        assertNull(client.code2Session("CODE-1").unionid());
    }

    @Test
    void code2Session_maps_invalid_code_to_401() {
        mockServer.expect(requestTo(SESSION_URL))
                .andRespond(withSuccess("{\"errcode\":40029,\"errmsg\":\"invalid code\"}", MediaType.APPLICATION_JSON));

        BusinessException e = assertThrows(BusinessException.class, () -> client.code2Session("CODE-1"));

        assertEquals(401, e.getCode());
        assertEquals("微信登录凭证无效或已过期，请重试", e.getMessage());
    }

    @Test
    void code2Session_maps_risk_user_to_403() {
        mockServer.expect(requestTo(SESSION_URL))
                .andRespond(withSuccess("{\"errcode\":40226,\"errmsg\":\"high risk\"}", MediaType.APPLICATION_JSON));

        BusinessException e = assertThrows(BusinessException.class, () -> client.code2Session("CODE-1"));

        assertEquals(403, e.getCode());
    }

    @Test
    void code2Session_missing_openid_is_502() {
        mockServer.expect(requestTo(SESSION_URL))
                .andRespond(withSuccess("{\"session_key\":\"sk\"}", MediaType.APPLICATION_JSON));

        BusinessException e = assertThrows(BusinessException.class, () -> client.code2Session("CODE-1"));

        assertEquals(502, e.getCode());
    }

    @Test
    void code2Session_http_failure_is_502() {
        mockServer.expect(requestTo(SESSION_URL)).andRespond(withServerError());

        BusinessException e = assertThrows(BusinessException.class, () -> client.code2Session("CODE-1"));

        assertEquals(502, e.getCode());
    }

    @Test
    void code2Session_rejects_missing_config_without_calling_wechat() {
        ReflectionTestUtils.setField(client, "appSecret", "");

        BusinessException e = assertThrows(BusinessException.class, () -> client.code2Session("CODE-1"));

        assertEquals(503, e.getCode());
        mockServer.verify();
    }
}
