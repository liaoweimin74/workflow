package com.workflow.system.service;

import com.workflow.common.domain.PageResult;
import com.workflow.system.domain.dto.DictTypeCreateRequest;
import com.workflow.system.domain.dto.DictTypeQueryRequest;
import com.workflow.system.domain.dto.DictTypeUpdateRequest;
import com.workflow.system.domain.vo.DictTypeVO;

public interface DictTypeService {
    PageResult<DictTypeVO> list(DictTypeQueryRequest query);

    DictTypeVO create(DictTypeCreateRequest request);

    DictTypeVO update(Long id, DictTypeUpdateRequest request);

    void delete(Long id);
}