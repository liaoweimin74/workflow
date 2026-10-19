package com.workflow.engine.material;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * 物料包（material-bundle）zip 编解码：跨项目导出导入的载体格式。
 *
 * <p>包结构：
 * <pre>
 * manifest.json                        包清单：kind / schemaVersion / exportedAt / materials[]
 * materials/&lt;key&gt;.manifest.json      物料 manifest 原文（逐字节照搬，含 meta 数组顺序）
 * materials/&lt;key&gt;.bundle.js           物料 bundle 原文
 * </pre>
 *
 * <p>manifest 原文必须原样进出包：它落库后是 MySQL 的 JSON 列（对象键会被重排），
 * 包内是 JSON 文本、顺序保持声明序，导入方按上传同一套校验重新入库。
 *
 * <p>护栏沿用 {@code ModulePackageCodec}：条目名统一 '/'、拒绝越界路径（zip slip）、
 * 包/单文件/条目数上限。物料 bundle 是可执行 JS，条目名由服务端按 key 生成，
 * key 必须先过 {@link #SAFE_KEY}，绝不采用包内自带的路径。
 */
public final class MaterialPackageCodec {

    public static final String BUNDLE_KIND = "material-bundle";
    public static final int SCHEMA_VERSION = 1;
    public static final String MANIFEST_ENTRY = "manifest.json";
    public static final String MATERIALS_PREFIX = "materials/";

    /** 可作为 zip 条目名的物料 key（与上传侧 key 的可用字符一致，且不含路径分隔符）。 */
    private static final Pattern SAFE_KEY = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$");

    /** 上限保护：单包 64MB、单文件 16MB、条目 2000。 */
    private static final long MAX_PACKAGE_BYTES = 64L * 1024 * 1024;
    private static final int MAX_FILE_BYTES = 16 * 1024 * 1024;
    private static final int MAX_ENTRIES = 2000;

    private MaterialPackageCodec() {
    }

    /** 包清单里的一个物料条目（文件名指向包内条目）。 */
    public record BundleMaterial(String key, String name, String type, String sdkVersion, Integer version,
                                 String manifestFile, String bundleFile) {
    }

    /** 根 manifest.json 的映射结构。 */
    public record MaterialBundle(String kind, int schemaVersion, String exportedAt, List<BundleMaterial> materials) {
    }

    /** 一个物料的载荷：manifest 原文 + bundle 字节。 */
    public record MaterialPayload(String manifestJson, byte[] bundleBytes) {
    }

    /** 解包结果，payloads 按物料 key 取。 */
    public record Package(MaterialBundle bundle, Map<String, MaterialPayload> payloads) {
    }

    /** 条目名由 key 拼出；key 的合法性由读写两侧的 {@link #requireSafeKey} 把关。 */
    public static String manifestEntryOf(String key) {
        return MATERIALS_PREFIX + key + ".manifest.json";
    }

    public static String bundleEntryOf(String key) {
        return MATERIALS_PREFIX + key + ".bundle.js";
    }

    /** 打包为 zip 字节流。 */
    public static byte[] write(MaterialBundle bundle, Map<String, MaterialPayload> payloads,
                               ObjectMapper objectMapper) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bos, StandardCharsets.UTF_8)) {
            zip.putNextEntry(new ZipEntry(MANIFEST_ENTRY));
            zip.write(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(bundle));
            zip.closeEntry();

            for (BundleMaterial item : bundle.materials()) {
                requireSafeKey(item.key());
                MaterialPayload payload = payloads.get(item.key());
                if (payload == null || payload.bundleBytes() == null || payload.manifestJson() == null) {
                    throw new IOException("物料包缺少载荷: " + item.key());
                }
                putEntry(zip, manifestEntryOf(item.key()),
                        payload.manifestJson().getBytes(StandardCharsets.UTF_8), MAX_FILE_BYTES);
                putEntry(zip, bundleEntryOf(item.key()), payload.bundleBytes(), MAX_FILE_BYTES);
            }
        }
        byte[] bytes = bos.toByteArray();
        if (bytes.length > MAX_PACKAGE_BYTES) {
            throw new IOException("物料包超出大小上限（64MB）");
        }
        return bytes;
    }

    /**
     * 读取并校验 zip。格式问题一律 IOException（由服务层转 400），
     * 让调用方无法拿到半解析的包。
     */
    public static Package read(byte[] zipBytes, ObjectMapper objectMapper) throws IOException {
        if (zipBytes == null || zipBytes.length == 0) {
            throw new IOException("物料包为空");
        }
        if (zipBytes.length > MAX_PACKAGE_BYTES) {
            throw new IOException("物料包超出大小上限（64MB）");
        }

        String manifestJson = null;
        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(zipBytes), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            int count = 0;
            while ((entry = zip.getNextEntry()) != null) {
                if (++count > MAX_ENTRIES) {
                    throw new IOException("物料包条目数超出上限");
                }
                String name = entry.getName().replace('\\', '/');
                if (name.startsWith("/") || name.contains("../") || name.contains("/../")) {
                    throw new IOException("物料包含非法条目路径: " + name);
                }
                byte[] content = zip.readAllBytes();
                if (content.length > MAX_FILE_BYTES) {
                    throw new IOException("物料包单文件超出大小上限（16MB）: " + name);
                }
                if (!entry.isDirectory()) {
                    entries.put(name, content);
                }
                zip.closeEntry();
            }
        }

        manifestJson = entries.get(MANIFEST_ENTRY) == null ? null
                : new String(entries.get(MANIFEST_ENTRY), StandardCharsets.UTF_8);
        if (manifestJson == null) {
            throw new IOException("物料包缺少 " + MANIFEST_ENTRY);
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(manifestJson);
        } catch (IOException e) {
            throw new IOException("物料包 manifest.json 解析失败: " + e.getMessage(), e);
        }
        String kind = root.path("kind").asText("");
        if (!BUNDLE_KIND.equals(kind)) {
            throw new IOException("不是物料包（kind 应为 " + BUNDLE_KIND + "，当前为 " + kind + "）");
        }
        int schemaVersion = root.path("schemaVersion").asInt(0);
        if (schemaVersion != SCHEMA_VERSION) {
            throw new IOException("不支持的物料包版本: " + schemaVersion + "（当前支持 v" + SCHEMA_VERSION + "）");
        }

        MaterialBundle bundle = new MaterialBundle(kind, schemaVersion,
                root.path("exportedAt").asText(""), readMaterials(root));

        Map<String, MaterialPayload> payloads = new LinkedHashMap<>();
        for (BundleMaterial item : bundle.materials()) {
            byte[] manifest = entries.get(item.manifestFile());
            byte[] bundleBytes = entries.get(item.bundleFile());
            if (manifest == null || bundleBytes == null) {
                throw new IOException("物料包缺少 " + item.key() + " 的 "
                        + (manifest == null ? "manifest" : "bundle") + " 文件");
            }
            payloads.put(item.key(), new MaterialPayload(new String(manifest, StandardCharsets.UTF_8), bundleBytes));
        }
        return new Package(bundle, payloads);
    }

    private static List<BundleMaterial> readMaterials(JsonNode root) throws IOException {
        JsonNode materials = root.path("materials");
        if (!materials.isArray() || materials.isEmpty()) {
            throw new IOException("物料包没有可导入的物料");
        }
        java.util.ArrayList<BundleMaterial> items = new java.util.ArrayList<>();
        for (JsonNode node : materials) {
            String key = node.path("key").asText("");
            requireSafeKey(key);
            // 条目名以服务端按 key 生成为准，不信任包内自带路径
            items.add(new BundleMaterial(key, node.path("name").asText(""), node.path("type").asText(""),
                    node.path("sdkVersion").asText(""), node.path("version").asInt(0),
                    manifestEntryOf(key), bundleEntryOf(key)));
        }
        return items;
    }

    private static void putEntry(ZipOutputStream zip, String name, byte[] content, int maxBytes) throws IOException {
        if (content.length > maxBytes) {
            throw new IOException("物料包单文件超出大小上限（16MB）: " + name);
        }
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content);
        zip.closeEntry();
    }

    private static String requireSafeKey(String key) throws IOException {
        if (key == null || !SAFE_KEY.matcher(key).matches()) {
            throw new IOException("非法物料 key（无法作为包内条目名）: " + key);
        }
        return key;
    }
}
