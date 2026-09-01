package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.model.Recipient;
import com.workflow.notification.model.TemplateContentType;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.MessageRepository;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.store.RecipientRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 管理端公告发布逻辑验证
 */
class AnnouncementControllerTest {

    private MessageService messageService;
    private SseEmitterManager sseManager;
    private MessageRepository messageRepository;
    private RecipientRepository recipientRepository;
    private AnnouncementController controller;

    @BeforeEach
    void setUp() {
        messageService = mock(MessageService.class);
        sseManager = new SseEmitterManager();
        messageRepository = mock(MessageRepository.class);
        recipientRepository = mock(RecipientRepository.class);
        controller = new AnnouncementController(messageService, sseManager, messageRepository, recipientRepository);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        new LoginUser(100L, "admin", "x", List.of("ROLE_ADMIN"), Set.of(), true),
                        null));
    }

    @Test
    void publish_createsPublicSystemAnnouncement_toEachRecipient() {
        R<Void> res = controller.publish(
                "系统升级公告",
                "**系统将于今晚升级**，请提前保存工作。",
                List.of(1000L, 2000L));

        assertThat(res.getCode()).isEqualTo(200);
        verify(messageService).send(argThat(m -> {
            assertThat(m.getTitle()).isEqualTo("系统升级公告");
            assertThat(m.getMessageType()).isEqualTo(MessageType.PUBLIC);
            assertThat(m.getCategory()).isEqualTo(MessageCategory.SYSTEM);
            assertThat(m.getSenderType()).isEqualTo("SYSTEM");
            assertThat(m.getSenderId()).isEqualTo(100L);
            assertThat(m.getContentType()).isEqualTo(TemplateContentType.MARKDOWN);
            @SuppressWarnings("unchecked")
            Map<String, Object> content = (Map<String, Object>) m.getContent();
            assertThat(content.get("text")).isEqualTo("**系统将于今晚升级**，请提前保存工作。");
            return true;
        }), eq(List.of(1000L, 2000L)));
    }

    @Test
    void publish_linksRequest_withoutRecipients_behavesSafely() {
        R<Void> res = controller.publish("空收件人公告", "内容", List.of());

        assertThat(res.getCode()).isEqualTo(200);
        verify(messageService).send(argThat(m -> m.getMessageType() == MessageType.PUBLIC),
                eq(List.of()));
    }

    // ==================== P2-5: 公告列表/撤回 ====================

    @Test
    void list_filters_by_announcement_template() {
        Message announcement = new Message();
        announcement.setId(1L);
        announcement.setTemplateCode("ANNOUNCEMENT");
        announcement.setTitle("升级公告");
        when(messageRepository.findAll(any(Specification.class), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(announcement), PageRequest.of(0, 20), 1));
        Recipient rec = new Recipient();
        rec.setUserId(1000L);
        when(recipientRepository.findByMessageId(1L)).thenReturn(List.of(rec));

        R<Map<String, Object>> res = controller.list(0, 20, null);

        assertThat(res.getCode()).isEqualTo(200);
        List<?> rows = (List<?>) res.getData().get("rows");
        Map<?, ?> row = (Map<?, ?>) rows.get(0);
        assertThat(row.get("id")).isEqualTo(1L);
        assertThat(row.get("recipientCount")).isEqualTo(1);
    }

    @Test
    void detail_returns_markdown_content_type_and_body() {
        Message announcement = new Message();
        announcement.setId(8L);
        announcement.setTemplateCode("ANNOUNCEMENT");
        announcement.setContentType(TemplateContentType.MARKDOWN);
        announcement.setContent(Map.of("text", "# 标题\n\n**正文**", "variables", Map.of()));
        when(messageRepository.findById(8L)).thenReturn(java.util.Optional.of(announcement));

        R<Message> res = controller.detail(8L);

        assertThat(res.getData().getContentType()).isEqualTo(TemplateContentType.MARKDOWN);
        assertThat(res.getData().getContent().get("text")).isEqualTo("# 标题\n\n**正文**");
    }

    @Test
    void recall_deletes_recipients_and_message() {
        Message announcement = new Message();
        announcement.setId(5L);
        announcement.setTemplateCode("ANNOUNCEMENT");
        when(messageRepository.findById(5L)).thenReturn(java.util.Optional.of(announcement));
        Recipient rec = new Recipient();
        rec.setMessageId(5L);
        when(recipientRepository.findByMessageId(5L)).thenReturn(List.of(rec));

        R<Void> res = controller.recall(5L);

        assertThat(res.getCode()).isEqualTo(200);
        verify(recipientRepository).deleteAll(List.of(rec));
        verify(messageRepository).delete((Message) announcement);
    }

    @Test
    void recall_rejects_non_announcement_message() {
        Message regular = new Message();
        regular.setId(6L);
        regular.setTemplateCode("TASK_CREATED");
        when(messageRepository.findById(6L)).thenReturn(java.util.Optional.of(regular));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.recall(6L))
                .isInstanceOf(com.workflow.common.exception.BusinessException.class);
        verify(messageRepository, never()).delete(any(Message.class));
    }
}
