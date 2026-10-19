package com.workflow.system.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.permission.PermissionEvaluator;
import com.workflow.system.domain.entity.SysMaterial;
import com.workflow.system.service.MaterialScaffoldService;
import com.workflow.system.service.MaterialService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * MaterialController 权限与响应语义单元测试（remote-materials 2.4/2.5）。
 *
 * <p>覆盖：管理动作要求 material:manage（无权限 403）、bundle 下载不校验权限
 * （公开读，供 ESM import()）、status 参数非法 400、详情返回宿主 SDK 版本。
 */
class MaterialControllerTest {

    private MaterialService materialService;
    private MaterialScaffoldService materialScaffoldService;
    private PermissionEvaluator permissionEvaluator;
    private MaterialController controller;

    @BeforeEach
    void setUp() {
        materialService = mock(MaterialService.class);
        materialScaffoldService = mock(MaterialScaffoldService.class);
        permissionEvaluator = mock(PermissionEvaluator.class);
        controller = new MaterialController(materialService, materialScaffoldService,
                permissionEvaluator, new ObjectMapper());
    }

    private SysMaterial material() {
        SysMaterial m = new SysMaterial();
        m.setId(1L);
        m.setMaterialKey("demo-board");
        m.setName("示例物料看板");
        m.setType(SysMaterial.TYPE_PAGE);
        m.setVersion(1);
        m.setSdkVersion("1");
        m.setStatus(1);
        m.setFileSize(10L);
        m.setManifestJson("{\"key\":\"demo-board\",\"name\":\"示例物料看板\",\"type\":\"PAGE\",\"sdkVersion\":\"1\"}");
        return m;
    }

    @Test
    void 无管理权限上传返回403() {
        when(permissionEvaluator.hasPermission(MaterialController.PERMISSION_MANAGE)).thenReturn(false);
        MockMultipartFile bundle = new MockMultipartFile("bundle", "b.js", "application/javascript", "x".getBytes());
        MockMultipartFile manifest = new MockMultipartFile("manifest", "m.json", "application/json", "{}".getBytes());

        assertThatThrownBy(() -> controller.upload(bundle, manifest))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("material:manage");

        verify(materialService, never()).upload(any(), any(), any());
    }

    @Test
    void 有管理权限上传放行() throws Exception {
        when(permissionEvaluator.hasPermission(anyString())).thenReturn(true);
        when(materialService.upload(any(), any(), any())).thenReturn(material());
        MockMultipartFile bundle = new MockMultipartFile("bundle", "b.js", "application/javascript", "x".getBytes());
        MockMultipartFile manifest = new MockMultipartFile("manifest", "m.json", "application/json", "{}".getBytes());

        assertThat(controller.upload(bundle, manifest).getData().getMaterialKey()).isEqualTo("demo-board");
    }

