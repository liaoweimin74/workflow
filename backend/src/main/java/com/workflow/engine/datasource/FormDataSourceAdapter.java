package com.workflow.engine.datasource;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.bizdata.BizDataService;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Component;

/**
 * FORM 数据源适配器：把数据源绑定表单 key 解析为业务数据查询，委托 BizDataService。
 * 复用 Task 6.2 的查询逻辑（列白名单、filter JSON 解析、分页）。
 */
@Component
public class FormDataSourceAdapter implements DataSourceAdapter {

    private final BizDataService bizDataService;
    private final TenantProvider tenantProvider;

    public FormDataSourceAdapter(BizDataService bizDataService, TenantProvider tenantProvider) {
        this.bizDataService = bizDataService;
        this.tenantProvider = tenantProvider;
    }

    @Override
    public boolean supports(String type) {
        return "FORM".equals(type);
    }

    @Override
    public BizDataPageVO query(DataSourceDefinition ds, BizDataQueryRequest query) {
        return bizDataService.query(ds.getFormKey(), query);
    }
}