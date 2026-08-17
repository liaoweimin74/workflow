package com.workflow.engine.datasource;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.bizdata.BizDataService;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * FORM 数据源适配器：把数据源绑定表单 key 解析为业务数据查询/写入，委托 BizDataService。
 * 复用 Task 6.2 的查询逻辑（列白名单、filter JSON 解析、分页）与 CRUD（create/update/delete）。
 * 元数据：从表单 column_config 读取列定义（key/label/columnType 等，中文名在 label）。
 */
@Component
public class FormDataSourceAdapter implements DataSourceAdapter {

    private final BizDataService bizDataService;
    private final FormDefinitionService formDefService;
    private final TenantProvider tenantProvider;

    public FormDataSourceAdapter(BizDataService bizDataService,
                                 FormDefinitionService formDefService,
                                 TenantProvider tenantProvider) {
        this.bizDataService = bizDataService;
        this.formDefService = formDefService;
        this.tenantProvider = tenantProvider;
    }

    @Override
    public boolean supports(String type) {
        return "FORM".equals(type);
    }

    @Override
    public DataSourceMetadata metadata(DataSourceDefinition ds) {
        return new DataSourceMetadata(formDefService.getBusinessColumnsByKey(ds.getFormKey()), true);
    }

    @Override
    public BizDataPageVO query(DataSourceDefinition ds, BizDataQueryRequest query) {
        return bizDataService.query(ds.getFormKey(), query);
    }

    @Override
    public BizDataVO get(DataSourceDefinition ds, String id) {
        return bizDataService.getById(ds.getFormKey(), id);
    }

    @Override
    public String create(DataSourceDefinition ds, Map<String, Object> data) {
        return bizDataService.create(ds.getFormKey(), data).getId();
    }

    @Override
    public void update(DataSourceDefinition ds, String id, Map<String, Object> data, Integer version) {
        bizDataService.update(ds.getFormKey(), id, data, version);
    }

    @Override
    public void delete(DataSourceDefinition ds, String id) {
        bizDataService.delete(ds.getFormKey(), id);
    }
}
