package com.workflow.system.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.entity.SysMaterial;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMaterialRepository;
import com.workflow.system.repository.SysMenuRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * MaterialService 单元测试（change: remote-materials 一期）。
 *
 * <p>覆盖 remote-material spec 的上传注册 Requirement：
 * 首次上传建记录、同 key 版本 +1 覆盖并替换 bundle、manifest 必填字段/type 非法拒绝、
 * 停用后 bundle 不可加载、删除被菜单引用时 409。
 */
@ExtendWith(MockitoExtension.class)
class MaterialServiceTest {

    @Mock
    SysMaterialRepository materialRepository;

    @Mock
    SysMenuRepository menuRepository;

    @TempDir
    Path tempDir;

    MaterialService service;

    private static final String MANIFEST_PAGE = """
            {"key":"demo-board","name":"示例物料看板","type":"PAGE","sdkVersion":"1",
             "menu":{"title":"示例物料看板","icon":"Grid"}}
            """;

    @BeforeEach
    void setUp() {
        service = new MaterialService(materialRepository, menuRepository, new ObjectMapper());
        ReflectionTestUtils.setField(service, "storagePath", tempDir.toString());
        ReflectionTestUtils.setField(service, "maxSizeMb", 5L);
        ReflectionTestUtils.setField(service, "sdkVersion", "1");
    }

    private MockMultipartFile bundle(String content) {
        return new MockMultipartFile("bundle", "bundle.js", "application/javascript", content.getBytes());
    }

    private MockMultipartFile manifest(String json) {
        return new MockMultipartFile("manifest", "manifest.json", "application/json", json.getBytes());
    }

    @Test
    void 首次上传创建启用记录并落盘bundle() throws Exception {
        AtomicLong seq = new AtomicLong(100);
        when(materialRepository.findByMaterialKey("demo-board")).thenReturn(Optional.empty());
        when(materialRepository.save(any(SysMaterial.class))).thenAnswer(inv -> {
            SysMaterial m = inv.getArgument(0);
            m.setId(seq.incrementAndGet());
            return m;
        });

        SysMaterial saved = service.upload(bundle("export default {}"), manifest(MANIFEST_PAGE), "admin");

        assertThat(saved.getMaterialKey()).isEqualTo("demo-board");
        assertThat(saved.getName()).isEqualTo("示例物料看板");
        assertThat(saved.getType()).isEqualTo(SysMaterial.TYPE_PAGE);
        assertThat(saved.getVersion()).isEqualTo(1);
        assertThat(saved.getSdkVersion()).isEqualTo("1");
        assertThat(saved.getStatus()).isEqualTo(1);
        assertThat(saved.getManifestJson()).contains("demo-board");
        assertThat(Files.exists(tempDir.resolve(saved.getStoragePath()))).isTrue();
    }

