package com.workflow.engine.process;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.mapping.FormMappingValidator;
import com.workflow.engine.process.bpmn.MultiInstanceBpmnRewriter;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.entity.ProcessDraft;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.repository.Deployment;
import org.flowable.engine.repository.DeploymentBuilder;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.repository.ProcessDefinitionQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ProcessDesignService.deploy() 部署变化检测单元测试。
 *
 * <p>验证：变化检测从"仅比较改写后 BPMN XML"升级为"改写后 XML + nodeConfigMap 整体 SHA-256 hash"，
 * 使审批人、操作权限、__PROCESS__ 等配置变化可触发部署；内容真正无变化才拦截。
 * 历史数据（deployed_config_hash 为空）降级为旧的 XML 比较行为。
 */
class ProcessDesignServiceDeployTest {

    private static final String DRAFT_ID = "draft-001";
    private static final String TENANT_ID = "tenant-1";
    private static final String PROC_DEF_ID = "procdef-1";
    private static final String DEPLOY_ID = "deploy-1";

    private static final String EFFECTIVE_BPMN =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            + "<definitions xmlns=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" targetNamespace=\"test\">\n"
            + "  <process id=\"testProcess\" name=\"测试流程\" isExecutable=\"true\">\n"
            + "    <startEvent id=\"start\" name=\"开始\"/>\n"
            + "    <userTask id=\"approvalTask\" name=\"审批\"/>\n"
            + "    <endEvent id=\"end\" name=\"结束\"/>\n"
            + "  </process>\n"
            + "</definitions>";

    private ProcessDraftRepository draftRepository;
    private NodeConfigRepository nodeConfigRepository;
    private RepositoryService repositoryService;
    private TenantProvider tenantProvider;
    private MultiInstanceBpmnRewriter multiInstanceBpmnRewriter;
    private FormMappingValidator formMappingValidator;
    private ProcessDesignService service;

    @BeforeEach
    void setUp() {
        draftRepository = mock(ProcessDraftRepository.class);
        nodeConfigRepository = mock(NodeConfigRepository.class);
        repositoryService = mock(RepositoryService.class);
        tenantProvider = mock(TenantProvider.class);
        multiInstanceBpmnRewriter = mock(MultiInstanceBpmnRewriter.class);
        formMappingValidator = mock(FormMappingValidator.class);
        when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        service = new ProcessDesignService(draftRepository, nodeConfigRepository, repositoryService,
                tenantProvider, multiInstanceBpmnRewriter, formMappingValidator, new ObjectMapper());
    }

    // ==================== 部署配置 hash 计算 ====================

    @Test
    void 相同配置内容产生相同hash() {
        String xml = "<definitions></definitions>";
        Map<String, String> configs = new java.util.TreeMap<>();
        configs.put("node1", "{\"operations\":{\"allowTransfer\":true}}");
        configs.put("__PROCESS__", "{\"approvalPolicy\":{\"operations\":{\"allowTransfer\":true}}}");

        String hash1 = invokeComputeHash(xml, configs);
        String hash2 = invokeComputeHash(xml, configs);

        assertThat(hash1).isEqualTo(hash2);
        assertThat(hash1).hasSize(64); // SHA-256 hex
    }

    @Test
    void 配置变化导致hash变化() {
        String xml = "<definitions></definitions>";
        Map<String, String> configs = new java.util.TreeMap<>();
        configs.put("node1", "{\"operations\":{\"allowTransfer\":true}}");
        String hash1 = invokeComputeHash(xml, configs);

        configs.put("node1", "{\"operations\":{\"allowTransfer\":false}}");
        String hash2 = invokeComputeHash(xml, configs);

        assertThat(hash1).isNotEqualTo(hash2);
    }

    // ==================== 部署变化判定 ====================

    @Test
    void 仅修改节点配置可部署() {
        ProcessDraft draft = newDraft();
        stubDraftLookup(draft);
        stubDeploy();
        when(multiInstanceBpmnRewriter.rewrite(anyString(), any())).thenReturn(EFFECTIVE_BPMN);
        // 第一次部署：内容 A
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(DRAFT_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":true}}"));

        service.deploy(DRAFT_ID);
        assertThat(draft.getStatus()).isEqualTo("DEPLOYED");
        String hashAfterA = draft.getDeployedConfigHash();
        assertThat(hashAfterA).isNotBlank();

