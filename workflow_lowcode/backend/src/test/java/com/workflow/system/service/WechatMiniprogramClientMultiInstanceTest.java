package com.workflow.system.service;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.entity.AppClient;
import com.workflow.engine.app.repository.AppClientRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * WechatMiniprogramClient 按 Client 多实例解析测试（Task 9.4，
 * spec: app-release-pipeline「小程序凭证多实例」）。
 *
 * 覆盖：
 * - forClient：从 Client 的 buildConfig 解析 appid/appSecret（兼容 appid/appId、
 *   appSecret/app-secret 键名）；缺凭据/缺配置 → 503；
 * - forClientId：租户内按 clientId 解析；未知客户端 → 404；
 * - forAppId：租户内按 appId 解析小程序客户端；未知 → 404；
 * - code2Session(Credentials, code)：以该 Client 凭证请求微信（URL 带各自
 *   appid/secret），返回会话归属该 appId；
 * - 两个 Client 的凭证互不串用（各走各的 appid/secret）。
 */
class WechatMiniprogramClientMultiInstanceTest {

    private static final String TENANT = "t1";
    private static final String CODE = "CODE-1";

    private RestClient.Builder builder;
    private MockRestServiceServer mockServer;
    private AppClientRepository clientRepository;
    private WechatMiniprogramClient client;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(builder).build();
        clientRepository = mock(AppClientRepository.class);
        client = new WechatMiniprogramClient(builder, clientRepository, new TenantProvider());
        TenantContext.setTenantId(TENANT);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ---------- forClient：凭证解析 ----------

    @Test
    void forClient_parses_appid_and_appSecret() {
        AppClient c = mpClient("wx-a", "sec-a");
        WechatMiniprogramClient.Credentials creds = client.forClient(c);
        assertEquals("wx-a", creds.appId());
        assertEquals("sec-a", creds.appSecret());
    }

    @Test
    void forClient_accepts_camel_and_kebab_keys() {
        AppClient c = new AppClient();
        c.setId("c1");
        c.setClientType("MP_WEIXIN");
        c.setBuildConfigJson("{\"appId\":\"wx-b\",\"app-secret\":\"sec-b\"}");
        WechatMiniprogramClient.Credentials creds = client.forClient(c);
        assertEquals("wx-b", creds.appId());
        assertEquals("sec-b", creds.appSecret());
    }

    @Test
    void forClient_missing_credentials_is_503() {
        AppClient noSecret = mpClient("wx-a", null);
        BusinessException e1 = assertThrows(BusinessException.class, () -> client.forClient(noSecret));
        assertEquals(503, e1.getCode());

        AppClient noConfig = new AppClient();
        noConfig.setId("c2");
        noConfig.setClientType("MP_WEIXIN");
        BusinessException e2 = assertThrows(BusinessException.class, () -> client.forClient(noConfig));
        assertEquals(503, e2.getCode());
    }

    // ---------- forClientId / forAppId：按 Client 定位 ----------

    @Test
    void forClientId_resolves_client_in_tenant() {
        when(clientRepository.findByIdAndTenantId("c1", TENANT))
                .thenReturn(Optional.of(mpClient("wx-a", "sec-a")));
        assertEquals("wx-a", client.forClientId("c1").appId());
    }

    @Test
    void forClientId_unknown_is_404() {
        when(clientRepository.findByIdAndTenantId("ghost", TENANT)).thenReturn(Optional.empty());
        BusinessException e = assertThrows(BusinessException.class, () -> client.forClientId("ghost"));
        assertEquals(404, e.getCode());
    }

    @Test
    void forAppId_resolves_mp_client_in_tenant() {
        AppClient web = new AppClient();
        web.setId("web1");
        web.setClientType("WEB");
        AppClient mp = mpClient("wx-a", "sec-a");
        when(clientRepository.findByTenantIdAndAppIdOrderByCreatedAtAsc(TENANT, "app1"))
                .thenReturn(List.of(web, mp));
        assertEquals("wx-a", client.forAppId(TENANT, "app1").appId());
    }

    @Test
    void forAppId_without_mp_client_is_404() {
        when(clientRepository.findByTenantIdAndAppIdOrderByCreatedAtAsc(TENANT, "app9"))
                .thenReturn(List.of());
        BusinessException e = assertThrows(BusinessException.class, () -> client.forAppId(TENANT, "app9"));
        assertEquals(404, e.getCode());
    }

    // ---------- code2Session：按凭证请求微信 ----------

    @Test
    void code2Session_uses_given_credentials_and_reports_that_appId() {
        mockServer.expect(requestTo(sessionUrl("wx-a", "sec-a")))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"openid\":\"openid-1\",\"unionid\":\"union-1\"}",
                        MediaType.APPLICATION_JSON));

        WechatMiniprogramClient.SessionInfo session = client.code2Session(
                new WechatMiniprogramClient.Credentials("wx-a", "sec-a"), CODE);

        mockServer.verify();
        assertEquals("wx-a", session.appId());
        assertEquals("openid-1", session.openid());
    }

    @Test
    void code2Session_two_clients_do_not_cross_credentials() {
        mockServer.expect(requestTo(sessionUrl("wx-a", "sec-a")))
                .andRespond(withSuccess("{\"openid\":\"openid-a\"}", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo(sessionUrl("wx-b", "sec-b")))
                .andRespond(withSuccess("{\"openid\":\"openid-b\"}", MediaType.APPLICATION_JSON));

        WechatMiniprogramClient.SessionInfo a = client.code2Session(
                new WechatMiniprogramClient.Credentials("wx-a", "sec-a"), CODE);
        WechatMiniprogramClient.SessionInfo b = client.code2Session(
                new WechatMiniprogramClient.Credentials("wx-b", "sec-b"), CODE);

        mockServer.verify();
        assertEquals("openid-a", a.openid());
        assertEquals("wx-b", b.appId());
        assertEquals("openid-b", b.openid());
    }

    @Test
    void code2Session_blank_credentials_is_503_without_calling_wechat() {
        BusinessException e = assertThrows(BusinessException.class, () -> client.code2Session(
                new WechatMiniprogramClient.Credentials("wx-a", ""), CODE));
        assertEquals(503, e.getCode());
        mockServer.verify();
    }

    // ---------- fixtures ----------

    private String sessionUrl(String appId, String secret) {
        return "https://api.weixin.qq.com/sns/jscode2session"
                + "?appid=" + appId + "&secret=" + secret + "&js_code=" + CODE + "&grant_type=authorization_code";
    }

    private AppClient mpClient(String appid, String appSecret) {
        AppClient c = new AppClient();
        c.setId("c-" + appid);
        c.setTenantId(TENANT);
        c.setAppId("app1");
        c.setClientType("MP_WEIXIN");
        StringBuilder json = new StringBuilder("{\"appid\":\"").append(appid).append("\"");
        if (appSecret != null) {
            json.append(",\"appSecret\":\"").append(appSecret).append("\"");
        }
        json.append("}");
        c.setBuildConfigJson(json.toString());
        return c;
    }
}