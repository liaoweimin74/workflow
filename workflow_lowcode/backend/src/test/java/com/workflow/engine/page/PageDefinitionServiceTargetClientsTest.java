package com.workflow.engine.page;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.repository.SysClientRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A5 发布目标端（target_clients）契约。
 *
 * <p>口径（designs 2026-10-25 §4 A5 + 定案）：
 * <ul>
 *   <li>clientIds null/空 = 缺省 portal(1)——与存量行 target_clients NULL 的缺省语义同轨；</li>
 *   <li>落库为升序去重 CSV（"1,2"），PageAccessGuard 非 portal 端按此闸；</li>
 *   <li>目标端不存在 → 拒绝发布（400 文案族，锁临界区之前 fail-fast，不触 save）。</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PageDefinitionServiceTargetClientsTest {

    @Mock
    private PageDefinitionRepository pageDefRepository;
    @Mock
    private TenantProvider tenantProvider;
    @Mock
    private PageValidator validator;
    @Mock
    private SysClientRepository clientRepository;

    private PageDefinitionService service;
    private PageDefinition draft;

    private static final String TENANT_ID = "test-tenant";

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        service = new PageDefinitionService(pageDefRepository, tenantProvider,
                validator, new ObjectMapper(), clientRepository);

        draft = new PageDefinition();
        draft.setId("page-1");
        draft.setTenantId(TENANT_ID);
        draft.setName("订单列表");
        draft.setKey("order-page");
        draft.setType("PAGE");
        draft.setSchema("{\"rule\":[]}");
        draft.setVersion(1);
        draft.setStatus("DRAFT");
        when(pageDefRepository.findByIdForUpdate("page-1", TENANT_ID)).thenReturn(Optional.of(draft));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                TENANT_ID, "order-page", "PUBLISHED", "page-1")).thenReturn(Optional.empty());
        when(pageDefRepository.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));
        when(clientRepository.existsById(1L)).thenReturn(true);
        when(clientRepository.existsById(2L)).thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ------------------------------------------------------------ 缺省归一 portal

    @Test
    void publish_clientIdsNull_writesPortalCsv() {
        PageDefinition result = service.publish("page-1", null);

        assertThat(result.getTargetClients()).isEqualTo("1");
    }

    @Test
    void publish_clientIdsEmpty_treatedAsPortalDefault() {
        PageDefinition result = service.publish("page-1", List.of());

        assertThat(result.getTargetClients()).isEqualTo("1");
    }

    @Test
    void legacyPublishSignature_defaultsPortalCsv() {
        // 老入口（不带目标端的调用方）与显式 null 同口径——发布动作必有明确端集
        PageDefinition result = service.publish("page-1");

        assertThat(result.getTargetClients()).isEqualTo("1");
    }

    // ------------------------------------------------------------ CSV 归一（升序去重）

    @Test
    void publish_singleNonPortalClient_writesOwnCsv() {
        PageDefinition result = service.publish("page-1", List.of(2L));

        assertThat(result.getTargetClients()).isEqualTo("2");
    }

    @Test
    void publish_multipleClients_sortedDedupedCsv() {
        PageDefinition result = service.publish("page-1", List.of(2L, 1L, 2L));

        assertThat(result.getTargetClients()).isEqualTo("1,2");
    }

    // ------------------------------------------------------------ 存在性校验

    @Test
    void publish_unknownClient_rejected_beforePublishFlow() {
        assertThatThrownBy(() -> service.publish("page-1", List.of(1L, 99L)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("客户端不存在");

        // 拒绝必须发生在锁/降级/save 之前：页面维持 DRAFT，目标端非法不产生半成品发布
        assertThat(draft.getStatus()).isEqualTo("DRAFT");
        verify(pageDefRepository, never()).save(any());
    }
}
