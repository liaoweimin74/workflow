package com.workflow.system.service;

import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.dto.DictDataSortRequest;
import com.workflow.system.domain.entity.SysDictData;
import com.workflow.system.domain.entity.SysDictType;
import com.workflow.system.domain.vo.DictDataVO;
import com.workflow.system.repository.SysDictDataRepository;
import com.workflow.system.repository.SysDictTypeRepository;
import com.workflow.system.service.impl.DictDataServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 字典项拖动排序契约。
 *
 * 前端把「当前可见子集」的新顺序映射回整表后一次性提交 ids，后端按 ids 顺序重排并把
 * 未列出的在册项顺次排在后面，最后整表归一化 sortOrder = 0..n-1（与菜单拖动同一套语义）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DictDataSortServiceTest {

    @Mock
    SysDictDataRepository dictDataRepository;
    @Mock
    SysDictTypeRepository dictTypeRepository;
    @InjectMocks
    DictDataServiceImpl dictDataService;

    private SysDictData data(long id, String dictCode, int sortOrder) {
        SysDictData d = new SysDictData();
        d.setId(id);
        d.setDictCode(dictCode);
        d.setLabel("L" + id);
        d.setValue(String.valueOf(id));
        d.setSortOrder(sortOrder);
        d.setStatus(1);
        return d;
    }

    private void stubCode(SysDictData... rows) {
        when(dictTypeRepository.findByDictCode("opinion_type")).thenReturn(Optional.of(new SysDictType()));
        when(dictDataRepository.findByDictCodeOrderBySortOrder("opinion_type"))
                .thenReturn(new ArrayList<>(List.of(rows)));
    }

    @SuppressWarnings("unchecked")
    private List<SysDictData> savedAll() {
        ArgumentCaptor<List<SysDictData>> captor = ArgumentCaptor.forClass(List.class);
        verify(dictDataRepository).saveAll(captor.capture());
        return captor.getValue();
    }

    @Test
    void sort_byGivenOrder_renumbersWholeDict() {
        stubCode(data(11L, "opinion_type", 0), data(12L, "opinion_type", 1), data(13L, "opinion_type", 2));

        List<DictDataVO> result = dictDataService.sort(new DictDataSortRequest("opinion_type", List.of(13L, 11L)));

        List<SysDictData> saved = savedAll();
        // 13、11 按提交顺序占前排，未列出的 12 顺次排在后面
        assertThat(order(saved, 13L)).isZero();
        assertThat(order(saved, 11L)).isEqualTo(1);
        assertThat(order(saved, 12L)).isEqualTo(2);
        // 返回体按新顺序给出，前端可直接用
        assertThat(result).extracting(DictDataVO::id).containsExactly(13L, 11L, 12L);
    }

    @Test
    void sort_sameOrder_stillNormalizesGaps() {
        stubCode(data(11L, "opinion_type", 5), data(12L, "opinion_type", 9));

        dictDataService.sort(new DictDataSortRequest("opinion_type", List.of(11L, 12L)));

        List<SysDictData> saved = savedAll();
        assertThat(order(saved, 11L)).isZero();
        assertThat(order(saved, 12L)).isEqualTo(1);
    }

    @Test
    void sort_unknownId_rejected() {
        stubCode(data(11L, "opinion_type", 0));

        assertThatThrownBy(() -> dictDataService.sort(
                new DictDataSortRequest("opinion_type", List.of(99L))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不属于该字典类型");
        verify(dictDataRepository, never()).saveAll(any());
    }

    @Test
    void sort_duplicatedId_rejected() {
        stubCode(data(11L, "opinion_type", 0), data(12L, "opinion_type", 1));

        assertThatThrownBy(() -> dictDataService.sort(
                new DictDataSortRequest("opinion_type", List.of(11L, 11L))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("重复");
    }

    @Test
    void sort_missingDictType_rejected() {
        when(dictTypeRepository.findByDictCode("opinion_type")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> dictDataService.sort(
                new DictDataSortRequest("opinion_type", List.of(11L))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("字典类型不存在");
    }

    @Test
    void sort_skipsSoftDeletedRows() {
        SysDictData deleted = data(14L, "opinion_type", 0);
        deleted.setIsDeleted(1);
        stubCode(data(11L, "opinion_type", 0), deleted);

        dictDataService.sort(new DictDataSortRequest("opinion_type", List.of(11L)));

        assertThat(savedAll()).extracting(SysDictData::getId).containsExactly(11L);
    }

    private int order(List<SysDictData> saved, long id) {
        return saved.stream().filter(d -> Long.valueOf(id).equals(d.getId()))
                .findFirst().orElseThrow().getSortOrder();
    }
}
