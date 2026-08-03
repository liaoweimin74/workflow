package com.workflow.engine.spike;

import org.flowable.engine.ProcessEngine;
import org.flowable.engine.ProcessEngineConfiguration;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.HistoryService;
import org.flowable.engine.impl.cfg.StandaloneProcessEngineConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;

/**
 * Spike 测试基类：编程式构建内存 H2 Flowable 引擎，不起 Spring 上下文。
 *
 * <p>目的：隔离验证 Flowable 8 的 MI 会签/或签、changeActivityState 驳回能力，
 * 不受项目 Security/Redis/JPA 配置干扰。
 */
public abstract class AbstractFlowableSpikeTest {

    protected ProcessEngine processEngine;
    protected RepositoryService repositoryService;
    protected RuntimeService runtimeService;
    protected TaskService taskService;
    protected HistoryService historyService;

    @BeforeEach
    void setUpEngine() {
        ProcessEngineConfiguration cfg = new StandaloneProcessEngineConfiguration()
                .setJdbcUrl("jdbc:h2:mem:spike-test;DB_CLOSE_DELAY=-1")
                .setJdbcDriver("org.h2.Driver")
                .setJdbcUsername("sa")
                .setJdbcPassword("")
                .setDatabaseSchemaUpdate(ProcessEngineConfiguration.DB_SCHEMA_UPDATE_TRUE)
                .setAsyncExecutorActivate(false);

        processEngine = cfg.buildProcessEngine();
        repositoryService = processEngine.getRepositoryService();
        runtimeService = processEngine.getRuntimeService();
        taskService = processEngine.getTaskService();
        historyService = processEngine.getHistoryService();
    }

    @AfterEach
    void tearDownEngine() {
        if (processEngine != null) {
            processEngine.close();
        }
    }

    /** 部署内嵌 BPMN XML 字符串。 */
    protected void deploy(String name, String bpmnXml) {
        repositoryService.createDeployment()
                .name(name)
                .addString(name + ".bpmn20.xml", bpmnXml)
                .deploy();
    }
}
