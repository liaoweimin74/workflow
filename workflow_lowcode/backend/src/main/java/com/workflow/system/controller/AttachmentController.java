package com.workflow.system.controller;

import com.workflow.common.domain.R;
import com.workflow.system.domain.vo.AttachmentVO;
import com.workflow.system.service.AttachmentService;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 附件接口（Task 146：系统组件·附件；Task 147：系统组件·图片）。
 *
 * <p>路径对齐前端 http baseURL=/api + '/attachments'。上传/查询/删除走 R 包装；
 * 下载/预览直接流式返回文件字节（preview 内联、download 附件式，文件名 RFC 5987 编码）。
 *
 * <p>Task 147 新增：
 * - POST /upload-image：图片强校验上传（服务端读像素尺寸，VO 返回 width/height）
 * - GET /{id}/thumbnail?w=320：位图服务端等比缩略图（JPEG，磁盘缓存），非位图回退原图
 */
@RestController
@RequestMapping("/api/attachments")
public class AttachmentController {

    private final AttachmentService attachmentService;

    public AttachmentController(AttachmentService attachmentService) {
        this.attachmentService = attachmentService;
    }

    /** 多文件上传（multipart/files；bizType/bizRef 预留业务归类）。 */
    @PostMapping("/upload")
    public R<List<AttachmentVO>> upload(@RequestParam("files") List<MultipartFile> files,
                                        @RequestParam(required = false) String bizType,
                                        @RequestParam(required = false) String bizRef) {
        return R.ok(attachmentService.upload(files, bizType, bizRef));
    }

    /** 图片上传（Task 147：强校验图片类型 + 服务端读像素尺寸；供图片组件专用）。 */
    @PostMapping("/upload-image")
    public R<List<AttachmentVO>> uploadImage(@RequestParam("files") List<MultipartFile> files,
                                             @RequestParam(required = false) String bizType,
                                             @RequestParam(required = false) String bizRef) {
        return R.ok(attachmentService.uploadImages(files, bizType, bizRef));
    }

    /** 按 id 批量取元数据（ids=1,2,3），组件回显文件列表用。 */
    @GetMapping
    public R<List<AttachmentVO>> listByIds(@RequestParam("ids") List<Long> ids) {
        return R.ok(attachmentService.listByIds(ids));
    }

    /** 单条元数据。 */
    @GetMapping("/{id}")
    public R<AttachmentVO> get(@PathVariable long id) {
        List<AttachmentVO> vos = attachmentService.listByIds(List.of(id));
        if (vos.isEmpty()) {
            return R.fail("附件不存在或已删除");
        }
        return R.ok(vos.get(0));
    }

    /** 在线预览（Content-Disposition: inline；前端按 content-type 决定渲染方式）。 */
    @GetMapping("/{id}/preview")
    public ResponseEntity<Resource> preview(@PathVariable long id) {
        AttachmentService.ResolvedAttachment resolved = attachmentService.resolve(id);
        MediaType mediaType = safeMediaType(resolved.meta().getContentType());
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename*=UTF-8''" + encodeName(resolved.meta().getFileName()))
                .body(resolved.resource());
    }

    /** 下载（Content-Disposition: attachment）。 */
    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> download(@PathVariable long id) {
        AttachmentService.ResolvedAttachment resolved = attachmentService.resolve(id);
        MediaType mediaType = safeMediaType(resolved.meta().getContentType());
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename*=UTF-8''" + encodeName(resolved.meta().getFileName()))
                .body(resolved.resource());
    }

    /**
     * 缩略图（Task 147：系统组件·图片；w 为目标最大边长 64~640，缺省 320）。
     *
     * <p>位图返回服务端生成的 JPEG 缩略图；非位图（SVG/WEBP 等 ImageIO 不支持）
     * 回退返回原文件字节（contentType 为原 MIME），浏览器自身缩放展示。
     */
    @GetMapping("/{id}/thumbnail")
    public ResponseEntity<Resource> thumbnail(@PathVariable long id,
                                              @RequestParam(required = false) Integer w) {
        AttachmentService.ThumbnailResult result = attachmentService.thumbnail(id, w);
        MediaType mediaType = safeMediaType(result.contentType());
        return ResponseEntity.ok().contentType(mediaType).body(result.resource());
    }

    /** 软删（磁盘文件保留）。 */
    @DeleteMapping("/{id}")
    public R<Void> remove(@PathVariable long id) {
        attachmentService.delete(id);
        return R.ok();
    }

    // ================= 内部工具 =================

    private static MediaType safeMediaType(String contentType) {
        try {
            return MediaType.parseMediaType(contentType == null || contentType.isBlank()
                    ? "application/octet-stream" : contentType);
        } catch (Exception e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    private static String encodeName(String filename) {
        String name = filename == null ? "file" : filename;
        return URLEncoder.encode(name, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
