package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.domain.R;
import com.workflow.engine.form.bizdata.BizDataService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 业务数据（底表）Controller。
 * 提供业务表单数据行的增删改查，formKey 标识业务表单（表 = wf_biz_<formKey>）。
 */
@RestController
@RequestMapping("/api/v1/biz-data")
public class BizDataController {

    private final BizDataService bizDataService;

    public BizDataController(BizDataService bizDataService) {
        this.bizDataService = bizDataService;
    }

    /**
     * 新增业务数据。
     */
    @PostMapping("/{formKey}")
    public R<BizDataVO> create(@PathVariable String formKey,
                               @RequestBody Map<String, Object> data) {
        return R.ok(bizDataService.create(formKey, data));
    }

    /**
     * 分页查询业务数据。
     */
    @GetMapping("/{formKey}")
    public R<BizDataPageVO> query(@PathVariable String formKey, BizDataQueryRequest req) {
        return R.ok(bizDataService.query(formKey, req));
    }

    /**
     * 查询单条业务数据。
     */
    @GetMapping("/{formKey}/{id}")
    public R<BizDataVO> getById(@PathVariable String formKey,
                                @PathVariable String id) {
        return R.ok(bizDataService.getById(formKey, id));
    }

    /**
     * 更新业务数据（乐观锁，请求体须携带 version）。
     */
    @PutMapping("/{formKey}/{id}")
    public R<BizDataVO> update(@PathVariable String formKey,
                               @PathVariable String id,
                               @RequestBody Map<String, Object> data) {
        Integer version = data.get("version") instanceof Number n ? n.intValue() : null;
        return R.ok(bizDataService.update(formKey, id, data, version));
    }

    /**
     * 删除业务数据。
     */
    @DeleteMapping("/{formKey}/{id}")
    public R<Void> delete(@PathVariable String formKey,
                          @PathVariable String id) {
        bizDataService.delete(formKey, id);
        return R.ok();
    }
}
