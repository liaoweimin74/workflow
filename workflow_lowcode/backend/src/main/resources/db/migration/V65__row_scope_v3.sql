-- ============================================================
-- V65: 数据权限 v3 语义（关联即受控、授权即赋予可见行；取消读写双轴）
--
-- v2 把「授权」实现成了「对某角色施加收紧滤镜」：没被授到的角色反而全量可见，
-- 与「授权 = 赋予权限」的语义正好相反。v3 翻转为白名单模型：
--   数据源被任意权限对象关联 → 受控；受控且未被授权的角色 → 0 行；
--   空条件对象 = 全部行（保存期恢复合法）；可见性同时管读与改删，授权不再分读写轴。
--
-- grant 表去掉 scope_action 轴；豁免表去掉轴（豁免挂在数据源上）。
-- 两张表随 v2/v3 交付窗口极短（现网零数据），直接清空重建，不做行内换算迁移。
-- 【幂等】ALTER 走 INFORMATION_SCHEMA 判定 + PREPARE。
-- ============================================================

DELETE FROM wf_row_permission_grant;
DELETE FROM wf_row_scope_exemption;

-- grant：旧唯一键含 scope_action，先删索引再删列，最后建新唯一键
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_row_permission_grant'
      AND INDEX_NAME = 'uk_row_permission_grant');
SET @ddl = IF(@idx_exists > 0,
    'ALTER TABLE wf_row_permission_grant DROP INDEX uk_row_permission_grant',
    'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_row_permission_grant'
      AND COLUMN_NAME = 'scope_action');
SET @ddl = IF(@col_exists > 0,
    'ALTER TABLE wf_row_permission_grant DROP COLUMN scope_action',
    'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_row_permission_grant'
      AND INDEX_NAME = 'uk_row_permission_grant');
SET @ddl = IF(@idx_exists = 0,
    'ALTER TABLE wf_row_permission_grant
       ADD UNIQUE KEY uk_row_permission_grant (permission_id, subject_type, subject_key)',
    'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- exemption：整行只剩「数据源 × 理由」，轴列与轴索引一并去掉
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_row_scope_exemption'
      AND INDEX_NAME = 'idx_row_scope_exemption_ds');
SET @ddl = IF(@idx_exists > 0,
    'ALTER TABLE wf_row_scope_exemption DROP INDEX idx_row_scope_exemption_ds',
    'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_row_scope_exemption'
      AND COLUMN_NAME = 'scope_action');
SET @ddl = IF(@col_exists > 0,
    'ALTER TABLE wf_row_scope_exemption DROP COLUMN scope_action',
    'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_row_scope_exemption'
      AND INDEX_NAME = 'idx_row_scope_exemption_ds');
SET @ddl = IF(@idx_exists = 0,
    'ALTER TABLE wf_row_scope_exemption
       ADD KEY idx_row_scope_exemption_ds (tenant_id, data_source_id)',
    'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