        // 仅修改节点配置（不影响 BPMN XML）→ 再次部署应成功且 hash 更新
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(DRAFT_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":false}}"));

        service.deploy(DRAFT_ID);

        String hashAfterB = draft.getDeployedConfigHash();
        assertThat(hashAfterB).isNotBlank();
        assertThat(hashAfterB).isNotEqualTo(hashAfterA);
    }

    @Test
    void 内容无变化时拦截() {
        ProcessDraft draft = newDraft();
        stubDraftLookup(draft);
        stubDeploy();
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(DRAFT_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":true}}"));
        when(multiInstanceBpmnRewriter.rewrite(anyString(), any())).thenReturn(EFFECTIVE_BPMN);

        service.deploy(DRAFT_ID);
        verify(repositoryService).createDeployment(); // 第一次部署成功

        // 内容无任何变化，再次部署应被拦截
        assertThatThrownBy(() -> service.deploy(DRAFT_ID))
                .isInstanceOf(BusinessException.class)
                .hasMessage("流程数据未变化，无需部署");

        // 未创建新的 Flowable deployment
        verify(repositoryService, times(1)).createDeployment();
    }

    @Test
    void 历史数据降级路径_hash为空且XML相同且配置相同则拒绝() {
        ProcessDraft draft = newDraft();
        // 历史数据：deployed_config_hash 为空，deployedXml 与 effective 相同，配置与上次部署快照一致
        draft.setDeployedXml(EFFECTIVE_BPMN);
        draft.setProcessDefinitionId(PROC_DEF_ID);
        stubDraftLookup(draft);
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(DRAFT_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":true}}"));
        // 上次部署版本快照与当前配置一致
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionId(DRAFT_ID, PROC_DEF_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":true}}"));
        when(multiInstanceBpmnRewriter.rewrite(anyString(), any())).thenReturn(EFFECTIVE_BPMN);

        // 降级路径：XML 相同 且 配置与快照一致 → 拒绝部署
        assertThatThrownBy(() -> service.deploy(DRAFT_ID))
                .isInstanceOf(BusinessException.class)
                .hasMessage("流程数据未变化，无需部署");
        verify(repositoryService, never()).createDeployment();
    }

    @Test
    void 历史数据降级路径_XML相同但配置已修改则允许部署() {
        ProcessDraft draft = newDraft();
        // 历史数据：hash 为空，XML 未变，但配置已修改（如流程级 allowTransfer 从 true 改 false）
        draft.setDeployedXml(EFFECTIVE_BPMN);
        draft.setProcessDefinitionId(PROC_DEF_ID);
        stubDraftLookup(draft);
        stubDeploy();
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(DRAFT_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":false}}"));
        // 上次部署版本快照是旧配置
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionId(DRAFT_ID, PROC_DEF_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":true}}"));
        when(multiInstanceBpmnRewriter.rewrite(anyString(), any())).thenReturn(EFFECTIVE_BPMN);

        service.deploy(DRAFT_ID);

        assertThat(draft.getStatus()).isEqualTo("DEPLOYED");
        assertThat(draft.getDeployedConfigHash()).isNotBlank();
        verify(repositoryService).createDeployment();
    }

    @Test
    void 历史数据首次部署_hash为空但XML不同则成功并写入hash() {
        ProcessDraft draft = newDraft();
        // 历史数据：deployed_config_hash 为空，deployedXml 与 effective 不同
        draft.setDeployedXml("<definitions>old</definitions>");
        stubDraftLookup(draft);
        stubDeploy();
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(DRAFT_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":true}}"));
        when(multiInstanceBpmnRewriter.rewrite(anyString(), any())).thenReturn(EFFECTIVE_BPMN);

        service.deploy(DRAFT_ID);

        assertThat(draft.getStatus()).isEqualTo("DEPLOYED");
        assertThat(draft.getDeployedConfigHash()).isNotBlank();
        verify(repositoryService).createDeployment();
    }

    // ==================== 部署写入分类（方案 A） ====================

    @Test
    void 部署时写入流程分类() {
        ProcessDraft draft = newDraft();
        draft.setCategoryId("cat-1");
        stubDraftLookup(draft);
        DeploymentBuilder builder = stubDeploy();
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(DRAFT_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":true}}"));
        when(multiInstanceBpmnRewriter.rewrite(anyString(), any())).thenReturn(EFFECTIVE_BPMN);

        service.deploy(DRAFT_ID);

        verify(builder).category("cat-1");
        verify(builder).deploy();
    }

    @Test
    void 分类为空时不设置category() {
        ProcessDraft draft = newDraft(); // 无 categoryId
        stubDraftLookup(draft);
        DeploymentBuilder builder = stubDeploy();
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(DRAFT_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":true}}"));
        when(multiInstanceBpmnRewriter.rewrite(anyString(), any())).thenReturn(EFFECTIVE_BPMN);

        service.deploy(DRAFT_ID);

        verify(builder, never()).category(anyString());
        verify(builder).deploy();
    }

    @Test
    void 非法映射配置时部署失败() {
        ProcessDraft draft = newDraft();
        stubDraftLookup(draft);
        stubDeploy();
        when(nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(DRAFT_ID))
                .thenReturn(nodeConfigs("node1", "{\"operations\":{\"allowTransfer\":true}}"));
        when(multiInstanceBpmnRewriter.rewrite(anyString(), any())).thenReturn(EFFECTIVE_BPMN);
        doThrow(new IllegalArgumentException("节点 UserTask_1 的映射目标字段不存在: nonexistent"))
                .when(formMappingValidator).validate(PROC_DEF_ID);

        assertThatThrownBy(() -> service.deploy(DRAFT_ID))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("nonexistent");
    }

    // ==================== helpers ====================

    private ProcessDraft newDraft() {
        ProcessDraft draft = new ProcessDraft();
        draft.setId(DRAFT_ID);
        draft.setTenantId(TENANT_ID);
        draft.setName("测试流程");
        draft.setKey("testProcess");
        draft.setBpmnXml(EFFECTIVE_BPMN);
        draft.setStatus("DRAFT");
        return draft;
    }

    private void stubDraftLookup(ProcessDraft draft) {
        when(draftRepository.findByIdAndTenantId(DRAFT_ID, TENANT_ID)).thenReturn(Optional.of(draft));
        when(draftRepository.save(draft)).thenReturn(draft);
    }

    private DeploymentBuilder stubDeploy() {
        DeploymentBuilder builder = mock(DeploymentBuilder.class);
        when(repositoryService.createDeployment()).thenReturn(builder);
        when(builder.name(anyString())).thenReturn(builder);
        when(builder.addString(anyString(), anyString())).thenReturn(builder);
        when(builder.tenantId(anyString())).thenReturn(builder);
        when(builder.category(anyString())).thenReturn(builder);
        Deployment deployment = mock(Deployment.class);
        when(builder.deploy()).thenReturn(deployment);
        when(deployment.getId()).thenReturn(DEPLOY_ID);

        ProcessDefinitionQuery query = mock(ProcessDefinitionQuery.class);
        when(repositoryService.createProcessDefinitionQuery()).thenReturn(query);
        when(query.deploymentId(anyString())).thenReturn(query);
        when(query.processDefinitionTenantId(anyString())).thenReturn(query);
        when(query.latestVersion()).thenReturn(query);
        ProcessDefinition procDef = mock(ProcessDefinition.class);
        when(query.singleResult()).thenReturn(procDef);
        when(procDef.getId()).thenReturn(PROC_DEF_ID);
        when(procDef.getVersion()).thenReturn(2);
        return builder;
    }

    private List<NodeConfig> nodeConfigs(String nodeId, String configJson) {
        NodeConfig nc = new NodeConfig();
        nc.setId("nc-" + nodeId);
        nc.setTenantId(TENANT_ID);
        nc.setProcessDefId(DRAFT_ID);
        nc.setNodeId(nodeId);
        nc.setNodeType("userTask");
        nc.setConfigJson(configJson);
        return List.of(nc);
    }

    private String invokeComputeHash(String xml, Map<String, String> configs) {
        try {
            java.lang.reflect.Method m = ProcessDesignService.class
                    .getDeclaredMethod("computeDeployHash", String.class, java.util.Map.class);
            m.setAccessible(true);
            return (String) m.invoke(service, xml, configs);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
