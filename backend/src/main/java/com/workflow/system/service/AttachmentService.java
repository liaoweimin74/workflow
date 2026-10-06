package com.workflow.system.service;

import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.entity.SysAttachment;
import com.workflow.system.domain.vo.AttachmentVO;
import com.workflow.system.repository.SysAttachmentRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import javax.imageio.ImageIO;

/**
 * 附件服务（Task 146：系统组件·附件）。
 *
 * <p>文件内容存本地磁盘：{@code workflow.attachment.storage-path}/{@code yyyy/MM/}/{@code uuid.ext}；
 * 元数据落 sys_attachment。服务端生成存储名（uuid + 白名单化扩展名），杜绝路径穿越；
 * 单文件上限由 {@code workflow.attachment.max-size-mb} 强制（前端 maxSizeMB 仅为体验层限制）。
 */
@Service
public class AttachmentService {

    private static final Logger log = LoggerFactory.getLogger(AttachmentService.class);

    /** 扩展名白名单外一律拒绝（可执行/脚本类永不允许上传）。 */
    private static final java.util.Set<String> BLOCKED_EXTENSIONS = java.util.Set.of(
            "exe", "bat", "cmd", "sh", "ps1", "jar", "class", "dll", "so", "msi", "com", "vbs", "js", "jsp", "php", "asp", "aspx");

    /** 图片扩展名白名单（Task 147：upload-image 端点强校验，与前端 isImageFile 对齐）。 */
    public static final java.util.Set<String> IMAGE_EXTENSIONS = java.util.Set.of(
            "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif");

    /** 缩略图边长允许范围（请求参数 w 超出则夹取）。 */
    private static final int THUMB_MIN_SIZE = 64;
    private static final int THUMB_MAX_SIZE = 640;

    /** 缩略图生成原图最大边长保护（超大位图解码内存风险 → 回退原图）。 */
    private static final int THUMB_SOURCE_MAX_EDGE = 8000;

    private final SysAttachmentRepository attachmentRepository;

    @Value("${workflow.attachment.storage-path:./data/attachments}")
    private String storagePath;

    @Value("${workflow.attachment.max-size-mb:100}")
    private long maxSizeMb;

    public AttachmentService(SysAttachmentRepository attachmentRepository) {
        this.attachmentRepository = attachmentRepository;
    }

    @PostConstruct
    void initStorageDir() {
        try {
            Files.createDirectories(Paths.get(storagePath).toAbsolutePath().normalize());
            log.info("[Attachment] 存储目录就绪: {}", Paths.get(storagePath).toAbsolutePath().normalize());
        } catch (IOException e) {
            throw new IllegalStateException("附件存储目录初始化失败: " + storagePath, e);
        }
    }

    // ================= 上传 =================

