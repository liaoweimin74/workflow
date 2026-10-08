package com.workflow.system.controller;

import com.workflow.common.domain.PageResult;
import com.workflow.common.domain.R;
import com.workflow.system.domain.dto.DictTypeCreateRequest;
import com.workflow.system.domain.dto.DictTypeQueryRequest;
import com.workflow.system.domain.dto.DictTypeUpdateRequest;
import com.workflow.system.domain.vo.DictTypeVO;
import com.workflow.system.service.DictTypeService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/dict-types")
public class DictTypeController {
    private final DictTypeService dictTypeService;

    public DictTypeController(DictTypeService dictTypeService) {
        this.dictTypeService = dictTypeService;
    }

    @GetMapping
    public R<PageResult<DictTypeVO>> list(DictTypeQueryRequest query) {
        return R.ok(dictTypeService.list(query));
    }

    @PostMapping
    public R<DictTypeVO> create(@Valid @RequestBody DictTypeCreateRequest request) {
        return R.ok(dictTypeService.create(request));
    }

    @PutMapping("/{id}")
    public R<DictTypeVO> update(@PathVariable Long id, @Valid @RequestBody DictTypeUpdateRequest request) {
        return R.ok(dictTypeService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        dictTypeService.delete(id);
        return R.ok();
    }
}