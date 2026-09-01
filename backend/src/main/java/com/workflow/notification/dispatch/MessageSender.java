package com.workflow.notification.dispatch;

import com.workflow.engine.tenant.TenantProvider;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageTemplate;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.template.TemplateService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 消息发送门面（模板场景）。
 *
 * <p>为模板驱动的高频发送场景提供一键入口：按模板代码加载模板，
 * 校验必填变量、渲染标题、组装 {@link Message}，最终发布 {@link MessageEvent}
 * 交予 {@link MessageDispatcher} 分发。内部复用 {@link TemplateService}，
 * 使各业务模块只需提供 {@code templateCode + variables}，无需关心模板渲染细节。
 *
 * <p>底层 {@code MessageService.send(Message, ...)} 仍保留，供自由内容（非模板）消息使用；
 * 二者为"底层原语 + 高层门面"的分层关系，本门面委托底层事件链路，不重复写库。
 */
@Service
public class MessageSender {

    private final TemplateService templateService;
    private final TenantProvider tenantProvider;
    private final ApplicationEventPublisher eventPublisher;

    public MessageSender(TemplateService templateService,
                         TenantProvider tenantProvider,
                         ApplicationEventPublisher eventPublisher) {
        this.templateService = templateService;
        this.tenantProvider = tenantProvider;
        this.eventPublisher = eventPublisher;
    }

    /**
     * 按模板发送消息。
     *
     * <p>从数据库加载 {@code templateCode} 对应模板，校验标题与内容模板的必填变量
     * （缺失将抛 {@link com.workflow.common.exception.BusinessException} 且不发送），
     * 渲染标题作为用户可见标题；内容以变量 Map（JSON templateData）形式存入，
     * 供外部渠道二次渲染。优先级/类别取模板默认值，收件人与渠道由调用方指定。
     *
     * @param senderId     发送者ID（系统模板通常为系统用户ID）
     * @param templateCode 模板代码
     * @param variables    模板变量，发送前校验必填并用于渲染
     * @param recipientIds 接收用户ID列表
     * @param channels     投递渠道（如 IN_APP / SMS 等）
     */
    public void sendByTemplate(Long senderId,
                               String templateCode,
                               Map<String, Object> variables,
                               List<Long> recipientIds,
                               List<ChannelType> channels) {
        String tenantId = tenantProvider.getTenantId();
        MessageTemplate tpl = templateService.getTemplate(templateCode, tenantId);

        // 发送前校验标题与内容模板的必填变量，缺失即拒绝，避免 ${var} 残留传给用户
        templateService.validateVariables(tpl.getTitle(), variables);
        templateService.validateVariables(tpl.getContent(), variables);

        Message message = new Message();
        message.setTenantId(tenantId);
        message.setTemplateCode(templateCode);
        message.setSenderId(senderId);
        message.setSenderType("SYSTEM");
        message.setTitle(templateService.render(tpl.getTitle(), variables));
        // 内容以变量 Map 存储（JSON），作为外部渠道二次渲染的 templateData
        message.setContent(variables != null ? new HashMap<>(variables) : new HashMap<>());
        message.setPriority(tpl.getPriority());
        message.setCategory(tpl.getCategory());
        message.setMessageType(MessageType.PRIVATE);

        eventPublisher.publishEvent(new MessageEvent(this, message, recipientIds, channels));
    }
}
