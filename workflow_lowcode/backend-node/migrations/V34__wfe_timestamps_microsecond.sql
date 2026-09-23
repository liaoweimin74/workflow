-- V34：把 wfe_* 的时间戳列改为 DATETIME(6)，与项目其它表保持一致
--
-- 为什么必须改：
--   V32 建这些表时写的是 DATETIME（秒精度），而项目里其它表（sys_*、wf_*、msg_*）
--   全是 datetime(6)。后果是**同一操作内创建的多个活动实例时间戳完全相同**，
--   而高亮接口是按 start_time 排序返回的（对齐 Java 的
--   orderByHistoricActivityInstanceStartTime asc），时间相同则 MySQL 排序不稳定，
--   导致响应数组顺序与 Java 不一致（实测踩到过：
--   completedActivityIds 变成 [Flow_1, Flow_2, Start_1, Initiator_1]）。
--
-- 配合引擎里的单调时钟（同一 runtime 内时间严格递增），毫秒精度即可给出稳定顺序。

ALTER TABLE `wfe_activity`
  MODIFY COLUMN `start_time`  DATETIME(6) NOT NULL,
  MODIFY COLUMN `end_time`    DATETIME(6) DEFAULT NULL,
  MODIFY COLUMN `created_at`  DATETIME(6) NOT NULL,
  MODIFY COLUMN `updated_at`  DATETIME(6) NOT NULL;

ALTER TABLE `wfe_execution`
  MODIFY COLUMN `created_at`  DATETIME(6) NOT NULL,
  MODIFY COLUMN `updated_at`  DATETIME(6) NOT NULL;

ALTER TABLE `wfe_process_instance`
  MODIFY COLUMN `start_time`  DATETIME(6) NOT NULL,
  MODIFY COLUMN `end_time`    DATETIME(6) DEFAULT NULL,
  MODIFY COLUMN `created_at`  DATETIME(6) NOT NULL,
  MODIFY COLUMN `updated_at`  DATETIME(6) NOT NULL;

ALTER TABLE `wfe_task`
  MODIFY COLUMN `create_time` DATETIME(6) NOT NULL,
  MODIFY COLUMN `claim_time`  DATETIME(6) DEFAULT NULL,
  MODIFY COLUMN `end_time`    DATETIME(6) DEFAULT NULL,
  MODIFY COLUMN `due_date`    DATETIME(6) DEFAULT NULL,
  MODIFY COLUMN `created_at`  DATETIME(6) NOT NULL,
  MODIFY COLUMN `updated_at`  DATETIME(6) NOT NULL;

ALTER TABLE `wfe_process_def`
  MODIFY COLUMN `deployed_at` DATETIME(6) NOT NULL,
  MODIFY COLUMN `created_at`  DATETIME(6) NOT NULL,
  MODIFY COLUMN `updated_at`  DATETIME(6) NOT NULL;

ALTER TABLE `wfe_variable`
  MODIFY COLUMN `create_time` DATETIME(6) NOT NULL,
  MODIFY COLUMN `update_time` DATETIME(6) NOT NULL;

ALTER TABLE `wfe_task_candidate`
  MODIFY COLUMN `created_at`  DATETIME(6) NOT NULL;
