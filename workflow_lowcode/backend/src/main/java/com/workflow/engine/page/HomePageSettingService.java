package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.entity.HomePageSetting;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.HomePageSettingRepository;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 首页页面配置：登录后的固定路由 /dashboard 由 DashboardRouterPage 按 key 加载页面，
 * 本服务负责读写该 key（租户级）。
 */
@Service
public class HomePageSettingService {

    /** 未配置或配置失效时的首页 key（沿用原有仪表盘页面约定）。 */
    public static final String DEFAULT_HOME_PAGE_KEY = "dashboard";

    private final HomePageSettingRepository settingRepository;
    private final PageDefinitionRepository pageDefRepository;
    private final TenantProvider tenantProvider;

    public HomePageSettingService(HomePageSettingRepository settingRepository,
                                  PageDefinitionRepository pageDefRepository,
                                  TenantProvider tenantProvider) {
        this.settingRepository = settingRepository;
        this.pageDefRepository = pageDefRepository;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 当前租户生效的首页 key。配置的页面已删除、未发布或不是 PAGE 时回退默认 key；
     * 默认 key 也不可用时由前端回退静态首页。
     */
    public String getHomePageKey() {
        String tenantId = tenantProvider.getTenantId();
        return settingRepository.findById(tenantId)
                .map(HomePageSetting::getPageKey)
                .filter(key -> isPublishedPage(tenantId, key))
                .orElse(DEFAULT_HOME_PAGE_KEY);
    }

    /**
     * 把已发布的自定义页面设为首页。不收草稿/归档页面（首页立刻要能渲染），
     * 不收 VIEW（已废弃，且不承载页面 schema）。
     */
    @Transactional
    public String setHomePage(String pageId) {
        String tenantId = tenantProvider.getTenantId();
        PageDefinition page = pageDefRepository.findByIdAndTenantId(pageId, tenantId)
                .orElseThrow(() -> new BusinessException(404, "页面不存在: " + pageId));
        if (!"PAGE".equals(page.getType())) {
            throw new BusinessException(400, "仅自定义页面可设为首页");
        }
        if (!"PUBLISHED".equals(page.getStatus())) {
            throw new BusinessException(400, "仅已发布页面可设为首页");
        }
        HomePageSetting setting = settingRepository.findById(tenantId).orElseGet(() -> {
            HomePageSetting created = new HomePageSetting();
            created.setTenantId(tenantId);
            return created;
        });
        setting.setPageKey(page.getKey());
        settingRepository.save(setting);
        return page.getKey();
    }

    private boolean isPublishedPage(String tenantId, String key) {
        return pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, key, "PUBLISHED")
                .map(page -> "PAGE".equals(page.getType()))
                .orElse(false);
    }
}
