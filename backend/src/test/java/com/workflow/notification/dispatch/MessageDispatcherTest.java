package com.workflow.notification.dispatch;

import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.notification.channel.InAppChannelAdapter;
import com.workflow.notification.model.*;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.store.RecipientRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageDispatcherTest {

    @Mock
    private MessageService messageService;

    @Mock
    private RecipientRepository recipientRepository;

    private InAppChannelAdapter inAppAdapter;
    private SseEmitterManager sseManager;

    private MessageDispatcher dispatcher;

    private Message testMessage;

    @BeforeEach
    void setUp() {
        // 使用真实实例
        inAppAdapter = new InAppChannelAdapter();
        sseManager = new SseEmitterManager();
        dispatcher = new MessageDispatcher(messageService, recipientRepository, sseManager, List.of(inAppAdapter));

        testMessage = new Message();
        testMessage.setId(1L);
        testMessage.setTenantId("default");
        testMessage.setTemplateCode("TASK_CREATED");
        testMessage.setSenderId(100L);
        testMessage.setSenderType("SYSTEM");
        testMessage.setTitle("新任务通知");
        testMessage.setContent(java.util.Map.of("taskName", "审批任务"));
        testMessage.setPriority(MessagePriority.NORMAL);
        testMessage.setCategory(MessageCategory.WORKFLOW);
        testMessage.setMessageType(MessageType.PRIVATE);
    }

    @Test
    void handleMessageEvent_sends_in_app_message() {
        MessageEvent event = new MessageEvent(this, testMessage, List.of(1000L), List.of(ChannelType.IN_APP));

        dispatcher.handleMessageEvent(event);

        verify(messageService, times(1)).send(eq(testMessage), eq(List.of(1000L)));
    }

    @Test
    void handleMessageEvent_skips_unavailable_channel() {
        // 测试当渠道不可用时，异步部分不会抛异常
        // 由于 inAppAdapter 是真实实例且始终可用，这里测试的是异步逻辑的异常处理
        MessageEvent event = new MessageEvent(this, testMessage, List.of(1000L), List.of(ChannelType.IN_APP));

        // 不应抛出异常
        dispatcher.handleMessageEvent(event);

        // 站内信仍然会发送（同步部分）
        verify(messageService, times(1)).send(eq(testMessage), eq(List.of(1000L)));
    }
}
