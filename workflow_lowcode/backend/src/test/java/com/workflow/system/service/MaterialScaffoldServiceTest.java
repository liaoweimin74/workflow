package com.workflow.system.service;

import com.workflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 物料工程模板打包单元测试（change: remote-materials 三期 6.1 附带需求）。
 *
 * <p>模板真源在仓库 material-scaffold/，构建前由 scripts/sync-material-scaffold.mjs 同步进
 * classpath:material-scaffold/。这里守住两件事：模板一个都不能少（少一个下载回来就是残缺工程），
 * 以及规范文档必须随包走（离线开发物料的人不看 README 就会写出加载不了的包）。
 */
class MaterialScaffoldServiceTest {

    private final MaterialScaffoldService service = new MaterialScaffoldService();

    private Map<String, String> unzip(byte[] zip) throws Exception {
        Map<String, String> entries = new LinkedHashMap<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = zis.read(buf)) > 0) {
                    bos.write(buf, 0, n);
                }
                entries.put(entry.getName(), bos.toString(StandardCharsets.UTF_8));
            }
        }
        return entries;
    }

    @Test
    void 模板zip含工程骨架示例源码与两份文档() throws Exception {
        MaterialScaffoldService.Template template = service.build();

        assertThat(template.fileName()).startsWith("material-scaffold-").endsWith(".zip");
        Map<String, String> entries = unzip(template.zipBytes());
        // 骨架
        assertThat(entries).containsKeys(
                "material-scaffold/package.json",
                "material-scaffold/pnpm-lock.yaml",
                "material-scaffold/vite.config.js",
                "material-scaffold/vite.config.widget.js",
                "material-scaffold/scripts/gen-manifest.mjs",
                "material-scaffold/.gitignore");
        // 两类物料示例源码 + manifest
        assertThat(entries).containsKeys(
                "material-scaffold/src/index.js",
                "material-scaffold/src/DemoBoard.vue",
                "material-scaffold/src/widget.js",
                "material-scaffold/src/StatCardWidget.vue",
                "material-scaffold/material.json",
                "material-scaffold/material-widget.json");
        // 教程 + 规范
        assertThat(entries.get("material-scaffold/README.md")).contains("pnpm build");
        assertThat(entries.get("material-scaffold/MATERIAL_SPEC.md")).contains("external");
    }

    @Test
    void 规范文档写清依赖范围与构建环境限制() throws Exception {
        Map<String, String> entries = unzip(service.build().zipBytes());
        String spec = entries.get("material-scaffold/MATERIAL_SPEC.md");

        // 依赖白名单：物料只能 import 这三个
        assertThat(spec).contains("@platform/sdk").contains("element-plus").contains("不要 import");
        // 语法/产物限制
        assertThat(spec).contains("单文件").contains("meta").contains("数组");
        // 编译环境版本限制
        assertThat(spec).contains("Node").contains("sdkVersion");
    }

    @Test
    void 模板资源缺失时直接失败而不是给出残缺工程() {
        assertThat(MaterialScaffoldService.TEMPLATE_FILES).isNotEmpty();
        // 路径前缀必须统一，否则同步脚本与打包会各说各话
        assertThat(MaterialScaffoldService.TEMPLATE_FILES).allSatisfy(p ->
                assertThat(p).startsWith(MaterialScaffoldService.RESOURCE_PREFIX));
        assertThatThrownBy(() -> service.build(new String[] {MaterialScaffoldService.RESOURCE_PREFIX
                + "not-exist.json"}))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("not-exist.json");
    }
}
