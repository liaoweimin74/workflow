-- ============================================================
-- V28: 通知消息增加内容渲染类型列
-- 记录该消息正文应按何种类型渲染（TEXT=纯文本 / MARKDOWN=Markdown 富文本），
-- 由发送时模板的 contentType 决定，供前端展示层按类型差异化渲染。
--
-- 说明：开发环境 ddl-auto=update 可能已自动创建该列，而本机 MySQL 8.0.16
-- 不支持 ADD COLUMN IF NOT EXISTS，故通过 information_schema 动态判断，
-- 列已存在则跳过，保证幂等、兼容生产全新库与开发增量库两种场景。
-- ============================================================

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'msg_message'
      AND column_name = 'content_type'
);

SET @ddl := IF(@col_exists = 0,
    'ALTER TABLE msg_message ADD COLUMN content_type ENUM(''TEXT'',''MARKDOWN'') NULL COMMENT ''内容渲染类型 (TEXT/MARKDOWN)'' AFTER message_type',
    'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
