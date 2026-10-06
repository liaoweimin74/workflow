package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * 附件元数据实体（Task 146：系统组件·附件；Task 147：系统组件·图片）。
 *
 * <p>文件内容存本地磁盘（workflow.attachment.storage-path + storage_path 相对子路径），
 * 本表仅存元数据；stored_name 由服务端生成（uuid.ext），杜绝路径穿越。
 *
 * <p>Task 147 新增 img_width/img_height：仅图片类型上传（upload-image）时由服务端
 * 读取像素尺寸写入（解码失败/非位图如 SVG、WEBP 留 null），供图片组件缩略图
 * 信息条与尺寸限制展示；普通附件上传恒为 null。
 */
@Entity
@Table(name = "sys_attachment", indexes = {
        @Index(name = "uk_sys_attachment_stored_name", columnList = "stored_name", unique = true),
        @Index(name = "idx_sys_attachment_created_at", columnList = "created_at")
})
public class SysAttachment extends BaseEntity {

    /** 原始文件名（展示用）。 */
    @Column(name = "file_name", nullable = false, length = 500)
    private String fileName;

    /** 存储文件名（uuid.ext，服务端生成）。 */
    @Column(name = "stored_name", nullable = false, length = 128)
    private String storedName;

    /** MIME 类型。 */
    @Column(name = "content_type", length = 255)
    private String contentType;

    /** 文件字节数。 */
    @Column(name = "file_size", nullable = false)
    private Long fileSize = 0L;

    /** 相对 storage-path 的子路径（yyyy/MM/uuid.ext）。 */
    @Column(name = "storage_path", nullable = false, length = 500)
    private String storagePath;

    /** 业务归类（预留）。 */
    @Column(name = "biz_type", length = 50)
    private String bizType;

    /** 业务引用标识（预留）。 */
    @Column(name = "biz_ref", length = 64)
    private String bizRef;

    /** 图片宽度（px，仅 upload-image 且解码成功时有值；非图片恒 null）。 */
    @Column(name = "img_width")
    private Integer imgWidth;

    /** 图片高度（px，仅 upload-image 且解码成功时有值；非位图如 SVG 留 null）。 */
    @Column(name = "img_height")
    private Integer imgHeight;

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public String getStoredName() { return storedName; }
    public void setStoredName(String storedName) { this.storedName = storedName; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }
    public String getStoragePath() { return storagePath; }
    public void setStoragePath(String storagePath) { this.storagePath = storagePath; }
    public String getBizType() { return bizType; }
    public void setBizType(String bizType) { this.bizType = bizType; }
    public String getBizRef() { return bizRef; }
    public void setBizRef(String bizRef) { this.bizRef = bizRef; }
    public Integer getImgWidth() { return imgWidth; }
    public void setImgWidth(Integer imgWidth) { this.imgWidth = imgWidth; }
    public Integer getImgHeight() { return imgHeight; }
    public void setImgHeight(Integer imgHeight) { this.imgHeight = imgHeight; }
}
