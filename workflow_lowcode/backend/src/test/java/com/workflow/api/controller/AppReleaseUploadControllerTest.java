package com.workflow.api.controller;

import com.workflow.api.dto.AppReleaseResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.AppReleaseUploadService;
import com.workflow.engine.app.entity.AppClient;
import com.workflow.engine.app.entity.AppRelease;
import com.workflow.engine.app.repository.AppClientRepository;
import com.workflow.engine.app.repository.AppReleaseRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Release 体验版上传测试（Task 9.3，spec: app-release-pipeline「体验版上传」）。
 *
 * 直调控制器（真实 AppReleaseUploadService + mock 仓储 + MockRestServiceServer 假
 * app-builder），覆盖：
 * - 构建成功后上传 → POST app-builder（appid + privateKeyPath 凭据按 Client 快照
 *   透传，非全局单例）→ 回写 uploaded_qr_url + UPLOADED；
 * - 上传凭据来自该 Client 快照配置（两个 Client 不同 appid 互不影响）；
 * - 未构建/构建失败拒绝 400；非小程序客户端拒绝 400；凭据缺失拒绝 400；
 * - 上传失败可追溯（记录 error），且不推翻已构建状态与产物（可重试）。
 */
class AppReleaseUploadControllerTest {

    private static final String TENANT = "t1";
    private static final String APP_ID = "app1";
    private static final String CLIENT_ID = "client1";
    private static final String BUILDER_URL = "http://app-builder.local";

    private AppClientRepository clientRepo;
    private AppReleaseRepository releaseRepo;
    private MockRestServiceServer builderServer;
    private AppReleaseUploadController controller;

