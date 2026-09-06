package com.workflow.example.leave;

import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.tenant.TenantContext;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * leave_bill 全链路集成测试（H2）：
 * 草稿期自由 CRUD → submit 启动流程 → 运行中守卫 409 → approve 结束流程 →
 * 结束后 PUT 放行 / DELETE 仍 409；另有 reject 驳回到发起人节点用例。
 *
 * 说明：DdlBuilder 生成 MySQL 方言 DDL（DATETIME 等），H2 无法执行建表，
 * 故 @MockitoBean DynamicTableManager 屏蔽发布建表，并在 @BeforeEach 手工预建 H2 兼容表
 * （结构对齐 DdlBuilder 固定列 + 业务列），保证 BizDataService 真实 SQL 可执行。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class LeaveBillWorkflowIntegrationTest {

    private static final String FORM_KEY = "leave_bill";
    private static final String PROCESS_KEY = "leave-bill";
    private static final String TENANT_ID = "t1";

    private static final String COLUMN_CONFIG = """
            [
              {"key":"days","label":"请假天数","columnType":"INT","required":false,"unique":false,"indexed":false,"hidden":false},
              {"key":"reason","label":"请假理由","columnType":"VARCHAR","length":255,"required":false,"unique":false,"indexed":false,"hidden":false},
              {"key":"status","label":"状态","columnType":"VARCHAR","length":32,"required":false,"unique":false,"indexed":false,"hidden":false}
            ]
            """;

    @Autowired
    private LeaveBillBizService leaveBillBizService;

    @Autowired
    private FormDefinitionService formDefService;

    @Autowired
    private RepositoryService repositoryService;

    @Autowired
    private RuntimeService runtimeService;

    @Autowired
    private TaskService taskService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 屏蔽发布建表（DdlBuilder 为 MySQL 方言，H2 不兼容）；表由 @BeforeEach 手工预建 */
    @MockitoBean
    private DynamicTableManager tableManager;

    @BeforeEach
    void setUp() throws Exception {
        TenantContext.setTenantId(TENANT_ID);
        when(tableManager.tableExists(anyString())).thenReturn(true);
        ensureBizTable();
        ensureFormDefinition();
        ensureDeployment();
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    /** 手工预建 H2 兼容业务表（列结构对齐 DdlBuilder 固定列 + leave_bill 业务列） */
    private void ensureBizTable() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS wf_biz_leave_bill (
                    id VARCHAR(64) NOT NULL,
                    tenant_id VARCHAR(64) NOT NULL,
                    days INT,
                    reason VARCHAR(255),
                    status VARCHAR(32),
                    version INT NOT NULL DEFAULT 1,
                    created_by VARCHAR(50),
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (id)
                )
                """);
    }

    /** 幂等建表：leave_bill 表单定义 + publish 触发 wf_biz_leave_bill 建表 */
    private void ensureFormDefinition() {
        try {
            formDefService.getByKey(FORM_KEY);
            return; // 已存在（跨测试保留），跳过
        } catch (RuntimeException e) {
            // 不存在，创建
        }
        FormDefinition def = formDefService.create("请假单", FORM_KEY, "BUSINESS", PROCESS_KEY);
        formDefService.update(def.getId(), null, null, "[]", COLUMN_CONFIG, PROCESS_KEY);
        formDefService.publish(def.getId());
    }

    /** 幂等部署：leave-bill BPMN（按 tenantId 部署，与 startProcess 对齐） */
    private void ensureDeployment() throws Exception {
        long count = repositoryService.createProcessDefinitionQuery()
                .processDefinitionKey(PROCESS_KEY)
                .processDefinitionTenantId(TENANT_ID)
                .count();
        if (count > 0) {
            return;
        }
        String bpmnXml = new ClassPathResource("example/leave-bill.bpmn20.xml")
                .getContentAsString(StandardCharsets.UTF_8);
        repositoryService.createDeployment()
                .name("leave-bill")
                .tenantId(TENANT_ID)
                .addString("leave-bill.bpmn20.xml", bpmnXml)
                .deploy();
    }

    private static Map<String, Object> data(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    // ==================== 用例链 1-5 ====================

    @Test
    void leaveBill_fullLifecycle_draftGuardApproveAfterEnd() {
        // ---- 用例 1：草稿期自由 CRUD ----
        BizDataVO draft = leaveBillBizService.createDraft(data("days", 3, "reason", "个人事务"));
        assertThat(draft.getId()).isNotBlank();
        assertThat(leaveBillBizService.getStatus(draft.getId())).isEqualTo("草稿");

        BizDataVO updated = leaveBillBizService.updateDraft(draft.getId(), data("days", 2), draft.getVersion());
        assertThat(leaveBillBizService.getStatus(updated.getId())).isEqualTo("草稿");
        leaveBillBizService.deleteDraft(draft.getId()); // 草稿期 DELETE 成功

        // ---- 用例 2：submit 启动流程 ----
        BizDataVO row = leaveBillBizService.createDraft(data("days", 7, "reason", "年假"));
        String id = row.getId();
        BizDataVO submitted = leaveBillBizService.submit(id);
        assertThat(leaveBillBizService.getStatus(id)).isEqualTo("待审批");

        ProcessInstance pi = runtimeService.createProcessInstanceQuery()
                .processInstanceTenantId(TENANT_ID)
                .processInstanceBusinessKey(id)
                .singleResult();
        assertThat(pi).isNotNull();
        assertThat(pi.getBusinessKey()).isEqualTo(id);

        // ---- 用例 3：运行中 PUT/DELETE → 409 ----
        BizDataVO running = leaveBillBizService.refresh(id);
        assertThatThrownBy(() -> leaveBillBizService.updateDraft(id, data("days", 5), running.getVersion()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("运行中");
        assertThatThrownBy(() -> leaveBillBizService.deleteDraft(id))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("禁止删除");

        // ---- 用例 4：approve 结束流程 ----
        Task managerTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertThat(managerTask).isNotNull();
        assertThat(managerTask.getTaskDefinitionKey()).isEqualTo("managerApproval");

        BizDataVO approved = leaveBillBizService.approve(managerTask.getId());
        assertThat(leaveBillBizService.getStatus(id)).isEqualTo("已批准");

        ProcessInstance afterEnd = runtimeService.createProcessInstanceQuery()
                .processInstanceTenantId(TENANT_ID)
                .processInstanceBusinessKey(id)
                .singleResult();
        assertThat(afterEnd).isNull(); // 流程已结束

        // ---- 用例 5：结束后 PUT 成功 / DELETE 409 ----
        BizDataVO afterApprove = leaveBillBizService.refresh(id);
        BizDataVO reUpdated = leaveBillBizService.updateDraft(id, data("days", 6), afterApprove.getVersion());
        assertThat(leaveBillBizService.getStatus(reUpdated.getId())).isEqualTo("已批准");

        assertThatThrownBy(() -> leaveBillBizService.deleteDraft(id))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("禁止删除");
    }

    // ==================== reject 用例 ====================

    @Test
    void leaveBill_reject_movesBackToInitiatorAndMarksRejected() {
        BizDataVO row = leaveBillBizService.createDraft(data("days", 3, "reason", "事假"));
        String id = row.getId();
        leaveBillBizService.submit(id);

        ProcessInstance pi = runtimeService.createProcessInstanceQuery()
                .processInstanceTenantId(TENANT_ID)
                .processInstanceBusinessKey(id)
                .singleResult();
        Task managerTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();

        BizDataVO rejected = leaveBillBizService.reject(managerTask.getId(), "理由不充分，请补充材料");
        assertThat(leaveBillBizService.getStatus(id)).isEqualTo("已驳回");

        // 流程仍在运行，且任务回到发起人节点
        ProcessInstance stillRunning = runtimeService.createProcessInstanceQuery()
                .processInstanceTenantId(TENANT_ID)
                .processInstanceBusinessKey(id)
                .singleResult();
        assertThat(stillRunning).isNotNull();

        Task initiatorTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertThat(initiatorTask).isNotNull();
        assertThat(initiatorTask.getTaskDefinitionKey()).isEqualTo("submitTask");
    }

    // ==================== handler 业务校验 ====================

    @Test
    void beforeCreate_daysOver5WithoutReason_rejects400() {
        assertThatThrownBy(() -> leaveBillBizService.createDraft(data("days", 6)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("超过 5 天");
    }

    @Test
    void beforeCreate_daysOver5WithReason_passes() {
        BizDataVO row = leaveBillBizService.createDraft(data("days", 10, "reason", "婚假"));
        assertThat(row.getId()).isNotBlank();
    }
}