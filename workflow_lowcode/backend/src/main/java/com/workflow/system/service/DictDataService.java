package com.workflow.system.service;

import com.workflow.system.domain.dto.DictDataCreateRequest;
import com.workflow.system.domain.dto.DictDataUpdateRequest;
import com.workflow.system.domain.vo.DictDataVO;

import java.util.List;

public interface DictDataService {
    List<DictDataVO> list(String dictCode);

    DictDataVO create(DictDataCreateRequest request);

    DictDataVO update(Long id, DictDataUpdateRequest request);

    void delete(Long id);
}