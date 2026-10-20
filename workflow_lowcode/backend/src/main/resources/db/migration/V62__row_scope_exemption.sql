-- ============================================================
-- V62: 数据范围覆盖度豁免（「没挂即不受控」的显式留痕）
--
-- 默认放行是语义的一部分，但缺口必须可盘点、可解释：
-- 每条豁免记录「数据源 × 读写轴」上一个被接受的缺口，写明理由与操作人；
-- 撤销只写 revoked_at/revoked_by，不删行——事后仍能回答「当初是谁决定放过的」。
-- 不加唯一键：撤销后重新豁免需要新行，历史理由不能被覆盖；服务层保证同一轴只有一条生效记录。
-- 【幂等】DDL IF NOT EXISTS。
-- ============================================================

CREATE TABLE IF NOT EXISTS `wf_row_scope_exemption` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT,
    `tenant_id`      VARCHAR(64)  NOT NULL,
    `data_source_id` VARCHAR(64)  NOT NULL COMMENT 'wf_data_source.id',
    `scope_action`   VARCHAR(10)  NOT NULL COMMENT 'READ 读 / WRITE 写',
    `reason`         VARCHAR(500) NOT NULL COMMENT '豁免理由（必填，留痕的核心）',
    `revoked_at`     DATETIME(6)  NULL COMMENT '软撤销时间；NULL = 生效中',
    `revoked_by`     VARCHAR(50)  NULL,
    `is_deleted`     INT          NOT NULL DEFAULT 0,
    `created_by`     VARCHAR(50)  NULL,
    `created_at`     DATETIME(6)  NULL,
    `updated_by`     VARCHAR(50)  NULL,
    `updated_at`     DATETIME(6)  NULL,
    PRIMARY KEY (`id`),
    KEY `idx_row_scope_exemption_ds` (`tenant_id`, `data_source_id`, `scope_action`),
    KEY `idx_row_scope_exemption_active` (`tenant_id`, `revoked_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='数据范围覆盖度豁免（谁/何时/理由，软撤销留痕）';
