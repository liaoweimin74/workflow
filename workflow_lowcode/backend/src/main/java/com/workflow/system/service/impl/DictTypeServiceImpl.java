package com.workflow.system.service.impl;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.dto.DictTypeCreateRequest;
import com.workflow.system.domain.dto.DictTypeQueryRequest;
import com.workflow.system.domain.dto.DictTypeUpdateRequest;
import com.workflow.system.domain.entity.SysDictType;
import com.workflow.system.domain.vo.DictTypeVO;
import com.workflow.system.repository.SysDictTypeRepository;
import com.workflow.system.service.DictTypeService;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

@Service
public class DictTypeServiceImpl implements DictTypeService {
    private final SysDictTypeRepository dictTypeRepository;

    public DictTypeServiceImpl(SysDictTypeRepository dictTypeRepository) {
        this.dictTypeRepository = dictTypeRepository;
    }

    @Override
    public PageResult<DictTypeVO> list(DictTypeQueryRequest query) {
        Specification<SysDictType> spec = (root, cq, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("isDeleted"), GlobalConstant.DELETED_NO));
            if (StringUtils.hasText(query.dictName())) {
                predicates.add(cb.like(root.get("dictName"), "%" + query.dictName() + "%"));
            }
            if (StringUtils.hasText(query.dictCode())) {
                predicates.add(cb.like(root.get("dictCode"), "%" + query.dictCode() + "%"));
            }
            if (query.status() != null) {
                predicates.add(cb.equal(root.get("status"), query.status()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        int page = query.page() != null ? Math.max(query.page(), 1) : 1;
        int size = query.size() != null ? query.size() : 10;
        PageRequest pr = PageRequest.of(page - 1, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<SysDictType> p = dictTypeRepository.findAll(spec, pr);
        List<DictTypeVO> list = p.getContent().stream()
                .map(t -> new DictTypeVO(t.getId(), t.getDictName(), t.getDictCode(),
                        t.getRemark(), t.getStatus(), t.getCreatedAt()))
                .toList();
        return new PageResult<>(p.getTotalElements(), page, size, list);
    }

    @Override
    @Transactional
    public DictTypeVO create(DictTypeCreateRequest request) {
        SysDictType dt = new SysDictType();
        dt.setDictName(request.dictName());
        dt.setDictCode(request.dictCode());
        dt.setRemark(request.remark());
        dt.setStatus(request.status() != null ? request.status() : 1);
        dt = dictTypeRepository.save(dt);
        return new DictTypeVO(dt.getId(), dt.getDictName(), dt.getDictCode(),
                dt.getRemark(), dt.getStatus(), dt.getCreatedAt());
    }

    @Override
    @Transactional
    public DictTypeVO update(Long id, DictTypeUpdateRequest request) {
        SysDictType dt = dictTypeRepository.findById(id)
                .orElseThrow(() -> new BusinessException("字典类型不存在"));
        if (StringUtils.hasText(request.dictName())) dt.setDictName(request.dictName());
        if (request.remark() != null) dt.setRemark(request.remark());
        if (request.status() != null) dt.setStatus(request.status());
        dt = dictTypeRepository.save(dt);
        return new DictTypeVO(dt.getId(), dt.getDictName(), dt.getDictCode(),
                dt.getRemark(), dt.getStatus(), dt.getCreatedAt());
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!dictTypeRepository.existsById(id)) {
            throw new BusinessException("字典类型不存在");
        }
        SysDictType dt = dictTypeRepository.findById(id).orElseThrow();
        dt.setIsDeleted(GlobalConstant.DELETED_YES);
        dictTypeRepository.save(dt);
    }
}
