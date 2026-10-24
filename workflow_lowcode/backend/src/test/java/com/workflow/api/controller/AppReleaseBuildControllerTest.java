package com.workflow.api.controller;

import com.workflow.api.dto.AppReleaseBuildRequest;
import com.workflow.api.dto.AppReleaseResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.AppReleaseBuildService;
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
 * Release 构建触发与归档测试（Task 9.2，spec: app-release-pipeline「按 Client 构建」）。
 *
 * 直调控制器（真实 AppReleaseBuildService + mock 仓储 + MockRestServiceServer 假
 * app-builder），覆盖：
 * - 触发构建 → BUILDING → POST app-builder（快照 client 配置 + files 转发）→
 *   成功回写 artifact_url + PUBLISHED；失败置 FAILED 且错误可追溯；
 * - 构建失败不清掉旧 artifact_url（历史产物不受影响）；
 * - BUILDING 并发触发拒绝 400；APP 端暂不支持 400；files 缺失 400。
 */
class AppReleaseBuildControllerTest {

    private static final String TENANT = "t1";
    private static final String APP_ID = "app1";
    private static final String CLIENT_ID = "client1";
    private static final String BUILDER_URL = "http://app-builder.local";

    private AppClientRepository clientRepo;
    private AppReleaseRepository releaseRepo;
    private MockRestServiceServer builderServer;
    private AppReleaseBuildController controller;

