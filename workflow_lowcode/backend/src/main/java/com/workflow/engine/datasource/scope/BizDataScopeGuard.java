package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.FilterAware;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.bizdata.BizDataService;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 业务表单底表通道（{@code /api/v1/biz-data/**}）的行范围闸门。
 *
 * <p>数据权限挂在数据源上，而「管理数据」页与表单里的数据引用选择器读的是同一张
 * {@code wf_biz_<formKey>} 物理表、却不经过数据源服务；这条通道不收紧，受控的表照样全量可见。
 * 判定与条件构造一律委托 {@link DataScopeService}（formKey 反查数据源后走同一份可见集合），
 * 这里只补「按 id 反查这一行在不在可见集合里」的读回逻辑。
 *
 * <p>不参与范围的动作（与 v3 不变量一致）：新增不按行校验；独立子表行不按主表行收紧；
 * 引用显示文本解析（resolve）保持可用，否则看不见来源行的表单会连标签一起空掉。
 */
@Component
public class BizDataScopeGuard {

    private final DataScopeService dataScopeService;
    private final BizDataService bizDataService;
    private final ObjectMapper objectMapper;

    public BizDataScopeGuard(DataScopeService dataScopeService,
                             BizDataService bizDataService,
                             ObjectMapper objectMapper) {
        this.dataScopeService = dataScopeService;
        this.bizDataService = bizDataService;
        this.objectMapper = objectMapper;
    }

    /** 列表/聚合：把当前用户在该表单上的可见集合叠加到请求上。 */
    public void apply(String formKey, FilterAware request) {
        dataScopeService.applyByFormKey(formKey, request);
    }

    /** 单条读取：不可见按 404（不区分「不存在」与「无权读」，免得这里变成存在性探针）。 */
    public void requireReadable(String formKey, String rowId) {
        if (!dataScopeService.hasScopeByFormKey(formKey)) {
            return;
        }
        if (findScopedRow(formKey, rowId) == null) {
            throw new BusinessException(404, "记录不存在或无权访问: " + rowId);
        }
    }

    /** 改删：看不到的行改不到也删不掉（「看即能操作」），越权 403。 */
    public void requireWritable(String formKey, String rowId) {
        if (!dataScopeService.hasScopeByFormKey(formKey)) {
            return;
        }
        if (findScopedRow(formKey, rowId) == null) {
            throw new BusinessException(403, "无权修改或删除该记录（不在数据权限范围内）: " + rowId);
        }
    }

    /** 带可见集合条件按 id 取一行；不可见或不存在返回 null（受控未授权时保留键是空数组，自然取不到）。 */
    private BizDataVO findScopedRow(String formKey, String rowId) {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter(idFilter(rowId));
        req.setSize(1);
        dataScopeService.applyByFormKey(formKey, req);
        BizDataPageVO page = bizDataService.query(formKey, req);
        List<BizDataVO> records = page == null ? null : page.getRecords();
        return records == null || records.isEmpty() ? null : records.get(0);
    }

    /** id 等值筛选 JSON（走序列化：rowId 来自路径参数，可能是任意字符）。 */
    private String idFilter(String rowId) {
        try {
            return objectMapper.writeValueAsString(Map.of("id", rowId == null ? "" : rowId));
        } catch (JsonProcessingException e) {
            throw new BusinessException(500, "数据范围校验条件构造失败");
        }
    }
}
