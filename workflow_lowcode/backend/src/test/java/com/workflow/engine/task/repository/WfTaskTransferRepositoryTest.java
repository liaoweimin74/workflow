package com.workflow.engine.task.repository;

import com.workflow.engine.task.entity.WfTaskTransfer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WfTaskTransferRepositoryTest {

    @Mock
    WfTaskTransferRepository repository;

    @Test
    void save_persistsTransferRecord() {
        WfTaskTransfer transfer = new WfTaskTransfer();
        transfer.setId("tf-001");
        transfer.setTenantId("tenant-1");
        transfer.setTaskId("task-100");
        transfer.setProcessInstanceId("pi-200");
        transfer.setFromUser("alice");
        transfer.setToUser("bob");
        transfer.setReason("出差代办");

        when(repository.save(any(WfTaskTransfer.class))).thenAnswer(inv -> {
            WfTaskTransfer t = inv.getArgument(0);
            t.setCreatedAt(LocalDateTime.now());
            return t;
        });

        WfTaskTransfer saved = repository.save(transfer);

        assertThat(saved.getId()).isEqualTo("tf-001");
        assertThat(saved.getFromUser()).isEqualTo("alice");
        assertThat(saved.getToUser()).isEqualTo("bob");
        assertThat(saved.getReason()).isEqualTo("出差代办");
        assertThat(saved.getCreatedAt()).isNotNull();
    }

    @Test
    void findByTaskId_returnsTransfersForTask() {
        WfTaskTransfer t1 = new WfTaskTransfer();
        t1.setTaskId("task-100");
        t1.setFromUser("alice");
        t1.setToUser("bob");

        when(repository.findByTaskId("task-100")).thenReturn(List.of(t1));

        List<WfTaskTransfer> results = repository.findByTaskId("task-100");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getFromUser()).isEqualTo("alice");
        assertThat(results.get(0).getToUser()).isEqualTo("bob");
    }

    @Test
    void findByProcessInstanceId_returnsTransfersForInstance() {
        WfTaskTransfer t1 = new WfTaskTransfer();
        t1.setProcessInstanceId("pi-200");
        t1.setFromUser("alice");
        t1.setToUser("carol");

        when(repository.findByProcessInstanceId("pi-200")).thenReturn(List.of(t1));

        List<WfTaskTransfer> results = repository.findByProcessInstanceId("pi-200");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getToUser()).isEqualTo("carol");
    }

    @Test
    void findById_returnsExistingRecord() {
        WfTaskTransfer transfer = new WfTaskTransfer();
        transfer.setId("tf-001");
        transfer.setFromUser("alice");
        transfer.setToUser("bob");

        when(repository.findById("tf-001")).thenReturn(Optional.of(transfer));

        Optional<WfTaskTransfer> found = repository.findById("tf-001");

        assertThat(found).isPresent();
        assertThat(found.get().getFromUser()).isEqualTo("alice");
    }

    @Test
    void findById_returnsEmptyForNonExistent() {
        when(repository.findById("nonexistent")).thenReturn(Optional.empty());

        Optional<WfTaskTransfer> found = repository.findById("nonexistent");

        assertThat(found).isEmpty();
    }

    @Test
    void repository_extendsJpaRepository() {
        // 验证接口继承了 JpaRepository（编译期保证，这里验证类型兼容）
        assertThat(repository).isInstanceOf(JpaRepository.class);
    }
}