    @BeforeEach
    void setUp() {
        clientRepo = mock(AppClientRepository.class);
        releaseRepo = mock(AppReleaseRepository.class);
        RestClient.Builder restBuilder = RestClient.builder();
        builderServer = MockRestServiceServer.bindTo(restBuilder).build();
        AppReleaseBuildService service = new AppReleaseBuildService(
                releaseRepo, clientRepo, restBuilder, BUILDER_URL, new TenantProvider());
        controller = new AppReleaseBuildController(service);
        TenantContext.setTenantId(TENANT);
        when(releaseRepo.save(any(AppRelease.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ---------- 构建成功：归档 + PUBLISHED ----------

    @Test
    void build_success_archivesArtifactAndPublishes() {
        AppRelease release = release("rel1", "CREATED", mpWeixinSnapshot());
        when(releaseRepo.findByIdAndTenantId("rel1", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));
        builderServer.expect(requestTo(BUILDER_URL + "/build"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"releaseId":"rel1","platform":"mp-weixin","files":{"src/pages.json":"{}"},"buildConfig":{"appid":"wx1234"}}
                        """))
                .andRespond(withSuccess("{\"ok\":true,\"artifactUrl\":\"/artifacts/rel1/app.zip\"}", MediaType.APPLICATION_JSON));

        R<AppReleaseResponse> result = controller.build(
                APP_ID, CLIENT_ID, "rel1", buildRequest("{\"src/pages.json\":\"{}\"}"));

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().getStatus()).isEqualTo("PUBLISHED");
        assertThat(result.getData().getArtifactUrl()).isEqualTo("/artifacts/rel1/app.zip");
        builderServer.verify();

        // 两次 save：置 BUILDING + 成功回写终态；以最后一次为准
        ArgumentCaptor<AppRelease> captor = ArgumentCaptor.forClass(AppRelease.class);
        verify(releaseRepo, times(2)).save(captor.capture());
        AppRelease last = captor.getAllValues().get(1);
        assertThat(last.getStatus()).isEqualTo("PUBLISHED");
        assertThat(last.getArtifactUrl()).isEqualTo("/artifacts/rel1/app.zip");
        assertThat(last.getError()).isNull();
    }

    @Test
    void build_h5Client_usesH5Platform() {
        AppRelease release = release("rel2", "CREATED", h5Snapshot());
        when(releaseRepo.findByIdAndTenantId("rel2", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));
        builderServer.expect(requestTo(BUILDER_URL + "/build"))
                .andExpect(content().json("""
                        {"releaseId":"rel2","platform":"h5","files":{"src/pages.json":"{}"},"buildConfig":{"domain":"h5.example.com"}}
                        """))
                .andRespond(withSuccess("{\"ok\":true,\"artifactUrl\":\"/artifacts/rel2/h5.zip\"}", MediaType.APPLICATION_JSON));

        controller.build(APP_ID, CLIENT_ID, "rel2", buildRequest("{\"src/pages.json\":\"{}\"}"));
        builderServer.verify();
    }

    // ---------- 构建失败：FAILED 可追溯，历史产物不受影响 ----------

    @Test
    void build_appBuilderReportsFailure_marksFailedAndKeepsOldArtifact() {
        AppRelease release = release("rel3", "CREATED", mpWeixinSnapshot());
        release.setArtifactUrl("/artifacts/old/rel3.zip");
        when(releaseRepo.findByIdAndTenantId("rel3", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));
        builderServer.expect(requestTo(BUILDER_URL + "/build"))
                .andRespond(withServerError().body("{\"ok\":false,\"error\":\"uni build 失败（exit 1）：template syntax\"}"));

        assertThatThrownBy(() -> controller.build(APP_ID, CLIENT_ID, "rel3", buildRequest("{\"src/pages.json\":\"{}\"}")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("uni build 失败");

        // 两次 save：置 BUILDING + markFailed；以最后一次为准
        ArgumentCaptor<AppRelease> captor = ArgumentCaptor.forClass(AppRelease.class);
        verify(releaseRepo, times(2)).save(captor.capture());
        AppRelease last = captor.getAllValues().get(1);
        assertThat(last.getStatus()).isEqualTo("FAILED");
        // 历史产物不受影响：失败的构建不清掉旧 artifact_url
        assertThat(last.getArtifactUrl()).isEqualTo("/artifacts/old/rel3.zip");
        assertThat(last.getError()).contains("uni build 失败");
    }

    @Test
    void build_appBuilderUnreachable_marksFailed() {
        AppRelease release = release("rel4", "CREATED", mpWeixinSnapshot());
        when(releaseRepo.findByIdAndTenantId("rel4", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));
        builderServer.expect(requestTo(BUILDER_URL + "/build"))
                .andRespond(withException(new java.io.IOException("connection refused")));

        assertThatThrownBy(() -> controller.build(APP_ID, CLIENT_ID, "rel4", buildRequest("{\"src/pages.json\":\"{}\"}")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("app-builder");

        // 两次 save：置 BUILDING + markFailed
        ArgumentCaptor<AppRelease> captor = ArgumentCaptor.forClass(AppRelease.class);
        verify(releaseRepo, times(2)).save(captor.capture());
        AppRelease last = captor.getAllValues().get(1);
        assertThat(last.getStatus()).isEqualTo("FAILED");
        assertThat(last.getError()).isNotBlank();
    }

    // ---------- 状态机约束 ----------

    @Test
    void build_alreadyBuilding_rejected400() {
        AppRelease release = release("rel5", "BUILDING", mpWeixinSnapshot());
        when(releaseRepo.findByIdAndTenantId("rel5", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));

        assertThatThrownBy(() -> controller.build(APP_ID, CLIENT_ID, "rel5", buildRequest("{}")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("构建进行中");
    }

    @Test
    void build_appClientNotSupportedYet_rejected400() {
        AppRelease release = release("rel6", "CREATED", appSnapshot());
        when(releaseRepo.findByIdAndTenantId("rel6", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));

        assertThatThrownBy(() -> controller.build(APP_ID, CLIENT_ID, "rel6", buildRequest("{}")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("暂不支持");
    }

    @Test
    void build_filesRequired_rejected400() {
        AppRelease release = release("rel7", "CREATED", mpWeixinSnapshot());
        when(releaseRepo.findByIdAndTenantId("rel7", TENANT)).thenReturn(Optional.of(release));
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));

        assertThatThrownBy(() -> controller.build(APP_ID, CLIENT_ID, "rel7", buildRequest(null)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("files");
    }

    @Test
    void build_crossTenant_404() {
        when(releaseRepo.findByIdAndTenantId("rel8", TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.build(APP_ID, CLIENT_ID, "rel8", buildRequest("{}")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }

    // ---------- fixtures ----------

    private AppReleaseBuildRequest buildRequest(String filesJson) {
        AppReleaseBuildRequest req = new AppReleaseBuildRequest();
        req.setFiles(filesJson);
        return req;
    }

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
        release.setVersion(1);
        release.setStatus(status);
        release.setSnapshotJson(snapshotJson);
        return release;
    }

    /** 快照形状与 9.1 AppReleaseService 固化的一致（client.type/buildConfig + pages） */
    private String mpWeixinSnapshot() {
        return "{\"client\":{\"id\":\"" + CLIENT_ID + "\",\"type\":\"MP_WEIXIN\",\"name\":\"会员端小程序\","
                + "\"buildConfig\":{\"appid\":\"wx1234\"},\"navigation\":null},"
                + "\"pages\":[{\"key\":\"home\",\"publishedVersion\":3}]}";
    }

    private String h5Snapshot() {
        return "{\"client\":{\"id\":\"" + CLIENT_ID + "\",\"type\":\"H5\",\"name\":\"会员端H5\","
                + "\"buildConfig\":{\"domain\":\"h5.example.com\"},\"navigation\":null},"
                + "\"pages\":[{\"key\":\"home\",\"publishedVersion\":3}]}";
    }

    private String appSnapshot() {
        return "{\"client\":{\"id\":\"" + CLIENT_ID + "\",\"type\":\"APP\",\"name\":\"会员端APP\","
                + "\"buildConfig\":null,\"navigation\":null},"
                + "\"pages\":[{\"key\":\"home\",\"publishedVersion\":3}]}";
    }
}