    @BeforeEach
    void setUp() {
        clientRepo = mock(AppClientRepository.class);
        releaseRepo = mock(AppReleaseRepository.class);
        RestClient.Builder restBuilder = RestClient.builder();
        builderServer = MockRestServiceServer.bindTo(restBuilder).build();
        AppReleaseUploadService service = new AppReleaseUploadService(
                releaseRepo, clientRepo, restBuilder, BUILDER_URL, new TenantProvider());
        controller = new AppReleaseUploadController(service);
        TenantContext.setTenantId(TENANT);
        when(releaseRepo.save(any(AppRelease.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ---------- 上传成功：回传二维码 + UPLOADED ----------

    @Test
    void upload_success_recordsQrUrlAndMarksUploaded() {
        AppRelease release = release("rel1", "PUBLISHED", mpWeixinSnapshot("wx1234", "/keys/wx1234.key"));
        release.setArtifactUrl("/artifacts/rel1/mp-weixin");
        when(releaseRepo.findByIdAndTenantId("rel1", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));
        builderServer.expect(requestTo(BUILDER_URL + "/upload"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"releaseId":"rel1","platform":"mp-weixin","appId":"wx1234",
                         "privateKeyPath":"/keys/wx1234.key","version":"3","desc":"体验版 v3"}
                        """))
                .andRespond(withSuccess("{\"ok\":true,\"qrUrl\":\"/artifacts/rel1/qr.png\"}", MediaType.APPLICATION_JSON));

        R<AppReleaseResponse> result = controller.upload(APP_ID, CLIENT_ID, "rel1");

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().getStatus()).isEqualTo("UPLOADED");
        assertThat(result.getData().getUploadedQrUrl()).isEqualTo("/artifacts/rel1/qr.png");
        // 已构建产物地址不受上传影响
        assertThat(result.getData().getArtifactUrl()).isEqualTo("/artifacts/rel1/mp-weixin");
        builderServer.verify();

        ArgumentCaptor<AppRelease> captor = ArgumentCaptor.forClass(AppRelease.class);
        verify(releaseRepo, times(1)).save(captor.capture());
        AppRelease saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo("UPLOADED");
        assertThat(saved.getUploadedQrUrl()).isEqualTo("/artifacts/rel1/qr.png");
        assertThat(saved.getError()).isNull();
    }

    @Test
    void upload_credentialsComeFromThatClientSnapshot_notGlobalSingleton() {
        // 同一租户内另一小程序客户端：凭证按各自快照透传（spec「小程序凭证多实例」上传侧先行）
        AppRelease other = release("rel2", "PUBLISHED", mpWeixinSnapshot("wx9999", "/keys/wx9999.key"));
        when(releaseRepo.findByIdAndTenantId("rel2", TENANT)).thenReturn(Optional.of(other));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));
        builderServer.expect(requestTo(BUILDER_URL + "/upload"))
                .andExpect(content().json("""
                        {"appId":"wx9999","privateKeyPath":"/keys/wx9999.key"}
                        """))
                .andRespond(withSuccess("{\"ok\":true,\"qrUrl\":\"/artifacts/rel2/qr.png\"}", MediaType.APPLICATION_JSON));

        controller.upload(APP_ID, CLIENT_ID, "rel2");
        builderServer.verify();
    }

    @Test
    void upload_alreadyUploaded_reuploadAllowed() {
        AppRelease release = release("rel3", "UPLOADED", mpWeixinSnapshot("wx1234", "/keys/wx1234.key"));
        when(releaseRepo.findByIdAndTenantId("rel3", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));
        builderServer.expect(requestTo(BUILDER_URL + "/upload"))
                .andRespond(withSuccess("{\"ok\":true,\"qrUrl\":\"/artifacts/rel3/qr.png\"}", MediaType.APPLICATION_JSON));

        R<AppReleaseResponse> result = controller.upload(APP_ID, CLIENT_ID, "rel3");
        assertThat(result.getData().getStatus()).isEqualTo("UPLOADED");
    }

    // ---------- 前置条件 ----------

    @Test
    void upload_notBuiltYet_rejected400() {
        AppRelease release = release("rel4", "CREATED", mpWeixinSnapshot("wx1234", "/keys/wx1234.key"));
        when(releaseRepo.findByIdAndTenantId("rel4", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));

        assertThatThrownBy(() -> controller.upload(APP_ID, CLIENT_ID, "rel4"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("构建成功");
    }

    @Test
    void upload_buildFailed_rejected400() {
        AppRelease release = release("rel5", "FAILED", mpWeixinSnapshot("wx1234", "/keys/wx1234.key"));
        when(releaseRepo.findByIdAndTenantId("rel5", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));

        assertThatThrownBy(() -> controller.upload(APP_ID, CLIENT_ID, "rel5"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("构建成功");
    }

    @Test
    void upload_nonMpWeixinClient_rejected400() {
        AppRelease release = release("rel6", "PUBLISHED", h5Snapshot());
        when(releaseRepo.findByIdAndTenantId("rel6", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));

        assertThatThrownBy(() -> controller.upload(APP_ID, CLIENT_ID, "rel6"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("小程序");
    }

    @Test
    void upload_missingCredentials_rejected400() {
        AppRelease release = release("rel7", "PUBLISHED", mpWeixinSnapshotMissingCreds());
        when(releaseRepo.findByIdAndTenantId("rel7", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));

        assertThatThrownBy(() -> controller.upload(APP_ID, CLIENT_ID, "rel7"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("凭据");
    }

    @Test
    void upload_crossTenant_404() {
        when(releaseRepo.findByIdAndTenantId("rel8", TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.upload(APP_ID, CLIENT_ID, "rel8"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }

    // ---------- 上传失败：可追溯且不推翻已构建状态 ----------

    @Test
    void upload_builderFailure_recordsErrorAndKeepsPublished() {
        AppRelease release = release("rel9", "PUBLISHED", mpWeixinSnapshot("wx1234", "/keys/wx1234.key"));
        release.setArtifactUrl("/artifacts/rel9/mp-weixin");
        when(releaseRepo.findByIdAndTenantId("rel9", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));
        builderServer.expect(requestTo(BUILDER_URL + "/upload"))
                .andRespond(withServerError().body("{\"ok\":false,\"error\":\"invalid ip, not in whitelist\"}"));

        assertThatThrownBy(() -> controller.upload(APP_ID, CLIENT_ID, "rel9"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("invalid ip");

        ArgumentCaptor<AppRelease> captor = ArgumentCaptor.forClass(AppRelease.class);
        verify(releaseRepo, times(1)).save(captor.capture());
        AppRelease saved = captor.getValue();
        // 失败不推翻已构建状态与产物（可重试）
        assertThat(saved.getStatus()).isEqualTo("PUBLISHED");
        assertThat(saved.getArtifactUrl()).isEqualTo("/artifacts/rel9/mp-weixin");
        assertThat(saved.getError()).contains("invalid ip");
    }

    @Test
    void upload_builderUnreachable_recordsError() {
        AppRelease release = release("rel10", "PUBLISHED", mpWeixinSnapshot("wx1234", "/keys/wx1234.key"));
        when(releaseRepo.findByIdAndTenantId("rel10", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));
        builderServer.expect(requestTo(BUILDER_URL + "/upload"))
                .andRespond(withException(new java.io.IOException("connection refused")));

        assertThatThrownBy(() -> controller.upload(APP_ID, CLIENT_ID, "rel10"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("app-builder");

        ArgumentCaptor<AppRelease> captor = ArgumentCaptor.forClass(AppRelease.class);
        verify(releaseRepo, times(1)).save(captor.capture());
        assertThat(captor.getValue().getError()).isNotBlank();
    }

    // ---------- fixtures ----------

    private AppClient client() {
        AppClient client = new AppClient();
        client.setId(CLIENT_ID);
        client.setTenantId(TENANT);
        client.setAppId(APP_ID);
        client.setClientType("MP_WEIXIN");
        return client;
    }

    private AppRelease release(String id, String status, String snapshotJson) {
        AppRelease release = new AppRelease();
        release.setId(id);
        release.setTenantId(TENANT);
        release.setClientId(CLIENT_ID);
        release.setVersion(3);
        release.setStatus(status);
        release.setSnapshotJson(snapshotJson);
        return release;
    }

    /** 快照形状与 9.1 AppReleaseService 固化的一致；小程序凭证（appid/privateKeyPath）按 Client 配置 */
    private String mpWeixinSnapshot(String appid, String privateKeyPath) {
        return "{\"client\":{\"id\":\"" + CLIENT_ID + "\",\"type\":\"MP_WEIXIN\",\"name\":\"会员端小程序\","
                + "\"buildConfig\":{\"appid\":\"" + appid + "\",\"privateKeyPath\":\"" + privateKeyPath + "\"},"
                + "\"navigation\":null},"
                + "\"pages\":[{\"key\":\"home\",\"publishedVersion\":3}]}";
    }

    private String mpWeixinSnapshotMissingCreds() {
        return "{\"client\":{\"id\":\"" + CLIENT_ID + "\",\"type\":\"MP_WEIXIN\",\"name\":\"会员端小程序\","
                + "\"buildConfig\":{\"appid\":\"wx1234\"},\"navigation\":null},"
                + "\"pages\":[{\"key\":\"home\",\"publishedVersion\":3}]}";
    }

    private String h5Snapshot() {
        return "{\"client\":{\"id\":\"" + CLIENT_ID + "\",\"type\":\"H5\",\"name\":\"会员端H5\","
                + "\"buildConfig\":{\"domain\":\"h5.example.com\"},\"navigation\":null},"
                + "\"pages\":[{\"key\":\"home\",\"publishedVersion\":3}]}";
    }
}