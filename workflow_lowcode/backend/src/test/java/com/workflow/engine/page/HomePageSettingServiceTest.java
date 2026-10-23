package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.entity.HomePageSetting;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.HomePageSettingRepository;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class HomePageSettingServiceTest {

    private static final String TENANT_ID = "default";

    @Mock
    private HomePageSettingRepository settingRepository;

    @Mock
    private PageDefinitionRepository pageDefRepository;

    @Mock
    private TenantProvider tenantProvider;

    private HomePageSettingService service;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        service = new HomePageSettingService(settingRepository, pageDefRepository, tenantProvider);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private PageDefinition page(String key, String type, String status) {
        PageDefinition page = new PageDefinition();
        page.setId("p-" + key);
        page.setTenantId(TENANT_ID);
        page.setKey(key);
        page.setType(type);
        page.setStatus(status);
        return page;
    }

    private HomePageSetting setting(String key) {
        HomePageSetting setting = new HomePageSetting();
        setting.setTenantId(TENANT_ID);
        setting.setPageKey(key);
        return setting;
    }

    @Test
    void 未配置时使用默认首页key() {
        when(settingRepository.findById(TENANT_ID)).thenReturn(Optional.empty());

        assertThat(service.getHomePageKey()).isEqualTo("dashboard");
    }

    @Test
    void 返回配置的已发布页面key() {
        when(settingRepository.findById(TENANT_ID)).thenReturn(Optional.of(setting("leave_board")));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "leave_board", "PUBLISHED"))
                .thenReturn(Optional.of(page("leave_board", "PAGE", "PUBLISHED")));

        assertThat(service.getHomePageKey()).isEqualTo("leave_board");
    }

    @Test
    void 配置页面未发布时回退默认首页key() {
        when(settingRepository.findById(TENANT_ID)).thenReturn(Optional.of(setting("leave_board")));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "leave_board", "PUBLISHED"))
                .thenReturn(Optional.empty());

        assertThat(service.getHomePageKey()).isEqualTo("dashboard");
    }

    @Test
    void 配置页面已废弃为VIEW时回退默认首页key() {
        when(settingRepository.findById(TENANT_ID)).thenReturn(Optional.of(setting("legacy_view")));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "legacy_view", "PUBLISHED"))
                .thenReturn(Optional.of(page("legacy_view", "VIEW", "PUBLISHED")));

        assertThat(service.getHomePageKey()).isEqualTo("dashboard");
    }

    @Test
    void 设为首页保存页面key() {
        when(pageDefRepository.findByIdAndTenantId("p-leave", TENANT_ID))
                .thenReturn(Optional.of(page("leave_board", "PAGE", "PUBLISHED")));
        when(settingRepository.findById(TENANT_ID)).thenReturn(Optional.of(setting("dashboard")));
        when(settingRepository.save(any(HomePageSetting.class))).thenAnswer(inv -> inv.getArgument(0));

        String key = service.setHomePage("p-leave");

        assertThat(key).isEqualTo("leave_board");
        ArgumentCaptor<HomePageSetting> captor = ArgumentCaptor.forClass(HomePageSetting.class);
        verify(settingRepository).save(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(TENANT_ID);
        assertThat(captor.getValue().getPageKey()).isEqualTo("leave_board");
    }

    @Test
    void 首次设为首页时新建租户配置行() {
        when(pageDefRepository.findByIdAndTenantId("p-leave", TENANT_ID))
                .thenReturn(Optional.of(page("leave_board", "PAGE", "PUBLISHED")));
        when(settingRepository.findById(TENANT_ID)).thenReturn(Optional.empty());
        when(settingRepository.save(any(HomePageSetting.class))).thenAnswer(inv -> inv.getArgument(0));

        service.setHomePage("p-leave");

        ArgumentCaptor<HomePageSetting> captor = ArgumentCaptor.forClass(HomePageSetting.class);
        verify(settingRepository).save(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(TENANT_ID);
        assertThat(captor.getValue().getPageKey()).isEqualTo("leave_board");
    }

    @Test
    void 拒绝草稿页面设为首页() {
        when(pageDefRepository.findByIdAndTenantId("p-draft", TENANT_ID))
                .thenReturn(Optional.of(page("leave_board", "PAGE", "DRAFT")));

        assertThatThrownBy(() -> service.setHomePage("p-draft"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("仅已发布页面可设为首页");

        verify(settingRepository, never()).save(any(HomePageSetting.class));
    }

    @Test
    void 拒绝VIEW设为首页() {
        when(pageDefRepository.findByIdAndTenantId("p-view", TENANT_ID))
                .thenReturn(Optional.of(page("legacy_view", "VIEW", "PUBLISHED")));

        assertThatThrownBy(() -> service.setHomePage("p-view"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("仅自定义页面可设为首页");

        verify(settingRepository, never()).save(any(HomePageSetting.class));
    }

    @Test
    void 拒绝不存在的页面() {
        when(pageDefRepository.findByIdAndTenantId("missing", TENANT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.setHomePage("missing"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("页面不存在");

        verify(settingRepository, never()).save(any(HomePageSetting.class));
    }
}
