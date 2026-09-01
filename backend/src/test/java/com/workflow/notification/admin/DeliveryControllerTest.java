package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.model.Recipient;
import com.workflow.notification.store.MessageRepository;
import com.workflow.notification.store.RecipientRepository;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * DeliveryController 发送记录聚合 + 过滤逻辑验证
 *
 * <p>发送记录应从 msg_message + msg_recipient 聚合，
 * 每次发送（含渠道测试消息）都会写入这两个表，因此发送记录不应为空；
 * 支持按标题（keyword）、收件人（recipient）、渠道（channel）、时间段（start/end）过滤。
 */
class DeliveryControllerTest {

    private final MessageRepository messageRepository = mock(MessageRepository.class);
    private final RecipientRepository recipientRepository = mock(RecipientRepository.class);
    private final DeliveryController controller =
            new DeliveryController(messageRepository, recipientRepository);

    private Message message(long id, String title, LocalDateTime createdAt) {
        Message m = new Message();
        m.setId(id);
        m.setTitle(title);
        m.setCreatedAt(createdAt);
        m.setStatus(MessageStatus.SENT);
        return m;
    }

    private Recipient recipient(long userId, String username, Long messageId) {
        Recipient r = new Recipient();
        r.setUserId(userId);
        r.setUsername(username);
        r.setMessageId(messageId);
        r.setChannel(ChannelType.IN_APP);
        r.setStatus(MessageStatus.PENDING);
        return r;
    }

    @Test
    void list_returns_aggregated_records_including_test_message() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 1, 10, 0);
        Message testMessage = message(1L, "【渠道测试】站内信连通性测试", now);
        when(messageRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(testMessage), PageRequest.of(0, 20), 1));
        when(recipientRepository.findByMessageId(1L)).thenReturn(List.of(recipient(100L, "admin", 1L)));

        R<Map<String, Object>> res = controller.list(0, 20, null, null, null, null, null);

        assertThat(res.getCode()).isEqualTo(200);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) res.getData().get("rows");
        assertThat(rows).hasSize(1);
        Map<String, Object> row = rows.get(0);
        assertThat(row.get("title")).isEqualTo("【渠道测试】站内信连通性测试");
        assertThat(row.get("recipientCount")).isEqualTo(1);
        assertThat(row.get("channel")).isEqualTo("IN_APP");
        assertThat(row.get("status")).isEqualTo("SENT");
        assertThat(row.get("createdAt")).isEqualTo(now);
        assertThat(res.getData().get("total")).isEqualTo(1L);
    }

    @Test
    void list_returns_empty_when_no_messages() {
        when(messageRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        R<Map<String, Object>> res = controller.list(0, 20, null, null, null, null, null);

        assertThat(res.getCode()).isEqualTo(200);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) res.getData().get("rows");
        assertThat(rows).isEmpty();
        assertThat(res.getData().get("total")).isEqualTo(0L);
    }

    @Test
    void list_filterByRecipient_queriesUsernameAndFiltersMessageIds() {
        // 收件人反查命中 messageId=1、2
        when(recipientRepository.findByUsernameContaining("admin"))
                .thenReturn(List.of(recipient(100L, "admin", 1L), recipient(100L, "admin", 2L)));
        when(messageRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(message(1L, "标题A", LocalDateTime.now())), PageRequest.of(0, 20), 1));

        R<Map<String, Object>> res = controller.list(0, 20, null, "admin", null, null, null);

        assertThat(res.getCode()).isEqualTo(200);
        verify(recipientRepository).findByUsernameContaining("admin");
        verify(messageRepository).findAll(any(Specification.class), any(Pageable.class));
    }

    @Test
    void list_filterByChannel_queriesChannel() {
        when(recipientRepository.findByChannel(ChannelType.IN_APP))
                .thenReturn(List.of(recipient(100L, "admin", 1L)));
        when(messageRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(message(1L, "标题B", LocalDateTime.now())), PageRequest.of(0, 20), 1));

        R<Map<String, Object>> res = controller.list(0, 20, null, null, ChannelType.IN_APP, null, null);

        assertThat(res.getCode()).isEqualTo(200);
        verify(recipientRepository).findByChannel(ChannelType.IN_APP);
    }

    @Test
    void list_filterByRecipient_noMatch_returnsEmptyWithoutQueryingMessages() {
        when(recipientRepository.findByUsernameContaining("nobody")).thenReturn(List.of());

        R<Map<String, Object>> res = controller.list(0, 20, null, "nobody", null, null, null);

        assertThat(res.getCode()).isEqualTo(200);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) res.getData().get("rows");
        assertThat(rows).isEmpty();
        assertThat(res.getData().get("total")).isEqualTo(0L);
        verify(messageRepository, never()).findAll(any(Specification.class), any(Pageable.class));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void list_filterByTitleKeyword_buildsLikePredicate() {
        when(messageRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        controller.list(0, 20, "连通性", null, null, null, null);

        ArgumentCaptor<Specification<Message>> captor = ArgumentCaptor.forClass(Specification.class);
        verify(messageRepository).findAll(captor.capture(), any(Pageable.class));
        Specification<Message> spec = captor.getValue();

        // 执行该 Specification，验证其对 title 构造 like 谓词
        Root root = mock(Root.class);
        jakarta.persistence.criteria.CriteriaQuery query = mock(jakarta.persistence.criteria.CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        Path titlePath = mock(Path.class);
        when(root.get("title")).thenReturn(titlePath);
        when(cb.like(titlePath, "%连通性%")).thenReturn(mock(Predicate.class));
        when(cb.and(any(Predicate[].class))).thenReturn(mock(Predicate.class));

        spec.toPredicate(root, query, cb);
        verify(cb).like(titlePath, "%连通性%");
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void list_filterByTimeRange_buildsRangePredicates() {
        when(messageRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        LocalDateTime start = LocalDateTime.of(2026, 9, 1, 0, 0);
        LocalDateTime end = LocalDateTime.of(2026, 9, 30, 23, 59);
        controller.list(0, 20, null, null, null, start, end);

        ArgumentCaptor<Specification<Message>> captor = ArgumentCaptor.forClass(Specification.class);
        verify(messageRepository).findAll(captor.capture(), any(Pageable.class));
        Specification<Message> spec = captor.getValue();

        Root root = mock(Root.class);
        jakarta.persistence.criteria.CriteriaQuery query = mock(jakarta.persistence.criteria.CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        Path createdAtPath = mock(Path.class);
        when(root.get("createdAt")).thenReturn(createdAtPath);
        when(cb.greaterThanOrEqualTo(createdAtPath, start)).thenReturn(mock(Predicate.class));
        when(cb.lessThanOrEqualTo(createdAtPath, end)).thenReturn(mock(Predicate.class));
        when(cb.and(any(Predicate[].class))).thenReturn(mock(Predicate.class));

        spec.toPredicate(root, query, cb);
        verify(cb).greaterThanOrEqualTo(createdAtPath, start);
        verify(cb).lessThanOrEqualTo(createdAtPath, end);
    }
}