    @Test
    void bundle下载不校验权限且返回ESM类型() {
        when(materialService.loadBundle("demo-board")).thenReturn(new ByteArrayResource("export default {}".getBytes()));

        var response = controller.bundle("demo-board");

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.parseMediaType("application/javascript;charset=UTF-8"));
        verify(permissionEvaluator, never()).hasPermission(anyString());
    }

    @Test
    void status非法值返回400() {
        when(permissionEvaluator.hasPermission(anyString())).thenReturn(true);

        assertThatThrownBy(() -> controller.setStatus(1L, 2))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("status");
    }

    @Test
    void 详情返回宿主SDK版本与下载地址() {
        when(materialService.requireByKey("demo-board")).thenReturn(material());
        when(materialService.currentSdkVersion()).thenReturn("1");
        when(materialService.referencingMenus(any())).thenReturn(java.util.List.of());

        var detail = controller.detailByKey("demo-board").getData();

        assertThat(detail.get("hostSdkVersion")).isEqualTo("1");
        assertThat(detail.get("downloadUrl")).isEqualTo("/api/materials/demo-board/bundle");
        // manifest 必须是纯 Java 结构：Jackson 2 的 JsonNode 进响应会被 Jackson 3 当 POJO 序列化
        assertThat(detail.get("manifest")).isInstanceOf(java.util.Map.class);
        assertThat((java.util.Map<String, ?>) detail.get("manifest")).containsKeys("key", "type");
        assertThat(httpJson(detail)).contains("demo-board").doesNotContain("containerNode");
    }

    private SysMaterial widgetMaterial() {
        SysMaterial m = new SysMaterial();
        m.setId(2L);
        m.setMaterialKey("stock-chart");
        m.setName("库存趋势图");
        m.setType(SysMaterial.TYPE_WIDGET);
        m.setVersion(3);
        m.setSdkVersion("1");
        m.setStatus(1);
        m.setManifestJson("""
                {"key":"stock-chart","name":"库存趋势图","type":"WIDGET","sdkVersion":"1",
                 "meta":[{"field":"title","label":"标题","type":"text","default":"库存趋势"},
                          {"field":"value","label":"指标值","type":"number","default":128},
                          {"field":"unit","label":"单位","type":"text","default":"条"},
                          {"field":"trend","label":"趋势","type":"select","options":[{"label":"上升","value":"up"}]},
                          {"field":"refreshInterval","label":"刷新秒数","type":"number","default":30}]}
                """);
        return m;
    }

    @Test
    @SuppressWarnings("unchecked")
    void 组件物料列表返回meta供设计器面板使用且不校验管理权限() throws Exception {
        when(materialService.listEnabledWidgets()).thenReturn(java.util.List.of(widgetMaterial()));

        var items = controller.widgets().getData();

        assertThat(items).hasSize(1);
        assertThat(items.get(0).get("materialKey")).isEqualTo("stock-chart");
        assertThat(items.get(0).get("name")).isEqualTo("库存趋势图");
        assertThat(items.get(0).get("version")).isEqualTo(3);
        assertThat(items.get(0).get("sdkVersion")).isEqualTo("1");
        // meta 必须是有序数组：响应体的 Jackson 3 会把 Map 的键按字母序重排，
        // 面板顺序（= manifest.meta 声明顺序）用对象承载会丢失
        assertThat(items.get(0).get("meta")).isInstanceOf(java.util.List.class);
        java.util.List<java.util.Map<String, Object>> meta =
                (java.util.List<java.util.Map<String, Object>>) items.get(0).get("meta");
        // 顺序 = manifest.meta 的声明顺序（Jackson 2 的 ObjectNode 默认 HashMap 存键，不显式保序会乱）
        assertThat(meta).extracting(m -> m.get("field")).containsExactly(
                "title", "value", "unit", "trend", "refreshInterval");
        assertThat(meta.get(0)).containsEntry("label", "标题").containsEntry("default", "库存趋势");
        assertThat(meta.get(4)).containsEntry("type", "number").containsEntry("default", 30);
        assertThat(meta.get(3).get("options")).isInstanceOf(java.util.List.class);
        // 与真实 HTTP 一致用 Jackson 3 序列化：meta 是声明里的配置项，不是 JsonNode 的 getter 集合
        String httpJson = httpJson(items.get(0));
        assertThat(httpJson).contains("refreshInterval").contains("刷新秒数").doesNotContain("containerNode");
        verify(permissionEvaluator, never()).hasPermission(anyString());
    }

    @Test
    void 组件物料缺meta时返回空列表不报错() {
        SysMaterial legacy = widgetMaterial();
        legacy.setManifestJson("{\"key\":\"stock-chart\",\"name\":\"库存趋势图\",\"type\":\"WIDGET\",\"sdkVersion\":\"1\"}");
        when(materialService.listEnabledWidgets()).thenReturn(java.util.List.of(legacy));

        assertThat(controller.widgets().getData().get(0).get("meta")).isEqualTo(java.util.List.of());
    }

    @Test
    @SuppressWarnings("unchecked")
    void 协议前的对象形态meta仍按可用内容下发() {
        SysMaterial legacy = widgetMaterial();
        legacy.setManifestJson("""
                {"key":"stock-chart","name":"库存趋势图","type":"WIDGET","sdkVersion":"1",
                 "meta":{"title":{"label":"标题","type":"text"}}}
                """);
        when(materialService.listEnabledWidgets()).thenReturn(java.util.List.of(legacy));

        var meta = (java.util.List<java.util.Map<String, Object>>) controller.widgets().getData().get(0).get("meta");

        assertThat(meta).hasSize(1);
        assertThat(meta.get(0)).containsEntry("field", "title").containsEntry("label", "标题");
    }

    @Test
    void 导出需管理权限并回zip流() throws Exception {
        when(permissionEvaluator.hasPermission(MaterialController.PERMISSION_MANAGE)).thenReturn(false);
        assertThatThrownBy(() -> controller.export(new MaterialController.ExportReq(java.util.List.of(1L))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("material:manage");
        verify(materialService, never()).exportPackage(any());

        when(permissionEvaluator.hasPermission(MaterialController.PERMISSION_MANAGE)).thenReturn(true);
        when(materialService.exportPackage(java.util.List.of(1L)))
                .thenReturn(new MaterialService.ExportResult("materials-20261019.zip", new byte[] {1, 2, 3}));

        var response = controller.export(new MaterialController.ExportReq(java.util.List.of(1L)));

        assertThat(response.getHeaders().getFirst(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION))
                .contains("materials-20261019.zip");
        assertThat(response.getBody()).hasSize(3);
    }

    @Test
    void 预检与导入需管理权限并透传策略() throws Exception {
        when(permissionEvaluator.hasPermission(MaterialController.PERMISSION_MANAGE)).thenReturn(false);
        MockMultipartFile file = new MockMultipartFile("file", "p.zip", "application/zip", new byte[] {1});
        assertThatThrownBy(() -> controller.inspect(file)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> controller.imports(file, "[]")).isInstanceOf(BusinessException.class);

        when(permissionEvaluator.hasPermission(MaterialController.PERMISSION_MANAGE)).thenReturn(true);
        when(materialService.importPackage(any(), any(), any()))
                .thenReturn(new MaterialService.ImportResult(java.util.List.of(), java.util.List.of()));

        controller.imports(file, "[{\"key\":\"demo-board\",\"strategy\":\"OVERWRITE\"},"
                + "{\"key\":\"stat-card\",\"strategy\":\"SKIP\"}]");
        // actions 是 JSON 串（multipart 里传对象数组只能走字符串），控制器负责解析成服务层的策略表
        @SuppressWarnings("unchecked")
        org.mockito.ArgumentCaptor<java.util.List<MaterialService.ImportAction>> captor =
                org.mockito.ArgumentCaptor.forClass((Class) java.util.List.class);
        verify(materialService).importPackage(any(), captor.capture(), any());
        java.util.List<MaterialService.ImportAction> actions = captor.getValue();
        assertThat(actions).hasSize(2);
        assertThat(actions.get(0).key()).isEqualTo("demo-board");
        assertThat(actions.get(0).strategy()).isEqualTo("OVERWRITE");
        assertThat(actions.get(1).key()).isEqualTo("stat-card");
        assertThat(actions.get(1).strategy()).isEqualTo("SKIP");
    }

    @Test
    void 导入actions非法JSON返回400() throws Exception {
        when(permissionEvaluator.hasPermission(MaterialController.PERMISSION_MANAGE)).thenReturn(true);
        MockMultipartFile file = new MockMultipartFile("file", "p.zip", "application/zip", new byte[] {1});

        assertThatThrownBy(() -> controller.imports(file, "{not json"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("actions");
    }

    /** 按 Spring Boot 4 的响应序列化方式（tools.jackson / Jackson 3）转 JSON */
    private static String httpJson(Object payload) {
        return tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(payload);
    }
}
