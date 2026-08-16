package com.workflow.engine.datasource;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.engine.datasource.entity.DataSourceDefinition;

/**
 * 数据源查询适配器 SPI。
 * 每种数据源类型（FORM/SYSTEM/API）注册一个适配器，负责把 DataSourceDefinition 解析为实际查询。
 */
public interface DataSourceAdapter {

    /** 是否支持该数据源类型 */
    boolean supports(String type);

    /** 执行数据源查询 */
    BizDataPageVO query(DataSourceDefinition ds, BizDataQueryRequest query);
}