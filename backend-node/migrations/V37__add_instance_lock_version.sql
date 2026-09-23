-- V37：wfe_process_instance 增加 lock_version（乐观锁，并发控制）
--
-- 为什么需要：引擎的写路径是**读-改-写**（`loadState` → 内存推进 → `replaceRuntimeRows`
-- 先删后插整份运行时行）。两个针对**同一实例**的并发请求会在各自的内存态里看到旧状态，
-- 后落库的一方**覆盖**掉前一方（丢更新），同时副作用重复（审批意见插两条、
-- 后端逻辑重复调用、SSE 重复推送）。
--
-- Java 侧靠 Flowable 的乐观锁（`ACT_RU_EXECUTION.REV_`）兜底：冲突时抛异常，请求失败。
-- 这里照同一思路加一列版本号，落库前做 compare-and-swap：
--   `UPDATE wfe_process_instance SET lock_version = lock_version + 1
--     WHERE id = ? AND lock_version = <loadState 时读到的值>`
-- 影响行数为 0 即表示"期间被别人改过" ⇒ 抛并发冲突（HTTP 500，与 Java 的引擎异常一致）。
--
-- ⚠️ 为什么用乐观锁而不是 `SELECT ... FOR UPDATE` 悲观锁：
--    一次任务操作中间会做**外部 HTTP 调用**（节点级后端逻辑），
--    悲观锁会把这个外部调用圈进事务里（长事务 + 锁等待超时风险）；
--    乐观锁只在写库那一瞬间冲突，外部调用照常进行。
--
-- 绿地表（决策 C2），加列不影响任何既有数据与 Java 侧。

ALTER TABLE `wfe_process_instance`
  ADD COLUMN `lock_version` BIGINT NOT NULL DEFAULT 0
  COMMENT '乐观锁版本：每次整份运行时行重写 +1；落库前 CAS 校验（对齐 Flowable 的 REV_）';
