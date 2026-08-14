package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.domain.R;
import com.workflow.engine.form.bizdata.BizDataService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
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
     * 统计业务表单被 dataPicker 引用的情况（引用感知）。
     * 返回 { formKey: { count: N, referencedBy: [formKeyA, ...] } }，仅含被引用（count>0）的目标表单。
     */
    @GetMapping("/referenced-count")
    public R<Map<String, Map<String, Object>>> referencedCount() {
        return R.ok(bizDataService.countReferencedBy());
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
     * 批量解析业务数据显示文本（data-picker 引用还原）。
     * 返回 id → 显示字段文本 映射。
     */
    @GetMapping("/{formKey}/resolve")
    public R<Map<String, String>> resolve(@PathVariable String formKey,
                                          @RequestParam List<String> ids,
                                          @RequestParam(required = false) String displayField) {
        return R.ok(bizDataService.resolveByFormKey(formKey, ids, displayField));
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
