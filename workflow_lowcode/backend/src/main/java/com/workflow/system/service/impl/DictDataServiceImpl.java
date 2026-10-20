package com.workflow.system.service.impl;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.dto.DictDataCreateRequest;
import com.workflow.system.domain.dto.DictDataSortRequest;
import com.workflow.system.domain.dto.DictDataUpdateRequest;
import com.workflow.system.domain.entity.SysDictData;
import com.workflow.system.domain.vo.DictDataVO;
import com.workflow.system.repository.SysDictDataRepository;
import com.workflow.system.repository.SysDictTypeRepository;
import com.workflow.system.service.DictDataService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class DictDataServiceImpl implements DictDataService {
    private final SysDictDataRepository dictDataRepository;
    private final SysDictTypeRepository dictTypeRepository;

    public DictDataServiceImpl(SysDictDataRepository dictDataRepository, SysDictTypeRepository dictTypeRepository) {
        this.dictDataRepository = dictDataRepository;
        this.dictTypeRepository = dictTypeRepository;
    }

    @Override
    public List<DictDataVO> list(String dictCode) {
        return dictDataRepository.findByDictCodeOrderBySortOrder(dictCode).stream()
                .filter(d -> d.getIsDeleted() == 0)
                .map(d -> new DictDataVO(d.getId(), d.getDictCode(), d.getLabel(),
                        d.getValue(), d.getSortOrder(), d.getStatus(), d.getCreatedAt()))
                .toList();
    }

    @Override
    @Transactional
    public DictDataVO create(DictDataCreateRequest request) {
        if (dictTypeRepository.findByDictCode(request.dictCode()).isEmpty()) {
            throw new BusinessException("字典类型不存在");
        }
        SysDictData dd = new SysDictData();
        dd.setDictCode(request.dictCode());
        dd.setLabel(request.label());
        dd.setValue(request.value());
        dd.setSortOrder(request.sortOrder() != null ? request.sortOrder() : 0);
        dd.setStatus(request.status() != null ? request.status() : 1);
        dd = dictDataRepository.save(dd);
        return new DictDataVO(dd.getId(), dd.getDictCode(), dd.getLabel(),
                dd.getValue(), dd.getSortOrder(), dd.getStatus(), dd.getCreatedAt());
    }

    @Override
    @Transactional
    public DictDataVO update(Long id, DictDataUpdateRequest request) {
        SysDictData dd = dictDataRepository.findById(id)
                .orElseThrow(() -> new BusinessException("字典数据不存在"));
        if (StringUtils.hasText(request.dictCode())) {
            if (dictTypeRepository.findByDictCode(request.dictCode()).isEmpty()) {
                throw new BusinessException("字典类型不存在");
            }
            dd.setDictCode(request.dictCode());
        }
        if (StringUtils.hasText(request.label())) dd.setLabel(request.label());
        if (StringUtils.hasText(request.value())) dd.setValue(request.value());
        if (request.sortOrder() != null) dd.setSortOrder(request.sortOrder());
        if (request.status() != null) dd.setStatus(request.status());
        dd = dictDataRepository.save(dd);
        return new DictDataVO(dd.getId(), dd.getDictCode(), dd.getLabel(),
                dd.getValue(), dd.getSortOrder(), dd.getStatus(), dd.getCreatedAt());
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!dictDataRepository.existsById(id)) {
            throw new BusinessException("字典数据不存在");
        }
        SysDictData dd = dictDataRepository.findById(id).orElseThrow();
        dd.setIsDeleted(GlobalConstant.DELETED_YES);
        dictDataRepository.save(dd);
    }

    @Override
    @Transactional
    public List<DictDataVO> sort(DictDataSortRequest request) {
        if (dictTypeRepository.findByDictCode(request.dictCode()).isEmpty()) {
            throw new BusinessException("字典类型不存在");
        }
        // 在册（未软删）项，按当前 sortOrder 顺序
        Map<Long, SysDictData> live = new LinkedHashMap<>();
        for (SysDictData d : dictDataRepository.findByDictCodeOrderBySortOrder(request.dictCode())) {
            if (d.getIsDeleted() == 0) live.put(d.getId(), d);
        }

        List<Long> ids = request.ids() == null ? List.of() : request.ids();
        Set<Long> seen = new HashSet<>();
        for (Long id : ids) {
            if (!seen.add(id)) {
                throw new BusinessException("排序项存在重复 id：" + id);
            }
            if (!live.containsKey(id)) {
                throw new BusinessException("字典项 " + id + " 不属于该字典类型");
            }
        }

        // ids 顺序占前排，未列出的在册项按原相对顺序顺次排后
        List<SysDictData> ordered = new ArrayList<>(live.size());
        for (Long id : ids) ordered.add(live.get(id));
        for (SysDictData d : live.values()) {
            if (!seen.contains(d.getId())) ordered.add(d);
        }
        for (int i = 0; i < ordered.size(); i++) {
            ordered.get(i).setSortOrder(i);
        }
        dictDataRepository.saveAll(ordered);
        return ordered.stream().map(this::toVO).toList();
    }

    private DictDataVO toVO(SysDictData d) {
        return new DictDataVO(d.getId(), d.getDictCode(), d.getLabel(),
                d.getValue(), d.getSortOrder(), d.getStatus(), d.getCreatedAt());
    }
}