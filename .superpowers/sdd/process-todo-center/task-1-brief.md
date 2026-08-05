## Task 1: 鍚庣鏁版嵁搴撹縼绉?鈥?wf_task_comment + wf_task_remind

**Files:**
- Create: `backend/src/main/resources/db/migration/V13__create_wf_task_comment.sql`
- Create: `backend/src/main/resources/db/migration/V14__create_wf_task_remind.sql`

**Interfaces:**
- Produces: `wf_task_comment` 琛紙id, task_id, process_instance_id, user_id, comment, action, create_time锛?- Produces: `wf_task_remind` 琛紙id, task_id, process_instance_id, remind_from, remind_to, remind_time锛夛紝task_id 绱㈠紩

- [ ] **Step 1: 缂栧啓 V13 杩佺Щ鑴氭湰**

```sql
-- V13__create_wf_task_comment.sql
CREATE TABLE wf_task_comment (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL,
    process_instance_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    comment TEXT,
    action VARCHAR(32) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_id (task_id),
    INDEX idx_process_instance_id (process_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: 缂栧啓 V14 杩佺Щ鑴氭湰**

```sql
-- V14__create_wf_task_remind.sql
CREATE TABLE wf_task_remind (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL,
    process_instance_id VARCHAR(64) NOT NULL,
    remind_from VARCHAR(64) NOT NULL,
    remind_to VARCHAR(64) NOT NULL,
    remind_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 3: 鍚姩鍚庣楠岃瘉杩佺Щ鎵ц**

Run: `cd backend && mvn spring-boot:run`锛堟鏌ユ棩蹇楁棤 Flyway 鎶ラ敊锛岃〃宸插垱寤猴級
Expected: Flyway 鎵ц V13/V14 鎴愬姛

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V13__create_wf_task_comment.sql backend/src/main/resources/db/migration/V14__create_wf_task_remind.sql
git commit -m "feat(db): add wf_task_comment and wf_task_remind tables"
```

---

