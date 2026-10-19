package com.workflow.system.service;

import com.workflow.common.exception.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * 物料工程模板打包（change: remote-materials 三期：导出模块附带的模板下载）。
 *
 * <p>模板真源是仓库根 {@code material-scaffold/}，构建/启动前由
 * {@code scripts/sync-material-scaffold.mjs} 同步到 classpath 的 {@code material-scaffold/} 下，
 * 避免两处各自维护导致下载回来的工程与平台契约脱节。
 *
 * <p>清单写死在这里（不扫目录）：一是 jar 内枚举资源不可靠，二是少一个文件必须当场失败，
 * 而不是让用户下载到一个跑不起来的残缺工程。
 */
@Service
public class MaterialScaffoldService {

    private static final Logger log = LoggerFactory.getLogger(MaterialScaffoldService.class);

    public static final String RESOURCE_PREFIX = "material-scaffold/";

    /** 下载文件名前缀。 */
    public static final String TEMPLATE_NAME = "material-scaffold";

    /** 模板内容清单：工程骨架 + 两类物料示例 + SDK 类型声明 + 开发教程（规范并入教程）。 */
    public static final String[] TEMPLATE_FILES = {
            RESOURCE_PREFIX + "package.json",
            RESOURCE_PREFIX + "pnpm-lock.yaml",
            RESOURCE_PREFIX + "vite.config.js",
            RESOURCE_PREFIX + "vite.config.widget.js",
            RESOURCE_PREFIX + "scripts/gen-manifest.mjs",
            RESOURCE_PREFIX + "src/index.js",
            RESOURCE_PREFIX + "src/DemoBoard.vue",
            RESOURCE_PREFIX + "src/widget.js",
            RESOURCE_PREFIX + "src/StatCardWidget.vue",
            RESOURCE_PREFIX + "material.json",
            RESOURCE_PREFIX + "material-widget.json",
            RESOURCE_PREFIX + "types/platform-sdk.d.ts",
            RESOURCE_PREFIX + ".gitignore",
            RESOURCE_PREFIX + "README.md",
    };

    private static final DateTimeFormatter FILE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    /** 模板结果：下载用的文件名与 zip 字节。 */
    public record Template(String fileName, byte[] zipBytes) {
    }

    public Template build() {
        return build(TEMPLATE_FILES);
    }

    /** 按 classpath 清单组 zip；任一条目读不到即失败（宁可下载报错，不给残缺工程）。 */
    public Template build(String[] paths) {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(bos, StandardCharsets.UTF_8)) {
            for (String path : paths) {
                zos.putNextEntry(new ZipEntry(path));
                zos.write(readClasspath(path));
                zos.closeEntry();
            }
        } catch (IOException e) {
            throw new BusinessException("物料工程模板打包失败: " + e.getMessage());
        }
        String fileName = TEMPLATE_NAME + "-" + LocalDateTime.now().format(FILE_FORMAT) + ".zip";
        log.info("[Material] 工程模板已打包: {} ({} 个文件)", fileName, paths.length);
        return new Template(fileName, bos.toByteArray());
    }

    private byte[] readClasspath(String path) {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(path)) {
            if (in == null) {
                throw new BusinessException("物料工程模板缺少文件: " + path
                        + "（请先执行 scripts/sync-material-scaffold.mjs）");
            }
            return in.readAllBytes();
        } catch (IOException e) {
            throw new BusinessException("物料工程模板读取失败: " + path + " " + e.getMessage());
        }
    }
}
