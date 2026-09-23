package com.workflow.notification.template;

import com.workflow.common.exception.BusinessException;
import com.workflow.notification.model.MessageTemplate;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.event.NotificationEventService;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 模板服务
 */
@Service
public class TemplateService {

    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\$\\{([^}]+)}");

    private final MessageTemplateRepository templateRepository;
    private final NotificationEventService eventService;

    public TemplateService(MessageTemplateRepository templateRepository) {
        this(templateRepository, null);
    }

    @Autowired
    public TemplateService(MessageTemplateRepository templateRepository,
                           NotificationEventService eventService) {
        this.templateRepository = templateRepository;
        this.eventService = eventService;
    }

    /**
     * 根据模板代码和租户ID获取模板
     *
     * @throws BusinessException 模板不存在或已停用
     */
    public MessageTemplate getTemplate(String templateCode, String tenantId) {
        MessageTemplate template = templateRepository.findByTemplateCodeAndTenantId(templateCode, tenantId)
                .orElseThrow(() -> new BusinessException("模板不存在: " + templateCode));
        if (!Boolean.TRUE.equals(template.getEnabled())) {
            throw new BusinessException("模板已停用: " + templateCode);
        }
        return template;
    }

    /** 按业务事件和渠道获取唯一启用模板。 */
    public MessageTemplate getTemplateForEvent(String tenantId, String eventCode, ChannelType channel) {
        MessageTemplate template = templateRepository
                .findByTenantIdAndEventCodeAndChannelAndEnabled(tenantId, eventCode, channel, true)
                .orElseThrow(() -> new BusinessException("事件没有可用模板: " + eventCode + "/" + channel));
        if (!Boolean.TRUE.equals(template.getEnabled())) {
            throw new BusinessException("模板已停用: " + template.getTemplateCode());
        }
        return template;
    }

    /**
     * 渲染模板内容，替换变量
     */
    public String render(String template, Map<String, Object> variables) {
        if (template == null || variables == null) return template;

        Matcher matcher = VARIABLE_PATTERN.matcher(template);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String varName = matcher.group(1);
            Object value = variables.get(varName);
            matcher.appendReplacement(sb, value != null ? Matcher.quoteReplacement(value.toString()) : "");
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    /**
     * 校验模板变量必填性
     */
    public void validateVariables(String template, Map<String, Object> variables) {
        if (template == null) return;

        Matcher matcher = VARIABLE_PATTERN.matcher(template);
        while (matcher.find()) {
            String varName = matcher.group(1);
            if (!variables.containsKey(varName) || variables.get(varName) == null) {
                throw new BusinessException("缺少必填变量: " + varName);
            }
        }
    }

    /**
     * 创建模板
     * 
     * <p>用户创建的一律为普通模板（isSystem=false），默认启用（enabled=true），
     * 系统模板由系统初始化预置，不允许用户创建
     */
    @Transactional
    public MessageTemplate create(MessageTemplate template) {
        if (templateRepository.existsByTemplateCodeAndTenantId(template.getTemplateCode(), template.getTenantId())) {
            throw new BusinessException("模板代码已存在: " + template.getTemplateCode());
        }
        template.setIsSystem(false);
        if (template.getEnabled() == null) {
            template.setEnabled(true);
        }
        if (template.getEventCode() != null && !template.getEventCode().isBlank()
                && eventService != null) {
            eventService.requireEnabled(template.getTenantId(), template.getEventCode());
            if (Boolean.TRUE.equals(template.getEnabled()) && template.getChannel() != null
                    && templateRepository.existsByTenantIdAndEventCodeAndChannelAndEnabled(
                    template.getTenantId(), template.getEventCode(), template.getChannel(), true)) {
                throw new BusinessException("同一事件和渠道已有启用模板");
            }
        }
        return templateRepository.save(template);
    }

    /**
     * 更新模板
     * 
     * <p>系统模板（isSystem=true）仅允许更新文案（name/title/content），
     * 结构性字段（templateCode/channel/priority/category/isSystem）由系统维护不可修改
     */
    @Transactional
    public MessageTemplate update(Long id, MessageTemplate updated) {
        MessageTemplate existing = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException("模板不存在"));
        boolean isSystem = Boolean.TRUE.equals(existing.getIsSystem());
        existing.setName(updated.getName());
        existing.setTitle(updated.getTitle());
        existing.setContent(updated.getContent());
        if (updated.getContentType() != null) {
            existing.setContentType(updated.getContentType());
        }
        if (updated.getEnabled() != null) {
            existing.setEnabled(updated.getEnabled());
        }
        if (!isSystem) {
            existing.setPriority(updated.getPriority());
            existing.setCategory(updated.getCategory());
        }
        return templateRepository.save(existing);
    }

    /**
     * 启用/停用模板
     */
    @Transactional
    public void toggle(Long id) {
        MessageTemplate existing = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException("模板不存在"));
        existing.setEnabled(!Boolean.TRUE.equals(existing.getEnabled()));
        templateRepository.save(existing);
    }

    /**
     * 获取模板列表
     */
    public List<MessageTemplate> list(String tenantId) {
        return templateRepository.findAll();
    }
}