    @Test
    void 组件物料meta必须是带field和type的有序数组() {
        when(materialRepository.findByMaterialKey("stat-card")).thenReturn(Optional.empty());
        String objectMeta = """
                {"key":"stat-card","name":"Stat Card","type":"WIDGET","sdkVersion":"1",
                 "meta":{"title":{"label":"标题","type":"text"}}}
                """;

        // manifest_json 是 MySQL 的 JSON 列，入库会按（长度,字节序）重排对象键，
        // 面板顺序（= meta 声明顺序）只能靠数组承载
        assertThatThrownBy(() -> service.upload(bundle("x"), manifest(objectMeta), "admin"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("meta");

        String arrayMeta = """
                {"key":"stat-card","name":"Stat Card","type":"WIDGET","sdkVersion":"1",
                 "meta":[{"field":"title","label":"标题","type":"text"},{"field":"value","type":"number"}]}
                """;
        when(materialRepository.save(any(SysMaterial.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThat(service.upload(bundle("x"), manifest(arrayMeta), "admin").getMaterialKey()).isEqualTo("stat-card");
    }

    @Test
    void 同key重新上传版本递增并替换bundle() throws Exception {
        SysMaterial existing = new SysMaterial();
        existing.setId(7L);
        existing.setMaterialKey("demo-board");
        existing.setVersion(3);
        existing.setStoragePath("2026/10/old.js");
        existing.setStoredName("old.js");
        Path oldFile = Files.createDirectories(tempDir.resolve("2026/10"));
        Files.writeString(oldFile.resolve("old.js"), "old");

        when(materialRepository.findByMaterialKey("demo-board")).thenReturn(Optional.of(existing));
        when(materialRepository.save(any(SysMaterial.class))).thenAnswer(inv -> inv.getArgument(0));

        SysMaterial saved = service.upload(bundle("export default 2"), manifest(MANIFEST_PAGE), "admin");

        ArgumentCaptor<SysMaterial> captor = ArgumentCaptor.forClass(SysMaterial.class);
        verify(materialRepository).save(captor.capture());
        assertThat(captor.getValue().getVersion()).isEqualTo(4);
        assertThat(captor.getValue().getId()).isEqualTo(7L);
        assertThat(Files.exists(oldFile.resolve("old.js"))).isFalse();
        assertThat(Files.readString(tempDir.resolve(saved.getStoragePath()))).isEqualTo("export default 2");
    }

    @Test
    void manifest缺必填字段拒绝且不落盘() {
        String broken = """
                {"name":"缺key","type":"PAGE","sdkVersion":"1"}
                """;

        assertThatThrownBy(() -> service.upload(bundle("x"), manifest(broken), "admin"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("key");

        verify(materialRepository, never()).save(any());
        assertThat(tempDir.toFile().listFiles()).isEmpty();
    }

    @Test
    void type非法拒绝() {
        String broken = """
                {"key":"k","name":"n","type":"CHART","sdkVersion":"1"}
                """;

        assertThatThrownBy(() -> service.upload(bundle("x"), manifest(broken), "admin"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("type");
    }

    @Test
    void widget物料必须提供meta() {
        String broken = """
                {"key":"w","name":"n","type":"WIDGET","sdkVersion":"1"}
                """;

        assertThatThrownBy(() -> service.upload(bundle("x"), manifest(broken), "admin"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("meta");
    }

    @Test
    void manifest缺失拒绝() {
        assertThatThrownBy(() -> service.upload(bundle("x"), null, "admin"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 非JS文件拒绝() {
        MockMultipartFile exe = new MockMultipartFile("bundle", "evil.exe",
                "application/octet-stream", new byte[] {1, 2, 3});

        assertThatThrownBy(() -> service.upload(exe, manifest(MANIFEST_PAGE), "admin"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("bundle");
    }

    @Test
    void 停用后bundle不可加载() throws Exception {
        SysMaterial m = new SysMaterial();
        m.setMaterialKey("demo-board");
        m.setStatus(0);
        m.setStoragePath("2026/10/x.js");
        when(materialRepository.findByMaterialKeyAndIsDeleted("demo-board", 0)).thenReturn(Optional.of(m));

        assertThatThrownBy(() -> service.loadBundle("demo-board"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不可用");
    }

    @Test
    void key不存在时加载返回404() {
        when(materialRepository.findByMaterialKeyAndIsDeleted("ghost", 0)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.loadBundle("ghost"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("物料不存在");
    }

    @Test
    void 删除被菜单引用的物料返回409并列出引用() {
        SysMaterial m = new SysMaterial();
        m.setId(9L);
        m.setMaterialKey("demo-board");
        when(materialRepository.findById(9L)).thenReturn(Optional.of(m));
        SysMenu menu = mock(SysMenu.class);
        when(menu.getMenuName()).thenReturn("看板页");
        when(menu.getPath()).thenReturn("/material/demo-board");
        when(menuRepository.findByComponentAndIsDeleted("material:demo-board", 0)).thenReturn(List.of(menu));

        assertThatThrownBy(() -> service.delete(9L, false))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("看板页");

        verify(materialRepository, never()).save(m);
    }

    @Test
    void 确认后删除为软删() {
        SysMaterial m = new SysMaterial();
        m.setId(9L);
        m.setMaterialKey("demo-board");
        when(materialRepository.findById(9L)).thenReturn(Optional.of(m));
        when(menuRepository.findByComponentAndIsDeleted("material:demo-board", 0)).thenReturn(List.of());
        when(materialRepository.save(any(SysMaterial.class))).thenAnswer(inv -> inv.getArgument(0));

        service.delete(9L, true);

        assertThat(m.getIsDeleted()).isEqualTo(1);
    }

    @Test
    void 组件物料列表只取启用的WIDGET() {
        SysMaterial widget = new SysMaterial();
        widget.setMaterialKey("stock-chart");
        widget.setType(SysMaterial.TYPE_WIDGET);
        widget.setStatus(1);
        when(materialRepository.findByTypeAndStatusAndIsDeletedOrderByCreatedAtDesc(
                SysMaterial.TYPE_WIDGET, 1, 0)).thenReturn(List.of(widget));

        assertThat(service.listEnabledWidgets())
                .extracting(SysMaterial::getMaterialKey)
                .containsExactly("stock-chart");
    }
}
