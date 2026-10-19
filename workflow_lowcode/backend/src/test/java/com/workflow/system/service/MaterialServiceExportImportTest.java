package com.workflow.system.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.material.MaterialPackageCodec;
import com.workflow.system.domain.entity.SysMaterial;
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

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * MaterialService 导出/预检/导入单元测试（change: remote-materials 三期 6.1/6.2）。
 *
 * <p>走真实存储目录（@TempDir）+ mock 仓储：物料之间没有依赖关系，
 * 所以导出/导入的正确性关键是「bundle 原文逐字节进出」与「同 key 冲突怎么处理」。
 */
@ExtendWith(MockitoExtension.class)
class MaterialServiceExportImportTest {

    @Mock
    SysMaterialRepository materialRepository;

    @Mock
    SysMenuRepository menuRepository;

    @TempDir
    Path tempDir;

    MaterialService service;

    private static final String MANIFEST_PAGE =
            "{\"key\":\"demo-board\",\"name\":\"示例物料看板\",\"type\":\"PAGE\",\"sdkVersion\":\"1\"}";

    private static final String MANIFEST_WIDGET =
            "{\"key\":\"stat-card\",\"name\":\"指标卡\",\"type\":\"WIDGET\",\"sdkVersion\":\"1\","
                    + "\"meta\":[{\"field\":\"title\",\"type\":\"text\"},{\"field\":\"unit\",\"type\":\"text\"}]}";

    @BeforeEach
    void setUp() {
        service = new MaterialService(materialRepository, menuRepository, new ObjectMapper());
        ReflectionTestUtils.setField(service, "storagePath", tempDir.toString());
        ReflectionTestUtils.setField(service, "maxSizeMb", 5L);
        ReflectionTestUtils.setField(service, "sdkVersion", "1");
    }

