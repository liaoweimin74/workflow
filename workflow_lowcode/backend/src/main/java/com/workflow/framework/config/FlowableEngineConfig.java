package com.workflow.framework.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.executor.BackendLogicExecutor;
import com.workflow.engine.logic.executor.GroovyScriptLogic;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.logic.listener.BackendLogicEventListener;
import com.workflow.engine.logic.parse.VariableResolver;
import com.workflow.engine.logic.resolver.ProcessConfigResolver;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import org.flowable.engine.RuntimeService;
import org.flowable.spring.boot.ProcessEngineConfigurationConfigurer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.web.client.RestClient;

/**
 * Flowable 引擎及后端业务逻辑执行组件的装配配置。
 *
 * <p>通过 {@link ProcessEngineConfigurationConfigurer} 注册全局 {@link BackendLogicEventListener}，
 * 并在容器中装配后端逻辑执行链路所需的 Bean（解析器、执行器、白名单注册表等）。
 */
@Configuration
public class FlowableEngineConfig {

    /**
     * 注册 Flowable 全局事件监听器，驱动节点后端逻辑执行。
     * 依赖 flyway：Flowable 引擎构建（含建表）必须在 Flyway 迁移之后执行。
     *
     * <p>同时强制 Flowable 使用 MySQL 方言：
     * 沙箱环境使用 H2 的 MODE=MySQL 承载业务表（Flyway 迁移脚本为 MySQL 方言），
     * 而 H2 的 MySQL 兼容模式不识别 Flowable H2 方言脚本中的 {@code identity} 列类型
     * （Unknown data type: "IDENTITY"），会导致引擎建表失败、启动崩溃循环；
     * MySQL 方言脚本（varchar 主键 / ENGINE=InnoDB / 内联 KEY）在 H2 MySQL 模式下可完整执行，
     * 真实 MySQL 环境下亦同样适用。
     */
    @Bean
    @DependsOn("flyway")
    public ProcessEngineConfigurationConfigurer processEngineConfigurer(BackendLogicEventListener listener) {
        return configuration -> {
            configuration.setDatabaseType("mysql");
            configuration.setEventListeners(java.util.List.of(listener));
        };
    }

    @Bean
    public BackendLogicEventListener backendLogicEventListener(BackendLogicExecutor executor) {
        return new BackendLogicEventListener(executor);
    }

    @Bean
    public BackendLogicExecutor backendLogicExecutor(ProcessConfigResolver resolver,
                                                     HttpLogicExecutor httpExecutor,
                                                     GroovyScriptLogic groovyScriptLogic,
                                                     BackendBeanRegistry backendBeanRegistry,
                                                     ObjectProvider<RuntimeService> runtimeServiceProvider) {
        // 通过 ObjectProvider 延迟解析 RuntimeService，打破与 Flowable processEngine 的装配期循环依赖。
        return new BackendLogicExecutor(resolver, httpExecutor, groovyScriptLogic, backendBeanRegistry,
                runtimeServiceProvider::getObject);
    }

    @Bean
    public VariableResolver variableResolver() {
        return new VariableResolver();
    }

    @Bean
    public HttpLogicExecutor httpLogicExecutor(RestClient.Builder restClientBuilder,
                                               VariableResolver variableResolver,
                                               ObjectMapper objectMapper) {
        return new HttpLogicExecutor(restClientBuilder, variableResolver, objectMapper);
    }

    @Bean
    public GroovyScriptLogic groovyScriptLogic() {
        return new GroovyScriptLogic();
    }

    @Bean
    public ProcessConfigResolver processConfigResolver(NodeConfigRepository nodeConfigRepository,
                                                       ObjectMapper objectMapper) {
        return new ProcessConfigResolver(nodeConfigRepository, objectMapper);
    }

    @Bean
    public BackendBeanRegistry backendBeanRegistry(ApplicationContext applicationContext) {
        return new BackendBeanRegistry(applicationContext);
    }
}