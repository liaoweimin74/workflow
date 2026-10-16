package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.page.PageAccessGuard;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import org.springframework.web.bind.annotation.*;

import java.util.Set;

/**
 * 页面数据查询 Controller。
 * 自定义页面（PAGE）数据源查询：按页面内 dataSourceId 解析全局数据源 refId，
 * 委托 DataSourceDefinitionService.queryData（经 DataSourceAdapter）查询。
 * 数据出口经 PageAccessGuard 校验访问权限（无菜单 404 / 无权限 403）。
 * 白名单/schema 解析逻辑下沉 {@link PageViewQuerySupport}（与 Excel 导入导出共享）。
 * VIEW 视图数据查询接口（/{pageKey}/data）已随视图编译一并废弃移除。
 */
@RestController
@RequestMapping("/api/v1/pages")
public class PageQueryController {

    private final PageDefinitionService pageDefService;
    private final DataSourceDefinitionService dsService;
    private final PageAccessGuard pageAccessGuard;
    private final PageViewQuerySupport querySupport;

    public PageQueryController(PageDefinitionService pageDefService,
                               DataSourceDefinitionService dsService,
                               PageAccessGuard pageAccessGuard,
                               PageViewQuerySupport querySupport) {
        this.pageDefService = pageDefService;
        this.dsService = dsService;
        this.pageAccessGuard = pageAccessGuard;
        this.querySupport = querySupport;
    }

    /**
     * 自定义页面（PAGE）数据源查询。
     * 按页面内 dataSourceId 在已发布 schema 的 dataSources 中解析 refId，
     * 委托 DataSourceDefinitionService.queryData（经 DataSourceAdapter）查询。
     *
     * @param pageKey       页面 key（已发布 PAGE）
     * @param dataSourceId  页面内数据源 id（dataSources[].id）
     * @param req           查询参数（filter 为 JSON 字符串，受数据源 searchFields 白名单约束）
     */
    @GetMapping("/{pageKey}/ds/{dataSourceId}/data")
    public R<BizDataPageVO> queryPageDataSource(@PathVariable String pageKey,
                                                @PathVariable String dataSourceId,
                                                BizDataQueryRequest req) {
        pageAccessGuard.assertPageAccess(pageKey);
        PageDefinition page = pageDefService.getPublishedByKey(pageKey);
        if (!"PAGE".equals(page.getType())) {
            throw new BusinessException(400, "页面 " + pageKey + " 不是自定义页面类型");
        }
        String refId = querySupport.resolveDataSourceRefId(page.getSchema(), dataSourceId);
        // filter 白名单：仅保留该数据源条目声明的 searchFields
        Set<String> whitelist = querySupport.pageDataSourceSearchFields(page.getSchema(), dataSourceId);
        req.setFilter(querySupport.whitelistFilter(req.getFilter(), whitelist));
        return R.ok(dsService.queryData(refId, req));
    }
}