    /** 简易内存仓储：按 materialKey 存取，覆盖上传版本 +1（与真库语义一致）。 */
    private void stubRepository() {
        AtomicLong seq = new AtomicLong(100);
        java.util.Map<String, SysMaterial> store = new java.util.LinkedHashMap<>();
        // lenient：导出/预检等路径未必把三条 stub 都用满，严格模式下会误报无用桩
        org.mockito.Mockito.lenient().when(materialRepository.findByMaterialKeyAndIsDeleted(any(),
                        org.mockito.ArgumentMatchers.eq(0)))
                .thenAnswer(inv -> Optional.ofNullable(store.get((String) inv.getArgument(0)))
                        .filter(m -> m.getIsDeleted() == null || m.getIsDeleted() == 0));
        org.mockito.Mockito.lenient().when(materialRepository.save(any(SysMaterial.class))).thenAnswer(inv -> {
            SysMaterial m = inv.getArgument(0);
            if (m.getId() == null) {
                m.setId(seq.incrementAndGet());
            }
            store.put(m.getMaterialKey(), m);
            return m;
        });
        org.mockito.Mockito.lenient().when(materialRepository.findById(any())).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            return store.values().stream().filter(m -> m.getId().equals(id)).findFirst();
        });
        // 唯一键视角的查找（含软删记录）：material_key 全表唯一，register 必须按这个口径判断新旧
        org.mockito.Mockito.lenient().when(materialRepository.findByMaterialKey(any())).thenAnswer(inv ->
                Optional.ofNullable(store.get((String) inv.getArgument(0))));
    }

    private SysMaterial uploadPage(String content) throws Exception {
        return service.upload(bundle(content, "bundle.js"), manifest(MANIFEST_PAGE), "admin");
    }

    private MockMultipartFile bundle(String content, String name) {
        return new MockMultipartFile("bundle", name, "application/javascript", content.getBytes());
    }

    /** 读磁盘上的 bundle 原文，验证导入确实替换了文件（而不是只改了记录）。 */
    private String storedContent(String key) throws Exception {
        SysMaterial material = service.requireByKey(key);
        return java.nio.file.Files.readString(tempDir.resolve(material.getStoragePath()));
    }

    private byte[] zipOf(java.util.Map<String, String> entries) throws Exception {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(bos)) {
            for (java.util.Map.Entry<String, String> e : entries.entrySet()) {
                zos.putNextEntry(new java.util.zip.ZipEntry(e.getKey()));
                zos.write(e.getValue().getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
            }
        }
        return bos.toByteArray();
    }

    private MockMultipartFile manifest(String json) {
        return new MockMultipartFile("manifest", "manifest.json", "application/json", json.getBytes());
    }

    private byte[] packageOf(String pageManifest, String pageBundle, String widgetManifest, String widgetBundle)
            throws Exception {
        List<MaterialPackageCodec.BundleMaterial> items = List.of(
                new MaterialPackageCodec.BundleMaterial("demo-board", "示例物料看板", "PAGE", "1", 1,
                        MaterialPackageCodec.manifestEntryOf("demo-board"),
                        MaterialPackageCodec.bundleEntryOf("demo-board")),
                new MaterialPackageCodec.BundleMaterial("stat-card", "指标卡", "WIDGET", "1", 1,
                        MaterialPackageCodec.manifestEntryOf("stat-card"),
                        MaterialPackageCodec.bundleEntryOf("stat-card")));
        MaterialPackageCodec.MaterialBundle bundle = new MaterialPackageCodec.MaterialBundle(
                MaterialPackageCodec.BUNDLE_KIND, MaterialPackageCodec.SCHEMA_VERSION, "2026-10-19 14:00:00", items);
        java.util.Map<String, MaterialPackageCodec.MaterialPayload> payloads = new java.util.LinkedHashMap<>();
        payloads.put("demo-board", new MaterialPackageCodec.MaterialPayload(pageManifest,
                pageBundle.getBytes(StandardCharsets.UTF_8)));
        payloads.put("stat-card", new MaterialPackageCodec.MaterialPayload(widgetManifest,
                widgetBundle.getBytes(StandardCharsets.UTF_8)));
        return MaterialPackageCodec.write(bundle, payloads, new ObjectMapper());
    }

    // ================= 导出 =================

    @Test
    void 导出包内含manifest原文与bundle字节() throws Exception {
        stubRepository();
        SysMaterial page = uploadPage("export default {name:'DemoBoard'}");
        SysMaterial widget = service.upload(bundle("export default {name:'StatCard'}", "bundle.js"),
                manifest(MANIFEST_WIDGET), "admin");

        MaterialService.ExportResult result = service.exportPackage(List.of(page.getId(), widget.getId()));

        assertThat(result.fileName()).endsWith(".zip");
        MaterialPackageCodec.Package pkg = MaterialPackageCodec.read(result.zipBytes(), new ObjectMapper());
        assertThat(pkg.bundle().materials()).hasSize(2);
        assertThat(new String(pkg.payloads().get("demo-board").bundleBytes(), StandardCharsets.UTF_8))
                .isEqualTo("export default {name:'DemoBoard'}");
        // meta 数组顺序在包内保持声明序（入库会被 MySQL JSON 列重排，包里不能丢）
        assertThat(pkg.payloads().get("stat-card").manifestJson())
                .contains("\"meta\":[{\"field\":\"title\",\"type\":\"text\"},{\"field\":\"unit\"");
    }

    @Test
    void 未选择物料时导出被拒() {
        stubRepository();
        assertThatThrownBy(() -> service.exportPackage(List.of()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("至少选择一个物料");
    }

    @Test
    void bundle文件缺失时导出失败并点出物料() throws Exception {
        stubRepository();
        SysMaterial page = uploadPage("export default {}");
        java.nio.file.Files.delete(tempDir.resolve(page.getStoragePath()));

        assertThatThrownBy(() -> service.exportPackage(List.of(page.getId())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("demo-board");
    }

    // ================= 预检 =================

    @Test
    void 预检标出同key冲突与全新物料() throws Exception {
        stubRepository();
        uploadPage("export default {}");
        byte[] zip = packageOf(MANIFEST_PAGE, "export default {name:'A'}", MANIFEST_WIDGET, "export default {name:'B'}");

        MaterialService.InspectResult inspect = service.inspectPackage(zip);

        assertThat(inspect.hostSdkVersion()).isEqualTo("1");
        assertThat(inspect.items()).hasSize(2);
        MaterialService.InspectItem existed = inspect.items().stream()
                .filter(i -> i.key().equals("demo-board")).findFirst().orElseThrow();
        assertThat(existed.conflict()).isTrue();
        assertThat(existed.existingVersion()).isEqualTo(1);
        assertThat(existed.importable()).isTrue();
        MaterialService.InspectItem fresh = inspect.items().stream()
                .filter(i -> i.key().equals("stat-card")).findFirst().orElseThrow();
        assertThat(fresh.conflict()).isFalse();
    }

    @Test
    void 预检拒绝SDK主版本不符的物料并给出原因() throws Exception {
        stubRepository();
        String sdk9 = MANIFEST_PAGE.replace("\"sdkVersion\":\"1\"", "\"sdkVersion\":\"9\"");
        byte[] zip = packageOf(sdk9, "export default {}", MANIFEST_WIDGET, "export default {}");

        MaterialService.InspectResult inspect = service.inspectPackage(zip);

        MaterialService.InspectItem mismatch = inspect.items().get(0);
        assertThat(mismatch.importable()).isFalse();
        assertThat(mismatch.reason()).contains("SDK");
    }

    @Test
    void 预检非物料包时报错() throws Exception {
        // 拿页面模板导出文件格式冒充物料包：kind 不符必须当场拒，不能进入逐条判定
        byte[] notAMaterialZip = zipOf(java.util.Map.of("manifest.json",
                "{\"kind\":\"page-template-bundle\",\"schemaVersion\":1,\"templates\":[]}"));

        assertThatThrownBy(() -> service.inspectPackage(notAMaterialZip))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不是物料包");
    }

    // ================= 导入 =================

    @Test
    void 导入全新物料落库并可用() throws Exception {
        stubRepository();
        byte[] zip = packageOf(MANIFEST_PAGE, "export default {name:'A'}", MANIFEST_WIDGET, "export default {name:'B'}");

        MaterialService.ImportResult result = service.importPackage(zip, List.of(), "admin");

        assertThat(result.results()).extracting(MaterialService.ImportItemResult::status)
                .containsOnly("IMPORTED");
        SysMaterial imported = service.requireByKey("demo-board");
        assertThat(imported.getName()).isEqualTo("示例物料看板");
        assertThat(imported.getVersion()).isEqualTo(1);
        assertThat(imported.getStatus()).isEqualTo(1);
        assertThat(storedContent("stat-card")).contains("{name:'B'}");
    }

    @Test
    void 冲突物料默认跳过() throws Exception {
        stubRepository();
        SysMaterial existing = uploadPage("export default {name:'旧版'}");
        byte[] zip = packageOf(MANIFEST_PAGE, "export default {name:'新版'}", MANIFEST_WIDGET, "export default {name:'B'}");

        MaterialService.ImportResult result = service.importPackage(zip, List.of(), "admin");

        assertThat(service.requireByKey("demo-board").getVersion()).isEqualTo(existing.getVersion());
        assertThat(storedContent("demo-board")).contains("旧版");
        assertThat(result.results()).anySatisfy(i -> {
            assertThat(i.key()).isEqualTo("demo-board");
            assertThat(i.status()).isEqualTo("SKIPPED");
        });
    }

    @Test
    void 选择覆盖时同key版本加一并替换bundle() throws Exception {
        stubRepository();
        uploadPage("export default {name:'旧版'}");
        byte[] zip = packageOf(MANIFEST_PAGE, "export default {name:'新版'}", MANIFEST_WIDGET, "export default {name:'B'}");

        MaterialService.ImportResult result = service.importPackage(zip,
                List.of(new MaterialService.ImportAction("demo-board", "OVERWRITE")), "admin");

        SysMaterial overwritten = service.requireByKey("demo-board");
        assertThat(overwritten.getVersion()).isEqualTo(2);
        assertThat(result.results()).anySatisfy(i -> {
            assertThat(i.key()).isEqualTo("demo-board");
            assertThat(i.status()).isEqualTo("OVERWRITTEN");
            assertThat(i.version()).isEqualTo(2);
        });
        assertThat(storedContent("demo-board")).contains("新版");
    }

    @Test
    void 单条物料校验失败不影响其他物料导入() throws Exception {
        stubRepository();
        // 合法 JSON、对象形态 meta：失败原因必须落在「meta 必须是数组」这条校验上，而不是解析错误
        String brokenWidget = MANIFEST_WIDGET.replace(
                "\"meta\":[{\"field\":\"title\",\"type\":\"text\"},{\"field\":\"unit\",\"type\":\"text\"}]",
                "\"meta\":{\"title\":{\"type\":\"text\"}}");
        byte[] zip = packageOf(MANIFEST_PAGE, "export default {name:'A'}", brokenWidget, "export default {name:'B'}");

        MaterialService.ImportResult result = service.importPackage(zip, List.of(), "admin");

        assertThat(result.results()).anySatisfy(i -> {
            assertThat(i.key()).isEqualTo("stat-card");
            assertThat(i.status()).isEqualTo("FAILED");
            assertThat(i.message()).contains("meta");
        });
        assertThat(service.requireByKey("demo-board").getMaterialKey()).isEqualTo("demo-board");
    }

    @Test
    void 导入时不信任包内key与manifest不一致的条目() throws Exception {
        stubRepository();
        // 根 manifest 写 demo-board，物料自身 manifest 写别的 key：以 manifest 为准，按新 key 落库
        byte[] zip = packageOf("{\"key\":\"other-board\",\"name\":\"改名\",\"type\":\"PAGE\",\"sdkVersion\":\"1\"}",
                "export default {}", MANIFEST_WIDGET, "export default {}");

        MaterialService.ImportResult result = service.importPackage(zip, List.of(), "admin");

        assertThat(result.results()).anySatisfy(i -> {
            assertThat(i.key()).isEqualTo("demo-board");
            assertThat(i.status()).isEqualTo("FAILED");
            assertThat(i.message()).contains("key");
        });
    }

    @Test
    void 导入未知策略被拒() throws Exception {
        stubRepository();
        byte[] zip = packageOf(MANIFEST_PAGE, "export default {}", MANIFEST_WIDGET, "export default {}");

        assertThatThrownBy(() -> service.importPackage(zip,
                List.of(new MaterialService.ImportAction("demo-board", "RENAME")), "admin"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("RENAME");
    }

    /**
     * sys_material.material_key 是全表唯一键（V57），软删的记录仍占着这个 key。
     * 导入/上传若按「未删除」去查就会当新物料插一行，直接撞唯一键 500——
     * 而「导出 → 删除 → 导入」正是三期 6.4 的验收路径。
     */
    @Test
    void 删除后同key重新导入会复用原记录而不是撞唯一键() throws Exception {
        stubRepository();
        SysMaterial first = uploadPage("export default {name:'旧版'}");
        service.delete(first.getId(), false);

        byte[] zip = packageOf(MANIFEST_PAGE, "export default {name:'新版'}", MANIFEST_WIDGET, "export default {name:'B'}");
        service.importPackage(zip, List.of(), "admin");

        SysMaterial revived = service.requireByKey("demo-board");
        assertThat(revived.getId()).isEqualTo(first.getId());
        assertThat(revived.getIsDeleted()).isEqualTo(0);
        assertThat(revived.getVersion()).isEqualTo(2);
        assertThat(storedContent("demo-board")).contains("新版");
    }

    @Test
    void 删除后同key重新上传同样复用原记录() throws Exception {
        stubRepository();
        SysMaterial first = uploadPage("export default {name:'旧版'}");
        service.delete(first.getId(), false);

        SysMaterial again = service.upload(bundle("export default {name:'重传'}", "bundle.js"),
                manifest(MANIFEST_PAGE), "admin");

        assertThat(again.getId()).isEqualTo(first.getId());
        assertThat(again.getVersion()).isEqualTo(2);
        assertThat(again.getStatus()).isEqualTo(1);
    }
}
