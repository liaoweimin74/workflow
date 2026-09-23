-- ============================================================
-- V36: 任务委派状态（delegate / resolve）
-- ============================================================
--
-- 【为什么需要这张表】
--   Java 的委派走 Flowable `delegateTask`：把原办理人写进 `ACT_RU_TASK.OWNER_`、
--   assignee 改成被委派人、任务置 `DELEGATION_ = PENDING`；被委派人「完成」时
--   先 `resolveTask`（assignee 归还 owner、`DELEGATION_ = RESOLVED`）**再** `complete`。
--   也就是「委派后完成 = 交还 + 继续推进」，与转办（换人即完、没有回还）语义不同。
--   契约场景「任务委派」把这条链路钉死了（delegate → assignee=4 → 4 完成 → 流程结束
--   且任务的 assignee 回到 1）。
--
-- 【为什么是侧表，而不是给 wfe_task 加两列】
--   自研引擎的 `wfe_task` 没有 owner / 委派态。**刻意不加在任务行上**：
--   `EnginePersistence.replaceRuntimeRows` 是「整实例删表重建」，且插入时用的是
--   显式列清单 —— 任何不在引擎内存态（`EngineTask`）里的列都会被覆盖丢失。
--   把委派态塞进任务行，等于要求引擎内存态也带上它，会牵动**全部任务路径**
--   （claim/complete/reject/transfer/add-sign/forward-sign 都会重写任务行）。
--   改放独立的侧表，与既有的 `wfe_task_candidate`（对应 Flowable 的
--   `ACT_RU_IDENTITYLINK`）保持同一种建模：附加属性放侧表，任务行保持精简。
--   任务 id 在整实例重写前后**保持不变**（引擎从库里读出来再原样写回），
--   所以按 task_id 关联的侧表在整个生命周期里都成立。
--
-- 【可观测性】
--   `owner` 与委派态**都不出现在任何响应里**（任务详情 VO 没有这两个字段）。
--   它们的唯一作用是在 complete 时把 assignee 还原成 owner —— 契约场景通过
--   `dvTaskAfterComplete.assignee` 观察到这个效果。
--
-- 【与 Flowable 的差异留痕】
--   Flowable 把这两个字段放在任务表上；本实现放在侧表。**不影响任何响应**，
--   但排查数据时要记得去 `wfe_task_delegation` 而不是 `wfe_task`。
-- ============================================================

CREATE TABLE IF NOT EXISTS wfe_task_delegation (
    task_id           VARCHAR(64) NOT NULL COMMENT '任务 ID（一个任务至多一条）',
    instance_id       VARCHAR(64) NOT NULL COMMENT '流程实例 ID（便于按实例清理）',
    tenant_id         VARCHAR(64) NOT NULL,
    owner             VARCHAR(64) NULL COMMENT '原办理人：委派时从 assignee 抄下，resolve 时还回去',
    delegation_state  VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING（已委派）/ RESOLVED（已交还）',
    created_at        DATETIME(6) NOT NULL,
    updated_at        DATETIME(6) NOT NULL,
    PRIMARY KEY (task_id),
    KEY idx_task_delegation_instance (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务委派状态（owner + 委派态）';
