package com.workflow.system.service;

import com.workflow.system.domain.dto.DictDataCreateRequest;
import com.workflow.system.domain.dto.DictDataSortRequest;
import com.workflow.system.domain.dto.DictDataUpdateRequest;
import com.workflow.system.domain.vo.DictDataVO;

import java.util.List;

public interface DictDataService {
    List<DictDataVO> list(String dictCode);

    DictDataVO create(DictDataCreateRequest request);

    DictDataVO update(Long id, DictDataUpdateRequest request);

    void delete(Long id);

    /** 按拖动后的 ids 顺序重排该字典类型下的字典项，返回新顺序的全表 */
    List<DictDataVO> sort(DictDataSortRequest request);
}