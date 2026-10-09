package com.workflow.system.service;

import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.entity.SysAttachment;
import com.workflow.system.domain.vo.AttachmentVO;
import com.workflow.system.repository.SysAttachmentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * AttachmentService 图片扩展单元测试（Task 147：系统组件·图片）。
 *
 * <p>覆盖：upload-image 强校验（非图片拒绝/空文件/超限）、PNG 尺寸读取落库、
 * 缩略图生成（JPEG 缓存）与非位图回退原图。
 */
@ExtendWith(MockitoExtension.class)
class AttachmentServiceImageTest {

    @Mock
    SysAttachmentRepository attachmentRepository;

    @InjectMocks
    AttachmentService service;

    @TempDir
    Path tempDir;

    private final AtomicLong seq = new AtomicLong(1);

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "storagePath", tempDir.toString());
        ReflectionTestUtils.setField(service, "maxSizeMb", 100L);
        // save：补 id 模拟数据库自增（lenient：校验类用例不会走到 save）
        lenient().when(attachmentRepository.save(any(SysAttachment.class))).thenAnswer(inv -> {
            SysAttachment e = inv.getArgument(0);
            if (e.getId() == null) {
                e.setId(seq.getAndIncrement());
            }
            return e;
        });
    }

    // ================= 工具 =================

    /** 生成 width×height 的真实 PNG 字节（ImageIO 现场编码，避免硬编码字节）。 */
    private static byte[] pngBytes(int width, int height) throws Exception {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private static MockMultipartFile pngFile(String name, int w, int h) throws Exception {
        return new MockMultipartFile("files", name, "image/png", pngBytes(w, h));
    }

    private SysAttachment persistEntity(long id, String storedName, String storagePath, String contentType) {
        SysAttachment e = new SysAttachment();
        e.setId(id);
        e.setFileName(storedName);
        e.setStoredName(storedName);
        e.setContentType(contentType);
        e.setFileSize(123L);
        e.setStoragePath(storagePath);
        return e;
    }

    // ================= uploadImages：类型强校验 =================

    @Test
    void uploadImages_rejectsNonImageFile() {
        MockMultipartFile txt = new MockMultipartFile("files", "note.txt", "text/plain",
                "hello".getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> service.uploadImages(List.of(txt), null, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不是支持的图片类型");
    }

    @Test
    void uploadImages_rejectsEmptyFile() {
        MockMultipartFile empty = new MockMultipartFile("files", "empty.png", "image/png", new byte[0]);
        assertThatThrownBy(() -> service.uploadImages(List.of(empty), null, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("空文件");
    }

    @Test
    void uploadImages_rejectsEmptyList() {
        assertThatThrownBy(() -> service.uploadImages(List.of(), null, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未选择任何图片");
    }

    @Test
    void uploadImages_sizeExceeded_rejected() {
        ReflectionTestUtils.setField(service, "maxSizeMb", 1L);
        MockMultipartFile big = new MockMultipartFile("files", "big.png", "image/png", new byte[2 * 1024 * 1024]);
        assertThatThrownBy(() -> service.uploadImages(List.of(big), null, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("超过单文件上限");
    }

    // ================= uploadImages：尺寸读取落库 =================

    @Test
    void uploadImages_acceptsPngByExtensionAndStoresDimensions() throws Exception {
        // 伪 MIME（application/octet-stream）但扩展名 .png → 仍按图片接受
        MockMultipartFile png = new MockMultipartFile("files", "a.png", "application/octet-stream", pngBytes(320, 200));
        List<AttachmentVO> vos = service.uploadImages(List.of(png), "image", null);

        assertThat(vos).hasSize(1);
        AttachmentVO vo = vos.get(0);
        assertThat(vo.width()).isEqualTo(320);
        assertThat(vo.height()).isEqualTo(200);
        assertThat(vo.fileName()).isEqualTo("a.png");
    }

    @Test
    void uploadImages_acceptsPngByMimeWhenExtensionMissing() throws Exception {
        // 无扩展名但 MIME image/png → 仍按图片接受（宽松接受策略）
        MockMultipartFile png = new MockMultipartFile("files", "noext", "image/png", pngBytes(64, 48));
        List<AttachmentVO> vos = service.uploadImages(List.of(png), null, null);
        assertThat(vos).hasSize(1);
        assertThat(vos.get(0).width()).isEqualTo(64);
        assertThat(vos.get(0).height()).isEqualTo(48);
    }

    @Test
    void uploadImages_multipleFiles_allStored() throws Exception {
        List<AttachmentVO> vos = service.uploadImages(
                List.of(pngFile("a.png", 10, 20), pngFile("b.png", 30, 40)), null, null);
        assertThat(vos).hasSize(2);
        assertThat(vos).extracting(AttachmentVO::width).containsExactly(10, 30);
        assertThat(vos).extracting(AttachmentVO::height).containsExactly(20, 40);
    }

    // ================= thumbnail：生成与回退 =================

    @Test
    void thumbnail_png_generatesCachedJpeg() throws Exception {
        SysAttachment e = persistEntity(100L, "p.png", "2025/10/p.png", "image/png");
        when(attachmentRepository.findById(100L)).thenReturn(Optional.of(e));
        Path file = tempDir.resolve("2025/10/p.png");
        Files.createDirectories(file.getParent());
        Files.write(file, pngBytes(800, 600));

        AttachmentService.ThumbnailResult result = service.thumbnail(100L, 160);

        assertThat(result.fallback()).isFalse();
        assertThat(result.contentType()).isEqualTo("image/jpeg");
        BufferedImage thumb = ImageIO.read(result.resource().getInputStream());
        assertThat(thumb).isNotNull();
        assertThat(Math.max(thumb.getWidth(), thumb.getHeight())).isEqualTo(160);

        // 缓存命中：再次请求直接读缓存（文件存在即命中，不再解码）
        Path cached = tempDir.resolve(".thumbs/100_160.jpg");
        assertThat(cached).exists();
        AttachmentService.ThumbnailResult second = service.thumbnail(100L, 160);
        assertThat(second.fallback()).isFalse();
        assertThat(second.resource().getFilename()).isEqualTo("100_160.jpg");
    }

    @Test
    void thumbnail_svg_decodesFail_fallsBackToOriginal() throws Exception {
        SysAttachment e = persistEntity(200L, "v.svg", "2025/10/v.svg", "image/svg+xml");
        when(attachmentRepository.findById(200L)).thenReturn(Optional.of(e));
        Path file = tempDir.resolve("2025/10/v.svg");
        Files.createDirectories(file.getParent());
        Files.write(file, "<svg xmlns='http://www.w3.org/2000/svg'/>".getBytes(StandardCharsets.UTF_8));

        AttachmentService.ThumbnailResult result = service.thumbnail(200L, 160);

        assertThat(result.fallback()).isTrue();
        assertThat(result.contentType()).isEqualTo("image/svg+xml");
        assertThat(new String(result.resource().getInputStream().readAllBytes(), StandardCharsets.UTF_8))
                .contains("<svg");
    }

    @Test
    void thumbnail_sizeClampedToAllowedRange() throws Exception {
        SysAttachment e = persistEntity(300L, "p.png", "2025/10/p.png", "image/png");
        when(attachmentRepository.findById(300L)).thenReturn(Optional.of(e));
        Path file = tempDir.resolve("2025/10/p.png");
        Files.createDirectories(file.getParent());
        Files.write(file, pngBytes(1000, 800));

        // w=99999 → 夹取到 640；w=-5 → 夹取到 64
        assertThat(service.thumbnail(300L, 99999).resource().getFilename()).isEqualTo("300_640.jpg");
        assertThat(service.thumbnail(300L, -5).resource().getFilename()).isEqualTo("300_64.jpg");
    }

    @Test
    void thumbnail_missingFile_fallsBackToOriginalResource() {
        SysAttachment e = persistEntity(400L, "lost.png", "2025/10/lost.png", "image/png");
        when(attachmentRepository.findById(400L)).thenReturn(Optional.of(e));
        // 磁盘文件丢失 → resolve 抛业务异常（提示文件已丢失）
        assertThatThrownBy(() -> service.thumbnail(400L, 160))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("丢失");
    }
}
