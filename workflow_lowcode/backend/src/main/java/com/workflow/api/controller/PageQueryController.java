package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.form.bizdata.BizDataService;
import com.workflow.engine.page.PageAccessGuard;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import org.springframework.web.bind.annotation.*;

import java.util.Set;

/**
 * 页面数据查询 Controller。
 * 视图（VIEW）页面渲染时的数据查询入口：按 pageKey 取已发布页面定义，
 * 以 schema 声明的 searchFields 作 filter 白名单，委托 BizDataService 查询业务表。
 * 自定义页面（PAGE）数据源查询：按页面内 dataSourceId 解析全局数据源 refId，
 * 委托 DataSourceDefinitionService.queryData（经 DataSourceAdapter）查询。
 * 所有数据出口均经 PageAccessGuard 校验访问权限（无菜单 404 / 无权限 403）。
 * 白名单/schema 解析逻辑下沉 {@link PageViewQuerySupport}（与 Excel 导入导出共享）。
 */
@RestController
@RequestMapping("/api/v1/pages")
public class PageQueryController {

    private final PageDefinitionService pageDefService;
    private final BizDataService bizDataService;
    private final DataSourceDefinitionService dsService;
    private final PageAccessGuard pageAccessGuard;
    private final PageViewQuerySupport querySupport;

    public PageQueryController(PageDefinitionService pageDefService,
                               BizDataService bizDataService,
                               DataSourceDefinitionService dsService,
                               PageAccessGuard pageAccessGuard,
                               PageViewQuerySupport querySupport) {
        this.pageDefService = pageDefService;
        this.bizDataService = bizDataService;
        this.dsService = dsService;
        this.pageAccessGuard = pageAccessGuard;
        this.querySupport = querySupport;
    }

    /**
     * 视图数据分页查询。
     * 参数对齐 BizDataQueryRequest（filter 为 JSON 字符串），filter 仅保留
     * schema 声明的 searchFields key（白名单）；pageKey 未发布/不存在 → 404。
     * 取数来源三分支：
     * 1. dataSourceId 非空（新协议）→ 经统一数据源 SPI 查询（DataSourceDefinitionService.queryData）
     * 2. 仅剩 formKey（兼容）→ 遗留 BizDataService 直连业务表
     * 3. 两者皆无 → 400「页面未绑定数据源」
     */
    @GetMapping("/{pageKey}/data")
    public R<BizDataPageVO> query(@PathVariable String pageKey, BizDataQueryRequest req) {
        pageAccessGuard.assertPageAccess(pageKey);
        PageDefinition page = pageDefService.getPublishedByKey(pageKey);
        if (!"VIEW".equals(page.getType())) {
            throw new BusinessException(400, "页面 " + pageKey + " 不是视图类型，不支持数据查询");
        }
        boolean hasDataSourceId = page.getDataSourceId() != null && !page.getDataSourceId().isBlank();
        boolean hasFormKey = page.getFormKey() != null && !page.getFormKey().isBlank();
        if (!hasDataSourceId && !hasFormKey) {
            throw new BusinessException(400, "页面 " + pageKey + " 未绑定数据源");
        }

        // filter 白名单：仅保留 schema 声明的 searchFields key
        Set<String> whitelist = querySupport.searchFieldKeys(page.getSchema());
        req.setFilter(querySupport.whitelistFilter(req.getFilter(), whitelist));

        // 排序白名单：schema 声明 sortableFields 时，sort 字段必须命中（对齐 searchFields 白名单模式）
        Set<String> sortable = querySupport.sortableFieldKeys(page.getSchema());
        if (req.getSort() != null && !req.getSort().isBlank()
                && !sortable.isEmpty() && !sortable.contains(req.getSort())) {
            throw new BusinessException(400, "排序字段不在页面声明的可排序字段中: " + req.getSort());
        }

        if (hasDataSourceId) {
            return R.ok(dsService.queryData(page.getDataSourceId(), req));
        }
        return R.ok(bizDataService.query(page.getFormKey(), req));
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