package com.workflow.system.domain.vo;

/**
 * 附件视图对象（Task 146；Task 147 图片组件扩展）。
 *
 * @param id          附件 id（组件值语义的主键）
 * @param fileName    原始文件名
 * @param contentType MIME 类型
 * @param fileSize    字节数
 * @param createdBy   上传人
 * @param createdAt   上传时间（ISO-8601 字符串）
 * @param width       图片宽度（px；仅 upload-image 且位图解码成功时有值，其余 null）
 * @param height      图片高度（px；同上）
 */
public record AttachmentVO(
        Long id,
        String fileName,
        String contentType,
        Long fileSize,
        String createdBy,
        String createdAt,
        Integer width,
        Integer height) {
}
