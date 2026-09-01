package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.model.TemplateContentType;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.MessageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * 管理端公告发布逻辑验证
 */
class AnnouncementControllerTest {

    private MessageService messageService;
    private SseEmitterManager sseManager;
    private AnnouncementController controller;

    @BeforeEach
    void setUp() {
        messageService = mock(MessageService.class);
        sseManager = new SseEmitterManager();
        controller = new AnnouncementController(messageService, sseManager);

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
}