    /** 批量上传（多文件）；任一文件非法则整批拒绝，保证组件值原子性。 */
    @Transactional
    public List<AttachmentVO> upload(List<MultipartFile> files, String bizType, String bizRef) {
        if (files == null || files.isEmpty()) {
            throw new BusinessException("未选择任何文件");
        }
        long maxBytes = maxSizeMb * 1024L * 1024L;

        // 先整体校验再落盘：任一文件超限/扩展名被禁 → 整批失败（事务回滚，不留孤儿文件）
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                throw new BusinessException("存在空文件，请检查后重新上传");
            }
            if (file.getSize() > maxBytes) {
                throw new BusinessException("文件「" + safeOriginalName(file) + "」超过单文件上限 " + maxSizeMb + "MB");
            }
            String ext = extensionOf(file.getOriginalFilename());
            if (BLOCKED_EXTENSIONS.contains(ext)) {
                throw new BusinessException("不允许上传 ." + ext + " 类型文件");
            }
        }

        String operator = currentUsername();
        List<SysAttachment> saved = new ArrayList<>(files.size());
        for (MultipartFile file : files) {
            saved.add(storeOne(file, bizType, bizRef, operator));
        }
        return saved.stream().map(AttachmentService::toVO).toList();
    }

    /**
     * 图片上传（Task 147：系统组件·图片）。
     *
     * <p>与通用 upload 的差别：①强校验所有文件为图片（MIME image/* 或扩展名命中
     * IMAGE_EXTENSIONS，双条件均不满足则整批拒绝）；②存盘后服务端读取像素尺寸
     * 写入 img_width/img_height（非位图如 SVG/WEBP 解码失败留 null，由前端校验兜底）。
     */
    @Transactional
    public List<AttachmentVO> uploadImages(List<MultipartFile> files, String bizType, String bizRef) {
        if (files == null || files.isEmpty()) {
            throw new BusinessException("未选择任何图片");
        }
        long maxBytes = maxSizeMb * 1024L * 1024L;
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                throw new BusinessException("存在空文件，请检查后重新上传");
            }
            if (file.getSize() > maxBytes) {
                throw new BusinessException("图片「" + safeOriginalName(file) + "」超过单文件上限 " + maxSizeMb + "MB");
            }
            if (!isImageFile(file)) {
                throw new BusinessException("「" + safeOriginalName(file) + "」不是支持的图片类型（jpg/png/gif/webp/bmp/svg/ico/avif）");
            }
        }
        String operator = currentUsername();
        List<SysAttachment> saved = new ArrayList<>(files.size());
        for (MultipartFile file : files) {
            SysAttachment entity = storeOne(file, bizType, bizRef, operator);
            int[] dims = readImageDimensions(diskPathOf(entity.getStoragePath()));
            if (dims != null) {
                entity.setImgWidth(dims[0]);
                entity.setImgHeight(dims[1]);
                entity = attachmentRepository.save(entity); // 回写尺寸
            }
            saved.add(entity);
        }
        return saved.stream().map(AttachmentService::toVO).toList();
    }

    /** MIME image/* 或扩展名命中图片白名单即视为图片（宽松接受，伪 MIME 兑底）。 */
    public static boolean isImageFile(MultipartFile file) {
        String type = file.getContentType();
        if (type != null && type.toLowerCase(Locale.ROOT).startsWith("image/")) {
            return true;
        }
        return IMAGE_EXTENSIONS.contains(extensionOf(file.getOriginalFilename()));
    }

    private SysAttachment storeOne(MultipartFile file, String bizType, String bizRef, String operator) {
        String original = safeOriginalName(file);
        String ext = extensionOf(original);
        String storedName = UUID.randomUUID().toString().replace("-", "") + (ext.isEmpty() ? "" : "." + ext);
        String monthDir = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM"));
        String relative = monthDir + "/" + storedName;

        Path target = Paths.get(storagePath).toAbsolutePath().normalize().resolve(relative).normalize();
        // 双保险：resolve 后必须仍在存储根目录内
        Path root = Paths.get(storagePath).toAbsolutePath().normalize();
        if (!target.startsWith(root)) {
            throw new BusinessException("非法的存储路径");
        }
        try {
            Files.createDirectories(target.getParent());
            try (var in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new BusinessException("文件保存失败: " + original);
        }

        SysAttachment entity = new SysAttachment();
        entity.setFileName(original);
        entity.setStoredName(storedName);
        entity.setContentType(StringUtils.hasText(file.getContentType()) ? file.getContentType() : "application/octet-stream");
        entity.setFileSize(file.getSize());
        entity.setStoragePath(relative);
        entity.setBizType(bizType);
        entity.setBizRef(bizRef);
        entity.setCreatedBy(operator);
        entity.setUpdatedBy(operator);
        return attachmentRepository.save(entity);
    }

    // ================= 查询 =================

    /** 按 id 批量取元数据（组件回显文件列表）。缺失/已删的 id 直接跳过。 */
    @Transactional(readOnly = true)
    public List<AttachmentVO> listByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        List<Long> distinct = ids.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (distinct.isEmpty()) {
            return List.of();
        }
        return attachmentRepository.findByIdInAndIsDeleted(distinct, 0).stream()
                .sorted(Comparator.comparingInt(a -> distinct.indexOf(a.getId())))
                .map(AttachmentService::toVO)
                .toList();
    }

    // ================= 下载/预览 =================

    /** 读取附件文件资源（不存在/已删抛 BusinessException）。 */
    @Transactional(readOnly = true)
    public ResolvedAttachment resolve(long id) {
        SysAttachment entity = attachmentRepository.findById(id)
                .filter(a -> a.getIsDeleted() == null || a.getIsDeleted() == 0)
                .orElseThrow(() -> new BusinessException("附件不存在或已删除"));
        Path root = Paths.get(storagePath).toAbsolutePath().normalize();
        Path target = root.resolve(entity.getStoragePath()).normalize();
        if (!target.startsWith(root) || !Files.exists(target)) {
            throw new BusinessException("附件文件已丢失");
        }
        return new ResolvedAttachment(entity, new FileSystemResource(target));
    }

    /** 已解析附件：元数据 + 文件资源。 */
    public record ResolvedAttachment(SysAttachment meta, Resource resource) {
    }

    /** 缩略图解析结果：resource 为缩略图或回退原图；fallback=true 时 contentType 为原文件 MIME。 */
    public record ThumbnailResult(Resource resource, String contentType, boolean fallback) {
    }

    /**
     * 图片缩略图（Task 147：系统组件·图片）。
     *
     * <p>等比缩放到最大边 {@code size}（64~640，超界夹取）输出 JPEG；磁盘缓存于
     * {@code storage-path}/.thumbs/{id}_{size}.jpg，命中直接返回。非位图（SVG/WEBP 等
     * ImageIO 解码失败）或超大原图（最大边 > 8000，防解码内存风险）回退返回原图字节。
     */
    @Transactional(readOnly = true)
    public ThumbnailResult thumbnail(long id, Integer size) {
        ResolvedAttachment resolved = resolve(id);
        SysAttachment meta = resolved.meta();
        int edge = size == null ? 320 : Math.max(THUMB_MIN_SIZE, Math.min(THUMB_MAX_SIZE, size));

        Path root = Paths.get(storagePath).toAbsolutePath().normalize();
        Path source = root.resolve(meta.getStoragePath()).normalize();
        Path cache = root.resolve(".thumbs").resolve(meta.getId() + "_" + edge + ".jpg").normalize();
        if (!cache.startsWith(root)) {
            throw new BusinessException("非法的缩略图路径");
        }
        if (Files.exists(cache)) {
            return new ThumbnailResult(new FileSystemResource(cache), MediaType_IMAGE_JPEG, false);
        }

        BufferedImage source_ = readImage(source);
        if (source_ == null || Math.max(source_.getWidth(), source_.getHeight()) > THUMB_SOURCE_MAX_EDGE) {
            return new ThumbnailResult(resolved.resource(), meta.getContentType(), true); // 回退原图
        }
        try {
            BufferedImage thumb = scaleImage(source_, edge);
            Files.createDirectories(cache.getParent());
            Path tmp = cache.resolveSibling(cache.getFileName() + "." + UUID.randomUUID() + ".tmp");
            ImageIO.write(thumb, "jpg", tmp.toFile());
            try {
                Files.move(tmp, cache, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException atomicUnsupported) {
                Files.move(tmp, cache, StandardCopyOption.REPLACE_EXISTING);
            }
            return new ThumbnailResult(new FileSystemResource(cache), MediaType_IMAGE_JPEG, false);
        } catch (Exception e) {
            log.warn("[Attachment] 缩略图生成失败 id={} size={}: {}", id, edge, e.getMessage());
            return new ThumbnailResult(resolved.resource(), meta.getContentType(), true); // 回退原图
        }
    }

    private static final String MediaType_IMAGE_JPEG = "image/jpeg";

    /** 磁盘文件相对路径 → 绝对路径（限定在存储根目录内）。 */
    private Path diskPathOf(String relative) {
        Path root = Paths.get(storagePath).toAbsolutePath().normalize();
        Path target = root.resolve(relative == null ? "" : relative).normalize();
        return target.startsWith(root) ? target : root;
    }

    /** ImageIO 读取图片尺寸；非位图/解码失败返回 null（SVG、JDK 不支持的 WEBP 等）。 */
    private static int[] readImageDimensions(Path file) {
        BufferedImage image = readImage(file);
        return image == null ? null : new int[]{image.getWidth(), image.getHeight()};
    }

    private static BufferedImage readImage(Path file) {
        if (!Files.exists(file)) {
            return null;
        }
        try (var in = Files.newInputStream(file)) {
            return ImageIO.read(in);
        } catch (Exception e) {
            return null;
        }
    }

    /** 等比缩放到最大边 edge（白底 JPEG 兼容透明 PNG）。 */
    private static BufferedImage scaleImage(BufferedImage source, int edge) {
        int w = source.getWidth();
        int h = source.getHeight();
        double ratio = Math.min((double) edge / w, (double) edge / h);
        // 不放大：原图小于目标边长时按原尺寸输出
        int tw = Math.max(1, (int) Math.round(w * Math.min(1.0d, ratio)));
        int th = Math.max(1, (int) Math.round(h * Math.min(1.0d, ratio)));
        BufferedImage target = new BufferedImage(tw, th, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = target.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setColor(java.awt.Color.WHITE);
            g.fillRect(0, 0, tw, th);
            g.drawImage(source, 0, 0, tw, th, null);
        } finally {
            g.dispose();
        }
        return target;
    }

    // ================= 删除 =================

    /** 软删元数据（磁盘文件保留以便审计恢复；定期清理策略后续再接）。 */
    @Transactional
    public void delete(long id) {
        SysAttachment entity = attachmentRepository.findById(id)
                .filter(a -> a.getIsDeleted() == null || a.getIsDeleted() == 0)
                .orElseThrow(() -> new BusinessException("附件不存在或已删除"));
        entity.setIsDeleted(1);
        entity.setUpdatedBy(currentUsername());
        attachmentRepository.save(entity);
    }

    // ================= 内部工具 =================

    private static String safeOriginalName(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (!StringUtils.hasText(name)) {
            return "unnamed";
        }
        // 仅取文件名部分并去除控制字符，长度截断到 500
        String cleaned = name.replace("\\", "/");
        int slash = cleaned.lastIndexOf('/');
        cleaned = slash >= 0 ? cleaned.substring(slash + 1) : cleaned;
        cleaned = cleaned.replaceAll("[\\x00-\\x1f]", "").trim();
        return cleaned.isEmpty() ? "unnamed" : cleaned.substring(0, Math.min(cleaned.length(), 500));
    }

    private static String extensionOf(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "";
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return "";
        }
        return filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && StringUtils.hasText(auth.getName())) ? auth.getName() : "anonymous";
    }

    private static AttachmentVO toVO(SysAttachment a) {
        return new AttachmentVO(
                a.getId(),
                a.getFileName(),
                a.getContentType(),
                a.getFileSize(),
                a.getCreatedBy(),
                a.getCreatedAt() == null ? null : a.getCreatedAt().toString(),
                a.getImgWidth(),
                a.getImgHeight());
    }
}
