-- ============================================================
-- V70: AppRelease 构建/上传链路补充列（Task 9.2/9.3）
--
-- error：最近一次构建或上传失败原因（FAILED 可追溯，spec
--   app-release-pipeline「构建失败可追溯」）；成功后清空。
-- uploaded_qr_url：体验版二维码地址（miniprogram-ci 上传回传，Task 9.3）。
-- 【兼容】普通 ALTER ADD COLUMN（V68 例外口径）：MySQL / H2(MODE=MySQL)
--   双兼容；Flyway 单次执行，不做 information_schema+PREPARE 幂等探针
--   （V23 口径为 MySQL 专用，H2 测试库不可执行）。
-- ============================================================

ALTER TABLE wf_app_release ADD COLUMN error VARCHAR(1024) NULL;
ALTER TABLE wf_app_release ADD COLUMN uploaded_qr_url VARCHAR(512) NULL;
