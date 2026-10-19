package com.workflow.engine.material;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 物料包（material-bundle zip）编解码单元测试：往返一致、包格式校验、非法包拒绝。
 *
 * <p>包结构：根 manifest.json（kind/schemaVersion/materials[]）+
 * materials/&lt;key&gt;.manifest.json（manifest 原文）+ materials/&lt;key&gt;.bundle.js（bundle 字节）。
 */
class MaterialPackageCodecTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private MaterialPackageCodec.MaterialBundle sampleBundle() {
        return new MaterialPackageCodec.MaterialBundle(
                MaterialPackageCodec.BUNDLE_KIND,
                MaterialPackageCodec.SCHEMA_VERSION,
                "2026-10-19 13:20:00",
                List.of(
                        new MaterialPackageCodec.BundleMaterial("demo-board", "示例物料看板", "PAGE",
                                "1", 2, manifestEntryOf("demo-board"), bundleEntryOf("demo-board")),
                        new MaterialPackageCodec.BundleMaterial("stat-card", "指标卡（组件物料示例）", "WIDGET",
                                "1", 2, manifestEntryOf("stat-card"), bundleEntryOf("stat-card"))));
    }

    private Map<String, MaterialPackageCodec.MaterialPayload> samplePayloads() {
        Map<String, MaterialPackageCodec.MaterialPayload> payloads = new LinkedHashMap<>();
        payloads.put("demo-board", new MaterialPackageCodec.MaterialPayload(
                "{\"key\":\"demo-board\",\"name\":\"示例物料看板\",\"type\":\"PAGE\",\"sdkVersion\":\"1\"}",
                "export default {}".getBytes(StandardCharsets.UTF_8)));
        payloads.put("stat-card", new MaterialPackageCodec.MaterialPayload(
                "{\"key\":\"stat-card\",\"name\":\"指标卡\",\"type\":\"WIDGET\",\"sdkVersion\":\"1\","
                        + "\"meta\":[{\"field\":\"title\",\"type\":\"text\"}]}",
                "export default {name:'StatCard'}".getBytes(StandardCharsets.UTF_8)));
        return payloads;
    }

    private static String manifestEntryOf(String key) {
        return MaterialPackageCodec.manifestEntryOf(key);
    }

    private static String bundleEntryOf(String key) {
        return MaterialPackageCodec.bundleEntryOf(key);
    }

    @Test
    void 写包读包往返一致() throws IOException {
        byte[] zip = MaterialPackageCodec.write(sampleBundle(), samplePayloads(), objectMapper);
        MaterialPackageCodec.Package pkg = MaterialPackageCodec.read(zip, objectMapper);

        assertThat(pkg.bundle().kind()).isEqualTo("material-bundle");
        assertThat(pkg.bundle().materials()).hasSize(2);
        assertThat(pkg.payloads()).containsKeys("demo-board", "stat-card");
        assertThat(new String(pkg.payloads().get("demo-board").bundleBytes(), StandardCharsets.UTF_8))
                .isEqualTo("export default {}");
        // manifest 原文照搬，不做任何改写（meta 数组顺序在包内必须与源系统一致）
        assertThat(pkg.payloads().get("stat-card").manifestJson()).contains("\"meta\":[{\"field\":\"title\"");
    }

    @Test
    void kind不符的包被拒() throws IOException {
        byte[] zip = zipOf(Map.of(
                "manifest.json",
                "{\"kind\":\"page-template-bundle\",\"schemaVersion\":1,\"materials\":[]}"));

        assertThatThrownBy(() -> MaterialPackageCodec.read(zip, objectMapper))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("material-bundle");
    }

    @Test
    void schemaVersion不支持时被拒() throws IOException {
        byte[] zip = zipOf(Map.of(
                "manifest.json",
                "{\"kind\":\"material-bundle\",\"schemaVersion\":99,\"materials\":[]}"));

        assertThatThrownBy(() -> MaterialPackageCodec.read(zip, objectMapper))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("不支持的物料包版本");
    }

    @Test
    void 缺少根manifest的包被拒() throws IOException {
        byte[] zip = zipOf(Map.of("materials/demo-board.bundle.js", "export default {}"));

        assertThatThrownBy(() -> MaterialPackageCodec.read(zip, objectMapper))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("manifest.json");
    }

    @Test
    void manifest声明的物料缺载荷时被拒() throws IOException {
        // manifest 说有 demo-board，包里却只有它的 manifest.json，没有 bundle
        byte[] zip = zipOf(Map.of(
                "manifest.json",
                "{\"kind\":\"material-bundle\",\"schemaVersion\":1,\"materials\":"
                        + "[{\"key\":\"demo-board\",\"type\":\"PAGE\",\"sdkVersion\":\"1\","
                        + "\"manifestFile\":\"materials/demo-board.manifest.json\","
                        + "\"bundleFile\":\"materials/demo-board.bundle.js\"}]}",
                "materials/demo-board.manifest.json",
                "{\"key\":\"demo-board\",\"name\":\"看板\",\"type\":\"PAGE\",\"sdkVersion\":\"1\"}"));

        assertThatThrownBy(() -> MaterialPackageCodec.read(zip, objectMapper))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("demo-board");
    }

    @Test
    void 条目路径越界的包被拒() throws IOException {
        byte[] zip = zipOf(Map.of(
                "manifest.json", "{\"kind\":\"material-bundle\",\"schemaVersion\":1,\"materials\":[]}",
                "../escape.js", "alert(1)"));

        assertThatThrownBy(() -> MaterialPackageCodec.read(zip, objectMapper))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("非法条目路径");
    }

    @Test
    void 物料key含非法字符时不写条目() {
        MaterialPackageCodec.MaterialBundle evil = new MaterialPackageCodec.MaterialBundle(
                MaterialPackageCodec.BUNDLE_KIND, MaterialPackageCodec.SCHEMA_VERSION, "2026-10-19 13:20:00",
                List.of(new MaterialPackageCodec.BundleMaterial("../../etc/passwd", "恶意", "PAGE",
                        "1", 1, manifestEntryOf("../../etc/passwd"), bundleEntryOf("../../etc/passwd"))));

        assertThatThrownBy(() -> MaterialPackageCodec.write(evil, Map.of(), objectMapper))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("非法物料 key");
    }

    @Test
    void 空包或零字节包被拒() {
        assertThatThrownBy(() -> MaterialPackageCodec.read(new byte[0], objectMapper))
                .isInstanceOf(IOException.class);
    }

    private byte[] zipOf(Map<String, String> entries) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(bos)) {
            for (Map.Entry<String, String> e : entries.entrySet()) {
                zos.putNextEntry(new ZipEntry(e.getKey()));
                zos.write(e.getValue().getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
            }
        }
        return bos.toByteArray();
    }
}
