-- ============================================================
-- V52: 系统组件·图片（Task 147）
--
-- 图片上传组件复用 sys_attachment 元数据表（V51，Task 146），新增
-- 图片像素尺寸两列：POST /api/attachments/upload-image 上传时由
-- 服务端 ImageIO 读取并回写；仅位图（JPEG/PNG/GIF/BMP 等 ImageIO
-- 可解码类型）有值，SVG/WEBP 等解码失败留 NULL，由前端校验兜底。
-- 普通附件上传（POST /api/attachments/upload）恒为 NULL。
--
-- 尺寸用途：图片组件回显信息条（宽×高）、缩略图请求参数参考、
-- 后续按尺寸筛选的查询能力预留。
--
-- 【幂等】ADD COLUMN IF NOT EXISTS（MariaDB 10.x 语法），可重复执行；
-- 与 hibernate ddl-auto=update 共存：Flyway 先行建列，ddl-auto 校验通过。
-- ============================================================

ALTER TABLE `sys_attachment`
    ADD COLUMN IF NOT EXISTS `img_width`  INT NULL COMMENT '图片宽度 px（仅 upload-image 且位图解码成功时有值）',
    ADD COLUMN IF NOT EXISTS `img_height` INT NULL COMMENT '图片高度 px（同上）';
