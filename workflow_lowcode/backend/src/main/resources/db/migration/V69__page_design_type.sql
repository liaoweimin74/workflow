-- ============================================================
-- V69: 页面设计类型 design_type（web / uniapp）
--
-- 页面设计器路线二分（spec: uniapp-codegen D2）：web = Web 设计器
-- （WEB Client 运行时渲染），uniapp = UniApp 设计器（小程序/H5/App
-- 出码交付）。页面创建时确定、不可变更；客户端启用清单分配时按端
-- 类型校验兼容：web 页面 → WEB Client，uniapp 页面 → MP_WEIXIN/H5/APP
-- （同一 uniapp 页面池跨端复用）。
--
-- 存量页面全部是 Web 设计器产物，ADD COLUMN NOT NULL DEFAULT 'web'
-- 直接回填。
--
-- 【幂等】无（ADD COLUMN 单次执行，重放报 duplicate column 属预期，
--   同 V68 加列口径）。
-- 【兼容】MySQL / H2(MODE=MySQL)：ADD COLUMN NOT NULL DEFAULT 两方言
--   均支持。
-- ============================================================

ALTER TABLE `wf_page_def`
    ADD COLUMN `design_type` VARCHAR(16) NOT NULL DEFAULT 'web' COMMENT '页面设计类型：web / uniapp（创建时确定，不可变更）';
