package com.workflow.engine.datasource;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;

import java.util.Map;

/**
 * 数据源适配器 SPI（统一接口，方案 A：能力接口 + default 方法）。
 * 每种数据源类型（FORM/SYSTEM/API）注册一个适配器，把 DataSourceDefinition 解析为实际查询/写入。
 * 只读能力（metadata/query/get）所有数据源必须实现；
 * 写能力（create/update/delete）只读数据源继承默认实现 → 抛"该数据源不支持XX"。
 */
public interface DataSourceAdapter {

    /** 是否支持该数据源类型 */
    boolean supports(String type);

    /** 取元数据：列定义（ColumnConfig 列表）+ 可写标记 */
    DataSourceMetadata metadata(DataSourceDefinition ds);

    /** 列表分页查询 */
    BizDataPageVO query(DataSourceDefinition ds, BizDataQueryRequest req);

    /** 单条查询 */
    BizDataVO get(DataSourceDefinition ds, String id);

    // ===== 写能力：只读数据源继承默认实现 → 抛"该数据源不支持XX" =====

    /** 新增（返回新记录 id） */
    default String create(DataSourceDefinition ds, Map<String, Object> data) {
        throw unsupported(ds, "新增");
    }

    /** 修改（version 为乐观锁版本，可空） */
    default void update(DataSourceDefinition ds, String id, Map<String, Object> data, Integer version) {
        throw unsupported(ds, "修改");
    }

    /** 删除 */
    default void delete(DataSourceDefinition ds, String id) {
        throw unsupported(ds, "删除");
    }

    private BusinessException unsupported(DataSourceDefinition ds, String op) {
        return new BusinessException(400, "该数据源不支持" + op + ": " + ds.getName());
    }
}
