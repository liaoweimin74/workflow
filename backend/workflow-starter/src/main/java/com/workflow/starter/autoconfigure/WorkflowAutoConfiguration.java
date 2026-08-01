package com.workflow.starter.autoconfigure;

import com.workflow.api.interceptor.TenantInterceptor;
import com.workflow.core.engine.ProcessInstanceService;
import com.workflow.core.engine.ProcessService;
import com.workflow.core.engine.WorkflowIdentityService;
import com.workflow.core.engine.WorkflowTaskService;
import com.workflow.core.tenant.TenantProvider;
import com.workflow.starter.properties.WorkflowProperties;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.springframework.boot.autoconfigure.AutoConfigureAfter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@ConditionalOnClass(name = "org.flowable.engine.ProcessEngine")
@EnableConfigurationProperties(WorkflowProperties.class)
public class WorkflowAutoConfiguration implements WebMvcConfigurer {

    private final WorkflowProperties properties;

    public WorkflowAutoConfiguration(WorkflowProperties properties) {
        this.properties = properties;
    }

    @Bean
    @ConditionalOnMissingBean
    public TenantProvider tenantProvider() {
        return new TenantProvider();
    }

    @Bean
    @ConditionalOnMissingBean
    public ProcessService processService(RepositoryService repositoryService,
                                         TenantProvider tenantProvider) {
        return new ProcessService(repositoryService, null, tenantProvider);
    }

    @Bean
    @ConditionalOnMissingBean
    public ProcessInstanceService processInstanceService(RuntimeService runtimeService,
                                                          TenantProvider tenantProvider) {
        return new ProcessInstanceService(runtimeService, tenantProvider);
    }

    @Bean
    @ConditionalOnMissingBean
    public WorkflowTaskService workflowTaskService(org.flowable.engine.TaskService taskService,
                                                    HistoryService historyService,
                                                    TenantProvider tenantProvider) {
        return new WorkflowTaskService(taskService, historyService, tenantProvider);
    }

    @Bean
    @ConditionalOnMissingBean
    public WorkflowIdentityService workflowIdentityService(TenantProvider tenantProvider) {
        return new WorkflowIdentityService(null, null, tenantProvider);
    }

    @Bean
    @ConditionalOnMissingBean
    public TenantInterceptor tenantInterceptor() {
        return new TenantInterceptor();
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(tenantInterceptor())
                .addPathPatterns("/api/**");
    }
}